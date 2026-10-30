import * as THREE from 'three';
import { clampBoneEulerRotation } from '../core/character.js';

// Authentic NaturalMotion Endorphin 2.7.1 Poses & Posture Catalog
export const ENDORPHIN_POSES_LIBRARY = [
  {
    id: 't_pose',
    name: 'T-Pose (Rest Reference)',
    category: 'Reference',
    icon: '🧍',
    description: 'Classic horizontal arms T-Pose calibration posture.',
    rootPos: [0, 0.95, 0],
    localRotations: {}
  },
  {
    id: 'standing_relaxed',
    name: 'Natural Standing Stance',
    category: 'Standing',
    icon: '🧍‍♂️',
    description: 'Relaxed human standing stance with arm hang and knee flexion.',
    rootPos: [0, 0.95, 0],
    localRotations: {
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
    }
  },
  {
    id: 'standing_side_on',
    name: 'Standing Side-On (Boxing / Martial)',
    category: 'Standing',
    icon: '🥊',
    description: 'Combat side-on profile stance with guard posture.',
    rootPos: [0, 0.93, 0],
    localRotations: {
      LowerSpine: [0.05, 0.45, 0],
      UpperSpine: [0.05, 0.25, 0],
      Head: [0.0, -0.65, 0],
      LeftUpperArm: [0.75, 0.35, -0.65],
      LeftForearm: [1.65, 0, 0],
      RightUpperArm: [0.55, -0.25, 0.75],
      RightForearm: [1.85, 0, 0],
      LeftThigh: [-0.25, 0.15, 0.1],
      LeftCalf: [0.45, 0, 0],
      RightThigh: [0.2, -0.25, -0.1],
      RightCalf: [0.35, 0, 0]
    }
  },
  {
    id: 'standing_one_foot',
    name: 'Standing On Right Foot (Crane)',
    category: 'Standing',
    icon: '🦩',
    description: 'Single-leg balance with left knee raised high.',
    rootPos: [0.05, 0.94, 0],
    localRotations: {
      LowerSpine: [0.02, 0, 0.08],
      UpperSpine: [0.02, 0, -0.05],
      LeftUpperArm: [0.2, 0, -0.9],
      RightUpperArm: [0.2, 0, 0.9],
      RightThigh: [-0.05, 0, 0],
      RightCalf: [0.1, 0, 0],
      LeftThigh: [-1.45, 0.1, 0.2],
      LeftCalf: [1.85, 0, 0],
      LeftFoot: [-0.2, 0, 0]
    }
  },
  {
    id: 'standing_twist_right',
    name: 'Standing Twisting To Right',
    category: 'Standing',
    icon: '🔄',
    description: 'Upper torso windup twist to the right side.',
    rootPos: [0, 0.95, 0],
    localRotations: {
      LowerSpine: [0.05, -0.55, 0],
      UpperSpine: [0.05, -0.45, 0],
      Head: [0.0, -0.3, 0],
      LeftUpperArm: [0.45, -0.3, -0.85],
      LeftForearm: [0.85, 0, 0],
      RightUpperArm: [-0.35, 0.3, 0.95],
      RightForearm: [0.95, 0, 0],
      LeftThigh: [-0.1, 0.15, 0],
      RightThigh: [-0.05, -0.15, 0]
    }
  },
  {
    id: 'crouching',
    name: 'Crouching (Low Squat)',
    category: 'Crouching',
    icon: '🧎',
    description: 'Deep balanced athletic crouch with torso leaning forward.',
    rootPos: [0, 0.58, 0],
    localRotations: {
      LowerSpine: [0.65, 0, 0],
      UpperSpine: [0.25, 0, 0],
      Head: [-0.65, 0, 0],
      LeftThigh: [-1.85, 0.2, 0.15],
      LeftCalf: [2.35, 0, 0],
      LeftFoot: [-0.55, 0, 0],
      RightThigh: [-1.85, -0.2, -0.15],
      RightCalf: [2.35, 0, 0],
      RightFoot: [-0.55, 0, 0],
      LeftUpperArm: [0.35, 0, -0.55],
      LeftForearm: [1.25, 0, 0],
      RightUpperArm: [0.35, 0, 0.55],
      RightForearm: [1.25, 0, 0]
    }
  },
  {
    id: 'crouch_right_hand',
    name: 'Crouch (Right Hand On Ground)',
    category: 'Crouching',
    icon: '🦸',
    description: '3-point superhero touch / sprinter start on right fist.',
    rootPos: [0, 0.46, 0.05],
    localRotations: {
      LowerSpine: [0.95, -0.2, 0],
      UpperSpine: [0.35, -0.1, 0],
      Head: [-0.85, 0.15, 0],
      RightUpperArm: [1.45, 0.2, 0.45],
      RightForearm: [0.35, 0, 0],
      LeftUpperArm: [-0.55, 0, -0.95],
      LeftForearm: [1.15, 0, 0],
      LeftThigh: [-1.95, 0.35, 0.2],
      LeftCalf: [2.45, 0, 0],
      RightThigh: [-1.55, -0.2, -0.1],
      RightCalf: [2.15, 0, 0]
    }
  },
  {
    id: 'crouch_both_hands',
    name: 'Crouch (Both Hands On Ground)',
    category: 'Crouching',
    icon: '🐾',
    description: '4-point quadruped ground contact crawl stance.',
    rootPos: [0, 0.44, 0.08],
    localRotations: {
      LowerSpine: [0.95, 0, 0],
      UpperSpine: [0.35, 0, 0],
      Head: [-0.85, 0, 0],
      LeftUpperArm: [1.35, 0.1, -0.35],
      LeftForearm: [0.45, 0, 0],
      RightUpperArm: [1.35, -0.1, 0.35],
      RightForearm: [0.45, 0, 0],
      LeftThigh: [-1.95, 0.3, 0.15],
      LeftCalf: [2.35, 0, 0],
      RightThigh: [-1.95, -0.3, -0.15],
      RightCalf: [2.35, 0, 0]
    }
  },
  {
    id: 'rolling_tuck',
    name: 'Rolling Fetal Tuck',
    category: 'Stunts',
    icon: '🔄',
    description: 'Tight fetal tuck for fall cushion and roll-outs.',
    rootPos: [0, 0.35, 0],
    localRotations: {
      LowerSpine: [1.15, 0, 0],
      UpperSpine: [0.65, 0, 0],
      Head: [0.75, 0, 0],
      LeftThigh: [-2.15, 0.25, 0.1],
      LeftCalf: [2.45, 0, 0],
      RightThigh: [-2.15, -0.25, -0.1],
      RightCalf: [2.45, 0, 0],
      LeftUpperArm: [1.15, 0.45, -0.45],
      LeftForearm: [2.15, 0, 0],
      RightUpperArm: [1.15, -0.45, 0.45],
      RightForearm: [2.15, 0, 0]
    }
  },
  {
    id: 'sitting_ground_head_down',
    name: 'Sitting On Ground (Head Down)',
    category: 'Ground',
    icon: '🧎‍♂️',
    description: 'Seated on ground with knees bent and head hung low.',
    rootPos: [0, 0.28, 0],
    localRotations: {
      LowerSpine: [0.75, 0, 0],
      UpperSpine: [0.45, 0, 0],
      Head: [0.65, 0, 0],
      LeftThigh: [-1.65, 0.35, 0.2],
      LeftCalf: [2.15, 0, 0],
      RightThigh: [-1.65, -0.35, -0.2],
      RightCalf: [2.15, 0, 0],
      LeftUpperArm: [0.45, 0.2, -0.4],
      LeftForearm: [1.45, 0, 0],
      RightUpperArm: [0.45, -0.2, 0.4],
      RightForearm: [1.45, 0, 0]
    }
  },
  {
    id: 'sitting_ground_arm_out',
    name: 'Sitting On Ground (Arm Out)',
    category: 'Ground',
    icon: '✋',
    description: 'Seated defensive position with right arm braced behind.',
    rootPos: [0, 0.28, 0],
    localRotations: {
      LowerSpine: [-0.25, -0.35, 0],
      UpperSpine: [-0.15, -0.2, 0],
      Head: [0.25, 0.35, 0],
      RightUpperArm: [-0.95, -0.45, 0.65],
      RightForearm: [0.45, 0, 0],
      LeftUpperArm: [0.65, 0.35, -0.65],
      LeftForearm: [1.35, 0, 0],
      LeftThigh: [-1.45, 0.4, 0.2],
      LeftCalf: [1.85, 0, 0],
      RightThigh: [-0.85, -0.2, -0.1],
      RightCalf: [1.25, 0, 0]
    }
  },
  {
    id: 'arms_raised',
    name: 'Arms Raised Above Head',
    category: 'Standing',
    icon: '🙌',
    description: 'Both arms raised overhead in surrender or victory.',
    rootPos: [0, 0.95, 0],
    localRotations: {
      LeftUpperArm: [0, 0, 2.75],
      LeftForearm: [0.25, 0, 0],
      RightUpperArm: [0, 0, -2.75],
      RightForearm: [0.25, 0, 0],
      UpperSpine: [-0.1, 0, 0],
      Head: [-0.25, 0, 0]
    }
  },
  {
    id: 'weapon_right_hand',
    name: 'Weapon In Right Hand (Pistol / Blade)',
    category: 'Combat',
    icon: '🗡️',
    description: 'Forward aim with weapon held in right hand.',
    rootPos: [0, 0.95, 0],
    localRotations: {
      RightUpperArm: [1.45, -0.15, 0.15],
      RightForearm: [0.15, 0, 0],
      LeftUpperArm: [0.25, 0.15, -0.65],
      LeftForearm: [0.95, 0, 0],
      LowerSpine: [0.05, -0.15, 0],
      UpperSpine: [0.05, -0.1, 0]
    }
  },
  {
    id: 'weapon_both_hands',
    name: 'Weapon In Both Hands (Rifle / Katana)',
    category: 'Combat',
    icon: '⚔️',
    description: 'Two-handed tactical firearm or heavy sword grip.',
    rootPos: [0, 0.94, 0],
    localRotations: {
      LowerSpine: [0.08, 0.25, 0],
      UpperSpine: [0.05, 0.15, 0],
      Head: [-0.05, -0.35, 0],
      RightUpperArm: [1.25, -0.35, 0.45],
      RightForearm: [1.05, 0, 0],
      LeftUpperArm: [1.15, 0.45, -0.45],
      LeftForearm: [1.55, 0, 0],
      LeftThigh: [-0.2, 0.15, 0.05],
      LeftCalf: [0.35, 0, 0],
      RightThigh: [0.1, -0.15, -0.05],
      RightCalf: [0.25, 0, 0]
    }
  },
  {
    id: 'scuba_swim',
    name: 'Scuba Swimming Stroke (Endorphin 2.7)',
    category: 'Stunts',
    icon: '🏊',
    description: 'Authentic 2.7 fluid swimming propulsion stroke.',
    rootPos: [0, 0.95, 0],
    localRotations: {
      LowerSpine: [-0.15, 0, 0],
      UpperSpine: [-0.25, 0, 0],
      Head: [-0.55, 0, 0],
      LeftUpperArm: [2.15, 0.35, -0.45],
      LeftForearm: [0.45, 0, 0],
      RightUpperArm: [2.15, -0.35, 0.45],
      RightForearm: [0.45, 0, 0],
      LeftThigh: [0.15, 0.1, 0.05],
      LeftCalf: [0.35, 0, 0],
      RightThigh: [-0.25, -0.1, -0.05],
      RightCalf: [0.65, 0, 0]
    }
  },
  {
    id: 'catch_fall_reach',
    name: 'Catch Fall Ground Reach',
    category: 'Stunts',
    icon: '🛡️',
    description: 'Forward angled protective arm reach for floor impact.',
    rootPos: [0, 0.92, 0],
    localRotations: {
      LowerSpine: [0.35, 0, 0],
      UpperSpine: [0.25, 0, 0],
      Head: [-0.45, 0, 0],
      LeftUpperArm: [1.25, 0.15, -0.35],
      LeftForearm: [0.35, 0, 0],
      RightUpperArm: [1.25, -0.15, 0.35],
      RightForearm: [0.35, 0, 0],
      LeftThigh: [-0.35, 0.1, 0.05],
      LeftCalf: [0.65, 0, 0],
      RightThigh: [-0.25, -0.1, -0.05],
      RightCalf: [0.45, 0, 0]
    }
  }
];

export function applyPosePresetToCharacter(character, poseId, options = {}) {
  const preset = ENDORPHIN_POSES_LIBRARY.find(p => p.id === poseId);
  if (!preset || !character) return false;

  const clampedRotations = {};
  for (const [boneName, rot] of Object.entries(preset.localRotations)) {
    const c = clampBoneEulerRotation(boneName, rot[0], rot[1], rot[2]);
    clampedRotations[boneName] = [c.x, c.y, c.z];
  }

  const ox = character.spawnOffset?.x ?? 0;
  const oy = character.spawnOffset?.y ?? 0;
  const oz = character.spawnOffset?.z ?? 0;

  const rootPos = new THREE.Vector3(
    ox + (preset.rootPos?.[0] ?? 0),
    oy + (preset.rootPos?.[1] ?? 0.95),
    oz + (preset.rootPos?.[2] ?? 0)
  );

  if (typeof character.applyPoseState === 'function') {
    character.applyPoseState({ rootPos, localRotations: clampedRotations });
  } else {
    character.applyForwardKinematics(rootPos, clampedRotations);
  }

  return true;
}
