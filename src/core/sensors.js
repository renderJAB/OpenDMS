import * as THREE from 'three';

export class CharacterSensors {
  constructor(character) {
    this.character = character;
    this.centerOfMass = new THREE.Vector3();
    this.previousCOM = new THREE.Vector3();
    this.comVelocity = new THREE.Vector3();
    this.groundProjectedCOM = new THREE.Vector2();
    this.tiltAngle = 0; // degrees from vertical (0 = upright, 90 = horizontal)
    this.leftFootContact = false;
    this.rightFootContact = false;
    this.leftHandContact = false;
    this.rightHandContact = false;
    this.pelvisContact = false;
    this.torsoContact = false;
    this.handsGrounded = false;
    this.feetGrounded = false;
    this.bodyGrounded = false;
    this.hasGroundContact = false;
    this.isFalling = false;
    this.verticalVelocity = 0;
  }

  update(dt) {
    if (!this.character || !this.character.bodies) return;

    let totalMass = 0;
    const weightedSum = new THREE.Vector3();

    // Accumulate Center of Mass across all MetaBodies
    for (const [name, body] of Object.entries(this.character.bodies)) {
      if (!body.rigidBody) continue;
      const t = body.rigidBody.translation();
      const mass = body.mass || 1.0;
      weightedSum.addScaledVector(new THREE.Vector3(t.x, t.y, t.z), mass);
      totalMass += mass;
    }

    if (totalMass > 0) {
      this.centerOfMass.copy(weightedSum).divideScalar(totalMass);
    }

    // Compute CoM velocity
    if (dt > 0) {
      this.comVelocity.copy(this.centerOfMass).sub(this.previousCOM).divideScalar(dt);
      this.verticalVelocity = this.comVelocity.y;
    }
    this.previousCOM.copy(this.centerOfMass);

    // Ground projection of CoM
    this.groundProjectedCOM.set(this.centerOfMass.x, this.centerOfMass.z);

    // Compute spine tilt angle from Up vector (0, 1, 0)
    const spineBody = this.character.bodies['UpperSpine'] || this.character.bodies['LowerSpine'];
    if (spineBody && spineBody.rigidBody) {
      const rot = spineBody.rigidBody.rotation();
      const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const spineUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      this.tiltAngle = THREE.MathUtils.radToDeg(spineUp.angleTo(new THREE.Vector3(0, 1, 0)));
    }

    // Per-limb and torso ground contact detection
    const getBottomY = (bodyName, defaultRadius = 0.05) => {
      const b = this.character.bodies[bodyName];
      if (!b || !b.rigidBody) return 999.0;
      const trans = b.rigidBody.translation();
      const rot = b.rigidBody.rotation();
      const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const halfHeight = (b.type === 'capsule' || b.type === 'capsule_x') ? (b.height || 0.16) * 0.5 : 0.0;
      const localAxis = b.type === 'capsule_x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const worldAxis = localAxis.applyQuaternion(q);
      const verticalExtent = Math.abs(worldAxis.y) * halfHeight + (b.radius || defaultRadius);
      return trans.y - verticalExtent;
    };

    const lfBottom = getBottomY('LeftFoot', 0.035);
    const rfBottom = getBottomY('RightFoot', 0.035);
    const lhBottom = getBottomY('LeftHand', 0.02);
    const rhBottom = getBottomY('RightHand', 0.02);
    const pelvBottom = getBottomY('Pelvis', 0.10);
    const spineBottom = Math.min(getBottomY('LowerSpine', 0.10), getBottomY('UpperSpine', 0.125));

    this.leftFootContact = lfBottom <= 0.05;
    this.rightFootContact = rfBottom <= 0.05;
    this.leftHandContact = lhBottom <= 0.05;
    this.rightHandContact = rhBottom <= 0.05;
    this.pelvisContact = pelvBottom <= 0.14;
    this.torsoContact = spineBottom <= 0.15;

    this.handsGrounded = this.leftHandContact || this.rightHandContact;
    this.feetGrounded = this.leftFootContact || this.rightFootContact;
    this.bodyGrounded = this.pelvisContact || this.torsoContact;
    this.hasGroundContact = this.handsGrounded || this.feetGrounded || this.bodyGrounded;

    // Fall detection threshold
    this.isFalling = this.verticalVelocity < -1.2 || this.tiltAngle > 35;
  }

  reset() {
    this.centerOfMass.set(0, 0, 0);
    this.previousCOM.set(0, 0, 0);
    this.comVelocity.set(0, 0, 0);
    this.groundProjectedCOM.set(0, 0);
    this.tiltAngle = 0;
    this.leftFootContact = false;
    this.rightFootContact = false;
    this.leftHandContact = false;
    this.rightHandContact = false;
    this.pelvisContact = false;
    this.torsoContact = false;
    this.handsGrounded = false;
    this.feetGrounded = false;
    this.bodyGrounded = false;
    this.hasGroundContact = false;
    this.isFalling = false;
    this.verticalVelocity = 0;
  }

  getSnapshot() {
    return {
      com: this.centerOfMass.clone(),
      comVelocity: this.comVelocity.clone(),
      tiltAngle: this.tiltAngle,
      isFalling: this.isFalling,
      leftGrounded: this.leftFootContact,
      rightGrounded: this.rightFootContact,
      leftHandGrounded: this.leftHandContact,
      rightHandGrounded: this.rightHandContact,
      bodyGrounded: this.bodyGrounded,
      hasContact: this.hasGroundContact
    };
  }
}
