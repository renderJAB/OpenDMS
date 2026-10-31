import * as THREE from 'three';

// Canonical Natural Standing Reference Stance Rotations (Endorphin Natural Stance)
export const DEFAULT_STANCE_ROTATIONS = {
  LeftUpperArm: [0.08, -0.12, -1.15],
  LeftForearm: [0.26, 0, 0],
  RightUpperArm: [0.08, 0.12, 1.15],
  RightForearm: [0.26, 0, 0],
  LeftThigh: [-0.08, 0, 0.02],
  LeftCalf: [0.12, 0, 0],
  LeftFoot: [-0.04, 0, -0.02],
  RightThigh: [-0.08, 0, -0.02],
  RightCalf: [0.12, 0, 0],
  RightFoot: [-0.04, 0, 0.02],
  LowerSpine: [0.04, 0, 0],
  UpperSpine: [-0.03, 0, 0],
  Head: [0.02, 0, 0]
};

/**
 * Boston Dynamics Active Dynamic Balance & Push Recovery Controller
 *
 * Implements:
 * 1. Linear Inverted Pendulum Model (LIPM) & Instantaneous Capture Point (CP).
 * 2. Ankle & Pelvis Strategy: Upright restoring moments for subtle perturbations.
 * 3. Boston Dynamics Stumble Stepping Reflex:
 *    When pushed, character takes 2-3 active stumbling steps in the direction of momentum:
 *    - Swing leg lifts with foot clearance arc (~12cm) to avoid ground snagging.
 *    - Steps toward Capture Point to establish wide support polygon.
 *    - Stance leg knee braces and vertical suspension keeps pelvis elevated at ~0.94m.
 *    - Stepping foot touches down and applies active ground braking impulse against horizontal velocity.
 *    - Alternates feet (Left -> Right -> Left).
 * 4. Recovery to Standing Pause:
 *    Once momentum is arrested, smoothly interpolates all joint motor targets back to
 *    DEFAULT_STANCE_ROTATIONS, squaring stance and restoring upright standing pause.
 * 5. Absolute Joint Offsets: Joint angles are computed relative to reference stance each frame,
 *    preventing angular accumulation runaway.
 */
export class DynamicBalanceController {
  constructor(character) {
    this.character = character;
    this.state = 'STANDING'; // 'STANDING' | 'STUMBLING' | 'RECOVERING'
    this.steppingFoot = 'Left'; // 'Left' | 'Right'
    this.stepPhase = 0.0;       // 0.0 -> 1.0
    this.stepCount = 0;
    this.targetStepCount = 2;
    this.recoveryProgress = 0.0;
    this.recoveryStartRotations = {};
    this.zmpDisplacement = 0.0;
    this.stumblePushDir = { x: 0, z: 0 };
  }

  reset() {
    this.state = 'STANDING';
    this.steppingFoot = 'Left';
    this.stepPhase = 0.0;
    this.stepCount = 0;
    this.targetStepCount = 2;
    this.recoveryProgress = 0.0;
    this.recoveryStartRotations = {};
    this.zmpDisplacement = 0.0;
    this.stumblePushDir = { x: 0, z: 0 };
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

    // If completely airborne high off ground, cannot apply balance ground reactions
    if (!hasAnyGroundContact && pelvisY > 0.65) {
      return;
    }

    // Support base midpoint between feet
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
    // Only surrender if torso has tilted beyond limit AND pelvis is collapsed to ground
    if ((tilt > maxTilt && pelvisY < 0.35) || pelvisY < 0.22 || (char.sensors?.verticalVelocity ?? 0) < -3.2) {
      char.isLossOfBalance = true;
      return;
    }
    char.isLossOfBalance = false;

    const recoveryStrength = char.balanceRecoveryStrength ?? 1.0;

    // =========================================================================
    // STATE MACHINE TRANSITIONS
    // =========================================================================
    if (this.state === 'STANDING') {
      // Perturbation triggers stumbling steps reflex
      if (this.zmpDisplacement > 0.08 || hSpeed > 0.18) {
        this.state = 'STUMBLING';
        this.stepPhase = 0.0;
        this.stepCount = 0;
        // Determine number of stumbling steps based on impulse speed (2 to 3 steps)
        this.targetStepCount = Math.min(3, Math.max(2, Math.round(hSpeed * 2.2) + 1));
        // Pick initial swing foot in push direction
        this.steppingFoot = (comVx > 0.05 || (Math.abs(comVx) <= 0.05 && comVz > 0)) ? 'Right' : 'Left';
        this.stumblePushDir = { x: comVx, z: comVz };
      }
    }

    // =========================================================================
    // VERTICAL ANTI-BUCKLING SUSPENSION & ANKLE/TRUNK UPRIGHT TORQUES
    // =========================================================================
    if (hasAnyGroundContact && pelvisY > 0.30) {
      // Counter pitch perturbation (forward / backward restoring torque)
      const pitchKp = 320.0 * recoveryStrength;
      const pitchKd = 50.0 * recoveryStrength;
      const torqueX = (errZ * pitchKp) + (comVz * pitchKd);

      // Counter roll perturbation (lateral sway restoring torque)
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

      // Vertical Anti-Buckling Suspension (keeps pelvis elevated at ~0.94m upright height)
      const targetHeight = 0.94;
      const heightErr = targetHeight - pelvisY;
      if (heightErr > 0 && (pelvisVel.y || 0) < 0.2) {
        const supportForce = (heightErr * 2400.0 - (pelvisVel.y || 0) * 350.0) * dt;
        pelvis.rigidBody.applyImpulse({ x: 0, y: Math.min(supportForce, 38.0), z: 0 }, true);
      }
    }

    // =========================================================================
    // STATE: STUMBLING (2-3 STEPS IN DIRECTION OF MOMENTUM + GROUND BRAKING)
    // =========================================================================
    if (this.state === 'STUMBLING') {
      // Step cadence scales with perturbation speed
      const stepProgressionSpeed = THREE.MathUtils.clamp(3.8 + hSpeed * 4.0, 3.8, 7.5);
      this.stepPhase += dt * stepProgressionSpeed;

      const isLeftSwing = (this.steppingFoot === 'Left');
      const swingHipName = isLeftSwing ? 'Pelvis_to_LeftThigh' : 'Pelvis_to_RightThigh';
      const swingKneeName = isLeftSwing ? 'LeftThigh_to_LeftCalf' : 'RightThigh_to_RightCalf';
      const swingAnkleName = isLeftSwing ? 'LeftCalf_to_LeftFoot' : 'RightCalf_to_RightFoot';
      const stanceHipName = isLeftSwing ? 'Pelvis_to_RightThigh' : 'Pelvis_to_LeftThigh';
      const stanceKneeName = isLeftSwing ? 'RightThigh_to_RightCalf' : 'LeftThigh_to_LeftCalf';

      // Pitch step angle: reaches leg forward or backward toward Capture Point
      const pitchStep = THREE.MathUtils.clamp(errZ * 1.8 + comVz * 0.25, -0.95, 1.1) * recoveryStrength;
      // Roll step angle: steps outward laterally for wide base
      const rollStep = THREE.MathUtils.clamp(errX * 1.4 + comVx * 0.20, -0.55, 0.55) * recoveryStrength;

      const phase = Math.min(1.0, this.stepPhase);
      const footLift = Math.sin(phase * Math.PI); // Parabolic foot clearance arc

      // Compute absolute joint targets from DEFAULT_STANCE_ROTATIONS
      if (char.joints) {
        for (const j of char.joints) {
          const base = DEFAULT_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
          let ox = 0, oy = 0, oz = 0;

          if (j.name === swingHipName) {
            // Swing hip pitches in direction of fall, opens wide for base stability
            ox = pitchStep * (0.45 + 0.55 * phase);
            oz = (isLeftSwing ? rollStep - 0.12 : rollStep + 0.12);
          } else if (j.name === swingKneeName) {
            // Swing knee bends in mid-swing to lift foot, extends toward touchdown
            ox = footLift * 0.75 * Math.max(0.4, Math.abs(pitchStep)) + (1.0 - phase) * 0.15;
          } else if (j.name === swingAnkleName) {
            // Keep stepping foot plant angle flat on ground
            ox = -pitchStep * 0.35;
          } else if (j.name === stanceHipName) {
            // Stance hip maintains upright posture
            ox = -pitchStep * 0.14;
          } else if (j.name === stanceKneeName) {
            // Stance knee remains erect to support body mass without buckling
            ox = 0.05;
          } else if (j.name === 'LeftShoulder_to_LeftUpperArm' || j.name === 'RightShoulder_to_RightUpperArm') {
            // Dynamic counter-momentum arm swing reflex
            const isLArm = j.name.includes('Left');
            const armPitch = THREE.MathUtils.clamp(-errZ * 1.4, -0.75, 0.75);
            ox = (isLArm === isLeftSwing ? -armPitch : armPitch) * 0.8;
            oz = (isLArm ? -0.25 : 0.25);
          }

          if (j.targetAngle) {
            j.targetAngle.x = base[0] + ox;
            j.targetAngle.y = base[1] + oy;
            j.targetAngle.z = base[2] + oz;
          }
        }
      }

      // ACTIVE GROUND BRAKING IMPULSE:
      // When stepping foot touches down (phase > 0.6) or stance foot is grounded,
      // apply braking impulse in the opposite direction of horizontal velocity
      const plantFoot = (phase > 0.6) ? (isLeftSwing ? footL : footR) : (isLeftSwing ? footR : footL);
      if (plantFoot && hasAnyGroundContact) {
        const brakeScale = Math.min(1.0, dt * 16.0 * recoveryStrength);
        const totalMass = 75.0;
        const brakeX = -comVx * totalMass * brakeScale;
        const brakeZ = -comVz * totalMass * brakeScale;

        plantFoot.applyImpulse({
          x: THREE.MathUtils.clamp(brakeX, -65.0, 65.0),
          y: Math.abs(comVx + comVz) * 4.0 * dt,
          z: THREE.MathUtils.clamp(brakeZ, -65.0, 65.0)
        }, true);
      }

      // Step completion:
      if (this.stepPhase >= 1.0) {
        this.stepPhase = 0.0;
        this.stepCount++;
        // Alternate swing leg for next step
        this.steppingFoot = (this.steppingFoot === 'Left') ? 'Right' : 'Left';

        // Check if momentum has been arrested and we have taken at least 2 steps:
        if (this.stepCount >= this.targetStepCount || (this.stepCount >= 2 && hSpeed < 0.15 && this.zmpDisplacement < 0.09)) {
          // Transition to RECOVERING: smooth interpolation back to default upright pause
          this.state = 'RECOVERING';
          this.recoveryProgress = 0.0;
          this.recoveryStartRotations = {};
          if (char.joints) {
            for (const j of char.joints) {
              if (j.targetAngle) {
                this.recoveryStartRotations[j.name] = {
                  x: j.targetAngle.x,
                  y: j.targetAngle.y,
                  z: j.targetAngle.z
                };
              }
            }
          }
        }
      }
    }

    // =========================================================================
    // STATE: RECOVERING (SMOOTH LERP BACK TO DEFAULT UPRIGHT PAUSE)
    // =========================================================================
    else if (this.state === 'RECOVERING') {
      this.recoveryProgress += dt * 3.5; // Re-settle over ~0.28 seconds
      const t = Math.min(1.0, this.recoveryProgress);

      if (char.joints) {
        for (const j of char.joints) {
          const base = DEFAULT_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
          const start = this.recoveryStartRotations[j.name] || { x: base[0], y: base[1], z: base[2] };

          if (j.targetAngle) {
            j.targetAngle.x = THREE.MathUtils.lerp(start.x, base[0], t);
            j.targetAngle.y = THREE.MathUtils.lerp(start.y, base[1], t);
            j.targetAngle.z = THREE.MathUtils.lerp(start.z, base[2], t);
          }
        }
      }

      // Continuous braking to bring horizontal speed completely to 0
      const totalMass = 75.0;
      const brakeScale = Math.min(1.0, dt * 20.0);
      footL.applyImpulse({ x: -comVx * totalMass * 0.5 * brakeScale, y: 0, z: -comVz * totalMass * 0.5 * brakeScale }, true);
      footR.applyImpulse({ x: -comVx * totalMass * 0.5 * brakeScale, y: 0, z: -comVz * totalMass * 0.5 * brakeScale }, true);

      if (this.recoveryProgress >= 1.0) {
        // Fully recovered back to standing pause!
        this.state = 'STANDING';
        this.stepPhase = 0.0;
        this.stepCount = 0;
      }
    }

    // =========================================================================
    // STATE: STANDING (EQUILIBRIUM DEFAULT STANCE)
    // =========================================================================
    else if (this.state === 'STANDING') {
      if (char.joints) {
        for (const j of char.joints) {
          const base = DEFAULT_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
          if (j.targetAngle) {
            j.targetAngle.x = THREE.MathUtils.lerp(j.targetAngle.x, base[0], dt * 10.0);
            j.targetAngle.y = THREE.MathUtils.lerp(j.targetAngle.y, base[1], dt * 10.0);
            j.targetAngle.z = THREE.MathUtils.lerp(j.targetAngle.z, base[2], dt * 10.0);
          }
        }
      }
    }
  }
}
