import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
// unless specified, assume variables are in SI units
export class Aircraft {
  constructor({
    object,
    weight,    //lbs
    wingArea,  //ft^2
    wingspan   //ft
  }) {
    this.mass = 0.453592 * weight;
    this.wingArea = wingArea * 0.092903;
    this.gravity = 9.81;
    this.plane = object; //three.js object with position, rotation, etc.
    this.wingspan = wingspan * 0.3048;
    this.thrust = 0;
    this.velocity = new THREE.Vector3(0,0,-1)
      .applyQuaternion(object.quaternion)
      .multiplyScalar(75);
    this.airDensity = 1.225;
    this.angularVelocity = new THREE.Vector3(); // rad/s (p,q,r)
    this.torque = new THREE.Vector3();          // body-axis torque
    this.I = new THREE.Vector3(
      800000,
      1500000,
      2000000
    );
    this.pitchInput = 0; // -1 (nose down) to 1 (nose up)
    this.rollInput  = 0; // -1 (roll left) to 1 (roll right)
    this.yawInput   = 0; // -1 (rudder left) to 1 (rudder right)
  }
  findLift(velocity, Cl) {
    return 0.5 * this.airDensity * velocity * velocity * this.wingArea * Cl;
  }
  findWeight() {
    return this.mass * this.gravity;
  }
  findCl(alphaDeg) {
    const alphaRad = alphaDeg * Math.PI / 180;
    const aspectRatio = Math.pow(this.wingspan, 2) / this.wingArea;
    // ---- Finite wing lift slope ----
    const Cla = (2 * Math.PI * aspectRatio) / (aspectRatio + 2);

    // Linear lift
    const ClLinear = Cla * alphaRad;

    // Estimated stall angle (~12° for NACA 0010)
    const stallAngleDeg = 12;
    const stallRad = stallAngleDeg * Math.PI / 180;

    // Max Cl from linear model at stall
    const ClMax = Cla * stallRad;

    // Post-stall flat-plate approximation
    const ClPostStall = ClMax * Math.sin(2 * alphaRad) / Math.sin(2 * stallRad);

    // Smooth blending factor
    const blendWidth = 3 * Math.PI / 180; // 3° smoothing range
    const sigma = 1 / (1 + Math.exp(
        -(Math.abs(alphaRad) - stallRad) / blendWidth
    ));

    // Blend attached + stalled models
    const Cl = (1 - sigma) * ClLinear + sigma * ClPostStall;

    return Cl;
  }
  findRho() {
    const h = Math.max(0, this.plane.position.y);
    const factor = 1 - 2.25577e-5 * h;
    return 1.225 * Math.pow(Math.max(factor, 0), 4.25588);
  }
  findCd(Cl, Cd0 = 0.025, e = 0.85) {
    const aspectRatio = Math.pow(this.wingspan, 2) / this.wingArea;
    const inducedDrag = (Cl * Cl) / (Math.PI * aspectRatio * e);
    return Cd0 + inducedDrag;
  }
  findDrag(velocity, Cd) {
    return 0.5 * this.airDensity * velocity * velocity * this.wingArea * Cd;
  }
  updateThrust(thrust) {
    this.thrust = thrust;
  }
  // Set pitch input from main code
  setPitchInput(value) {
    this.pitchInput = THREE.MathUtils.clamp(value, -1, 1);
  }
  // Set roll input from main code
  setRollInput(value) {
    this.rollInput = THREE.MathUtils.clamp(value, -1, 1);
  }
  
  // Set yaw input from main code
  setYawInput(value) {
    this.yawInput = THREE.MathUtils.clamp(value, -1, 1);
  }
  update(dt, elevation){

  const q = this.plane.quaternion;

  this.airDensity = this.findRho();

  // --- BODY VELOCITY ---
  const velBody = this.velocity.clone().applyQuaternion(q.clone().invert());

  const u = -velBody.z; // forward
  const v = velBody.x;  // right
  const w = velBody.y;  // up

  const speed = Math.max(Math.sqrt(u*u + v*v + w*w), 0.1);

  const alpha = Math.atan2(w,u);

  const beta = speed > 0.01
    ? Math.asin(THREE.MathUtils.clamp(v/speed,-1,1))
    : 0;

  const qdyn = 0.5 * this.airDensity * speed * speed;

  const b = this.wingspan;
  const c = this.wingArea / this.wingspan;

  // --- AERODYNAMIC COEFFICIENTS ---

  const alphaDeg = alpha * 180 / Math.PI;

  const Cl = this.findCl(alphaDeg);

  const Cd = this.findCd(Cl);

  const Cy = -0.9 * beta;

  // --- BODY FORCES ---

  const Lift = qdyn * this.wingArea * Cl;
  const Drag = qdyn * this.wingArea * Cd;
  const Side = qdyn * this.wingArea * Cy;

  const forceBody = new THREE.Vector3(
    Side,
    Lift,
    -Drag - this.thrust
  );

  // --- WORLD FORCES ---

  const totalForce = forceBody.clone().applyQuaternion(q);

  totalForce.add(new THREE.Vector3(0,-this.findWeight(),0));

  const accel = totalForce.multiplyScalar(1/this.mass);

  this.velocity.addScaledVector(accel,dt);

  // prevent runaway speed
  this.velocity.clampLength(0,2000);

  // --- ANGULAR DYNAMICS ---

  const p = this.angularVelocity.x;
  const qRate = this.angularVelocity.y;
  const r = this.angularVelocity.z;

  const da = this.rollInput;
  const de = this.pitchInput;
  const dr = this.yawInput;

  // stability derivatives

  const Cl_beta = -0.12;
  const Cl_p = -0.6;
  const Cl_da = 0.25;

  const Cm_alpha = -1.2;
  const Cm_q = -12;
  const Cm_de = -1.3;

  const Cn_beta = -0.25;
  const Cn_r = -0.35;
  const Cn_dr = 0.15;

  const Cl_roll =
      Cl_beta*beta +
      Cl_p*(p*b/(2*speed)) +
      Cl_da*da;

  let Cm =
      Cm_alpha*alpha +
      Cm_q*(qRate*c/(2*speed)) +
      Cm_de*de;

  // small pitch trim
  Cm += -0.02;

  const Cn =
      Cn_beta*beta +
      Cn_r*(r*b/(2*speed)) +
      Cn_dr*dr;

  const rollMoment  = qdyn*this.wingArea*b*Cl_roll;
  const pitchMoment = qdyn*this.wingArea*c*Cm;
  const yawMoment   = qdyn*this.wingArea*b*Cn;

  const torque = new THREE.Vector3(
    rollMoment,
    pitchMoment,
    yawMoment
  );

  // --- RIGID BODY ROTATION ---

  const omega = this.angularVelocity;

  const Iomega = new THREE.Vector3(
    this.I.x*omega.x,
    this.I.y*omega.y,
    this.I.z*omega.z
  );

  const gyro = new THREE.Vector3().crossVectors(omega,Iomega);

  const angularAccel = new THREE.Vector3(
    (torque.x-gyro.x)/this.I.x,
    (torque.y-gyro.y)/this.I.y,
    (torque.z-gyro.z)/this.I.z
  );

  this.angularVelocity.addScaledVector(angularAccel,dt);

  this.angularVelocity.clampLength(0,3);

  // numerical damping
  this.angularVelocity.multiplyScalar(0.995);

  // --- QUATERNION INTEGRATION ---

  const omegaNow = this.angularVelocity.clone();

  const halfdt = 0.5 * dt;

  const qdot = new THREE.Quaternion(
    omegaNow.x * halfdt,
    omegaNow.y * halfdt,
    omegaNow.z * halfdt,
    0
  );

  qdot.multiply(this.plane.quaternion);

  this.plane.quaternion.x += qdot.x;
  this.plane.quaternion.y += qdot.y;
  this.plane.quaternion.z += qdot.z;
  this.plane.quaternion.w += qdot.w;

  this.plane.quaternion.normalize();

  // --- POSITION ---

  this.plane.position.addScaledVector(this.velocity,dt);

  // remove tiny numerical energy drift
  this.velocity.multiplyScalar(0.9995);

  // --- GROUND COLLISION ---

  if(this.plane.position.y <= elevation){

    this.plane.position.y = elevation;

    if(this.velocity.y < 0)
      this.velocity.y *= -0.2;

    this.velocity.x *= 0.8;
    this.velocity.z *= 0.8;

    this.angularVelocity.multiplyScalar(0.3);
  }
  }
}
