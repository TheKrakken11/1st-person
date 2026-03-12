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
      .multiplyScalar(300);
    this.airDensity = 1.225;
    this.angularVelocity = new THREE.Vector3(); // rad/s (p,q,r)
    this.torque = new THREE.Vector3();          // body-axis torque
    this.I = new THREE.Vector3(
      8000,
      15000,
      20000
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
  // Same signature: findCd(Cl, Cd0 = 0.025, e = 0.85)
  findCd(Cl, Cd0 = 0.021, e = 0.8) {
    const aspectRatio = Math.pow(this.wingspan, 2) / this.wingArea;

    // Induced drag
    const CdInduced = (Cl * Cl) / (Math.PI * aspectRatio * e);

    // Parasitic / profile drag
    const CdParasitic = Cd0;

    // Compressibility / transonic drag
    const speed = Math.max(this.velocity.length(), 0.1);
    const mach = speed / 343; // speed of sound ~343 m/s at sea level
    let CdWave = 0;
    if (mach > 0.8) {
        const machRise = (mach - 0.8) / 0.2; // normalize 0..1
        CdWave = 0.02 * Math.pow(machRise, 2); // smooth quadratic rise
    }

    return CdParasitic + CdInduced + CdWave;
  }

  // Same signature: findDrag(velocity, Cd)
  findDrag(velocity, Cd) {
    const speed = Math.max(velocity.length(), 0.1);
    return 0.5 * this.airDensity * speed * speed * this.wingArea * Cd;
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
  update(dt, elevation) {

  const q = this.plane.quaternion;

  // --- BODY AXES ---
  const forward = new THREE.Vector3(0,0,-1).applyQuaternion(q);
  const right   = new THREE.Vector3(1,0,0).applyQuaternion(q);
  const up      = new THREE.Vector3(0,1,0).applyQuaternion(q);

  // --- VELOCITY ---
  const speed = Math.max(this.velocity.length(), 0.1);
  const velDir = this.velocity.clone().normalize();

  // velocity in body frame
  const bodyVel = this.velocity.clone().applyQuaternion(q.clone().invert());
  const u = -bodyVel.z;
  const v = bodyVel.x;
  const w = bodyVel.y;

  const alpha = Math.atan2(w, u);
  const beta  = Math.atan2(v, u);

  // --- AIR DENSITY ---
  this.airDensity = this.findRho();

  // --- DYNAMIC PRESSURE ---
  const qdyn = 0.5 * this.airDensity * speed * speed;

  // --- LIFT / DRAG ---
  const Cl = this.findCl(alpha * 180 / Math.PI);
  const Cd = this.findCd(Cl);

  const LiftMag = qdyn * this.wingArea * Cl;
  const DragMag = qdyn * this.wingArea * Cd;

  const Lift = up.clone().multiplyScalar(LiftMag);
  const Drag = velDir.clone().multiplyScalar(-DragMag);

  // small lateral force
  const Cy = -0.05 * beta;
  const Side = right.clone().multiplyScalar(qdyn * this.wingArea * Cy);

  const Weight = new THREE.Vector3(0, -this.mass * this.gravity, 0);
  const Thrust = forward.clone().multiplyScalar(this.thrust);

  const totalForce = new THREE.Vector3();
  totalForce.add(Lift).add(Drag).add(Side).add(Weight).add(Thrust);

  // --- LINEAR MOTION ---
  const accel = totalForce.multiplyScalar(1 / this.mass);
  this.velocity.addScaledVector(accel, dt);
  this.velocity.clampLength(0, 250);

  // --- ROTATIONAL DYNAMICS ---
  const omega = this.angularVelocity;
  const p = omega.x;
  const qRate = omega.y;
  const r = omega.z;

  const b = this.wingspan;
  const c = this.wingArea / this.wingspan;

  // control inputs
  const da = this.rollInput;
  const de = this.pitchInput;
  const dr = this.yawInput;

  // stability derivatives (stable aircraft)
  const Cl_beta = -0.4;
  const Cl_p    = -3.0;
  const Cl_da   = 0.6;

  const Cm_alpha = -1.2;
  const Cm_q     = -10;
  const Cm_de    = -2.0;

  const Cn_beta = -0.3;
  const Cn_r    = -2.0;
  const Cn_dr   = 0.4;

  const rollMoment =
      Cl_beta * beta +
      Cl_p * (p*b/(2*speed)) +
      Cl_da * da;

  const pitchMoment =
      Cm_alpha * alpha +
      Cm_q * (qRate*c/(2*speed)) +
      Cm_de * de;

  const yawMoment =
      Cn_beta * beta +
      Cn_r * (r*b/(2*speed)) +
      Cn_dr * dr;

  const torque = new THREE.Vector3(
      qdyn * this.wingArea * b * rollMoment,
      qdyn * this.wingArea * c * pitchMoment,
      qdyn * this.wingArea * b * yawMoment
  );

  // --- ANGULAR ACCELERATION ---
  const angularAccel = new THREE.Vector3(
      torque.x / this.I.x,
      torque.y / this.I.y,
      torque.z / this.I.z
  );

  this.angularVelocity.addScaledVector(angularAccel, dt);

  // aerodynamic damping
  this.angularVelocity.multiplyScalar(0.97);

  // prevent runaway spin
  this.angularVelocity.clampLength(0, 1.5);

  // --- ORIENTATION UPDATE ---
  const halfdt = 0.5 * dt;

  const qdot = new THREE.Quaternion(
      this.angularVelocity.x * halfdt,
      this.angularVelocity.y * halfdt,
      this.angularVelocity.z * halfdt,
      0
  ).multiply(q);

  q.x += qdot.x;
  q.y += qdot.y;
  q.z += qdot.z;
  q.w += qdot.w;
  q.normalize();

  // --- POSITION UPDATE ---
  this.plane.position.addScaledVector(this.velocity, dt);

  // --- GROUND COLLISION ---
  if (this.plane.position.y <= elevation) {

      this.plane.position.y = elevation;

      if (this.velocity.y < 0)
          this.velocity.y = 0;

      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;

      this.angularVelocity.multiplyScalar(0.2);
  }
  }
}
