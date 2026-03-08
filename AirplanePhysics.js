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
  update(dt, elevation) {

  this.torque.set(0,0,0);

  this.airDensity = this.findRho();

  const speedSq = this.velocity.lengthSq();
  const speed = Math.max(Math.sqrt(speedSq), 0.1);

  const velDir = speed > 1e-6
    ? this.velocity.clone().normalize()
    : new THREE.Vector3();

  const qdyn = 0.5 * this.airDensity * speedSq;

  // --- BODY VELOCITY ---
  const bodyVel = this.velocity.clone()
    .applyQuaternion(this.plane.quaternion.clone().invert());

  const u = -bodyVel.z;   // forward
  const v =  bodyVel.x;   // right
  const w =  bodyVel.y;   // up

  const alphaRad = Math.atan2(-w, u);
  const alphaDeg = alphaRad * 180 / Math.PI;

  const Cl = this.findCl(alphaDeg);
  const Cd = this.findCd(Cl);

  const beta = speed > 1e-3
    ? Math.asin(THREE.MathUtils.clamp(v / speed, -0.999, 0.999))
    : 0;

  const elevatorDeflection = this.pitchInput * 20 * (Math.PI/180);
  const aileronDeflection  = this.rollInput  * 20 * (Math.PI/180);
  const rudderDeflection   = this.yawInput   * 25 * (Math.PI/180);

  const pRate = this.angularVelocity.x;
  const qRate = this.angularVelocity.y;
  const rRate = this.angularVelocity.z;

  const cbar = 3.0;
  const alphaTrim = 3 * Math.PI/180;

  // --- PITCH MOMENT ---
    
  const Cm =
      -0.05
    + (-2.5 * ((alphaRad + 3*(Math.PI/180)) - alphaTrim))
    + (-12 * (qRate * cbar / (2 * speed)))
    + (-1.1 * elevatorDeflection);

  const pitchMoment = qdyn * this.wingArea * cbar * Cm;

  this.torque.y += pitchMoment;

  // --- YAW MOMENT ---
  const Cn_beta = -0.25;
  const Cn_r = -0.35;
  const Cn_delta_r = 0.1;

  const Cn =
      Cn_beta * beta
    + Cn_r * (rRate * this.wingspan / (2 * speed))
    + Cn_delta_r * rudderDeflection;

  const yawMoment =
    qdyn * this.wingArea * this.wingspan * Cn;

  this.torque.z += yawMoment;

  // --- ROLL MOMENT ---
  const Cl_p = -0.9;
  const Cl_beta = -0.12;
  const Cl_delta_a = 0.12;

  const Cl_dihedral = -0.25 * beta;
  const Cl_roll =
      Cl_p * (pRate * this.wingspan / (2 * speed))
    + Cl_beta * beta
    + Cl_delta_a * aileronDeflection
    + Cl_dihedral;

  const rollMoment =
    qdyn * this.wingArea * this.wingspan * Cl_roll;

  this.torque.x += rollMoment;

  // --- STABILIZATION DAMPING (ROLL + YAW) ---
  const damping = 200 + speed * 2;

  this.torque.x += -this.angularVelocity.x * damping;
  this.torque.y += -this.angularVelocity.y * damping * 0.5;
  this.torque.z += -this.angularVelocity.z * damping;

  // --- ANGULAR DYNAMICS ---

  let omega = this.angularVelocity.clone();

  const Iomega = new THREE.Vector3(
    this.I.x * omega.x,
    this.I.y * omega.y,
    this.I.z * omega.z
  );

  const gyro = new THREE.Vector3().crossVectors(omega, Iomega);

  const angularAccel = new THREE.Vector3(
    (this.torque.x - gyro.x) / this.I.x,
    (this.torque.y - gyro.y) / this.I.y,
    (this.torque.z - gyro.z) / this.I.z
  );

  this.angularVelocity.addScaledVector(angularAccel, dt);

  if (this.angularVelocity.length() < 1e-5) {
    this.angularVelocity.set(0,0,0);
  }

  this.angularVelocity.clampLength(0, 5);
  omega = this.angularVelocity;

  // --- QUATERNION INTEGRATION (FIXED ORDER) ---

  const q = this.plane.quaternion;

  // angular velocity in body frame
  const dq = new THREE.Quaternion(
    omega.x * dt * 0.5,
    omega.y * dt * 0.5,
    omega.z * dt * 0.5,
    0
  );
  
  dq.multiply(q);
  q.x += dq.x;
  q.y += dq.y;
  q.z += dq.z;
  q.w += dq.w;
  q.normalize();

  // --- DRAG ---
  const dragMag = this.findDrag(speed, Cd);
  const dragForce = velDir.clone().multiplyScalar(-dragMag);

  // --- LIFT ---
  const relWind = this.velocity.clone().multiplyScalar(-1).normalize();
    
  const right = new THREE.Vector3(1,0,0)
    .applyQuaternion(this.plane.quaternion);
    
  const liftDir = new THREE.Vector3()
    .crossVectors(relWind, right)
    .cross(relWind)
    .normalize();

  if (liftDir.lengthSq() > 1e-6) {
    liftDir.normalize();
  } else {
    liftDir.set(0,0,0);
  }

  const up = new THREE.Vector3(0,1,0);
  const liftVerticalFactor = Math.max(0, liftDir.dot(up));
  const liftMag = this.findLift(speed, Cl) * (0.7 + 0.3 * liftVerticalFactor);
  const liftForce = liftDir.multiplyScalar(liftMag);

  const Cy_beta = -0.98; // typical value
  const Cy = Cy_beta * beta;

  const sideDir = new THREE.Vector3()
    .crossVectors(relWind, liftDir)
    .normalize();

  const verticalTailArea = this.wingArea * 0.25;
  const sideForceMag = qdyn * verticalTailArea * Cy;
  const sideForce = sideDir.multiplyScalar(sideForceMag);
    
  // --- THRUST ---
  const thrustForce = new THREE.Vector3(0,0,-1)
    .applyQuaternion(this.plane.quaternion)
    .multiplyScalar(this.thrust);

  // --- WEIGHT ---
  const weightForce = new THREE.Vector3(0,-this.findWeight(),0);

  // --- TOTAL FORCE ---
  const totalForce = new THREE.Vector3()
    .add(dragForce)
    .add(liftForce)
    .add(thrustForce)
    .add(weightForce)
    .add(sideForce);

  // --- LINEAR MOTION ---
  const acceleration = totalForce.multiplyScalar(1 / this.mass);

  this.velocity.addScaledVector(acceleration, dt);

  if (this.plane.position.y <= elevation) {

    this.plane.position.y = elevation;

    this.velocity.y = Math.max(0, this.velocity.y);
    // ground friction
    this.velocity.x *= 0.8;
    this.velocity.z *= 0.8;

    // stop spinning
    this.angularVelocity.multiplyScalar(0.2);
  }
  console.log("roll torque:", this.torque.z);
  console.log("yaw torque:", this.torque.y);
    
  this.plane.position.addScaledVector(this.velocity, dt);
  }
}
