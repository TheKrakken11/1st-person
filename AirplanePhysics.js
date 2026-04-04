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

    const speed = Math.max(this.velocity.length(), 0.1);
    const velDir = this.velocity.clone().normalize();

    // --- AIR DENSITY ---
    this.airDensity = this.findRho();
    const qdyn = 0.5 * this.airDensity * speed * speed;

    // --- ANGLES OF ATTACK / SIDESLIP ---
    const velBody = this.velocity.clone().applyQuaternion(q.clone().invert());
    const alpha = Math.atan2(-velBody.y, -velBody.z);
    const forwardSpeed = Math.max(-velBody.z, 5);
    const beta = THREE.MathUtils.clamp(Math.atan2(-velBody.x, forwardSpeed), -0.5, 0.5);

    // --- AERODYNAMIC FORCES ---
    const Cl = this.findCl(THREE.MathUtils.radToDeg(alpha));
    const Cd = this.findCd(Cl);

    const lift = qdyn * this.wingArea * Cl;
    const drag = qdyn * this.wingArea * Cd;

    const liftDir = new THREE.Vector3(0,1,0).applyQuaternion(q).normalize();
    const Lift = liftDir.clone().multiplyScalar(lift);
    const Drag = velDir.clone().multiplyScalar(-drag);
    const Thrust = forward.clone().multiplyScalar(this.thrust);
    const Weight = new THREE.Vector3(0,-this.mass*this.gravity,0);

    const totalForce = new THREE.Vector3()
        .add(Lift)
        .add(Drag)
        .add(Thrust)
        .add(Weight);

    // --- VELOCITY UPDATE ---
    const accel = totalForce.multiplyScalar(1/this.mass);
    this.velocity.addScaledVector(accel, dt);
    this.velocity.multiplyScalar(0.999); // drag stabilization
    this.velocity.clampLength(0, 250);

    // --- CONTROL INPUTS AS TORQUE ---
    const maxTorque = 2.0; // limit angular acceleration
    const rollTorque  = this.rollInput  * maxTorque;
    const pitchTorque = this.pitchInput * maxTorque;
    const yawTorque   = this.yawInput   * maxTorque;

    // Apply torques to angular velocity
    this.angularVelocity.x += rollTorque * dt;
    this.angularVelocity.y += pitchTorque * dt;
    this.angularVelocity.z += yawTorque * dt;

    // --- ZERO OUT VERY SMALL ANGULAR VELOCITIES ---
    const angThreshold = 0.001;
    if (Math.abs(this.angularVelocity.x) < angThreshold) this.angularVelocity.x = 0;
    if (Math.abs(this.angularVelocity.y) < angThreshold) this.angularVelocity.y = 0;
    if (Math.abs(this.angularVelocity.z) < angThreshold) this.angularVelocity.z = 0;

    // --- ANGULAR DAMPING ---
    this.angularVelocity.multiplyScalar(0.98);

    // --- QUATERNION UPDATE ---
    const omega = this.angularVelocity.clone();
    const angle = omega.length() * dt;
    if (angle > 1e-5) {
        const axis = omega.clone().normalize();
        const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        this.plane.quaternion.multiply(dq);
        this.plane.quaternion.normalize();
    }

    // --- POSITION UPDATE ---
    this.plane.position.addScaledVector(this.velocity, dt);

    // --- GROUND COLLISION ---
    if (this.plane.position.y <= elevation) {
        this.plane.position.y = elevation;
        if (this.velocity.y < 0) this.velocity.y = 0;
        this.velocity.x *= 0.7;
        this.velocity.z *= 0.7;
        this.angularVelocity.multiplyScalar(0.3);
    }
  }
}
