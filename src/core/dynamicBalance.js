import * as THREE from 'three';

/**
 * Boston Dynamics Active Dynamic Balance & Push Recovery Controller
 *
 * Implements:
 * 1. Linear Inverted Pendulum Model (LIPM) & Instantaneous Capture Point (CP).
 * 2. Regime 1 (Low Disturbance): Ankle Strategy & Continuous Ground Reaction Moment.
 *    Active pitch and roll virtual model torque on Pelvis/Feet to restore upright equilibrium.
 * 3. Regime 2 (Medium/High Disturbance): Capture Point Stepping & Active Ground Braking.
 *    Dynamic step targeting Capture Point with foot clearance swing arc, followed by
 *    active ground friction impulse directly arresting horizontal momentum (v_CoM -> 0).
 * 4. Multi-Step Recovery: Successive alternating steps for strong perturbations.
 * 5. Counter-Momentum Arm Swing: Inertial counter-torque reflex.
 * 6. Vertical Anti-Buckling Suspension: Keeps pelvis elevated at natural stance height.
 */
export class DynamicBalanceController {
  constructor(character) {
    this.character = character;
    this.steppingFoot = 'Left'; // 'Left' | 'Right'
    this.steppingPhase = 0.0;    // 0.0 -> 1.0
    this.zmpDisplacement = 0.0;
    this.recoveryStepCount = 0;
  }

  reset() {
    this.steppingFoot = 'Left';
    this.steppingPhase = 0.0;
    this.zmpDisplacement = 0.0;
    this.recoveryStepCount = 0;
  }

  update(dt) {
    const char = this.character;
    if (!char || char.isKinematic || char.isPureRagdoll || char.balanceControlEnabled === false) {
      return;
    }

    const pelvis = char.bodies['Pelvis'];
    if (!pelvis || !pelvis.rigidBody) return;
    const pelvisTrans = pelvis.rigidBody.translation();
    const pelvisVel = pelvis.rigidBody.linvel ? pelvis.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
    const pelvisY = pelvisTrans.y;

    const footL = char.bodies['LeftFoot']?.rigidBody;
    const footR = char.bodies['RightFoot']?.rigidBody;
    if (!footL || !footR) return;

    const footLPos = footL.translation();
    const footRPos = footR.translation();
    const footLNearGround = footLPos.y <= 0.16;
    const footRNearGround = footRPos.y <= 0.16;
    const hasAnyGroundContact = footLNearGround || footRNearGround || Boolean(char.sensors?.feetGrounded);

    // If completely airborne and high, cannot apply ground reaction balance
    if (!hasAnyGroundContact && pelvisY > 0.65) {
      return;
    }

    // Support base midpoint
    const baseSupportX = (footLPos.x + footRPos.x) * 0.5;
    const baseSupportZ = (footLPos.z + footRPos.z) * 0.5;

    // Inverted pendulum eigenfrequency: omega0 = sqrt(g / h_com)
    const comY = Math.max(0.35, char.sensors?.centerOfMass?.y || pelvisY);
    const omega0 = Math.sqrt(9.81 / comY);

    // Instantaneous CoM velocity and Capture Point (CP = CoM + v / omega0)
    const comVx = (char.sensors?.comVelocity?.x !== undefined) ? char.sensors.comVelocity.x : (pelvisVel.x || 0);
    const comVz = (char.sensors?.comVelocity?.z !== undefined) ? char.sensors.comVelocity.z : (pelvisVel.z || 0);
    const hSpeed = Math.hypot(comVx, comVz);

    const comX = (char.sensors?.centerOfMass?.x !== undefined) ? char.sensors.centerOfMass.x : pelvisTrans.x;
    const comZ = (char.sensors?.centerOfMass?.z !== undefined) ? char.sensors.centerOfMass.z : pelvisTrans.z;

    const zmpX = comX + (comVx / omega0);
    const zmpZ = comZ + (comVz / omega0);

    // Capture point error relative to feet base
    const errX = zmpX - baseSupportX;
    const errZ = zmpZ - baseSupportZ;
    this.zmpDisplacement = Math.hypot(errX, errZ);
    char.zmpDisplacement = this.zmpDisplacement;

    const tilt = char.sensors?.tiltAngle ?? 0;
    const maxTilt = char.lossOfBalanceTiltLimit !== undefined ? char.lossOfBalanceTiltLimit : 55;

    // Catastrophic unrecoverable fall threshold:
    // Only surrender if torso has tilted beyond limit AND pelvis is collapsed to ground,
    // or if vertical downward fall speed is extreme
    if ((tilt > maxTilt && pelvisY < 0.38) || pelvisY < 0.25 || (char.sensors?.verticalVelocity ?? 0) < -2.8) {
      char.isLossOfBalance = true;
      return;
    }
    char.isLossOfBalance = false;

    const recoveryStrength = char.balanceRecoveryStrength ?? 1.0;

    // =========================================================================
    // REGIME 1: CONTINUOUS GROUND REACTION TORQUE & ANKLE/HIP EQUILIBRIUM
    // =========================================================================
    if (hasAnyGroundContact && pelvisY > 0.35) {
      // Counter pitch perturbation (forward / backward)
      const pitchKp = 320.0 * recoveryStrength;
      const pitchKd = 50.0 * recoveryStrength;
      const torqueX = (errZ * pitchKp) + (comVz * pitchKd);

      // Counter roll perturbation (lateral sway)
      const rollKp = 280.0 * recoveryStrength;
      const rollKd = 45.0 * recoveryStrength;
      const torqueZ = (-errX * rollKp) - (comVx * rollKd);

      pelvis.rigidBody.applyTorqueImpulse({
        x: THREE.MathUtils.clamp(torqueX * dt, -45.0, 45.0),
        y: 0,
        z: THREE.MathUtils.clamp(torqueZ * dt, -45.0, 45.0)
      }, true);

      // Spine posture bracing
      const spine = char.bodies['UpperSpine'] || char.bodies['LowerSpine'];
      if (spine && spine.rigidBody) {
        spine.rigidBody.applyTorqueImpulse({
          x: THREE.MathUtils.clamp(torqueX * dt * 0.4, -20.0, 20.0),
          y: 0,
          z: THREE.MathUtils.clamp(torqueZ * dt * 0.4, -20.0, 20.0)
        }, true);
      }

      // Vertical Anti-Buckling Suspension (keeps knees from collapsing under gravity / impulse)
      const targetHeight = 0.92;
      const heightErr = targetHeight - pelvisY;
      if (heightErr > 0 && (pelvisVel.y || 0) < 0.1) {
        const supportForce = (heightErr * 2200.0 - (pelvisVel.y || 0) * 320.0) * dt;
        pelvis.rigidBody.applyImpulse({ x: 0, y: Math.min(supportForce, 30.0), z: 0 }, true);
      }
    }

    // =========================================================================
    // REGIME 2: BOSTON DYNAMICS CAPTURE POINT STEPPING & ACTIVE GROUND BRAKING
    // =========================================================================
    if (this.zmpDisplacement > 0.07 || hSpeed > 0.15) {
      // Progression rate scales with perturbation velocity
      const stepProgressionSpeed = THREE.MathUtils.clamp(3.2 + hSpeed * 4.5, 3.2, 8.5);
      this.steppingPhase += dt * stepProgressionSpeed;

      // When step completes (phase >= 1.0):
      if (this.steppingPhase >= 1.0) {
        this.steppingPhase = 0.0;
        this.recoveryStepCount++;
        // If horizontal motion persists, alternate foot for another step
        this.steppingFoot = (this.steppingFoot === 'Left') ? 'Right' : 'Left';
      }

      // If at start of recovery step, bias toward the unweighted or falling side
      if (this.steppingPhase < 0.15 && hSpeed > 0.25) {
        if (Math.abs(comVx) > Math.abs(comVz) * 0.5) {
          this.steppingFoot = (comVx > 0) ? 'Right' : 'Left';
        }
      }

      const isLeftSwing = (this.steppingFoot === 'Left');
      const swingHipName = isLeftSwing ? 'Pelvis_to_LeftThigh' : 'Pelvis_to_RightThigh';
      const swingKneeName = isLeftSwing ? 'LeftThigh_to_LeftCalf' : 'RightThigh_to_RightCalf';
      const swingAnkleName = isLeftSwing ? 'LeftCalf_to_LeftFoot' : 'RightCalf_to_RightFoot';
      const stanceHipName = isLeftSwing ? 'Pelvis_to_RightThigh' : 'Pelvis_to_LeftThigh';
      const stanceKneeName = isLeftSwing ? 'RightThigh_to_RightCalf' : 'LeftThigh_to_LeftCalf';

      const swingHip = char.joints?.find(j => j.name === swingHipName);
      const swingKnee = char.joints?.find(j => j.name === swingKneeName);
      const swingAnkle = char.joints?.find(j => j.name === swingAnkleName);
      const stanceHip = char.joints?.find(j => j.name === stanceHipName);
      const stanceKnee = char.joints?.find(j => j.name === stanceKneeName);

      // Pitch step angle: reaches leg forward or backward toward Capture Point
      const pitchStep = THREE.MathUtils.clamp(errZ * 2.2, -1.1, 1.2) * recoveryStrength;
      // Roll step angle: steps outward laterally for wide, stable base
      const rollStep = THREE.MathUtils.clamp(errX * 1.5, -0.65, 0.65) * recoveryStrength;

      const phase = this.steppingPhase;
      const footLift = Math.sin(phase * Math.PI);

      if (swingHip) {
        swingHip.targetAngle.x += pitchStep * (0.55 + 0.45 * phase);
        swingHip.targetAngle.z += (isLeftSwing ? rollStep : -rollStep) * 0.85;
      }
      if (swingKnee) {
        // Lift foot off floor in mid-swing, then extend knee before touchdown
        swingKnee.targetAngle.x += footLift * 0.80 * Math.max(0.4, Math.abs(pitchStep));
      }
      if (swingAnkle) {
        // Plant foot flat on floor
        swingAnkle.targetAngle.x -= pitchStep * 0.45;
      }

      // Stance leg: remains stiff and straight to support body weight
      if (stanceHip) {
        stanceHip.targetAngle.x -= pitchStep * 0.18;
      }
      if (stanceKnee) {
        stanceKnee.targetAngle.x = Math.max(0.04, stanceKnee.targetAngle.x * 0.5);
      }

      // ACTIVE GROUND BRAKING IMPULSE:
      // When the stepping foot reaches touchdown (phase > 0.6) or stance foot is on floor,
      // apply braking impulse in the opposite direction of horizontal velocity
      const plantFoot = (phase > 0.6) ? (isLeftSwing ? footL : footR) : (isLeftSwing ? footR : footL);
      if (plantFoot && hasAnyGroundContact) {
        const brakeScale = Math.min(1.0, dt * 14.0 * recoveryStrength);
        const totalMass = 75.0;
        const brakeX = -comVx * totalMass * brakeScale;
        const brakeZ = -comVz * totalMass * brakeScale;

        plantFoot.applyImpulse({
          x: THREE.MathUtils.clamp(brakeX, -50.0, 50.0),
          y: Math.abs(comVx + comVz) * 3.0 * dt,
          z: THREE.MathUtils.clamp(brakeZ, -50.0, 50.0)
        }, true);
      }

      // Dynamic Counter-Momentum Arm Swing Reflex
      if (char.counterWeighingEnabled !== false) {
        const lArm = char.joints?.find(j => j.name === 'LeftShoulder_to_LeftUpperArm');
        const rArm = char.joints?.find(j => j.name === 'RightShoulder_to_RightUpperArm');
        if (lArm && rArm) {
          const armPitch = THREE.MathUtils.clamp(-errZ * 1.6, -0.85, 0.85);
          lArm.targetAngle.x += (isLeftSwing ? -armPitch : armPitch) * 0.85;
          rArm.targetAngle.x += (isLeftSwing ? armPitch : -armPitch) * 0.85;
          lArm.targetAngle.z -= Math.abs(rollStep) * 0.65;
          rArm.targetAngle.z += Math.abs(rollStep) * 0.65;
        }
      }
    } else {
      // In equilibrium: decay phase smoothly
      this.steppingPhase = 0.0;
      this.recoveryStepCount = 0;
    }
  }
}
