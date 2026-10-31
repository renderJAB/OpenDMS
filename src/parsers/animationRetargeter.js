import * as THREE from 'three';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SKELETON_TREE, clampBoneEulerRotation } from '../core/character.js';

// Canonical bone alias map to OpenDMS 15-bone anatomical skeleton
export const BONE_MAP = {
  // Pelvis / Hips root
  hips: 'Pelvis',
  pelvis: 'Pelvis',
  root: 'Pelvis',
  hip: 'Pelvis',

  // Spine & Head
  chest: 'LowerSpine',
  spine: 'LowerSpine',
  spine0: 'LowerSpine',
  lowerspine: 'LowerSpine',

  chest2: 'UpperSpine',
  spine1: 'UpperSpine',
  spine2: 'UpperSpine',
  upperchest: 'UpperSpine',
  upperspine: 'UpperSpine',

  neck: 'Neck',
  neck1: 'Neck',
  head: 'Head',

  // Left Arm
  leftcollar: 'LeftShoulder',
  leftclavicle: 'LeftShoulder',
  lcollar: 'LeftShoulder',
  leftshoulder: 'LeftUpperArm',
  leftarm: 'LeftUpperArm',
  leftupperarm: 'LeftUpperArm',
  luparm: 'LeftUpperArm',
  leftelbow: 'LeftForearm',
  leftforearm: 'LeftForearm',
  leftlowerarm: 'LeftForearm',
  llowarm: 'LeftForearm',
  leftwrist: 'LeftHand',
  lefthand: 'LeftHand',
  lhand: 'LeftHand',

  // Right Arm
  rightcollar: 'RightShoulder',
  rightclavicle: 'RightShoulder',
  rcollar: 'RightShoulder',
  rightshoulder: 'RightUpperArm',
  rightarm: 'RightUpperArm',
  rightupperarm: 'RightUpperArm',
  ruparm: 'RightUpperArm',
  rightelbow: 'RightForearm',
  rightforearm: 'RightForearm',
  rightlowerarm: 'RightForearm',
  rlowarm: 'RightForearm',
  rightwrist: 'RightHand',
  righthand: 'RightHand',
  rhand: 'RightHand',

  // Left Leg
  lefthip: 'LeftThigh',
  leftupleg: 'LeftThigh',
  leftthigh: 'LeftThigh',
  leftupperleg: 'LeftThigh',
  lthigh: 'LeftThigh',
  leftknee: 'LeftCalf',
  leftleg: 'LeftCalf',
  leftlowerleg: 'LeftCalf',
  leftshin: 'LeftCalf',
  lcalf: 'LeftCalf',
  leftankle: 'LeftFoot',
  leftfoot: 'LeftFoot',
  lfoot: 'LeftFoot',
  lefttoebase: 'LeftFoot',
  lefttoe: 'LeftFoot',

  // Right Leg
  righthip: 'RightThigh',
  rightupleg: 'RightThigh',
  rightthigh: 'RightThigh',
  rightupperleg: 'RightThigh',
  rthigh: 'RightThigh',
  rightknee: 'RightCalf',
  rightleg: 'RightCalf',
  rightlowerleg: 'RightCalf',
  rightshin: 'RightCalf',
  rcalf: 'RightCalf',
  rightankle: 'RightFoot',
  rightfoot: 'RightFoot',
  rfoot: 'RightFoot',
  righttoebase: 'RightFoot',
  righttoe: 'RightFoot'
};

function normalizeName(str) {
  return str.toLowerCase().replace(/^(mixamorig|bip01_|character_|mhr_|smpl_|j_bip_)/, '').replace(/[:_\-\s]/g, '');
}

// Dynamically resolves bone mapping based on whether the imported skeleton/rig uses
// BVH convention (Collar = Clavicle/Shoulder joint, Shoulder = UpperArm) or
// Game/Mixamo/FBX convention (Shoulder = Clavicle/Shoulder joint, Arm = UpperArm).
export function resolveBoneMapForSkeleton(bonesOrTracks) {
  const names = Array.isArray(bonesOrTracks)
    ? bonesOrTracks.map(b => (b && b.name ? b.name : String(b || '')))
    : Object.keys(bonesOrTracks || {});
  const normNames = new Set(names.map(n => normalizeName(n.split('.')[0])));

  const hasLeftCollar = normNames.has('leftcollar') || normNames.has('leftclavicle') || normNames.has('lcollar') || normNames.has('lclavicle');
  const hasRightCollar = normNames.has('rightcollar') || normNames.has('rightclavicle') || normNames.has('rcollar') || normNames.has('rclavicle');

  const hasLeftArm = normNames.has('leftarm') || normNames.has('leftupperarm') || normNames.has('luparm') || normNames.has('larm');
  const hasRightArm = normNames.has('rightarm') || normNames.has('rightupperarm') || normNames.has('ruparm') || normNames.has('rarm');

  const map = { ...BONE_MAP };

  if (hasLeftCollar) {
    // BVH format: collar is clavicle (LeftShoulder), shoulder is upper arm (LeftUpperArm)
    map.leftcollar = 'LeftShoulder';
    map.leftclavicle = 'LeftShoulder';
    map.lcollar = 'LeftShoulder';
    map.leftshoulder = 'LeftUpperArm';
  } else if (hasLeftArm) {
    // Mixamo / FBX format: shoulder is clavicle (LeftShoulder), arm is upper arm (LeftUpperArm)
    map.leftshoulder = 'LeftShoulder';
    map.lshoulder = 'LeftShoulder';
    map.leftarm = 'LeftUpperArm';
    map.leftupperarm = 'LeftUpperArm';
    map.luparm = 'LeftUpperArm';
  }

  if (hasRightCollar) {
    map.rightcollar = 'RightShoulder';
    map.rightclavicle = 'RightShoulder';
    map.rcollar = 'RightShoulder';
    map.rightshoulder = 'RightUpperArm';
  } else if (hasRightArm) {
    map.rightshoulder = 'RightShoulder';
    map.rshoulder = 'RightShoulder';
    map.rightarm = 'RightUpperArm';
    map.rightupperarm = 'RightUpperArm';
    map.ruparm = 'RightUpperArm';
  }

  return map;
}

// Built-in Endorphin Motion Capture Library Catalogue
export const ENDORPHIN_MOCAP_LIBRARY = [
  // Locomotion
  { id: 'fast_walk', name: 'Fast Walk', category: 'Locomotion', file: '/motions/Fast walk.bvh', icon: '🚶' },
  { id: 'sneak_away', name: 'Sneak Away', category: 'Locomotion', file: '/motions/Sneak away.bvh', icon: '🕵️' },
  { id: 'waiting', name: 'Waiting / Idle Sway', category: 'Locomotion', file: '/motions/Waiting.bvh', icon: '🧍' },
  { id: 'zombie', name: 'Zombie Gait', category: 'Locomotion', file: '/motions/Zombie.bvh', icon: '🧟' },

  // Combat & Stunts
  { id: 'boxer_punching', name: 'Boxer Punching Combos', category: 'Combat & Stunts', file: '/motions/Boxer punching.bvh', icon: '🥊' },
  { id: 'jump', name: 'High Hurdle Jump', category: 'Combat & Stunts', file: '/motions/Jump.bvh', icon: '🦘' },
  { id: 'pushing', name: 'Heavy Object Pushing', category: 'Combat & Stunts', file: '/motions/Pushing.bvh', icon: '🚜' },
  { id: 'on_knees', name: 'Fall to Knees & Recover', category: 'Combat & Stunts', file: '/motions/On knees.bvh', icon: '🧎' },
  { id: 'sit_stand', name: 'Sit Down & Stand Up', category: 'Combat & Stunts', file: '/motions/Sit down stand up relaxed.bvh', icon: '🪑' },
  { id: 'exercises', name: 'Calisthenics & Squats', category: 'Combat & Stunts', file: '/motions/Exercises.bvh', icon: '💪' },

  // Sports & Soccer
  { id: 'soccer_kick', name: 'Soccer - Power Kick', category: 'Sports', file: '/motions/Soccer - kicking.bvh', icon: '⚽' },
  { id: 'soccer_penalty', name: 'Soccer - Penalty Kick', category: 'Sports', file: '/motions/Soccer - penalty kick.bvh', icon: '🎯' },
  { id: 'soccer_header', name: 'Soccer - Aerial Header', category: 'Sports', file: '/motions/Soccer - headers.bvh', icon: '⚽' },
  { id: 'soccer_passing', name: 'Soccer - Ground Passing', category: 'Sports', file: '/motions/Soccer - passing.bvh', icon: '👟' },
  { id: 'soccer_control', name: 'Soccer - Ball Juggling', category: 'Sports', file: '/motions/Soccer - ball control.bvh', icon: '🤹' },
  { id: 'soccer_chest', name: 'Soccer - Chest Trap & Volley', category: 'Sports', file: '/motions/Soccer - chest and kick01.bvh', icon: '⚽' },
  { id: 'soccer_throwin', name: 'Soccer - Touchline Throw-In', category: 'Sports', file: '/motions/Soccer - thowins.bvh', icon: '👐' },
  { id: 'soccer_gk', name: 'Soccer - Goalkeeper Throw', category: 'Sports', file: '/motions/Soccer - goalkeeper throws.bvh', icon: '🧤' },
  { id: 'tennis_smash', name: 'Tennis - Overhead Smash', category: 'Sports', file: '/motions/Tennis - smash.bvh', icon: '🎾' },
  { id: 'tennis_underarm', name: 'Tennis - Underarm Stroke', category: 'Sports', file: '/motions/Tennis - underarm hit.bvh', icon: '🏸' }
];

export class AnimationRetargeter {
  constructor() {
    this.bvhLoader = new BVHLoader();
    this.fbxLoader = new FBXLoader();
    this.gltfLoader = new GLTFLoader();
  }

  // Load animation from URL (.bvh, .fbx, or .glb)
  async loadFromUrl(url, clipName = null, options = {}) {
    const isBVH = url.toLowerCase().endsWith('.bvh');
    const isFBX = url.toLowerCase().endsWith('.fbx');
    const isGLTF = url.toLowerCase().endsWith('.glb') || url.toLowerCase().endsWith('.gltf');

    if (isBVH) {
      const res = await fetch(url);
      const text = await res.text();
      return this.loadFromBVHString(text, clipName || url.split('/').pop().replace('.bvh', ''), options);
    } else if (isFBX) {
      return new Promise((resolve, reject) => {
        this.fbxLoader.load(url, (fbx) => {
          if (!fbx.animations || fbx.animations.length === 0) {
            reject(new Error('No animation clips found in FBX file.'));
            return;
          }
          let fbxSkeleton = null;
          fbx.traverse(c => {
            if (c.isSkinnedMesh && c.skeleton && !fbxSkeleton) {
              fbxSkeleton = c.skeleton;
            }
          });
          const name = clipName || url.split('/').pop().replace('.fbx', '');
          resolve(this.retargetClip(fbx.animations[0], name, { isFBX: true, skeleton: fbxSkeleton, ...options }));
        }, undefined, reject);
      });
    } else if (isGLTF) {
      return new Promise((resolve, reject) => {
        this.gltfLoader.load(url, (gltf) => {
          if (!gltf.animations || gltf.animations.length === 0) {
            reject(new Error('No animation clips found in GLTF file.'));
            return;
          }
          let gltfSkeleton = null;
          gltf.scene.traverse(c => {
            if (c.isSkinnedMesh && c.skeleton && !gltfSkeleton) {
              gltfSkeleton = c.skeleton;
            }
          });
          const name = clipName || url.split('/').pop().replace(/\.(glb|gltf)$/, '');
          resolve(this.retargetClip(gltf.animations[0], name, { isGLTF: true, skeleton: gltfSkeleton, ...options }));
        }, undefined, reject);
      });
    }

    throw new Error('Unsupported animation file format: ' + url);
  }

  // Parse raw BVH string directly into an OpenDMS 15-bone ANIMATION layer
  loadFromBVHString(bvhText, clipName = 'AI Motion', options = {}) {
    const bvh = this.bvhLoader.parse(bvhText);
    return this.retargetClip(bvh.clip, clipName, { isBVH: true, skeleton: bvh.skeleton, ...options });
  }

  // Load animation from a user-dropped File object
  async loadFromFile(file, options = {}) {
    const name = file.name.replace(/\.(bvh|fbx|glb|gltf)$/i, '');
    const isBVH = file.name.toLowerCase().endsWith('.bvh');
    const isFBX = file.name.toLowerCase().endsWith('.fbx');
    const isGLTF = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');

    if (isBVH) {
      const text = await file.text();
      const bvh = this.bvhLoader.parse(text);
      return this.retargetClip(bvh.clip, name, { isBVH: true, skeleton: bvh.skeleton, ...options });
    } else if (isFBX) {
      const buffer = await file.arrayBuffer();
      const fbx = this.fbxLoader.parse(buffer, '');
      if (!fbx.animations || fbx.animations.length === 0) {
        throw new Error('No animation clips found in FBX file.');
      }
      let fbxSkeleton = null;
      fbx.traverse(c => {
        if (c.isSkinnedMesh && c.skeleton && !fbxSkeleton) {
          fbxSkeleton = c.skeleton;
        }
      });
      return this.retargetClip(fbx.animations[0], name, { isFBX: true, skeleton: fbxSkeleton, ...options });
    } else if (isGLTF) {
      const buffer = await file.arrayBuffer();
      return new Promise((resolve, reject) => {
        this.gltfLoader.parse(buffer, '', (gltf) => {
          if (!gltf.animations || gltf.animations.length === 0) {
            reject(new Error('No animation clips found in GLTF file.'));
            return;
          }
          let gltfSkeleton = null;
          gltf.scene.traverse(c => {
            if (c.isSkinnedMesh && c.skeleton && !gltfSkeleton) {
              gltfSkeleton = c.skeleton;
            }
          });
          resolve(this.retargetClip(gltf.animations[0], name, { isGLTF: true, skeleton: gltfSkeleton, ...options }));
        }, reject);
      });
    }

    throw new Error('Unsupported animation file type: ' + file.name);
  }

  // Retarget a THREE.AnimationClip into OpenDMS 15-bone skeletal keyframe track
  retargetClip(clip, clipName, options = {}) {
    if (!clip || !clip.tracks || clip.tracks.length === 0) {
      throw new Error('Animation clip contains no tracks.');
    }

    const fps = 60;
    const duration = clip.duration || 1.0;
    const totalFrames = Math.max(2, Math.round(duration * fps));
    const isBVH = options.isBVH || false;

    // --- HIGH-PRECISION HIERARCHICAL SKELETAL RETARGETING WITH REST-POSE CALIBRATION ---
    if (options.skeleton && options.skeleton.bones && options.skeleton.bones.length > 0) {
      const skeleton = options.skeleton;
      const rootBone = skeleton.bones[0];
      const mixer = new THREE.AnimationMixer(rootBone);
      mixer.clipAction(clip).play();

      const resolvedBoneMap = resolveBoneMapForSkeleton(skeleton.bones);
      const segToBone = {};
      for (const b of skeleton.bones) {
        const norm = normalizeName(b.name);
        const seg = resolvedBoneMap[norm];
        if (seg && !segToBone[seg]) {
          segToBone[seg] = b;
        }
      }

      rootBone.updateWorldMatrix(true, true);

      // Auto-detect rest pose arm angle differences (A-pose or arms-down vs T-pose)
      const boneLUp = segToBone['LeftUpperArm'];
      const boneLLow = segToBone['LeftForearm'];
      const boneRUp = segToBone['RightUpperArm'];
      const boneRLow = segToBone['RightForearm'];

      let qAlignL = new THREE.Quaternion();
      let qAlignR = new THREE.Quaternion();

      if (boneLUp && boneLLow) {
        const p1 = new THREE.Vector3(); const p2 = new THREE.Vector3();
        boneLUp.getWorldPosition(p1);
        boneLLow.getWorldPosition(p2);
        const restDirL = p2.sub(p1).normalize();
        if (restDirL.dot(new THREE.Vector3(1, 0, 0)) < 0.99) {
          qAlignL = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), restDirL);
        }
      } else if (isBVH) {
        qAlignL = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0));
      }

      if (boneRUp && boneRLow) {
        const p1 = new THREE.Vector3(); const p2 = new THREE.Vector3();
        boneRUp.getWorldPosition(p1);
        boneRLow.getWorldPosition(p2);
        const restDirR = p2.sub(p1).normalize();
        if (restDirR.dot(new THREE.Vector3(-1, 0, 0)) < 0.99) {
          qAlignR = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), restDirR);
        }
      } else if (isBVH) {
        qAlignR = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
      }

      // Sample Frame 0 first to determine human scale normalization and initial origin offset
      mixer.setTime(0);
      rootBone.updateWorldMatrix(true, true);
      const rootPos0 = new THREE.Vector3();
      rootBone.getWorldPosition(rootPos0);

      // BVH recordings are typically in centimeters or inches with hip elevation ~35-100 units.
      // Normalize ground elevation so human hip rests naturally at ~0.95m.
      let posScale = 1.0;
      if (Math.abs(rootPos0.y) > 5.0) {
        posScale = 0.95 / Math.abs(rootPos0.y);
      }
      const initX = rootPos0.x * posScale;
      const initZ = rootPos0.z * posScale;

      const keyframes = [];

      for (let f = 0; f < totalFrames; f++) {
        const time = (f / (totalFrames - 1)) * duration;
        mixer.setTime(time);
        rootBone.updateWorldMatrix(true, true);

        // 1. World rotation of each segment (inheriting parent world rotation if intermediate bone is unmapped)
        const worldRot = {};
        for (const [seg, def] of Object.entries(SKELETON_TREE)) {
          const bone = segToBone[seg];
          const wq = new THREE.Quaternion();
          if (bone) {
            bone.getWorldQuaternion(wq);
            // Arm rest-alignment applies strictly to UpperArm, Forearm, and Hand - NEVER to Clavicle (LeftShoulder/RightShoulder)
            if (seg.startsWith('Left') && (seg.includes('Arm') || seg.includes('Forearm') || seg.includes('Hand'))) {
              wq.multiply(qAlignL);
            } else if (seg.startsWith('Right') && (seg.includes('Arm') || seg.includes('Forearm') || seg.includes('Hand'))) {
              wq.multiply(qAlignR);
            }
          } else if (def.parent && worldRot[def.parent]) {
            wq.copy(worldRot[def.parent]);
          }
          worldRot[seg] = wq;
        }

        // 2. Local rotations top-down
        const localRotations = {};
        for (const [segName, def] of Object.entries(SKELETON_TREE)) {
          const wq = worldRot[segName];
          let localQ;
          if (!def.parent) {
            localQ = wq.clone();
          } else {
            const parentW = worldRot[def.parent];
            localQ = parentW ? parentW.clone().invert().multiply(wq) : wq.clone();
          }
          const euler = new THREE.Euler().setFromQuaternion(localQ, 'XYZ');
          localRotations[segName] = [
            Number(euler.x.toFixed(4)),
            Number(euler.y.toFixed(4)),
            Number(euler.z.toFixed(4))
          ];
        }

        // 3. Root position
        const rootWPos = new THREE.Vector3();
        rootBone.getWorldPosition(rootWPos);
        const rootPos = [
          Number(((rootWPos.x * posScale) - initX).toFixed(3)),
          Number(Math.max(0.15, rootWPos.y * posScale).toFixed(3)),
          Number(((rootWPos.z * posScale) - initZ).toFixed(3))
        ];

        keyframes.push({
          frame: f,
          rootPos,
          localRotations
        });
      }

      const startFrame = options.startFrame ?? 0;
      const layerId = `anim_${clipName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
      return {
        id: layerId,
        name: `${clipName} (${isBVH ? 'BVH' : 'FBX'})`,
        type: 'ANIMATION',
        animType: 'pose',
        enabled: true,
        startFrame: startFrame,
        endFrame: startFrame + totalFrames,
        durationFrames: totalFrames,
        blendIn: Math.min(10, Math.floor(totalFrames * 0.2)),
        blendOut: Math.min(10, Math.floor(totalFrames * 0.2)),
        color: '#10b981',
        isMotorized: false,
        muscleStiffness: 1.0,
        isDenseMocap: true,
        keyframes
      };
    }

    // --- FALLBACK: DIRECT TRACK-BY-TRACK PARSING (WITH ARMS-DOWN CALIBRATION) ---

    // Detect track mappings to OpenDMS bones
    const resolvedTrackMap = resolveBoneMapForSkeleton(clip.tracks);
    const trackBindings = [];
    let rootPosTrack = null;

    for (const track of clip.tracks) {
      const parts = track.name.split('.');
      const rawBoneName = parts[0] || '';
      const property = parts[1] || '';
      const norm = normalizeName(rawBoneName);
      const targetSegment = resolvedTrackMap[norm];

      if (targetSegment === 'Pelvis' && property === 'position') {
        rootPosTrack = track;
      } else if (targetSegment && property === 'quaternion') {
        trackBindings.push({
          segment: targetSegment,
          track: track
        });
      }
    }

    // Determine root position scaling and initial offset normalization:
    // BVH files typically record in centimeters or inches (~30-100 units height).
    // If initial Y is > 5, scale down to human scale (~0.95m hip height).
    let posScale = 1.0;
    let initX = 0;
    let initZ = 0;
    if (rootPosTrack && rootPosTrack.values.length >= 3) {
      const initY = Math.abs(rootPosTrack.values[1]);
      if (initY > 5.0) {
        posScale = 0.95 / initY;
      }
      initX = rootPosTrack.values[0] * posScale;
      initZ = rootPosTrack.values[2] * posScale;
    }

    const keyframes = [];
    const rootPosStart = new THREE.Vector3(0, 0.95, 0);

    for (let f = 0; f < totalFrames; f++) {
      const time = (f / (totalFrames - 1)) * duration;
      const rootPos = rootPosStart.clone();

      // Sample root position relative to initial frame (preserving character spawn location)
      if (rootPosTrack) {
        const p = this.interpolateVector3Track(rootPosTrack, time);
        if (p) {
          rootPos.x = (p.x * posScale) - initX;
          rootPos.y = Math.max(0.15, p.y * posScale);
          rootPos.z = (p.z * posScale) - initZ;
        }
      }

      // Sample local rotations for all anatomical bones (direct authentic mocap capture with arms-down calibration)
      const localRotations = {};
      const qFallbackAlignL = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0));
      const qFallbackAlignR = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));

      for (const binding of trackBindings) {
        const q = this.interpolateQuaternionTrack(binding.track, time);
        if (q) {
          const qCalib = q.clone();
          if (isBVH) {
            if (binding.segment.startsWith('Left') && (binding.segment.includes('Arm') || binding.segment.includes('Forearm') || binding.segment.includes('Hand'))) {
              qCalib.multiply(qFallbackAlignL);
            } else if (binding.segment.startsWith('Right') && (binding.segment.includes('Arm') || binding.segment.includes('Forearm') || binding.segment.includes('Hand'))) {
              qCalib.multiply(qFallbackAlignR);
            }
          }
          const euler = new THREE.Euler().setFromQuaternion(qCalib, 'XYZ');
          localRotations[binding.segment] = [
            Number(euler.x.toFixed(4)),
            Number(euler.y.toFixed(4)),
            Number(euler.z.toFixed(4))
          ];
        }
      }

      keyframes.push({
        frame: f,
        rootPos: [Number(rootPos.x.toFixed(3)), Number(rootPos.y.toFixed(3)), Number(rootPos.z.toFixed(3))],
        localRotations
      });
    }

    // Wrap into a timeline ANIMATION layer object
    const startFrame = options.startFrame ?? 0;
    const layerId = `anim_${clipName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    return {
      id: layerId,
      name: `${clipName} (${isBVH ? 'BVH' : 'FBX'})`,
      type: 'ANIMATION',
      animType: 'pose',
      enabled: true,
      startFrame: startFrame,
      endFrame: startFrame + totalFrames,
      durationFrames: totalFrames,
      blendIn: Math.min(10, Math.floor(totalFrames * 0.2)),
      blendOut: Math.min(10, Math.floor(totalFrames * 0.2)),
      color: '#10b981',
      isMotorized: false, // Endorphin kinematic animation track (100% motion fidelity)
      muscleStiffness: 1.0,
      isDenseMocap: true,
      keyframes
    };
  }

  // Hermite / linear track interpolators
  interpolateVector3Track(track, time) {
    const times = track.times;
    const values = track.values;
    if (!times || times.length === 0) return null;

    if (time <= times[0]) {
      return new THREE.Vector3(values[0], values[1], values[2]);
    }
    const lastIdx = times.length - 1;
    if (time >= times[lastIdx]) {
      return new THREE.Vector3(values[lastIdx * 3], values[lastIdx * 3 + 1], values[lastIdx * 3 + 2]);
    }

    // Binary search for interval
    let low = 0, high = lastIdx;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (times[mid] < time) low = mid + 1;
      else high = mid - 1;
    }
    const i = Math.max(0, low - 1);
    const t0 = times[i];
    const t1 = times[i + 1];
    const alpha = (time - t0) / Math.max(0.0001, t1 - t0);

    const x = THREE.MathUtils.lerp(values[i * 3], values[(i + 1) * 3], alpha);
    const y = THREE.MathUtils.lerp(values[i * 3 + 1], values[(i + 1) * 3 + 1], alpha);
    const z = THREE.MathUtils.lerp(values[i * 3 + 2], values[(i + 1) * 3 + 2], alpha);
    return new THREE.Vector3(x, y, z);
  }

  interpolateQuaternionTrack(track, time) {
    const times = track.times;
    const values = track.values;
    if (!times || times.length === 0) return null;

    if (time <= times[0]) {
      return new THREE.Quaternion(values[0], values[1], values[2], values[3]);
    }
    const lastIdx = times.length - 1;
    if (time >= times[lastIdx]) {
      return new THREE.Quaternion(values[lastIdx * 4], values[lastIdx * 4 + 1], values[lastIdx * 4 + 2], values[lastIdx * 4 + 3]);
    }

    let low = 0, high = lastIdx;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (times[mid] < time) low = mid + 1;
      else high = mid - 1;
    }
    const i = Math.max(0, low - 1);
    const t0 = times[i];
    const t1 = times[i + 1];
    const alpha = (time - t0) / Math.max(0.0001, t1 - t0);

    const q0 = new THREE.Quaternion(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]);
    const q1 = new THREE.Quaternion(values[(i + 1) * 4], values[(i + 1) * 4 + 1], values[(i + 1) * 4 + 2], values[(i + 1) * 4 + 3]);
    return q0.slerp(q1, alpha);
  }
}
