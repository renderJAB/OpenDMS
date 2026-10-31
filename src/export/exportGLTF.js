import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SKELETON_TREE } from '../core/character.js';
import { resampleSimulationFrames } from './resampleFrames.js';

// Segments and visual dimensions for high-fidelity glTF representation
const BONE_SPECS = {
  Pelvis: { size: [0.20, 0.12, 0.20], color: 0x3b82f6 },
  LowerSpine: { size: [0.21, 0.14, 0.16], color: 0x2563eb },
  UpperSpine: { size: [0.25, 0.18, 0.20], color: 0x1d4ed8 },
  Neck: { size: [0.10, 0.08, 0.10], color: 0x60a5fa },
  Head: { size: [0.18, 0.22, 0.18], color: 0xf59e0b },

  LeftShoulder: { size: [0.14, 0.08, 0.08], color: 0x10b981 },
  LeftUpperArm: { size: [0.24, 0.09, 0.09], color: 0x059669 },
  LeftForearm: { size: [0.22, 0.08, 0.08], color: 0x047857 },
  LeftHand: { size: [0.14, 0.06, 0.10], color: 0x6ee7b7 },

  RightShoulder: { size: [0.14, 0.08, 0.08], color: 0x10b981 },
  RightUpperArm: { size: [0.24, 0.09, 0.09], color: 0x059669 },
  RightForearm: { size: [0.22, 0.08, 0.08], color: 0x047857 },
  RightHand: { size: [0.14, 0.06, 0.10], color: 0x6ee7b7 },

  LeftThigh: { size: [0.14, 0.34, 0.14], color: 0x8b5cf6 },
  LeftCalf: { size: [0.12, 0.34, 0.12], color: 0x7c3aed },
  LeftFoot: { size: [0.10, 0.08, 0.22], color: 0xa78bfa },

  RightThigh: { size: [0.14, 0.34, 0.14], color: 0x8b5cf6 },
  RightCalf: { size: [0.12, 0.34, 0.12], color: 0x7c3aed },
  RightFoot: { size: [0.10, 0.08, 0.22], color: 0xa78bfa }
};

/**
 * Export baked OpenDMS physical simulation directly to a binary glTF (.glb) file.
 * Native compatibility with Unreal Engine 5, Blender 3.x/4.x, Maya, and Unity.
 * 
 * @param {Array} simulationCache - TimelineEngine.simulationCache
 * @param {Object} options - { fps: 60, propsManager: PropsManager }
 * @returns {Promise<Blob>} Binary GLB Blob
 */
export async function exportToGLTF(simulationCache, options = {}) {
  if (!simulationCache || simulationCache.length === 0) {
    throw new Error('No simulation frames recorded. Simulate the scene before exporting.');
  }

  const sourceFps = options.sourceFps || options.simFps || 60;
  const outputFps = options.outputFps || options.fps || sourceFps;

  const validFrames = resampleSimulationFrames(simulationCache, sourceFps, outputFps);
  if (validFrames.length === 0) {
    throw new Error('Simulation cache contains no valid keyframe data.');
  }

  const exportScene = new THREE.Scene();
  exportScene.name = 'OpenDMS_Simulation_Scene';

  const times = validFrames.map((f, i) => i / outputFps);
  const totalDuration = times[times.length - 1];
  const tracks = [];

  // Determine actors present in cache
  const firstFrame = validFrames[0];
  const actorIds = (firstFrame.actors && Object.keys(firstFrame.actors).length > 0)
    ? Object.keys(firstFrame.actors)
    : ['actor-1'];

  for (const actorId of actorIds) {
    const isActor2 = actorId === 'actor-2';
    const actorGroupName = isActor2 ? 'Actor_2_Opponent' : 'Actor_1_Hero';
    const actorGroup = new THREE.Group();
    actorGroup.name = actorGroupName;
    exportScene.add(actorGroup);

    const boneNames = Object.keys(SKELETON_TREE);

    for (const boneName of boneNames) {
      const spec = BONE_SPECS[boneName] || { size: [0.1, 0.1, 0.1], color: 0x94a3b8 };
      const geo = new THREE.BoxGeometry(...spec.size);
      const tint = isActor2 ? 0xf97316 : spec.color;
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.4,
        metalness: 0.1
      });

      const boneNode = new THREE.Mesh(geo, mat);
      boneNode.name = `${actorGroupName}_${boneName}`;
      actorGroup.add(boneNode);

      // Collect animation tracks for this bone
      const posValues = [];
      const rotValues = [];

      for (const frame of validFrames) {
        let bData = null;
        if (frame.actors && frame.actors[actorId] && frame.actors[actorId].bodies) {
          bData = frame.actors[actorId].bodies[boneName];
        } else if (actorId === 'actor-1' && frame.bodies) {
          bData = frame.bodies[boneName];
        }

        if (bData && bData.position && bData.rotation) {
          posValues.push(...bData.position);
          rotValues.push(...bData.rotation);
        } else {
          posValues.push(0, 0, 0);
          rotValues.push(0, 0, 0, 1);
        }
      }

      tracks.push(new THREE.VectorKeyframeTrack(`${boneNode.name}.position`, times, posValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneNode.name}.quaternion`, times, rotValues));
    }
  }

  // Handle Physical Props if recorded in cache
  const firstFrameProps = validFrames[0].props || {};
  for (const propId of Object.keys(firstFrameProps)) {
    const propGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const propMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const propNode = new THREE.Mesh(propGeo, propMat);
    propNode.name = `Prop_${propId}`;
    exportScene.add(propNode);

    const posValues = [];
    const rotValues = [];

    for (const frame of validFrames) {
      const p = (frame.props && frame.props[propId]) ? frame.props[propId] : null;
      if (p && p.position && p.rotation) {
        posValues.push(...p.position);
        rotValues.push(...p.rotation);
      } else {
        posValues.push(0, 0, 0);
        rotValues.push(0, 0, 0, 1);
      }
    }

    tracks.push(new THREE.VectorKeyframeTrack(`${propNode.name}.position`, times, posValues));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${propNode.name}.quaternion`, times, rotValues));
  }

  const animationClip = new THREE.AnimationClip('OpenDMS_Animation', totalDuration, tracks);

  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      exportScene,
      (gltf) => {
        const blob = new Blob([gltf], { type: 'model/gltf-binary' });
        resolve(blob);
      },
      (error) => {
        reject(error);
      },
      {
        binary: true,
        animations: [animationClip],
        includeCustomExtensions: true
      }
    );
  });
}
