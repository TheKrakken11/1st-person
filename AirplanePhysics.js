import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
// unless specified, assume variables are in SI units
class Aircraft {
  constructor({
    object,
    weight,    //lbs
    wingArea,  //ft^2
    wingspan   //ft
  }) {
    this.mass = 0.453592 * weight;
    this.wingArea = wingArea;
    this.gravity = 9.81;
    this.plane = object; //three.js object with position, rotation, etc.
    this.wingspan = wingspan;
    this.thrust = 0;
    this.velocity = new THREE.Vector3(0, 0, -200); //m/s
  }
  findLift(velocity, Cl) {
    return 0.0569 * Math.pow(velocity, 2) * this.wingArea * Cl;
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
  findCd(Cl, Cd0 = 0.025, e = 0.85) {
    const aspectRatio = Math.pow(this.wingspan, 2) / this.wingArea;
    const inducedDrag = (Cl * Cl) / (Math.PI * aspectRatio * e);
    return Cd0 + inducedDrag;
  }
  findDrag(velocity, Cd) {
    return 0.0569 * velocity * velocity * this.wingArea * Cd;
  }
  updateThrust(thrust) {
    this.thrust = thrust;
  }
  update(dt) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.plane.quaternion);
    const velDir = this.velocity.clone().normalize();
    // Signed AoA in radians
    const localVel = velDir.clone().applyQuaternion(this.plane.quaternion.clone().invert());
    const alphaRad = Math.atan2(localVel.y, -localVel.z);
    
    const Cl = this.findCl((alphaRad * 180 / Math.PI) + 3);
    const lift = this.findLift(this.velocity.length(), Cl);
    const thrust = this.thrust;
    const Cd = this.findCd(Cl);
    const drag = this.findDrag(this.velocity.length(), Cd);
    const dirForces = new THREE.Vector3(0, lift, drag-thrust); // -Z is forward
    const rotation = new THREE.Quaternion().setFromEuler(this.plane.rotation);
    dirForces.applyQuaternion(rotation);
    const weight = this.findWeight();
    const yForces = new THREE.Vector3(0, -weight, 0);
    const finalForces = new THREE.Vector3().add(yForces).add(dirForces)
    finalForces.multiplyScalar(1 / this.mass);
    this.velocity.add(finalForces.multiplyScalar(dt));
    this.plane.position.add(this.velocity.clone().multiplyScalar(dt));
  }
}
