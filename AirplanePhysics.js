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

  this.airDensity = this.findRho();

  const q = this.plane.quaternion;

  // BODY AXES
  const forward = new THREE.Vector3(0,0,-1).applyQuaternion(q);
  const right   = new THREE.Vector3(1,0,0).applyQuaternion(q);
  const up      = new THREE.Vector3(0,1,0).applyQuaternion(q);

  const speed = Math.max(this.velocity.length(), 0.1);

  const velBody = this.velocity.clone()
      .applyQuaternion(q.clone().invert());

  const u = -velBody.z;
  const v = velBody.x;
  const w = velBody.y;

  const alpha = Math.atan2(w, u);
  const beta  = Math.atan2(v, speed);

  const qdyn = 0.5 * this.airDensity * speed * speed;

  // LIFT / DRAG

  const Cl = THREE.MathUtils.clamp(
      5.5 * alpha,
      -1.2,
      1.4
  );

  const Cd = 0.025 + Cl*Cl*0.05;

  const liftMag = qdyn * this.wingArea * Cl;
  const dragMag = qdyn * this.wingArea * Cd;

  const liftForce = up.clone().multiplyScalar(liftMag);
  const dragForce = forward.clone().multiplyScalar(-dragMag);

  // SIDE FORCE (weather vane stability)

  const Cy = -1.2 * beta;
  const sideForce = right.clone().multiplyScalar(
      qdyn * this.wingArea * Cy
  );

  // THRUST

  const thrustForce = forward.clone().multiplyScalar(this.thrust);

  // WEIGHT

  const weightForce = new THREE.Vector3(0,-this.findWeight(),0);

  // TOTAL FORCE

  const totalForce = new THREE.Vector3()
      .add(liftForce)
      .add(dragForce)
      .add(sideForce)
      .add(thrustForce)
      .add(weightForce);

  const acceleration = totalForce.multiplyScalar(1/this.mass);

  this.velocity.addScaledVector(acceleration, dt);

  // -----------------------------
  // ROTATIONAL DYNAMICS
  // -----------------------------

  const rollRate  = this.angularVelocity.x;
  const pitchRate = this.angularVelocity.y;
  const yawRate   = this.angularVelocity.z;

  // CONTROL EFFECTIVENESS

  const rollAccel =
      this.rollInput * 2.5
      - rollRate * 1.8
      - beta * 0.8;

  const pitchAccel =
      this.pitchInput * 2.0
      - pitchRate * 1.6
      - alpha * 1.4;

  const yawAccel =
      this.yawInput * 1.5
      - yawRate * 1.8
      + beta * 1.2;

  this.angularVelocity.x += rollAccel * dt;
  this.angularVelocity.y += pitchAccel * dt;
  this.angularVelocity.z += yawAccel * dt;

  // clamp spin rate (prevents physics explosion)

  this.angularVelocity.clampLength(0,4);

  // QUATERNION INTEGRATION

  const omega = this.angularVelocity;

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

  // POSITION

  this.plane.position.addScaledVector(this.velocity, dt);

  // GROUND

  if (this.plane.position.y <= elevation) {

      this.plane.position.y = elevation;

      this.velocity.y = Math.max(0,this.velocity.y);

      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;

      this.angularVelocity.multiplyScalar(0.3);
  }
  }
}
