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
    this.velocity = new THREE.Vector3(0, 1, -200); //m/s
    this.airDensity = 1.225;
    this.angularVelocity = new THREE.Vector3(); // rad/s (p,q,r)
    this.torque = new THREE.Vector3();          // body-axis torque
    this.I = new THREE.Vector3(
      12000,   // Ixx (roll)
      80000,   // Iyy (pitch)
      90000    // Izz (yaw)
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
  update(dt) {
    if (Math.random() >= 0.7) {
      console.clear();
    }
    this.torque.set(0,0,0); // reset each frame
    // --- CONTROL TORQUES ---
    const speedSq = this.velocity.lengthSq();
    const qdyn = 0.5 * this.airDensity * speedSq;

    // Constants for authority (tune for realism)
    const pitchAuthority = 25000; // N·m
    const rollAuthority  = 15000; // N·m
    const yawAuthority   = 10000; // N·m

    // Scale by dynamic pressure to make controls weaker at low speed
    this.torque.y += pitchAuthority * this.pitchInput * Math.min(qdyn/10000, 1);
    this.torque.x += rollAuthority  * this.rollInput  * Math.min(qdyn/10000, 1);
    this.torque.z += yawAuthority   * this.yawInput   * Math.min(qdyn/10000, 1);
    
    this.airDensity = this.findRho();
    const speed = this.velocity.length();
    const velDir = speed > 1e-6 ? this.velocity.clone().normalize() : new THREE.Vector3(0,0,0);

    const bodyVel = this.velocity.clone()
      .applyQuaternion(this.plane.quaternion.clone().invert());
    
    // In coordinate system:
    // Forward = (0, 0, -1)
    // Up      = (0, 1,  0)
    
    const u = -bodyVel.z;   // forward velocity component
    const v = bodyVel.x;    // right velocity component
    const w = -bodyVel.y;    // vertical body component
    const alphaRad = Math.atan2(w, u);
    console.log("u:    ", u);
    console.log("w:    ", w);
    console.log("AoA:   ", (alphaRad * 180 / Math.PI) + 3);
    const Cl = this.findCl((alphaRad * 180 / Math.PI) + 3);
    const thrust = this.thrust;

    const cbar = 3.0; // mean aerodynamic chord (m)
    const qRate = this.angularVelocity.y;

    const Cm =
      -0.05 +
      (-0.8 * (alphaRad + (3 * (Math.PI / 180)))) +
      (-12 * (qRate * cbar / (2 * Math.max(speed, 0.1)))));

    const pitchMoment = qdyn * this.wingArea * cbar * Cm;
    this.torque.y += pitchMoment;

    const beta = speed > 1e-3 ? Math.asin(THREE.MathUtils.clamp(v / speed, -1, 1)) : 0;

    const Cn_beta = -0.25;

    const yawMoment =
      qdyn * this.wingArea * this.wingspan *
      (Cn_beta * beta);

    this.torque.z += yawMoment;
    const pRate = this.angularVelocity.x;

    const Cl_p = -0.5;

    const rollMoment =
      qdyn * this.wingArea * this.wingspan *
      (Cl_p * (pRate * this.wingspan / (2 * Math.max(speed, 0.1))));
    
    this.torque.x += rollMoment;

    // --- ANGULAR DYNAMICS ---

    const omega = this.angularVelocity.clone();

    // I * omega
    const Iomega = new THREE.Vector3(
      this.I.x * omega.x,
      this.I.y * omega.y,
      this.I.z * omega.z
    );
    
    // gyroscopic term ω × (Iω)
    const gyro = new THREE.Vector3().crossVectors(omega, Iomega);
    
    // angular acceleration
    const angularAccel = new THREE.Vector3(
      (this.torque.x - gyro.x) / this.I.x,
      (this.torque.y - gyro.y) / this.I.y,
      (this.torque.z - gyro.z) / this.I.z
    );

    // integrate angular velocity
    this.angularVelocity.addScaledVector(angularAccel, dt);

    // quaternion derivative
    const q = this.plane.quaternion;

    const omegaQuat = new THREE.Quaternion(
      this.angularVelocity.x,
      this.angularVelocity.y,
      this.angularVelocity.z,
      0
    );
      
    omegaQuat.multiply(q);

    q.x += 0.5 * omegaQuat.x * dt;
    q.y += 0.5 * omegaQuat.y * dt;
    q.z += 0.5 * omegaQuat.z * dt;
    q.w += 0.5 * omegaQuat.w * dt;

    q.normalize();
    
    // --- BODY-AXIS VELOCITY ---
    
    // Prevent divide-by-zero issues at very low speed

  
    // --- DRAG (opposes velocity) ---
    const Cd = this.findCd(Cl);
    const dragMag = this.findDrag(speed, Cd);
    const dragForce = velDir.clone().multiplyScalar(-dragMag);

    // --- LIFT (perpendicular to airflow and wingspan) ---

    const relWind = this.velocity.clone().multiplyScalar(-1);
    const Vhat = relWind.clone().normalize();

    const right = new THREE.Vector3(1,0,0)
      .applyQuaternion(this.plane.quaternion);

    const up = new THREE.Vector3(0,1,0)
      .applyQuaternion(this.plane.quaternion);

    // Remove lateral component (symmetry constraint)
    const Vsym = Vhat.clone().sub(
      right.clone().multiplyScalar(Vhat.dot(right))
    );

    if (Vsym.lengthSq() > 1e-6) {
      Vsym.normalize();
    }

    // Lift is perpendicular to airflow inside symmetry plane
    let liftDir = up.clone().sub(
      Vsym.clone().multiplyScalar(up.dot(Vsym))
    );

    if (liftDir.lengthSq() > 1e-6) {
      liftDir.normalize();
    } else {
      liftDir.set(0, 0, 0);
    }
    
    const liftMag = this.findLift(speed, Cl);
    console.log("Lift:   ", liftMag);
    const liftForce = liftDir.multiplyScalar(liftMag);
    // --- THRUST (forward along aircraft nose) ---
    const thrustForce = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.plane.quaternion)
      .multiplyScalar(this.thrust);

    // --- WEIGHT ---
    const weightForce = new THREE.Vector3(0, -this.findWeight(), 0);

    // --- TOTAL FORCE ---
    const totalForce = new THREE.Vector3()
      .add(dragForce)
      .add(liftForce)
      .add(thrustForce)
      .add(weightForce);

    // --- ACCELERATION ---
    const acceleration = totalForce.multiplyScalar(1 / this.mass);

    this.velocity.add(acceleration.multiplyScalar(dt));
    console.log("Velocity:   ", this.velocity);
    this.plane.position.add(this.velocity.clone().multiplyScalar(dt));
  }
}
