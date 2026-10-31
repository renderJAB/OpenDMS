import * as THREE from 'three';
import { resampleSimulationFrames } from './resampleFrames.js';

/**
 * Ordered definition of the humanoid skeleton hierarchy for BVH export.
 * Follows depth-first traversal of the skeletal tree.
 */
export const BVH_BONE_ORDER = [
  { name: 'Pelvis', parent: null, channels: 6 },
  { name: 'LowerSpine', parent: 'Pelvis', channels: 3 },
  { name: 'UpperSpine', parent: 'LowerSpine', channels: 3 },
  { name: 'Neck', parent: 'UpperSpine', channels: 3 },
  { name: 'Head', parent: 'Neck', channels: 3 },
  { name: 'LeftShoulder', parent: 'UpperSpine', channels: 3 },
  { name: 'LeftUpperArm', parent: 'LeftShoulder', channels: 3 },
  { name: 'LeftForearm', parent: 'LeftUpperArm', channels: 3 },
  { name: 'LeftHand', parent: 'LeftForearm', channels: 3 },
  { name: 'RightShoulder', parent: 'UpperSpine', channels: 3 },
  { name: 'RightUpperArm', parent: 'RightShoulder', channels: 3 },
  { name: 'RightForearm', parent: 'RightUpperArm', channels: 3 },
  { name: 'RightHand', parent: 'RightForearm', channels: 3 },
  { name: 'LeftThigh', parent: 'Pelvis', channels: 3 },
  { name: 'LeftCalf', parent: 'LeftThigh', channels: 3 },
  { name: 'LeftFoot', parent: 'LeftCalf', channels: 3 },
  { name: 'RightThigh', parent: 'Pelvis', channels: 3 },
  { name: 'RightCalf', parent: 'RightThigh', channels: 3 },
  { name: 'RightFoot', parent: 'RightCalf', channels: 3 }
];

/**
 * Builds the HIERARCHY section string matching the standard Endorphin 19-bone humanoid rig.
 * @param {number} scale Conversion multiplier from meters to BVH units (default: 1.0 for meters; 100 for cm).
 */
export function buildBVHHierarchy(scale = 1.0) {
  const f = (val) => (val * scale).toFixed(4);

  return `HIERARCHY
ROOT Pelvis
{
  OFFSET 0.0000 0.0000 0.0000
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT LowerSpine
  {
    OFFSET ${f(0)} ${f(0.16)} ${f(0)}
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT UpperSpine
    {
      OFFSET ${f(0)} ${f(0.18)} ${f(0)}
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT Neck
      {
        OFFSET ${f(0)} ${f(0.16)} ${f(0)}
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT Head
        {
          OFFSET ${f(0)} ${f(0.16)} ${f(0)}
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET ${f(0)} ${f(0.12)} ${f(0)}
          }
        }
      }
      JOINT LeftShoulder
      {
        OFFSET ${f(0.18)} ${f(0.04)} ${f(0)}
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT LeftUpperArm
        {
          OFFSET ${f(0.17)} ${f(0)} ${f(0)}
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT LeftForearm
          {
            OFFSET ${f(0.26)} ${f(0)} ${f(0)}
            CHANNELS 3 Zrotation Xrotation Yrotation
            JOINT LeftHand
            {
              OFFSET ${f(0.205)} ${f(0)} ${f(0)}
              CHANNELS 3 Zrotation Xrotation Yrotation
              End Site
              {
                OFFSET ${f(0.10)} ${f(0)} ${f(0)}
              }
            }
          }
        }
      }
      JOINT RightShoulder
      {
        OFFSET ${f(-0.18)} ${f(0.04)} ${f(0)}
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT RightUpperArm
        {
          OFFSET ${f(-0.17)} ${f(0)} ${f(0)}
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT RightForearm
          {
            OFFSET ${f(-0.26)} ${f(0)} ${f(0)}
            CHANNELS 3 Zrotation Xrotation Yrotation
            JOINT RightHand
            {
              OFFSET ${f(-0.205)} ${f(0)} ${f(0)}
              CHANNELS 3 Zrotation Xrotation Yrotation
              End Site
              {
                OFFSET ${f(-0.10)} ${f(0)} ${f(0)}
              }
            }
          }
        }
      }
    }
  }
  JOINT LeftThigh
  {
    OFFSET ${f(0.12)} ${f(-0.24)} ${f(0)}
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftCalf
    {
      OFFSET ${f(0)} ${f(-0.38)} ${f(0)}
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT LeftFoot
      {
        OFFSET ${f(0)} ${f(-0.29)} ${f(0.04)}
        CHANNELS 3 Zrotation Xrotation Yrotation
        End Site
        {
          OFFSET ${f(0)} ${f(-0.05)} ${f(0.12)}
        }
      }
    }
  }
  JOINT RightThigh
  {
    OFFSET ${f(-0.12)} ${f(-0.24)} ${f(0)}
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT RightCalf
    {
      OFFSET ${f(0)} ${f(-0.38)} ${f(0)}
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT RightFoot
      {
        OFFSET ${f(0)} ${f(-0.29)} ${f(0.04)}
        CHANNELS 3 Zrotation Xrotation Yrotation
        End Site
        {
          OFFSET ${f(0)} ${f(-0.05)} ${f(0.12)}
        }
      }
    }
  }
}
`;
}

/**
 * Exports simulated animation frames into standard Biovision Hierarchy (.bvh) format.
 * Computes exact relative parent-child Euler rotations in 'ZXY' convention to match
 * 'Zrotation Xrotation Yrotation' channel specifications in Blender, Maya, UE5, and BVH viewers.
 *
 * @param {Array<Object>} recordedFrames Timeline simulationCache array.
 * @param {number} fps Simulation frame rate (default: 60).
 * @param {Object} options Export options (scale, etc.).
 * @returns {string} Standard BVH file contents.
 */
export function exportToBVH(recordedFrames, fps = 60, options = {}) {
  if (!recordedFrames || recordedFrames.length === 0) return '';

  const scale = options.scale ?? 1.0; // 1.0 is standard 1:1 Meter scale for Blender, Unreal Engine, Godot, and Three.js
  const sourceFps = options.sourceFps || options.simFps || 60;
  const outputFps = options.outputFps || fps || sourceFps;

  const validFrames = resampleSimulationFrames(recordedFrames, sourceFps, outputFps);
  if (validFrames.length === 0) return '';

  const header = buildBVHHierarchy(scale);

  // Filter valid frames (supports both single-actor f.bodies and multi-actor f.actors)
  const actorId = options.actorId || 'actor-1';
  const getFrameBodies = (f) => {
    if (!f) return null;
    if (f.actors && f.actors[actorId] && f.actors[actorId].bodies) return f.actors[actorId].bodies;
    if (f.bodies) return f.bodies;
    return null;
  };

  const frameTime = (1.0 / outputFps).toFixed(6);
  const motionHeader = `MOTION\nFrames: ${validFrames.length}\nFrame Time: ${frameTime}\n`;

  const motionLines = [];

  for (const f of validFrames) {
    const bodies = getFrameBodies(f);
    // 1. Gather normalized world quaternions for all bones
    const worldQuats = {};
    for (const item of BVH_BONE_ORDER) {
      const bData = bodies[item.name];
      if (bData && bData.rotation && bData.rotation.length === 4) {
        worldQuats[item.name] = new THREE.Quaternion(
          bData.rotation[0],
          bData.rotation[1],
          bData.rotation[2],
          bData.rotation[3]
        ).normalize();
      } else {
        worldQuats[item.name] = new THREE.Quaternion(0, 0, 0, 1);
      }
    }

    const frameTokens = [];

    // 2. Compute local rotations along the tree
    for (const item of BVH_BONE_ORDER) {
      if (!item.parent) {
        // Root: Pelvis (6 channels: Xpos Ypos Zpos Zrot Xrot Yrot)
        const pPos = bodies[item.name]?.position || [0, 0.95, 0];
        const qPelvis = worldQuats[item.name];
        const eulPelvis = new THREE.Euler().setFromQuaternion(qPelvis, 'ZXY');

        frameTokens.push(
          (pPos[0] * scale).toFixed(4),
          (pPos[1] * scale).toFixed(4),
          (pPos[2] * scale).toFixed(4),
          THREE.MathUtils.radToDeg(eulPelvis.z).toFixed(4),
          THREE.MathUtils.radToDeg(eulPelvis.x).toFixed(4),
          THREE.MathUtils.radToDeg(eulPelvis.y).toFixed(4)
        );
      } else {
        // Child joint: 3 channels (Zrot Xrot Yrot)
        // Relative orientation: qLocal = qParent^-1 * qChild
        const qParent = worldQuats[item.parent] || new THREE.Quaternion();
        const qChild = worldQuats[item.name] || new THREE.Quaternion();

        const qLocal = qParent.clone().invert().multiply(qChild);
        const eulLocal = new THREE.Euler().setFromQuaternion(qLocal, 'ZXY');

        frameTokens.push(
          THREE.MathUtils.radToDeg(eulLocal.z).toFixed(4),
          THREE.MathUtils.radToDeg(eulLocal.x).toFixed(4),
          THREE.MathUtils.radToDeg(eulLocal.y).toFixed(4)
        );
      }
    }

    motionLines.push(frameTokens.join(' '));
  }

  return header + motionHeader + motionLines.join('\n') + '\n';
}

/**
 * Convert an OpenDMS 15-to-19-bone ANIMATION layer (keyframes array) into a standard 19-joint BVH file string
 * with 1:1 real-world meter scale matching Blender, UE5, Godot, and Three.js.
 */
export function keyframesToBVH(keyframes, fps = 60, options = {}) {
  if (!keyframes || keyframes.length === 0) return '';

  const scale = options.scale ?? 1.0;
  const rad2deg = (r) => THREE.MathUtils.radToDeg(r || 0).toFixed(4);
  const rotStr = (localRotations, boneName) => {
    const r = (localRotations && localRotations[boneName]) || [0, 0, 0];
    return `${rad2deg(r[2])} ${rad2deg(r[0])} ${rad2deg(r[1])}`;
  };

  const header = buildBVHHierarchy(scale);
  const motionHeader = `MOTION\nFrames: ${keyframes.length}\nFrame Time: ${(1.0 / fps).toFixed(6)}\n`;

  const lines = keyframes.map((kf) => {
    const rp = Array.isArray(kf.rootPos)
      ? kf.rootPos
      : [kf.rootPos?.x ?? 0, kf.rootPos?.y ?? 0.95, kf.rootPos?.z ?? 0];
    const posStr = `${(rp[0] * scale).toFixed(4)} ${(rp[1] * scale).toFixed(4)} ${(rp[2] * scale).toFixed(4)}`;
    const rots = BVH_BONE_ORDER.map(b => rotStr(kf.localRotations, b.name)).join(' ');
    return `${posStr} ${rots}`;
  });

  return header + motionHeader + lines.join('\n') + '\n';
}
