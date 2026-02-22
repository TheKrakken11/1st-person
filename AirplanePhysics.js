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
  update(dt) {
    console.clear();
    this.airDensity = this.findRho();
    const speed = this.velocity.length();
    const velDir = speed > 1e-6 ? this.velocity.clone().normalize() : new THREE.Vector3(0,0,0);
    // --- BODY-AXIS VELOCITY ---
    const bodyVel = this.velocity.clone()
      .applyQuaternion(this.plane.quaternion.clone().invert());
    
    // In coordinate system:
    // Forward = (0, 0, -1)
    // Up      = (0, 1,  0)
    
    const u = -bodyVel.z;   // forward velocity component
    const w = bodyVel.y;    // vertical body component
    
    // Prevent divide-by-zero issues at very low speed
    const alphaRad = Math.atan2(w, Math.max(u, 0.001));
    console.log("AoA:   ", (alphaRad * 180 / Math.PI) + 3);
    const Cl = this.findCl((alphaRad * 180 / Math.PI) + 3);
    const thrust = this.thrust;

  
    // --- DRAG (opposes velocity) ---
    const Cd = this.findCd(Cl);
    const dragMag = this.findDrag(speed, Cd);
    const dragForce = velDir.clone().multiplyScalar(-dragMag);

    // --- LIFT (perpendicular to airflow) ---
    const relWind = this.velocity.clone().multiplyScalar(-1);
    const relspeed = relWind.length();
    const Vhat = relWind.clone().normalize();
    const spanDir = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.plane.quaternion)
      .normalize();
    const liftNormal = new THREE.Vector3()
      .crossVectors(spanDir, Vhat)
      .normalize();
    const liftDir = new THREE.Vector3()
      .crossVectors(Vhat, liftNormal)
      .cross(Vhat)
      .normalize();
    console.log("Lift:   ", liftDir);
    if (liftDir.lengthSq() < 1e-6) liftDir.set(0,0,0);
    
    const liftMag = this.findLift(speed, Cl);
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
