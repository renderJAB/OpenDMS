import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CharacterSensors } from './sensors.js';

export const SKELETON_TREE = {
  Pelvis: { parent: null, offset: [0, 0.95, 0] },
  LowerSpine: { parent: 'Pelvis', offset: [0, 0.16, 0] },
  UpperSpine: { parent: 'LowerSpine', offset: [0, 0.18, 0] },
  Neck: { parent: 'UpperSpine', offset: [0, 0.16, 0] },
  Head: { parent: 'Neck', offset: [0, 0.16, 0] },

  // Left Arm (horizontal along +X in T-pose)
  LeftShoulder: { parent: 'UpperSpine', offset: [0.18, 0.04, 0] },
  LeftUpperArm: { parent: 'LeftShoulder', offset: [0.17, 0, 0] },
  LeftForearm: { parent: 'LeftUpperArm', offset: [0.26, 0, 0] },
  LeftHand: { parent: 'LeftForearm', offset: [0.205, 0, 0] },

  // Right Arm (horizontal along -X in T-pose)
  RightShoulder: { parent: 'UpperSpine', offset: [-0.18, 0.04, 0] },
  RightUpperArm: { parent: 'RightShoulder', offset: [-0.17, 0, 0] },
  RightForearm: { parent: 'RightUpperArm', offset: [-0.26, 0, 0] },
  RightHand: { parent: 'RightForearm', offset: [-0.205, 0, 0] },

  // Left Leg (downward along -Y)
  LeftThigh: { parent: 'Pelvis', offset: [0.12, -0.24, 0] },
  LeftCalf: { parent: 'LeftThigh', offset: [0, -0.38, 0] },
  LeftFoot: { parent: 'LeftCalf', offset: [0, -0.29, 0.04] },

  // Right Leg (downward along -Y)
  RightThigh: { parent: 'Pelvis', offset: [-0.12, -0.24, 0] },
  RightCalf: { parent: 'RightThigh', offset: [0, -0.38, 0] },
  RightFoot: { parent: 'RightCalf', offset: [0, -0.29, 0.04] }
};

// Exact NaturalMotion Endorphin 2.7.1 <CollisionSurface> self-collision matrix
// Derived via REA from StandardCharacter.xml (collidesWithParent, collidesWithSiblings, collidesWithAncestors)
const G_ENV     = 0x0001; // Ground & Scene Props
const G_PELVIS  = 0x0002; // Pelvis
const G_TORSO   = 0x0004; // LowerSpine, UpperSpine, LeftShoulder, RightShoulder, Neck
const G_HEAD    = 0x0008; // Head
const G_L_UARM  = 0x0010; // LeftUpperArm
const G_L_FARM  = 0x0020; // LeftForearm
const G_L_HAND  = 0x0040; // LeftHand (dedicated group for full arm self-collision)
const G_R_UARM  = 0x0080; // RightUpperArm
const G_R_FARM  = 0x0100; // RightForearm
const G_R_HAND  = 0x0200; // RightHand (dedicated group for full arm self-collision)
const G_L_THIGH = 0x0400; // LeftThigh
const G_L_CALF  = 0x0800; // LeftCalf, LeftFoot
const G_R_THIGH = 0x1000; // RightThigh
const G_R_CALF  = 0x2000; // RightCalf, RightFoot

// Multi-Actor Bitmask Flags:
// Each actor limbs hold ACTOR_x_FLAG in membership and the opposing actor's flag in filter.
// Intra-character self-collision retains exact bitwise isolation (no adjacent joint binding).
// Character-to-character collision enables full bone-to-bone physical contact via CCD.
export const ACTOR_0_FLAG = 0x4000;
export const ACTOR_1_FLAG = 0x8000;

export const COLLISION_GROUPS = {
  Pelvis:        (G_PELVIS  << 16) | (G_ENV | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_CALF | G_R_CALF),
  LowerSpine:    (G_TORSO   << 16) | (G_ENV | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  UpperSpine:    (G_TORSO   << 16) | (G_ENV | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  LeftShoulder:  (G_TORSO   << 16) | (G_ENV | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  RightShoulder: (G_TORSO   << 16) | (G_ENV | G_L_UARM | G_L_FARM | G_L_HAND | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  Neck:          (G_TORSO   << 16) | (G_ENV | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  Head:          (G_HEAD    << 16) | (G_ENV | G_PELVIS | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),

  LeftUpperArm:  (G_L_UARM  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  LeftForearm:   (G_L_FARM  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  LeftHand:      (G_L_HAND  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),

  RightUpperArm: (G_R_UARM  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_R_HAND | G_L_UARM | G_L_FARM | G_L_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  RightForearm:  (G_R_FARM  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),
  RightHand:     (G_R_HAND  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_R_UARM | G_L_UARM | G_L_FARM | G_L_HAND | G_L_THIGH | G_L_CALF | G_R_THIGH | G_R_CALF),

  LeftThigh:     (G_L_THIGH << 16) | (G_ENV | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_R_THIGH | G_R_CALF),
  LeftCalf:      (G_L_CALF  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_R_THIGH | G_R_CALF),
  LeftFoot:      (G_L_CALF  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_R_THIGH | G_R_CALF),
  RightThigh:    (G_R_THIGH << 16) | (G_ENV | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF),
  RightCalf:     (G_R_CALF  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF),
  RightFoot:     (G_R_CALF  << 16) | (G_ENV | G_PELVIS | G_TORSO | G_HEAD | G_L_UARM | G_L_FARM | G_L_HAND | G_R_UARM | G_R_FARM | G_R_HAND | G_L_THIGH | G_L_CALF)
};

export function getActorCollisionGroups(segName, actorIndex = 0) {
  const base = COLLISION_GROUPS[segName] || ((G_TORSO << 16) | G_ENV);
  const internalMembership = (base >> 16) & 0xFFFF;
  const internalFilter = base & 0xFFFF;

  if (actorIndex === 0) {
    const membership = internalMembership | ACTOR_0_FLAG;
    const filter = internalFilter | G_ENV | ACTOR_1_FLAG;
    return (membership << 16) | filter;
  } else {
    const membership = internalMembership | ACTOR_1_FLAG;
    const filter = internalFilter | G_ENV | ACTOR_0_FLAG;
    return (membership << 16) | filter;
  }
}

// Exact anatomical joint anchors in parent local frame and child local frame.
// Both anchors coincide at the shared anatomical pivot in world space (zero initial stretch/offset).
export const JOINT_ANCHORS = {
  // Spine & Head
  'Pelvis_to_LowerSpine': {
    parentAnchor: { x: 0, y: 0.08, z: 0 },
    childAnchor: { x: 0, y: -0.08, z: 0 }
  },
  'LowerSpine_to_UpperSpine': {
    parentAnchor: { x: 0, y: 0.09, z: 0 },
    childAnchor: { x: 0, y: -0.09, z: 0 }
  },
  'UpperSpine_to_Neck': {
    parentAnchor: { x: 0, y: 0.08, z: 0 },
    childAnchor: { x: 0, y: -0.08, z: 0 }
  },
  'Neck_to_Head': {
    parentAnchor: { x: 0, y: 0.08, z: 0 },
    childAnchor: { x: 0, y: -0.08, z: 0 }
  },

  // Left Leg (Femoral head, knee condyles, ankle malleoli)
  'Pelvis_to_LeftThigh': {
    parentAnchor: { x: 0.12, y: -0.06, z: 0 },
    childAnchor: { x: 0, y: 0.18, z: 0 }
  },
  'LeftThigh_to_LeftCalf': {
    parentAnchor: { x: 0, y: -0.19, z: 0 },
    childAnchor: { x: 0, y: 0.19, z: 0 }
  },
  'LeftCalf_to_LeftFoot': {
    parentAnchor: { x: 0, y: -0.19, z: 0 },
    childAnchor: { x: 0, y: 0.10, z: -0.04 }
  },

  // Right Leg (Femoral head, knee condyles, ankle malleoli)
  'Pelvis_to_RightThigh': {
    parentAnchor: { x: -0.12, y: -0.06, z: 0 },
    childAnchor: { x: 0, y: 0.18, z: 0 }
  },
  'RightThigh_to_RightCalf': {
    parentAnchor: { x: 0, y: -0.19, z: 0 },
    childAnchor: { x: 0, y: 0.19, z: 0 }
  },
  'RightCalf_to_RightFoot': {
    parentAnchor: { x: 0, y: -0.19, z: 0 },
    childAnchor: { x: 0, y: 0.10, z: -0.04 }
  },

  // Left Arm (Clavicle, shoulder socket, elbow pin, wrist)
  'UpperSpine_to_LeftShoulder': {
    parentAnchor: { x: 0.10, y: 0.04, z: 0 },
    childAnchor: { x: -0.08, y: 0, z: 0 }
  },
  'LeftShoulder_to_LeftUpperArm': {
    parentAnchor: { x: 0.085, y: 0, z: 0 },
    childAnchor: { x: -0.085, y: 0, z: 0 }
  },
  'LeftUpperArm_to_LeftForearm': {
    parentAnchor: { x: 0.13, y: 0, z: 0 },
    childAnchor: { x: -0.13, y: 0, z: 0 }
  },
  'LeftForearm_to_LeftHand': {
    parentAnchor: { x: 0.13, y: 0, z: 0 },
    childAnchor: { x: -0.075, y: 0, z: 0 }
  },

  // Right Arm (Clavicle, shoulder socket, elbow pin, wrist)
  'UpperSpine_to_RightShoulder': {
    parentAnchor: { x: -0.10, y: 0.04, z: 0 },
    childAnchor: { x: 0.08, y: 0, z: 0 }
  },
  'RightShoulder_to_RightUpperArm': {
    parentAnchor: { x: -0.085, y: 0, z: 0 },
    childAnchor: { x: 0.085, y: 0, z: 0 }
  },
  'RightUpperArm_to_RightForearm': {
    parentAnchor: { x: -0.13, y: 0, z: 0 },
    childAnchor: { x: 0.13, y: 0, z: 0 }
  },
  'RightForearm_to_RightHand': {
    parentAnchor: { x: -0.13, y: 0, z: 0 },
    childAnchor: { x: 0.075, y: 0, z: 0 }
  }
};

export const JOINT_CONFIGS = {
  // 1-DOF Knees (flexion backwards only [0.0, 2.45] rad; zero hyperextension)
  'LeftThigh_to_LeftCalf': {
    type: 'revolute',
    axis: { x: 1, y: 0, z: 0 },
    limits: [0.0, 2.45]
  },
  'RightThigh_to_RightCalf': {
    type: 'revolute',
    axis: { x: 1, y: 0, z: 0 },
    limits: [0.0, 2.45]
  },

  // 1-DOF Elbows (flexion forward into +Z only [0.0, 2.55] rad)
  'LeftUpperArm_to_LeftForearm': {
    type: 'revolute',
    axis: { x: 0, y: -1, z: 0 },
    limits: [0.0, 2.55]
  },
  'RightUpperArm_to_RightForearm': {
    type: 'revolute',
    axis: { x: 0, y: 1, z: 0 },
    limits: [0.0, 2.55]
  },

  // 1-DOF Ankles (dorsiflexion -0.75 rad / plantarflexion +0.95 rad)
  'LeftCalf_to_LeftFoot': {
    type: 'revolute',
    axis: { x: 1, y: 0, z: 0 },
    limits: [-0.75, 0.95]
  },
  'RightCalf_to_RightFoot': {
    type: 'revolute',
    axis: { x: 1, y: 0, z: 0 },
    limits: [-0.75, 0.95]
  },

  // 3-DOF Spine & Head with Endorphin Natural Flexion/Extension
  'Pelvis_to_LowerSpine': {
    type: 'spherical',
    xLimits: [-0.55, 0.75],
    yLimits: [-0.50, 0.50],
    zLimits: [-0.50, 0.50]
  },
  'LowerSpine_to_UpperSpine': {
    type: 'spherical',
    xLimits: [-0.55, 0.75],
    yLimits: [-0.50, 0.50],
    zLimits: [-0.50, 0.50]
  },
  'UpperSpine_to_Neck': {
    type: 'spherical',
    xLimits: [-0.50, 0.75],
    yLimits: [-0.55, 0.55],
    zLimits: [-0.50, 0.50]
  },
  'Neck_to_Head': {
    type: 'spherical',
    xLimits: [-0.50, 0.75],
    yLimits: [-0.65, 0.65],
    zLimits: [-0.50, 0.50]
  },

  // Hips: Allows full flexion up to 125 deg and extension up to 45 deg, plus full natural abduction
  'Pelvis_to_LeftThigh': {
    type: 'spherical',
    xLimits: [-2.15, 0.75],
    yLimits: [-0.65, 0.65],
    zLimits: [-0.65, 0.75]
  },
  'Pelvis_to_RightThigh': {
    type: 'spherical',
    xLimits: [-2.15, 0.75],
    yLimits: [-0.65, 0.65],
    zLimits: [-0.75, 0.65]
  },

  // Clavicles & Shoulders
  'UpperSpine_to_LeftShoulder': {
    type: 'spherical',
    xLimits: [-0.45, 0.45],
    yLimits: [-0.45, 0.45],
    zLimits: [-0.55, 0.45]
  },
  'UpperSpine_to_RightShoulder': {
    type: 'spherical',
    xLimits: [-0.45, 0.45],
    yLimits: [-0.45, 0.45],
    zLimits: [-0.45, 0.55]
  },
  'LeftShoulder_to_LeftUpperArm': {
    type: 'spherical',
    xLimits: [-1.65, 1.65],
    yLimits: [-1.65, 1.65],
    zLimits: [-1.85, 1.45]
  },
  'RightShoulder_to_RightUpperArm': {
    type: 'spherical',
    xLimits: [-1.65, 1.65],
    yLimits: [-1.65, 1.65],
    zLimits: [-1.45, 1.85]
  },

  // Wrists
  'LeftForearm_to_LeftHand': {
    type: 'spherical',
    xLimits: [-0.85, 0.85],
    yLimits: [-0.85, 0.85],
    zLimits: [-0.95, 0.95]
  },
  'RightForearm_to_RightHand': {
    type: 'spherical',
    xLimits: [-0.85, 0.85],
    yLimits: [-0.85, 0.85],
    zLimits: [-0.95, 0.95]
  }
};

export function getJointConfigForBone(boneName) {
  const def = SKELETON_TREE[boneName];
  if (!def || !def.parent) return null;
  return JOINT_CONFIGS[`${def.parent}_to_${boneName}`] || null;
}

export function clampBoneEulerRotation(boneName, euler, yOpt, zOpt) {
  let x = 0, y = 0, z = 0;
  if (typeof euler === 'object' && euler !== null) {
    x = euler.x ?? 0;
    y = euler.y ?? 0;
    z = euler.z ?? 0;
  } else if (typeof euler === 'number') {
    x = euler;
    y = yOpt ?? 0;
    z = zOpt ?? 0;
  }

  const cfg = getJointConfigForBone(boneName);
  if (!cfg) return { x, y, z };

  if (cfg.type === 'revolute') {
    const min = cfg.limits[0];
    const max = cfg.limits[1];
    if (cfg.axis.x !== 0) {
      x = THREE.MathUtils.clamp(x, min, max);
    } else if (cfg.axis.y !== 0) {
      y = THREE.MathUtils.clamp(y, min, max);
    } else if (cfg.axis.z !== 0) {
      z = THREE.MathUtils.clamp(z, min, max);
    }
  } else {
    if (cfg.xLimits) x = THREE.MathUtils.clamp(x, cfg.xLimits[0], cfg.xLimits[1]);
    if (cfg.yLimits) y = THREE.MathUtils.clamp(y, cfg.yLimits[0], cfg.yLimits[1]);
    if (cfg.zLimits) z = THREE.MathUtils.clamp(z, cfg.zLimits[0], cfg.zLimits[1]);
  }

  return { x, y, z };
}

export const NATURAL_STANCE_ROTATIONS = {
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

export class BiomechanicalCharacter {
  constructor(world, scene, initialPos = { x: 0, y: 0.95, z: 0 }, actorIndex = 0, options = {}) {
    this.world = world;
    this.scene = scene;
    this.initialPos = initialPos;
    this.actorIndex = actorIndex; // 0 = Actor 1 (Hero / Blue), 1 = Actor 2 (Opponent / Orange)
    this.actorId = options.actorId || `actor-${actorIndex + 1}`;
    this.actorColor = options.actorColor || (actorIndex === 0 ? 0x38bdf8 : 0xf97316);
    this.spawnOffset = new THREE.Vector3(initialPos.x || 0, Math.max(0, (initialPos.y || 0.95) - 0.95), initialPos.z || 0);
    this.spawnYaw = options.spawnYaw || 0;
    this.bodies = {};
    this.joints = [];
    this.visualMeshes = [];
    this.muscleStiffness = 300.0;
    this.muscleDamping = 35.0;
    this.isKinematic = true;
    this.isPureRagdoll = false;
    this.impactShockTimer = 0.0;
    this.groundClampingEnabled = true;
    this.footSoleOffset = 0.04;
    this.colliderGirth = 1.0;
    this.baseSegmentRadii = {};
    this.baseSegmentHeights = {};
    this.sensors = new CharacterSensors(this);

    // Biomechanical Dynamic Balance & Inverted Pendulum Recovery Controller (Endorphin ZMP)
    this.balanceControlEnabled = true;
    this.counterWeighingEnabled = true;
    this.balanceRecoveryStrength = 1.0;
    this.lossOfBalanceTiltLimit = 45;
    this.isLossOfBalance = false;
    this.steppingFoot = 'Left'; // 'Left' | 'Right'
    this.steppingPhaseTimer = 0.0;
    this.zmpDisplacement = 0.0;

    // Active Pose Authoring State
    this.currentPose = {
      rootPos: new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z),
      localRotations: {}
    };

    this.buildHumanoid();
    this.resetToTPose();
  }

  buildHumanoid() {
    const segments = [
      { name: 'Pelvis', type: 'capsule', r: 0.10, h: 0.12, mass: 14.0, color: 0x3b82f6 },
      { name: 'LowerSpine', type: 'capsule', r: 0.105, h: 0.14, mass: 10.0, color: 0x2563eb },
      { name: 'UpperSpine', type: 'capsule', r: 0.125, h: 0.18, mass: 16.0, color: 0x1d4ed8 },
      { name: 'Neck', type: 'capsule', r: 0.05, h: 0.08, mass: 2.0, color: 0x60a5fa },
      { name: 'Head', type: 'sphere', r: 0.11, h: 0.0, mass: 4.5, color: 0xf59e0b },

      { name: 'LeftShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0, color: 0x10b981 },
      { name: 'LeftUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5, color: 0x059669 },
      { name: 'LeftForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2, color: 0x047857 },
      { name: 'LeftHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8, color: 0x6ee7b7 },

      { name: 'RightShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0, color: 0x10b981 },
      { name: 'RightUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5, color: 0x059669 },
      { name: 'RightForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2, color: 0x047857 },
      { name: 'RightHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8, color: 0x6ee7b7 },

      { name: 'LeftThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5, color: 0x8b5cf6 },
      { name: 'LeftCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5, color: 0x7c3aed },
      { name: 'LeftFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5, color: 0xa78bfa },

      { name: 'RightThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5, color: 0x8b5cf6 },
      { name: 'RightCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5, color: 0x7c3aed },
      { name: 'RightFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5, color: 0xa78bfa }
    ];

    const globalRestPositions = {};
    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) {
        globalRestPositions[name] = new THREE.Vector3(...def.offset);
      } else {
        const parentPos = globalRestPositions[def.parent];
        globalRestPositions[name] = parentPos.clone().add(new THREE.Vector3(...def.offset));
      }
    }

    for (const seg of segments) {
      const restPos = globalRestPositions[seg.name];
      const qInit = new THREE.Quaternion();

      const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(restPos.x, restPos.y, restPos.z)
        .setRotation({ x: 0, y: 0, z: 0, w: 1 })
        .setLinearDamping(0.04)
        .setAngularDamping(0.35);

      const rb = this.world.createRigidBody(rbDesc);
      // Enable Continuous Collision Detection (CCD) to prevent high-speed tunneling on arms, hands & chest
      rb.enableCcd(true);

      let colDesc;
      let geom;
      if (seg.type === 'capsule') {
        colDesc = RAPIER.ColliderDesc.capsule(seg.h / 2, seg.r);
        geom = new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16);
      } else if (seg.type === 'capsule_x') {
        colDesc = RAPIER.ColliderDesc.capsule(seg.h / 2, seg.r);
        const qZ90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        colDesc.setRotation({ x: qZ90.x, y: qZ90.y, z: qZ90.z, w: qZ90.w });
        geom = new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16);
        geom.rotateZ(Math.PI / 2);
      } else if (seg.type === 'sphere') {
        colDesc = RAPIER.ColliderDesc.ball(seg.r);
        geom = new THREE.SphereGeometry(seg.r, 16, 16);
      } else if (seg.type === 'box_foot') {
        colDesc = RAPIER.ColliderDesc.cuboid(0.048, 0.035, seg.h / 2);
        geom = new THREE.BoxGeometry(0.096, 0.07, seg.h);
      } else if (seg.type === 'box') {
        colDesc = RAPIER.ColliderDesc.cuboid(seg.h / 2, 0.020, 0.040);
        geom = new THREE.BoxGeometry(seg.h, 0.040, 0.080);
      } else {
        colDesc = RAPIER.ColliderDesc.cuboid(seg.r, seg.r * 0.7, seg.h / 2);
        geom = new THREE.BoxGeometry(seg.r * 2, seg.r * 1.4, seg.h);
      }

      colDesc.setMass(seg.mass)
        .setFriction(1.2)
        .setRestitution(0.0)
        .setContactSkin(0.002)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);

      // Apply Endorphin's segmented <CollisionSurface> self-collision bitmask + multi-actor mutual collision
      const colGroup = getActorCollisionGroups(seg.name, this.actorIndex);
      colDesc.setCollisionGroups(colGroup);
      this.world.createCollider(colDesc, rb);

      // Create rich Endorphin stylized biomechanical mannequin visual group
      const mesh = this.createMannequinVisual(seg);
      mesh.position.copy(restPos);
      mesh.userData = { bodyName: seg.name, rigidBody: rb, actorId: this.actorId };
      mesh.traverse((child) => {
        child.userData.bodyName = seg.name;
        child.userData.actorId = this.actorId;
        child.userData.isCharacterBone = true;
      });
      this.scene.add(mesh);

      this.bodies[seg.name] = {
        name: seg.name,
        rigidBody: rb,
        mesh: mesh,
        type: seg.type,
        mass: seg.mass,
        radius: seg.r || 0.08,
        height: seg.h || 0.20,
        initPos: restPos.clone(),
        initRot: qInit.clone(),
        prevPos: restPos.clone()
      };
      this.baseSegmentRadii[seg.name] = seg.r || 0.08;
      this.baseSegmentHeights[seg.name] = seg.h || 0.20;
      this.visualMeshes.push(mesh);
    }

    this.createAnatomicalJoints();
  }

  // --- DYNAMIC COLLISION GIRTH & PENETRATION PREVENTION SOLVER ---
  // Reconfigures Rapier colliders on the character's segments when user or rig calibration
  // specifies a body girth multiplier (matching bulkier or slimmer 3D meshes).
  setColliderGirth(multiplier = 1.0) {
    this.colliderGirth = Math.max(0.4, Math.min(2.5, multiplier));
    if (!this.world || !this.bodies) return;

    for (const [name, b] of Object.entries(this.bodies)) {
      const baseR = this.baseSegmentRadii[name] || b.radius || 0.08;
      const baseH = this.baseSegmentHeights[name] || b.height || 0.20;
      const newR = baseR * this.colliderGirth;
      b.radius = newR;

      if (b.rigidBody) {
        // Remove existing colliders on this rigid body
        const numCols = b.rigidBody.numColliders();
        for (let i = numCols - 1; i >= 0; i--) {
          const col = b.rigidBody.collider(i);
          if (col) {
            this.world.removeCollider(col, false);
          }
        }

        let colDesc;
        if (b.type === 'capsule') {
          colDesc = RAPIER.ColliderDesc.capsule(baseH / 2, newR);
        } else if (b.type === 'capsule_x') {
          colDesc = RAPIER.ColliderDesc.capsule(baseH / 2, newR);
          const qZ90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
          colDesc.setRotation({ x: qZ90.x, y: qZ90.y, z: qZ90.z, w: qZ90.w });
        } else if (b.type === 'sphere') {
          colDesc = RAPIER.ColliderDesc.ball(newR);
        } else if (b.type === 'box_foot') {
          colDesc = RAPIER.ColliderDesc.cuboid(0.048 * this.colliderGirth, 0.035 * this.colliderGirth, baseH / 2);
        } else if (b.type === 'box') {
          colDesc = RAPIER.ColliderDesc.cuboid((baseH / 2) * this.colliderGirth, 0.020 * this.colliderGirth, 0.040 * this.colliderGirth);
        } else {
          colDesc = RAPIER.ColliderDesc.cuboid(newR, newR * 0.7, baseH / 2);
        }

        colDesc.setMass(b.mass)
          .setFriction(1.2)
          .setRestitution(0.0)
          .setContactSkin(0.002)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);

        const colGroup = getActorCollisionGroups(name, this.actorIndex);
        colDesc.setCollisionGroups(colGroup);
        this.world.createCollider(colDesc, b.rigidBody);
      }
    }
  }

  // --- STYLIZED BIOMECHANICAL MANNEQUIN 3D MESH GENERATOR (ENDORPHIN STUDIO STYLE) ---
  createMannequinVisual(seg) {
    const group = new THREE.Group();

    const isHero = this.actorIndex === 0;
    const accentColor = isHero ? 0x38bdf8 : 0xf97316; // Cyan Blue vs Amber Orange
    const emissiveColor = isHero ? 0x0284c7 : 0xea580c;
    const bodyColor = isHero ? 0x1e293b : 0x271e1b; // Satin Slate Carbon vs Warm Bronze Carbon
    const plateColor = isHero ? 0x334155 : 0x43302b; // Slate Armor vs Bronze Armor Shell

    // High-end Studio PBR Mannequin Materials
    const matBody = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.32,
      metalness: 0.45
    });
    const matPlates = new THREE.MeshStandardMaterial({
      color: plateColor,
      roughness: 0.26,
      metalness: 0.55
    });
    const matJoint = new THREE.MeshStandardMaterial({
      color: 0x475569, // Brushed Steel Hardware
      roughness: 0.22,
      metalness: 0.8
    });
    const matRing = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.15,
      metalness: 0.8,
      emissive: emissiveColor,
      emissiveIntensity: 0.45
    });
    const matVisor = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.1,
      metalness: 0.9,
      emissive: accentColor,
      emissiveIntensity: 0.95
    });

    if (seg.name === 'Head') {
      // Cranial dome
      const skull = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 24, 24), matBody);
      skull.castShadow = true;
      group.add(skull);

      // Sleek forward-facing visor (+Z)
      const visorGeo = new THREE.BoxGeometry(seg.r * 1.4, seg.r * 0.32, seg.r * 0.4);
      const visor = new THREE.Mesh(visorGeo, matVisor);
      visor.position.set(0, 0.015, seg.r * 0.85);
      group.add(visor);

      // Ear pivot hardware
      const earL = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.25, seg.r * 0.25, 0.02, 16).rotateZ(Math.PI / 2), matRing);
      earL.position.set(seg.r, 0, 0);
      const earR = earL.clone();
      earR.position.set(-seg.r, 0, 0);
      group.add(earL, earR);

      // Neck collar ring
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.65, seg.r * 0.65, 0.04, 20), matRing);
      collar.position.set(0, -seg.r * 0.8, 0);
      group.add(collar);

    } else if (seg.name === 'UpperSpine') {
      // Main ribcage body
      const rib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
      rib.castShadow = true;
      group.add(rib);

      // Anatomical Chest / Pectoral Shield (+Z)
      const chestGeo = new THREE.BoxGeometry(seg.r * 1.5, seg.h * 0.65, seg.r * 0.35);
      const chest = new THREE.Mesh(chestGeo, matPlates);
      chest.position.set(0, seg.h * 0.1, seg.r * 0.50);
      chest.castShadow = true;
      group.add(chest);

      // Glowing Sternum Heartbeat Marker
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16).rotateX(Math.PI / 2), matVisor);
      badge.position.set(0, seg.h * 0.12, seg.r * 0.68);
      group.add(badge);

      // Shoulder Socket Rings
      const sockL = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.45, 0.012, 12, 20).rotateY(Math.PI / 2), matRing);
      sockL.position.set(seg.r * 0.95, seg.h * 0.35, 0);
      const sockR = sockL.clone();
      sockR.position.set(-seg.r * 0.95, seg.h * 0.35, 0);
      group.add(sockL, sockR);

    } else if (seg.name === 'LowerSpine') {
      // Abdominal core
      const core = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
      core.castShadow = true;
      group.add(core);

      // Intervertebral waist articulation rings
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.95, 0.01, 8, 24).rotateX(Math.PI / 2), matRing);
      r1.position.set(0, seg.h * 0.2, 0);
      const r2 = r1.clone();
      r2.position.set(0, -seg.h * 0.2, 0);
      group.add(r1, r2);

    } else if (seg.name === 'Pelvis') {
      // Pelvic cradle
      const pelv = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
      pelv.castShadow = true;
      group.add(pelv);

      // Pelvic flank shields
      const flankL = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 0.4, seg.h * 0.8, seg.r * 1.4), matPlates);
      flankL.position.set(seg.r * 0.9, 0, 0);
      const flankR = flankL.clone();
      flankR.position.set(-seg.r * 0.9, 0, 0);
      group.add(flankL, flankR);

      // Hip sockets
      const hipL = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.45, seg.r * 0.45, 0.03, 16), matRing);
      hipL.position.set(0.12, -seg.h * 0.45, 0);
      const hipR = hipL.clone();
      hipR.position.set(-0.12, -seg.h * 0.45, 0);
      group.add(hipL, hipR);

    } else if (seg.name.includes('Thigh')) {
      // Femur core
      const fem = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
      fem.castShadow = true;
      group.add(fem);

      // Anterior Quadricep Plate (+Z)
      const quad = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.85, seg.r * 0.65, seg.h * 0.75, 16), matPlates);
      quad.position.set(0, seg.h * 0.05, seg.r * 0.35);
      quad.castShadow = true;
      group.add(quad);

      // Patella (Kneecap) shield at the bottom front (+Z)
      const kneecap = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 0.9, 0.07, 0.04), matJoint);
      kneecap.position.set(0, -seg.h * 0.42, seg.r * 0.85);
      kneecap.castShadow = true;
      group.add(kneecap);

    } else if (seg.name.includes('Calf')) {
      // Tibia / Calf core
      const tib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
      tib.castShadow = true;
      group.add(tib);

      // Knee Hinge Pivot Pin (visible transverse axis through knee!)
      const kneePin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, seg.r * 2.5, 16).rotateZ(Math.PI / 2), matRing);
      kneePin.position.set(0, seg.h * 0.45, 0);
      group.add(kneePin);

      // Posterior Gastrocnemius (Calf muscle) on back (-Z)
      const calfMus = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.8, seg.r * 0.4, seg.h * 0.6, 14), matPlates);
      calfMus.position.set(0, seg.h * 0.12, -seg.r * 0.35);
      group.add(calfMus);

      // Ankle joint collar
      const ankRing = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.7, seg.r * 0.7, 0.025, 16), matRing);
      ankRing.position.set(0, -seg.h * 0.45, 0);
      group.add(ankRing);

    } else if (seg.name.includes('Foot')) {
      // Ergonomic Foot Sole & Body - Calibrated 1:1 with cuboid(0.048, 0.035, seg.h / 2)
      const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.058, seg.h), matPlates);
      footMesh.position.set(0, 0.006, 0);
      footMesh.castShadow = true;
      group.add(footMesh);

      // High-traction sole grip underneath - bottom face exactly at y = -0.035 (matches collider bottom)
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.012, seg.h), matBody);
      sole.position.set(0, -0.029, 0);
      group.add(sole);

      // Ankle pivot sphere on top
      const ankBall = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 14), matJoint);
      ankBall.position.set(0, 0.04, -seg.h * 0.2);
      group.add(ankBall);

    } else if (seg.name.includes('UpperArm')) {
      // Horizontal limb along X
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16).rotateZ(Math.PI / 2), matBody);
      arm.castShadow = true;
      group.add(arm);

      // Deltoid cap at shoulder end
      const signX = seg.name.includes('Left') ? 1 : -1;
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(seg.r * 1.15, 14, 14), matPlates);
      deltoid.position.set(-signX * seg.h * 0.4, 0, 0);
      group.add(deltoid);

      // Bicep contour
      const bicep = new THREE.Mesh(new THREE.BoxGeometry(seg.h * 0.5, seg.r * 1.4, seg.r * 1.4), matPlates);
      bicep.position.set(0, seg.r * 0.1, 0);
      group.add(bicep);

    } else if (seg.name.includes('Forearm')) {
      // Forearm horizontal along X
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16).rotateZ(Math.PI / 2), matBody);
      fore.castShadow = true;
      group.add(fore);

      const signX = seg.name.includes('Left') ? 1 : -1;
      // Elbow Hinge Pivot Pin (visible vertical axis through elbow)
      const elbowPin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, seg.r * 2.3, 16), matRing);
      elbowPin.position.set(-signX * seg.h * 0.46, 0, 0);
      group.add(elbowPin);

      // Wrist articulation band
      const wristBand = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.8, seg.r * 0.8, 0.02, 16).rotateZ(Math.PI / 2), matRing);
      wristBand.position.set(signX * seg.h * 0.44, 0, 0);
      group.add(wristBand);

    } else if (seg.name.includes('Hand')) {
      // Defined palm plate - Calibrated 1:1 with cuboid(seg.h / 2, 0.020, 0.040)
      const palm = new THREE.Mesh(new THREE.BoxGeometry(seg.h, 0.040, 0.080), matJoint);
      palm.castShadow = true;
      group.add(palm);

      // Stylized thumb contour
      const signX = seg.name.includes('Left') ? 1 : -1;
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.020, 0.03), matPlates);
      thumb.position.set(0, 0.015, signX * 0.025);
      group.add(thumb);

    } else if (seg.name.includes('Shoulder')) {
      // Clavicle strut
      const clav = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 14, 14).rotateZ(Math.PI / 2), matBody);
      clav.castShadow = true;
      group.add(clav);

      const pivot = new THREE.Mesh(new THREE.SphereGeometry(seg.r * 0.9, 14, 14), matJoint);
      group.add(pivot);

    } else if (seg.name === 'Neck') {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.8, seg.r * 0.85, seg.h, 16), matJoint);
      n.castShadow = true;
      group.add(n);
      const nRing = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.85, 0.008, 8, 16).rotateX(Math.PI / 2), matRing);
      group.add(nRing);
    } else {
      const fb = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16), matBody);
      fb.castShadow = true;
      group.add(fb);
    }

    return group;
  }

  // --- ANATOMICAL JOINT CONSTRAINTS (NATIVE WASM HINGES & ASYMMETRIC 3-DOF LIMITS MATCHING ENDORPHIN 2.7.1) ---
  createAnatomicalJoints() {
    this.joints = [];

    // Joint specifications derived via REA from NaturalMotion Endorphin 2.7.1 StandardCharacter.xml:
    // - <SkeletalJoint> PrimaryFrameOffset + SoftLimits + HardLimits (asymmetric flexion/extension/abduction/twist)
    // - <Effector> & <Calibration name="Default"> (DrivePosAndVel implicit ForceBased joint motors)
    const jointConfigs = {
      // 1-DOF Knees (flexion backwards only [0.0, 2.45] rad; zero hyperextension)
      'LeftThigh_to_LeftCalf': {
        type: 'revolute',
        axis: { x: 1, y: 0, z: 0 },
        limits: [0.0, 2.45]
      },
      'RightThigh_to_RightCalf': {
        type: 'revolute',
        axis: { x: 1, y: 0, z: 0 },
        limits: [0.0, 2.45]
      },

      // 1-DOF Elbows (flexion forward into +Z only [0.0, 2.55] rad)
      'LeftUpperArm_to_LeftForearm': {
        type: 'revolute',
        axis: { x: 0, y: -1, z: 0 },
        limits: [0.0, 2.55]
      },
      'RightUpperArm_to_RightForearm': {
        type: 'revolute',
        axis: { x: 0, y: 1, z: 0 },
        limits: [0.0, 2.55]
      },

      // 1-DOF Ankles (dorsiflexion -0.75 rad / plantarflexion +0.95 rad)
      'LeftCalf_to_LeftFoot': {
        type: 'revolute',
        axis: { x: 1, y: 0, z: 0 },
        limits: [-0.75, 0.95]
      },
      'RightCalf_to_RightFoot': {
        type: 'revolute',
        axis: { x: 1, y: 0, z: 0 },
        limits: [-0.75, 0.95]
      },

      // 3-DOF Spine & Head with Endorphin Natural Flexion/Extension
      'Pelvis_to_LowerSpine': {
        type: 'spherical',
        xLimits: [-0.55, 0.75],
        yLimits: [-0.50, 0.50],
        zLimits: [-0.50, 0.50]
      },
      'LowerSpine_to_UpperSpine': {
        type: 'spherical',
        xLimits: [-0.55, 0.75],
        yLimits: [-0.50, 0.50],
        zLimits: [-0.50, 0.50]
      },
      'UpperSpine_to_Neck': {
        type: 'spherical',
        xLimits: [-0.50, 0.75],
        yLimits: [-0.55, 0.55],
        zLimits: [-0.50, 0.50]
      },
      'Neck_to_Head': {
        type: 'spherical',
        xLimits: [-0.50, 0.75],
        yLimits: [-0.65, 0.65],
        zLimits: [-0.50, 0.50]
      },

      // Hips: Allows full flexion up to 125 deg and extension up to 45 deg, plus full natural abduction
      'Pelvis_to_LeftThigh': {
        type: 'spherical',
        xLimits: [-2.15, 0.75],
        yLimits: [-0.65, 0.65],
        zLimits: [-0.65, 0.75]
      },
      'Pelvis_to_RightThigh': {
        type: 'spherical',
        xLimits: [-2.15, 0.75],
        yLimits: [-0.65, 0.65],
        zLimits: [-0.75, 0.65]
      },

      // Clavicles & Shoulders
      'UpperSpine_to_LeftShoulder': {
        type: 'spherical',
        xLimits: [-0.45, 0.45],
        yLimits: [-0.45, 0.45],
        zLimits: [-0.55, 0.45]
      },
      'UpperSpine_to_RightShoulder': {
        type: 'spherical',
        xLimits: [-0.45, 0.45],
        yLimits: [-0.45, 0.45],
        zLimits: [-0.45, 0.55]
      },
      'LeftShoulder_to_LeftUpperArm': {
        type: 'spherical',
        xLimits: [-1.65, 1.65],
        yLimits: [-1.65, 1.65],
        zLimits: [-1.85, 1.45]
      },
      'RightShoulder_to_RightUpperArm': {
        type: 'spherical',
        xLimits: [-1.65, 1.65],
        yLimits: [-1.65, 1.65],
        zLimits: [-1.45, 1.85]
      },

      // Wrists
      'LeftForearm_to_LeftHand': {
        type: 'spherical',
        xLimits: [-0.85, 0.85],
        yLimits: [-0.85, 0.85],
        zLimits: [-0.95, 0.95]
      },
      'RightForearm_to_RightHand': {
        type: 'spherical',
        xLimits: [-0.85, 0.85],
        yLimits: [-0.85, 0.85],
        zLimits: [-0.95, 0.95]
      }
    };

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) continue;

      const jointKey = `${def.parent}_to_${name}`;
      const cfg = jointConfigs[jointKey] || {
        type: 'spherical',
        xLimits: [-0.4, 0.4],
        yLimits: [-0.4, 0.4],
        zLimits: [-0.4, 0.4]
      };
      const pBody = this.bodies[def.parent].rigidBody;
      const cBody = this.bodies[name].rigidBody;

      const anchorData = JOINT_ANCHORS[jointKey] || {
        parentAnchor: { x: def.offset[0], y: def.offset[1], z: def.offset[2] },
        childAnchor: { x: 0, y: 0, z: 0 }
      };

      let joint;
      if (cfg.type === 'revolute') {
        const revData = RAPIER.JointData.revolute(
          anchorData.parentAnchor,
          anchorData.childAnchor,
          cfg.axis
        );
        joint = this.world.createImpulseJoint(revData, pBody, cBody, true);
        joint.setContactsEnabled(false);

        // Configure native Rapier WASM limits and ForceBased motor on AngX (3)
        const h = joint.handle;
        const raw = joint.rawSet;
        raw.jointSetLimits(h, 3, cfg.limits[0], cfg.limits[1]);
        raw.jointConfigureMotorModel(h, 3, RAPIER.MotorModel.ForceBased);
      } else {
        const sphData = RAPIER.JointData.spherical(
          anchorData.parentAnchor,
          anchorData.childAnchor
        );
        joint = this.world.createImpulseJoint(sphData, pBody, cBody, true);
        joint.setContactsEnabled(false);

        // Configure native Rapier WASM 3-DOF angular limits and ForceBased motors on AngX(3), AngY(4), AngZ(5)
        const h = joint.handle;
        const raw = joint.rawSet;
        raw.jointSetLimits(h, 3, cfg.xLimits[0], cfg.xLimits[1]);
        raw.jointSetLimits(h, 4, cfg.yLimits[0], cfg.yLimits[1]);
        raw.jointSetLimits(h, 5, cfg.zLimits[0], cfg.zLimits[1]);
        for (let ax = 3; ax <= 5; ax++) {
          raw.jointConfigureMotorModel(h, ax, RAPIER.MotorModel.ForceBased);
        }
      }

      this.joints.push({
        joint,
        name: jointKey,
        parentName: def.parent,
        childName: name,
        parentBody: pBody,
        childBody: cBody,
        parentAnchor: new THREE.Vector3(anchorData.parentAnchor.x, anchorData.parentAnchor.y, anchorData.parentAnchor.z),
        childAnchor: new THREE.Vector3(anchorData.childAnchor.x, anchorData.childAnchor.y, anchorData.childAnchor.z),
        config: cfg,
        targetAngle: new THREE.Vector3(0, 0, 0)
      });
    }
  }

  // --- FORWARD KINEMATICS FOR ANIMATION (EXACT JOINT-ANCHOR PIVOT KINEMATICS) ---
  applyForwardKinematics(rootPos, localRotationsEuler = {}) {
    const worldTransforms = {};
    const yaw = this.spawnYaw || 0;
    const qYaw = yaw !== 0 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : null;

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      const eul = localRotationsEuler[name] || [0, 0, 0];
      const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul));

      if (!def.parent) {
        let rPos = rootPos.clone();
        let rRot = localQ;
        const ox = this.spawnOffset ? this.spawnOffset.x : 0;
        const oy = this.spawnOffset ? this.spawnOffset.y : 0;
        const oz = this.spawnOffset ? this.spawnOffset.z : 0;
        if (qYaw) {
          const rel = new THREE.Vector3(rPos.x, 0, rPos.z).applyQuaternion(qYaw);
          rPos.x = ox + rel.x;
          rPos.y = rPos.y + oy;
          rPos.z = oz + rel.z;
          rRot = qYaw.clone().multiply(localQ);
        } else {
          rPos.x += ox;
          rPos.y += oy;
          rPos.z += oz;
        }
        worldTransforms[name] = { pos: rPos, rot: rRot };
      } else {
        const parentT = worldTransforms[def.parent];
        const jointKey = `${def.parent}_to_${name}`;
        const anchorData = JOINT_ANCHORS[jointKey];
        const worldRot = parentT.rot.clone().multiply(localQ);

        let worldPos;
        if (anchorData) {
          const pAnchor = new THREE.Vector3(
            anchorData.parentAnchor.x,
            anchorData.parentAnchor.y,
            anchorData.parentAnchor.z
          ).applyQuaternion(parentT.rot);
          const cAnchor = new THREE.Vector3(
            anchorData.childAnchor.x,
            anchorData.childAnchor.y,
            anchorData.childAnchor.z
          ).applyQuaternion(worldRot);
          worldPos = parentT.pos.clone().add(pAnchor).sub(cAnchor);
        } else {
          const offsetVec = new THREE.Vector3(...def.offset);
          worldPos = parentT.pos.clone().add(offsetVec.applyQuaternion(parentT.rot));
        }

        worldTransforms[name] = { pos: worldPos, rot: worldRot };
      }
    }

    // --- ANTI-GROUND-PENETRATION & FOOT CLAMPING SOLVER (ENDORPHIN FLOOR CONTACT SOLVER) ---
    // If any foot sole dips below the floor (Y < 0.0), elevates root position so the sole
    // rests precisely flush with the ground, eliminating ground clipping across animations and meshes.
    if (this.groundClampingEnabled !== false) {
      const soleMargin = this.footSoleOffset ?? 0.04;
      const footL = worldTransforms['LeftFoot'];
      const footR = worldTransforms['RightFoot'];
      let lowestSoleY = Infinity;
      if (footL) lowestSoleY = Math.min(lowestSoleY, footL.pos.y - soleMargin);
      if (footR) lowestSoleY = Math.min(lowestSoleY, footR.pos.y - soleMargin);

      if (lowestSoleY < 0.0) {
        const elev = -lowestSoleY;
        for (const name in worldTransforms) {
          worldTransforms[name].pos.y += elev;
        }
      }
    }

    // Apply resolved transforms to visual meshes and Rapier rigid bodies
    for (const [name, tr] of Object.entries(worldTransforms)) {
      const b = this.bodies[name];
      if (b) {
        b.mesh.position.copy(tr.pos);
        b.mesh.quaternion.copy(tr.rot);
        b.rigidBody.setTranslation({ x: tr.pos.x, y: tr.pos.y, z: tr.pos.z }, true);
        b.rigidBody.setRotation({ x: tr.rot.x, y: tr.rot.y, z: tr.rot.z, w: tr.rot.w }, true);
      }
    }
  }

  setDynamicMode(isDynamic) {
    this.isKinematic = !isDynamic;
    const bodyType = isDynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.KinematicPositionBased;

    for (const [name, b] of Object.entries(this.bodies)) {
      b.rigidBody.setBodyType(bodyType, true);
      b.rigidBody.enableCcd(isDynamic);
      if (!isDynamic) {
        b.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  setSpawnTransform(x, y, z, yaw = 0) {
    this.spawnOffset.set(x, Math.max(0, y), z);
    this.spawnYaw = yaw;
    if (this.isKinematic) {
      this.resetToTPose();
    }
  }

  setSpawnOffset(x, y, z) {
    this.setSpawnTransform(x, y, z, this.spawnYaw || 0);
  }

  resetToTPose() {
    this.setDynamicMode(false);
    this.isPureRagdoll = false;
    this.impactShockTimer = 0.0;
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const oy = this.spawnOffset ? this.spawnOffset.y : 0;
    const oz = this.spawnOffset ? this.spawnOffset.z : 0;
    const yaw = this.spawnYaw || 0;
    const qYaw = yaw !== 0 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : null;

    for (const [name, b] of Object.entries(this.bodies)) {
      let p = b.initPos.clone();
      let r = b.initRot.clone();
      if (qYaw) {
        p.applyQuaternion(qYaw);
        r = qYaw.clone().multiply(b.initRot);
      }
      const px = p.x + ox;
      const py = p.y + oy;
      const pz = p.z + oz;
      b.mesh.position.set(px, py, pz);
      b.mesh.quaternion.copy(r);
      b.rigidBody.setTranslation({ x: px, y: py, z: pz }, true);
      b.rigidBody.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w }, true);
      b.prevPos.set(px, py, pz);
    }
    for (const j of this.joints) {
      j.targetAngle.set(0, 0, 0);
    }
    this.currentPose = {
      rootPos: new THREE.Vector3(0, 0.95, 0),
      localRotations: {}
    };
  }

  resetToNaturalStance() {
    this.setDynamicMode(false);
    this.isPureRagdoll = false;
    this.impactShockTimer = 0.0;
    const rootPos = new THREE.Vector3(0, 0.94, 0);

    this.currentPose = {
      rootPos: rootPos.clone(),
      localRotations: JSON.parse(JSON.stringify(NATURAL_STANCE_ROTATIONS))
    };

    this.applyForwardKinematics(rootPos, NATURAL_STANCE_ROTATIONS);

    // Set motor targets matching relaxed anatomical standing angles
    for (const j of this.joints) {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        j.targetAngle.set(0.08, -0.12, -1.15);
      } else if (j.name === 'RightShoulder_to_RightUpperArm') {
        j.targetAngle.set(0.08, 0.12, 1.15);
      } else if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        j.targetAngle.set(0.26, 0, 0);
      } else if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        j.targetAngle.set(-0.08, 0, 0);
      } else if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        j.targetAngle.set(0.12, 0, 0);
      } else if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        j.targetAngle.set(-0.04, 0, 0);
      } else if (j.name.includes('Spine')) {
        j.targetAngle.set(0.02, 0, 0);
      } else {
        j.targetAngle.set(0, 0, 0);
      }
    }
  }

  // --- ACTIVE POSE & MANUAL ANIMATION AUTHORING INTERFACE ---
  getPoseState() {
    return {
      rootPos: [this.currentPose.rootPos.x, this.currentPose.rootPos.y, this.currentPose.rootPos.z],
      localRotations: JSON.parse(JSON.stringify(this.currentPose.localRotations || {}))
    };
  }

  applyPoseState(pose) {
    if (!pose) return;
    if (pose.rootPos) {
      if (Array.isArray(pose.rootPos)) {
        this.currentPose.rootPos.set(pose.rootPos[0], pose.rootPos[1], pose.rootPos[2]);
      } else {
        this.currentPose.rootPos.set(pose.rootPos.x, pose.rootPos.y, pose.rootPos.z);
      }
    }
    this.currentPose.localRotations = {};
    if (pose.localRotations) {
      for (const [bone, rot] of Object.entries(pose.localRotations)) {
        const eul = Array.isArray(rot) ? rot : [rot.x || 0, rot.y || 0, rot.z || 0];
        const clamped = (pose.isDenseMocap)
          ? { x: eul[0], y: eul[1], z: eul[2] }
          : clampBoneEulerRotation(bone, { x: eul[0], y: eul[1], z: eul[2] });
        this.currentPose.localRotations[bone] = [clamped.x, clamped.y, clamped.z];
      }
    }
    this.applyForwardKinematics(this.currentPose.rootPos, this.currentPose.localRotations);
    this.syncMotorTargetsToPose(this.currentPose.localRotations);
  }

  setBoneLocalRotation(boneName, rx, ry, rz) {
    if (!SKELETON_TREE[boneName]) return;
    if (boneName === 'Pelvis') {
      this.currentPose.localRotations['Pelvis'] = [rx, ry, rz];
    } else {
      const clamped = clampBoneEulerRotation(boneName, { x: rx, y: ry, z: rz });
      this.currentPose.localRotations[boneName] = [clamped.x, clamped.y, clamped.z];
    }
    this.applyForwardKinematics(this.currentPose.rootPos, this.currentPose.localRotations);
    this.syncMotorTargetsToPose(this.currentPose.localRotations);
  }

  setPoseRootPosition(x, y, z) {
    this.currentPose.rootPos.set(x, y, z);
    this.applyForwardKinematics(this.currentPose.rootPos, this.currentPose.localRotations);
  }

  syncMotorTargetsToPose(localRotations) {
    for (const j of this.joints) {
      const rot = localRotations[j.childName];
      if (rot) {
        j.targetAngle.set(rot[0], rot[1], rot[2]);
      } else {
        j.targetAngle.set(0, 0, 0);
      }
    }
  }

  // --- ACTIVE BEHAVIOR MOTOR CONTROL VIA NATIVE WASM IMPLICIT FORCE-BASED SOLVER ---
  applyMotorTorques(dt) {
    if (this.isKinematic || this.isPureRagdoll) return;

    const pelvis = this.bodies['Pelvis'];
    const pelvisY = pelvis.rigidBody.translation().y;
    
    // Natural Ground Rest Detection:
    // Only applies when character has actually landed or is in physical contact with the ground/props:
    const isGroundedOrNearFloor = pelvisY < 0.35 || this.sensors.hasGroundContact;
    const isGroundRest = isGroundedOrNearFloor && (
      pelvisY < 0.28 ||
      (this.sensors.tiltAngle > 55 && (this.sensors.handsGrounded || this.sensors.bodyGrounded || pelvisY < 0.36)) ||
      (pelvisY < 0.45 && this.sensors.hasGroundContact && (this.sensors.handsGrounded || this.sensors.bodyGrounded))
    );

    if (isGroundRest && !this.allowGroundActiveMotor) {
      this.applyPassiveRagdollDynamics(dt);
      return;
    }

    // Momentarily yield motor rigidity during heavy Force Event impact shock wave
    const shockScale = this.impactShockTimer > 0 ? 0.22 : 1.0;

    // Endorphin Dynamic Impact Yielding:
    // When hands touch the ground during a fall or steep tilt, arm and leg motor torques
    // compliantly yield (instead of fighting gravity with 240 Nm), allowing the torso,
    // chest, and pelvis to naturally descend and touch the ground.
    const isFallCatch = (this.sensors.isFalling || pelvisY < 0.65 || this.sensors.tiltAngle > 22.0) && this.sensors.handsGrounded;
    const armYieldScale = isFallCatch ? 0.18 : 1.0;
    const legYieldScale = isFallCatch ? 0.32 : 1.0;

    // Endorphin 2.7.1 effector stiffness/damping weights:
    // LowerBack & Hips carry high strength (1.25x), Knees/Ankles (1.1x), Shoulders/Arms (1.15x for active flailing/reach)
    const baseStiff = Math.max(12.0, this.muscleStiffness * 0.70 * shockScale);
    const baseDamp = Math.max(4.0, this.muscleDamping * 0.60 * shockScale);

    for (const j of this.joints) {
      const h = j.joint.handle;
      const raw = j.joint.rawSet;

      // Endorphin 2.7.1 Constrained Limb Compliance:
      // If a joint belongs to a pinned limb chain (e.g. wrist/elbow/shoulder of a pinned hand),
      // relax motor stiffness to 0.0 with natural damping so the limb hangs/pivots naturally
      // without fighting the pinned anchor!
      if (this.constrainedLimbJoints && this.constrainedLimbJoints.has(j.name)) {
        if (j.config.type === 'revolute') {
          raw.jointConfigureMotor(h, 3, 0.0, 0.0, 0.0, 3.5);
        } else {
          for (let ax = 3; ax <= 5; ax++) {
            raw.jointConfigureMotor(h, ax, 0.0, 0.0, 0.0, 3.5);
          }
        }
        continue;
      }

      let weight = 1.0;
      let yieldMod = 1.0;
      if (j.name.includes('Spine')) weight = 1.25;
      else if (j.name.includes('Thigh')) { weight = 1.25; yieldMod = legYieldScale; }
      else if (j.name.includes('Calf') || j.name.includes('Foot')) { weight = 1.1; yieldMod = legYieldScale; }
      else if (j.name.includes('Shoulder') || j.name.includes('UpperArm') || j.name.includes('Forearm')) { weight = 1.15; yieldMod = armYieldScale; }
      else if (j.name.includes('Neck') || j.name.includes('Head')) weight = 0.55;

      const s = baseStiff * weight * yieldMod;
      const d = baseDamp * weight * yieldMod;

      if (j.config.type === 'revolute') {
        raw.jointConfigureMotor(h, 3, j.targetAngle.x, 0.0, s, d);
      } else {
        raw.jointConfigureMotor(h, 3, j.targetAngle.x, 0.0, s, d);
        raw.jointConfigureMotor(h, 4, j.targetAngle.y, 0.0, s, d);
        raw.jointConfigureMotor(h, 5, j.targetAngle.z, 0.0, s, d);
      }
    }

    this.applyFloorContactStiction(dt);
  }

  // Native WASM 3-DOF angular limits (rawSet.jointSetLimits) are solved directly inside Rapier's 32-iteration PGS solver
  enforceAnatomicalLimits(dt) {
    // Handled natively inside Rapier WASM PGS solver via raw.jointSetLimits(handle, 3..5, min, max)
  }

  // --- NATURALMOTION ENDORPHIN 2.7.1 PURE PASSIVE LIMP RAGDOLL ENGINE ---
  applyPassiveRagdollDynamics(dt) {
    if (this.isKinematic) return;

    // Pure limp ragdoll dynamics: all motor stiffness is strictly 0.0,
    // allowing complete natural gravitational collapse where every limb, torso, pelvis,
    // and head settle 100% flat onto the floor or collision props.
    for (const j of this.joints) {
      const h = j.joint.handle;
      const raw = j.joint.rawSet;

      if (j.config.type === 'revolute') {
        raw.jointConfigureMotor(h, 3, 0.0, 0.0, 0.0, 0.35);
      } else {
        for (let ax = 3; ax <= 5; ax++) {
          raw.jointConfigureMotor(h, ax, 0.0, 0.0, 0.0, 0.35);
        }
      }
    }

    this.applyFloorContactStiction(dt);
  }

  // Per-Bone Floor Contact Damping & Micro-Drift Damping (lets limbs and body roll, compress, and rest naturally)
  applyFloorContactStiction(dt) {
    if (this.impactShockTimer > 0) return;

    for (const [name, b] of Object.entries(this.bodies)) {
      const trans = b.rigidBody.translation();
      const radius = b.radius || 0.05;
      const halfHeight = (b.type === 'capsule' || b.type === 'capsule_x') ? (b.height || 0.16) * 0.5 : 0.0;
      const rot = b.rigidBody.rotation();
      const qB = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const localAxis = (b.type === 'capsule_x') ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const worldAxis = localAxis.applyQuaternion(qB);
      const verticalExtent = Math.abs(worldAxis.y) * halfHeight + radius;
      const bottomY = trans.y - verticalExtent;

      const onFloor = bottomY <= 0.025;

      if (onFloor) {
        // Subtle damping upon ground contact to absorb micro-vibrations without locking
        b.rigidBody.setLinearDamping(1.2);
        b.rigidBody.setAngularDamping(1.5);

        const lv = b.rigidBody.linvel();
        const hSpeed = Math.hypot(lv.x, lv.z);

        // Gentle lateral stiction to settle sliding, preserving vertical collapse and rotational freedom
        if (hSpeed > 0.005 && hSpeed < 0.30 && Math.abs(lv.y) < 0.15) {
          const stiction = Math.min(0.20, dt * 8.0);
          b.rigidBody.applyImpulse({
            x: -lv.x * b.mass * stiction,
            y: 0,
            z: -lv.z * b.mass * stiction
          }, true);
        }
      } else {
        // Natural human joint & tissue damping in air to prevent runaway joint limit spin
        b.rigidBody.setLinearDamping(0.08);
        b.rigidBody.setAngularDamping(1.35);
      }
    }
  }

  // --- ENDORPHIN 2.7.1 BIOMECHANICAL ZERO-MOMENT-POINT (ZMP) DYNAMIC BALANCE CONTROLLER ---
  // Calculates inverted pendulum Capture Point and dynamically steps feet to maintain stability.
  updateZMPBalance(dt) {
    if (this.isKinematic || this.isPureRagdoll || !this.balanceControlEnabled) return;

    const footL = this.bodies['LeftFoot']?.rigidBody?.translation();
    const footR = this.bodies['RightFoot']?.rigidBody?.translation();
    if (!footL || !footR) return;

    // Midpoint of feet support polygon
    const baseSupportX = (footL.x + footR.x) * 0.5;
    const baseSupportZ = (footL.z + footR.z) * 0.5;

    // Inverted pendulum eigenfrequency: omega0 = sqrt(g / h_com)
    const comY = Math.max(0.35, this.sensors.centerOfMass.y);
    const omega0 = Math.sqrt(9.81 / comY);

    // Instantaneous Capture Point (Zero Moment Point): ZMP = CoM + v_CoM / omega0
    const zmpX = this.sensors.centerOfMass.x + (this.sensors.comVelocity.x / omega0);
    const zmpZ = this.sensors.centerOfMass.z + (this.sensors.comVelocity.z / omega0);

    // Error vector from base of support to capture point
    const errX = zmpX - baseSupportX;
    const errZ = zmpZ - baseSupportZ;
    this.zmpDisplacement = Math.hypot(errX, errZ);

    // Unrecoverable loss of balance threshold
    const maxTilt = this.lossOfBalanceTiltLimit !== undefined ? this.lossOfBalanceTiltLimit : 45;
    if (this.zmpDisplacement > 0.65 || this.sensors.tiltAngle > maxTilt || this.sensors.verticalVelocity < -1.6) {
      this.isLossOfBalance = true;
      return;
    }

    this.isLossOfBalance = false;

    if (this.zmpDisplacement > 0.06) {
      this.steppingPhaseTimer += dt * 3.5;

      // Select swing leg based on push direction or alternating timer
      if (this.steppingPhaseTimer > 1.0) {
        this.steppingFoot = this.steppingFoot === 'Left' ? 'Right' : 'Left';
        this.steppingPhaseTimer = 0.0;
      }

      const isLeftSwing = this.steppingFoot === 'Left';
      const swingHipName = isLeftSwing ? 'Pelvis_to_LeftThigh' : 'Pelvis_to_RightThigh';
      const swingKneeName = isLeftSwing ? 'LeftThigh_to_LeftCalf' : 'RightThigh_to_RightCalf';
      const stanceHipName = isLeftSwing ? 'Pelvis_to_RightThigh' : 'Pelvis_to_LeftThigh';

      const swingHip = this.joints.find(j => j.name === swingHipName);
      const swingKnee = this.joints.find(j => j.name === swingKneeName);
      const stanceHip = this.joints.find(j => j.name === stanceHipName);

      // Pitch correction (forward/backward step):
      const pitchStep = THREE.MathUtils.clamp(errZ * 1.8, -0.75, 0.95) * (this.balanceRecoveryStrength || 1.0);
      // Roll correction (lateral step):
      const rollStep = THREE.MathUtils.clamp(errX * 1.2, -0.45, 0.45) * (this.balanceRecoveryStrength || 1.0);

      if (swingHip) {
        swingHip.targetAngle.x += pitchStep * 0.85;
        swingHip.targetAngle.z += (isLeftSwing ? rollStep : -rollStep) * 0.75;
      }
      if (swingKnee) {
        const kneeFlex = Math.sin(this.steppingPhaseTimer * Math.PI) * 0.65 * Math.abs(pitchStep);
        swingKnee.targetAngle.x += kneeFlex;
      }
      if (stanceHip) {
        stanceHip.targetAngle.x -= pitchStep * 0.25;
      }

      // Natural counter-balancing arm swing
      if (this.counterWeighingEnabled !== false) {
        const lArm = this.joints.find(j => j.name === 'LeftShoulder_to_LeftUpperArm');
        const rArm = this.joints.find(j => j.name === 'RightShoulder_to_RightUpperArm');
        if (lArm && rArm) {
          const armPitch = THREE.MathUtils.clamp(-errZ * 1.2, -0.6, 0.6);
          lArm.targetAngle.x += (isLeftSwing ? -armPitch : armPitch) * 0.7;
          rArm.targetAngle.x += (isLeftSwing ? armPitch : -armPitch) * 0.7;
          lArm.targetAngle.z -= Math.abs(rollStep) * 0.5;
          rArm.targetAngle.z += Math.abs(rollStep) * 0.5;
        }
      }
    }
  }

  update(dt) {
    if (this.impactShockTimer > 0) {
      this.impactShockTimer = Math.max(0, this.impactShockTimer - dt);
    }
    this.sensors.update(dt);
    if (!this.isKinematic) {
      if (this.balanceControlEnabled && !this.isPureRagdoll) {
        this.updateZMPBalance(dt);
      }
      if (this.isPureRagdoll) {
        this.applyPassiveRagdollDynamics(dt);
      } else {
        this.applyMotorTorques(dt);
      }
      this.enforceAnatomicalLimits(dt);
    }

    for (const [name, b] of Object.entries(this.bodies)) {
      const t = b.rigidBody.translation();
      const r = b.rigidBody.rotation();
      b.mesh.position.set(t.x, t.y, t.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  applyImpulseToBody(bodyName, impulseVector) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (b && b.rigidBody) {
      b.rigidBody.applyImpulse(impulseVector, true);
    }
  }

  // Endorphin 2.7.1 High-Impact Force Effector with Kinetic Chain Coupling & Shock Yield
  applyForceEffector(bodyName, forceVector, isContinuous = false) {
    if (this.isKinematic) return;

    const target = this.bodies[bodyName] ? bodyName : 'UpperSpine';
    const b = this.bodies[target];
    if (!b || !b.rigidBody) return;

    // Trigger momentary postural shock yield so hit overcomes joint locks & ground stiction
    this.impactShockTimer = isContinuous ? Math.max(this.impactShockTimer, 0.08) : 0.26;

    // Calibrated Endorphin 92.5kg articulated body multiplier
    const powerScale = isContinuous ? 0.32 : 3.2;
    const fx = forceVector.x * powerScale;
    const fy = forceVector.y * powerScale;
    const fz = forceVector.z * powerScale;

    // 1. Primary hit on targeted bone
    b.rigidBody.applyImpulse({ x: fx, y: fy, z: fz }, true);

    // 2. Rotational whip torque on targeted bone so limbs/torso twist into the hit
    b.rigidBody.applyTorqueImpulse({
      x: fz * 0.14,
      y: (fx - fz) * 0.06,
      z: -fx * 0.14
    }, true);

    // 3. Propagate kinetic follow-through to parent & child segments in SKELETON_TREE
    const def = SKELETON_TREE[target];
    if (def && def.parent && this.bodies[def.parent]) {
      this.bodies[def.parent].rigidBody.applyImpulse({
        x: fx * 0.65,
        y: fy * 0.65,
        z: fz * 0.65
      }, true);
    }

    for (const [childName, cDef] of Object.entries(SKELETON_TREE)) {
      if (cDef.parent === target && this.bodies[childName]) {
        this.bodies[childName].rigidBody.applyImpulse({
          x: fx * 0.45,
          y: fy * 0.45,
          z: fz * 0.45
        }, true);
      }
    }

    // 4. Core center-of-mass transfer so limb/head/chest hits genuinely drive the whole body
    if (target !== 'Pelvis' && this.bodies['Pelvis']) {
      this.bodies['Pelvis'].rigidBody.applyImpulse({
        x: fx * 0.55,
        y: fy * 0.45,
        z: fz * 0.55
      }, true);
    }
    if (target !== 'UpperSpine' && this.bodies['UpperSpine']) {
      this.bodies['UpperSpine'].rigidBody.applyImpulse({
        x: fx * 0.45,
        y: fy * 0.40,
        z: fz * 0.45
      }, true);
    }
  }

  // Endorphin 2.7.1 Active Pose Matching
  applyActivePose(poseKey, strength = 1.0) {
    const pose = ENDORPHIN_ACTIVE_POSES[poseKey] || ENDORPHIN_ACTIVE_POSES['crouching'];
    if (!pose || !pose.angles) return;
    const factor = Math.min(1.0, Math.max(0.0, strength / 50.0));
    for (const j of this.joints) {
      const pAngles = pose.angles[j.name];
      if (pAngles) {
        j.targetAngle.x = THREE.MathUtils.lerp(j.targetAngle.x, pAngles[0], factor);
        j.targetAngle.y = THREE.MathUtils.lerp(j.targetAngle.y, pAngles[1], factor);
        j.targetAngle.z = THREE.MathUtils.lerp(j.targetAngle.z, pAngles[2], factor);
      }
    }
  }

  // Endorphin 2.7.1 Constraint Events (Absolute Lock, Position Lock, Orientation Lock, Object/World Pinning)
  applyBoneConstraint(bodyName, constraintType = 'lock', anchorPos = null, strength = 1.0, anchorLinvel = null, targetRotation = null, anchorAngvel = null) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (!b || !b.rigidBody) return;

    const effectiveStrength = THREE.MathUtils.clamp(strength, 0.0, 1.0);
    const linvelToSet = anchorLinvel || { x: 0, y: 0, z: 0 };
    const angvelToSet = anchorAngvel || { x: 0, y: 0, z: 0 };

    if (effectiveStrength >= 0.85) {
      // Solid Pin: Set to KinematicPositionBased so the pinned bone acts
      // as an unyielding infinite-mass anchor in Rapier's joint solver, eliminating
      // mass-ratio impulse explosions and wiggling/spinning of connected limbs!
      if (b.rigidBody.bodyType() !== RAPIER.RigidBodyType.KinematicPositionBased) {
        b.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      }

      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          b.rigidBody.setTranslation({ x: anchorPos.x, y: anchorPos.y, z: anchorPos.z }, true);
          if (b.mesh) b.mesh.position.set(anchorPos.x, anchorPos.y, anchorPos.z);
          b.rigidBody.setLinvel(linvelToSet, true);
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        if (targetRotation) {
          b.rigidBody.setRotation(targetRotation, true);
          if (b.mesh) b.mesh.quaternion.copy(targetRotation);
        }
        b.rigidBody.setAngvel(angvelToSet, true);
      }
    } else {
      // Soft compliant pin
      if (b.rigidBody.bodyType() !== RAPIER.RigidBodyType.Dynamic) {
        b.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      }

      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          const cur = b.rigidBody.translation();
          const dx = anchorPos.x - cur.x;
          const dy = anchorPos.y - cur.y;
          const dz = anchorPos.z - cur.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.0005) {
            const pullVel = dist * 120.0 * effectiveStrength;
            b.rigidBody.setLinvel({
              x: linvelToSet.x + (dx / dist) * pullVel,
              y: linvelToSet.y + (dy / dist) * pullVel,
              z: linvelToSet.z + (dz / dist) * pullVel
            }, true);
          } else {
            b.rigidBody.setLinvel(linvelToSet, true);
          }
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        b.rigidBody.setAngvel(angvelToSet, true);
      }
    }
  }

  releaseBoneConstraint(bodyName) {
    const b = this.bodies[bodyName];
    if (!b || !b.rigidBody) return;
    if (b.rigidBody.bodyType() !== RAPIER.RigidBodyType.Dynamic) {
      b.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    }
  }

  /**
   * Apply a named Endorphin 2.7.1 Effector Calibration preset ('Default', 'Strong', 'Weak', 'Relaxed', 'Rigid', 'Balance', 'Reach', 'Mocap')
   */
  applyEffectorCalibration(calibrationName = 'Default', selectionSet = null) {
    const cal = ENDORPHIN_EFFECTOR_CALIBRATIONS[calibrationName] || ENDORPHIN_EFFECTOR_CALIBRATIONS.Default;
    this.activeCalibration = calibrationName;
    this.muscleStiffness = 300.0 * cal.stiffnessScale;
    this.muscleDamping = 35.0 * cal.dampingScale;
    for (const j of this.joints) {
      if (selectionSet && Array.isArray(selectionSet) && !selectionSet.includes(j.childName)) continue;
      j.calibrationStiffnessScale = cal.stiffnessScale;
      j.calibrationDampingScale = cal.dampingScale;
    }
  }

  /**
   * Authentic NaturalMotion Endorphin Virtual Muscle Actuator
   * Models LeftArmVirtualMuscle, RightArmVirtualMuscle, LeftLegVirtualMuscle, RightLegVirtualMuscle
   * from Standard Simulation Character.nmc (SkeletalJoint + EffectorSkeletal connecting root directly to hand/foot).
   * Conserves internal momentum by applying equal-and-opposite compliant spring-damper forces between rootBody and endBody
   * while biasing intermediate 2-bone IK joint angles.
   */
  applyVirtualMuscleDrive(limbKey, targetWorldPos, options = {}) {
    if (this.isKinematic || !targetWorldPos) return;
    const vm = VIRTUAL_MUSCLE_CONFIGS[limbKey];
    if (!vm) return;

    const rootB = this.bodies[vm.rootBody];
    const midB = this.bodies[vm.midBody];
    const endB = this.bodies[vm.endBody];
    if (!rootB?.rigidBody || !endB?.rigidBody) return;

    const dt = options.dt ?? (1 / 120);
    const stiffness = (options.stiffness ?? vm.stiffness) * (options.strength ?? 1.0);
    const damping = options.damping ?? vm.damping;
    const vmExtension = THREE.MathUtils.clamp(options.vmExtension ?? 0.95, 0.15, 1.0);
    const maxReach = vm.maxRadius * vmExtension;

    const rTr = rootB.rigidBody.translation();
    const eTr = endB.rigidBody.translation();
    const rootPos = new THREE.Vector3(rTr.x, rTr.y, rTr.z);
    const endPos = new THREE.Vector3(eTr.x, eTr.y, eTr.z);
    const desiredPos = new THREE.Vector3(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z);

    // Clamp target within anatomical VirtualMuscle sphere radius (bradius) around rootBody
    const rootToTarget = desiredPos.clone().sub(rootPos);
    const distFromRoot = rootToTarget.length();
    if (distFromRoot > maxReach && distFromRoot > 0.0001) {
      rootToTarget.multiplyScalar(maxReach / distFromRoot);
      desiredPos.copy(rootPos).add(rootToTarget);
    }

    const disp = desiredPos.clone().sub(endPos);
    const rLv = rootB.rigidBody.linvel();
    const eLv = endB.rigidBody.linvel();
    const relVel = new THREE.Vector3(eLv.x - rLv.x, eLv.y - rLv.y, eLv.z - rLv.z);

    const fx = THREE.MathUtils.clamp(disp.x * stiffness - relVel.x * damping, -420, 420);
    const fy = THREE.MathUtils.clamp(disp.y * stiffness - relVel.y * damping, -420, 420);
    const fz = THREE.MathUtils.clamp(disp.z * stiffness - relVel.z * damping, -420, 420);

    // Equal and opposite internal virtual-muscle impulse (Endorphin VMCS internal actuator)
    endB.rigidBody.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    rootB.rigidBody.applyImpulse({ x: -fx * dt * 0.45, y: -fy * dt * 0.45, z: -fz * dt * 0.45 }, true);
    if (midB?.rigidBody) {
      midB.rigidBody.applyImpulse({ x: fx * dt * 0.25, y: fy * dt * 0.25, z: fz * dt * 0.25 }, true);
    }

    // Bias elbow / knee flexion angle based on virtual muscle extension ratio
    const extRatio = THREE.MathUtils.clamp(distFromRoot / Math.max(0.2, vm.maxRadius), 0.1, 1.0);
    const bendAngle = Math.acos(THREE.MathUtils.clamp(extRatio, 0.15, 0.99)) * 1.35;
    const midJoint = this.joints.find(j => j.childName === vm.midBody);
    if (midJoint && midJoint.targetAngle) {
      midJoint.targetAngle.x = THREE.MathUtils.lerp(midJoint.targetAngle.x, bendAngle, 0.35);
    }
  }

  destroy() {
    for (const j of this.joints) {
      if (j.joint && this.world) {
        try {
          this.world.removeImpulseJoint(j.joint, true);
        } catch (e) {
          console.warn('Error removing joint:', e);
        }
      }
    }
    this.joints = [];

    for (const [name, b] of Object.entries(this.bodies)) {
      if (b.mesh && this.scene) {
        this.scene.remove(b.mesh);
        b.mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
      }
      if (b.rigidBody && this.world) {
        try {
          this.world.removeRigidBody(b.rigidBody);
        } catch (e) {
          console.warn('Error removing rigid body:', e);
        }
      }
    }
    this.bodies = {};
    this.visualMeshes = [];
  }
}

// Canonical Endorphin 2.7.1 Named Effector Calibrations (extracted via REA from Standard Simulation Character.nmc)
export const ENDORPHIN_EFFECTOR_CALIBRATIONS = {
  Default: { stiffnessScale: 1.0,  dampingScale: 1.0,  muscleForce: 1.0 },
  Strong:  { stiffnessScale: 1.85, dampingScale: 1.25, muscleForce: 1.8 },
  Weak:    { stiffnessScale: 0.35, dampingScale: 0.65, muscleForce: 0.4 },
  Relaxed: { stiffnessScale: 0.12, dampingScale: 0.40, muscleForce: 0.15 },
  Rigid:   { stiffnessScale: 2.50, dampingScale: 1.60, muscleForce: 2.2 },
  Balance: { stiffnessScale: 1.40, dampingScale: 1.15, muscleForce: 1.5 },
  Reach:   { stiffnessScale: 1.30, dampingScale: 0.90, muscleForce: 1.6 },
  Mocap:   { stiffnessScale: 2.20, dampingScale: 1.40, muscleForce: 2.0 }
};

// Authentic 4 Virtual Muscles from Standard Simulation Character.nmc
export const VIRTUAL_MUSCLE_CONFIGS = {
  LeftArm:  { name: 'LeftArmVirtualMuscle',  rootBody: 'UpperSpine', midBody: 'LeftForearm',  endBody: 'LeftHand',  maxRadius: 0.76, stiffness: 320.0, damping: 28.0 },
  RightArm: { name: 'RightArmVirtualMuscle', rootBody: 'UpperSpine', midBody: 'RightForearm', endBody: 'RightHand', maxRadius: 0.76, stiffness: 320.0, damping: 28.0 },
  LeftLeg:  { name: 'LeftLegVirtualMuscle',  rootBody: 'Pelvis',     midBody: 'LeftCalf',     endBody: 'LeftFoot',  maxRadius: 0.88, stiffness: 380.0, damping: 34.0 },
  RightLeg: { name: 'RightLegVirtualMuscle', rootBody: 'Pelvis',     midBody: 'RightCalf',    endBody: 'RightFoot', maxRadius: 0.88, stiffness: 380.0, damping: 34.0 }
};

// Canonical Endorphin 2.7.1 Active Pose Library (Joint Angles in Radians)
export const ENDORPHIN_ACTIVE_POSES = {
  tpose: {
    name: 'T-Pose (Default Neutral)',
    angles: {}
  },
  crouching: {
    name: 'Crouching (Combat / Low Stance)',
    angles: {
      'Pelvis_to_LowerSpine': [0.25, 0, 0],
      'LowerSpine_to_UpperSpine': [0.22, 0, 0],
      'Pelvis_to_LeftThigh': [-0.85, 0, 0.08],
      'Pelvis_to_RightThigh': [-0.85, 0, -0.08],
      'LeftThigh_to_LeftCalf': [1.25, 0, 0],
      'RightThigh_to_RightCalf': [1.25, 0, 0],
      'LeftCalf_to_LeftFoot': [-0.55, 0, 0],
      'RightCalf_to_RightFoot': [-0.55, 0, 0],
      'LeftShoulder_to_LeftUpperArm': [0.10, -0.65, -0.55],
      'RightShoulder_to_RightUpperArm': [0.10, 0.65, 0.55],
      'LeftUpperArm_to_LeftForearm': [0.95, 0, 0],
      'RightUpperArm_to_RightForearm': [0.95, 0, 0]
    }
  },
  armsRaised: {
    name: 'Arms Raised (Surrender / Reach Up)',
    angles: {
      'LeftShoulder_to_LeftUpperArm': [-0.10, -1.45, 1.25],
      'RightShoulder_to_RightUpperArm': [-0.10, 1.45, -1.25],
      'LeftUpperArm_to_LeftForearm': [0.15, 0, 0],
      'RightUpperArm_to_RightForearm': [0.15, 0, 0]
    }
  },
  armsWide: {
    name: 'Arms Wide (Airplane Wings / Balance)',
    angles: {
      'LeftShoulder_to_LeftUpperArm': [0.0, 0.05, -0.15],
      'RightShoulder_to_RightUpperArm': [0.0, -0.05, 0.15],
      'LeftUpperArm_to_LeftForearm': [0.05, 0, 0],
      'RightUpperArm_to_RightForearm': [0.05, 0, 0]
    }
  },
  rolling: {
    name: 'Rolling (Tight Foetal Tuck)',
    angles: {
      'Pelvis_to_LowerSpine': [0.45, 0, 0],
      'LowerSpine_to_UpperSpine': [0.45, 0, 0],
      'UpperSpine_to_Neck': [0.35, 0, 0],
      'Pelvis_to_LeftThigh': [-1.35, 0, 0],
      'Pelvis_to_RightThigh': [-1.35, 0, 0],
      'LeftThigh_to_LeftCalf': [1.75, 0, 0],
      'RightThigh_to_RightCalf': [1.75, 0, 0],
      'LeftShoulder_to_LeftUpperArm': [0.25, -1.05, -0.45],
      'RightShoulder_to_RightUpperArm': [0.25, 1.05, 0.45],
      'LeftUpperArm_to_LeftForearm': [1.65, 0, 0],
      'RightUpperArm_to_RightForearm': [1.65, 0, 0]
    }
  },
  sitting: {
    name: 'Sitting On Ground (Relaxed)',
    angles: {
      'Pelvis_to_LowerSpine': [0.20, 0, 0],
      'LowerSpine_to_UpperSpine': [0.15, 0, 0],
      'Pelvis_to_LeftThigh': [-1.45, 0, 0.15],
      'Pelvis_to_RightThigh': [-1.45, 0, -0.15],
      'LeftThigh_to_LeftCalf': [0.45, 0, 0],
      'RightThigh_to_RightCalf': [0.45, 0, 0],
      'LeftShoulder_to_LeftUpperArm': [0.15, -0.35, -0.85],
      'RightShoulder_to_RightUpperArm': [0.15, 0.35, 0.85],
      'LeftUpperArm_to_LeftForearm': [0.45, 0, 0],
      'RightUpperArm_to_RightForearm': [0.45, 0, 0]
    }
  },
  standingTwist: {
    name: 'Standing Twisting To Right',
    angles: {
      'Pelvis_to_LowerSpine': [0.05, 0.35, 0],
      'LowerSpine_to_UpperSpine': [0.05, 0.35, 0],
      'UpperSpine_to_Neck': [0.0, -0.45, 0],
      'LeftShoulder_to_LeftUpperArm': [0.15, -0.45, -0.85],
      'RightShoulder_to_RightUpperArm': [-0.15, 0.75, 0.65],
      'RightUpperArm_to_RightForearm': [0.75, 0, 0]
    }
  },
  weaponHold: {
    name: 'Weapon In Both Hands (Tactical Grip)',
    angles: {
      'Pelvis_to_LowerSpine': [0.12, 0.15, 0],
      'LowerSpine_to_UpperSpine': [0.15, 0.15, 0],
      'LeftShoulder_to_LeftUpperArm': [0.20, -1.25, -0.25],
      'RightShoulder_to_RightUpperArm': [0.20, 1.05, 0.35],
      'LeftUpperArm_to_LeftForearm': [1.25, 0, 0],
      'RightUpperArm_to_RightForearm': [0.85, 0, 0]
    }
  }
};

