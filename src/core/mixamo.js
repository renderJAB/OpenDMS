import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { SKELETON_TREE } from './character.js';

// Universal Humanoid Bone-to-Physics-Segment Canonical Dictionary
// Supports Mixamo (all numbered prefixes), 3ds Max Biped, Unreal/Unity Humanoid, Blender Rigify, MakeHuman, VRM, and CMU/Endorphin BVH
const BONE_TO_SEGMENT = {
  // Spine & Head
  hips: 'Pelvis',
  pelvis: 'Pelvis',
  hip: 'Pelvis',
  cog: 'Pelvis',
  waist: 'Pelvis',

  spine: 'LowerSpine',
  spine01: 'LowerSpine',
  abdomen: 'LowerSpine',
  lowerback: 'LowerSpine',
  torso: 'LowerSpine',

  spine1: 'UpperSpine',
  spine2: 'UpperSpine',
  spine02: 'UpperSpine',
  spine03: 'UpperSpine',
  chest: 'UpperSpine',
  upperchest: 'UpperSpine',
  thorax: 'UpperSpine',

  neck: 'Neck',
  neck1: 'Neck',
  neck01: 'Neck',

  head: 'Head',

  // Left Arm
  leftshoulder: 'LeftShoulder',
  lshoulder: 'LeftShoulder',
  shoulderl: 'LeftShoulder',
  claviclel: 'LeftShoulder',
  leftclavicle: 'LeftShoulder',
  lcollar: 'LeftShoulder',
  leftcollar: 'LeftShoulder',

  leftarm: 'LeftUpperArm',
  leftupperarm: 'LeftUpperArm',
  upperarml: 'LeftUpperArm',
  lupperarm: 'LeftUpperArm',
  larms: 'LeftUpperArm',
  lshldr: 'LeftUpperArm',
  leftuparm: 'LeftUpperArm',

  leftforearm: 'LeftForearm',
  leftlowerarm: 'LeftForearm',
  lowerarml: 'LeftForearm',
  lforearm: 'LeftForearm',
  llowerarm: 'LeftForearm',
  leftlowarm: 'LeftForearm',

  lefthand: 'LeftHand',
  lhand: 'LeftHand',
  handl: 'LeftHand',
  lwrist: 'LeftHand',
  leftwrist: 'LeftHand',

  // Right Arm
  rightshoulder: 'RightShoulder',
  rshoulder: 'RightShoulder',
  shoulderr: 'RightShoulder',
  clavicler: 'RightShoulder',
  rightclavicle: 'RightShoulder',
  rcollar: 'RightShoulder',
  rightcollar: 'RightShoulder',

  rightarm: 'RightUpperArm',
  rightupperarm: 'RightUpperArm',
  upperarmr: 'RightUpperArm',
  rupperarm: 'RightUpperArm',
  rarms: 'RightUpperArm',
  rshldr: 'RightUpperArm',
  rightuparm: 'RightUpperArm',

  rightforearm: 'RightForearm',
  rightlowerarm: 'RightForearm',
  lowerarmr: 'RightForearm',
  rforearm: 'RightForearm',
  rlowerarm: 'RightForearm',
  rightlowarm: 'RightForearm',

  righthand: 'RightHand',
  rhand: 'RightHand',
  handr: 'RightHand',
  rwrist: 'RightHand',
  rightwrist: 'RightHand',

  // Left Leg
  leftupleg: 'LeftThigh',
  leftupperleg: 'LeftThigh',
  leftthigh: 'LeftThigh',
  thighl: 'LeftThigh',
  lupleg: 'LeftThigh',
  lthigh: 'LeftThigh',
  lhip: 'LeftThigh',

  leftleg: 'LeftCalf',
  leftlowerleg: 'LeftCalf',
  leftcalf: 'LeftCalf',
  leftshin: 'LeftCalf',
  calfl: 'LeftCalf',
  shinl: 'LeftCalf',
  lleg: 'LeftCalf',
  lcalf: 'LeftCalf',
  lshin: 'LeftCalf',
  lknee: 'LeftCalf',

  leftfoot: 'LeftFoot',
  footl: 'LeftFoot',
  lfoot: 'LeftFoot',
  lankle: 'LeftFoot',
  leftankle: 'LeftFoot',
  balll: 'LeftFoot',

  // Right Leg
  rightupleg: 'RightThigh',
  rightupperleg: 'RightThigh',
  rightthigh: 'RightThigh',
  thighr: 'RightThigh',
  rupleg: 'RightThigh',
  rthigh: 'RightThigh',
  rhip: 'RightThigh',

  rightleg: 'RightCalf',
  rightlowerleg: 'RightCalf',
  rightcalf: 'RightCalf',
  rightshin: 'RightCalf',
  calfr: 'RightCalf',
  shinr: 'RightCalf',
  rleg: 'RightCalf',
  rcalf: 'RightCalf',
  rshin: 'RightCalf',
  rknee: 'RightCalf',

  rightfoot: 'RightFoot',
  footr: 'RightFoot',
  rfoot: 'RightFoot',
  rankle: 'RightFoot',
  rightankle: 'RightFoot',
  ballr: 'RightFoot'
};

// Canonical Mixamo T-Pose World Quaternions (extracted from Mixamo standard bind pose via skeleton.pose())
// Used when retargeting "Without Skin" Mixamo FBX files where no SkinnedMesh bind matrix is embedded
const CANONICAL_MIXAMO_TPOSE_WORLD_QUATS = {
  Pelvis: new THREE.Quaternion(0.0065, 0, 0, 1).normalize(),
  LowerSpine: new THREE.Quaternion(-0.0737, 0, 0, 0.9973).normalize(),
  UpperSpine: new THREE.Quaternion(-0.0609, 0, 0, 0.9981).normalize(),
  Neck: new THREE.Quaternion(-0.0609, 0, 0, 0.9981).normalize(),
  Head: new THREE.Quaternion(-0.0609, 0, 0, 0.9981).normalize(),
  LeftShoulder: new THREE.Quaternion(-0.4590, -0.5379, 0.5599, -0.4318).normalize(),
  LeftUpperArm: new THREE.Quaternion(0.5, 0.5, -0.5, 0.5).normalize(),
  LeftForearm: new THREE.Quaternion(0.5, 0.5, -0.5, 0.5).normalize(),
  LeftHand: new THREE.Quaternion(0.5, 0.5, -0.5, 0.5).normalize(),
  RightShoulder: new THREE.Quaternion(0.4590, -0.5379, 0.5599, 0.4318).normalize(),
  RightUpperArm: new THREE.Quaternion(0.5, -0.5, 0.5, 0.5).normalize(),
  RightForearm: new THREE.Quaternion(0.5, -0.5, 0.5, 0.5).normalize(),
  RightHand: new THREE.Quaternion(0.5, -0.5, 0.5, 0.5).normalize(),
  LeftThigh: new THREE.Quaternion(0, 0.0039, 1, 0).normalize(),
  LeftCalf: new THREE.Quaternion(0, -0.0342, 0.9994, 0).normalize(),
  LeftFoot: new THREE.Quaternion(0, 0.4291, 0.9033, 0).normalize(),
  RightThigh: new THREE.Quaternion(0, 0.0039, 1, 0).normalize(),
  RightCalf: new THREE.Quaternion(0, -0.0342, 0.9994, 0).normalize(),
  RightFoot: new THREE.Quaternion(0, 0.4291, 0.9033, 0).normalize()
};

// Canonical child limb mapping used to measure bind-pose limb direction vectors for A-Pose -> T-Pose auto-alignment
const LIMB_ALIGNMENT_CONFIG = {
  LeftUpperArm: { childSeg: 'LeftForearm', targetDir: new THREE.Vector3(1, 0, 0) },
  LeftForearm: { childSeg: 'LeftHand', targetDir: new THREE.Vector3(1, 0, 0) },
  RightUpperArm: { childSeg: 'RightForearm', targetDir: new THREE.Vector3(-1, 0, 0) },
  RightForearm: { childSeg: 'RightHand', targetDir: new THREE.Vector3(-1, 0, 0) },
  LeftThigh: { childSeg: 'LeftCalf', targetDir: new THREE.Vector3(0, -1, 0) },
  LeftCalf: { childSeg: 'LeftFoot', targetDir: new THREE.Vector3(0, -1, 0) },
  RightThigh: { childSeg: 'RightCalf', targetDir: new THREE.Vector3(0, -1, 0) },
  RightCalf: { childSeg: 'RightFoot', targetDir: new THREE.Vector3(0, -1, 0) }
};

/**
 * Normalizes any bone name from Mixamo (`mixamorig:Hips`, `mixamorig1:Hips`, `mixamorig2Hips`),
 * namespaces (`Character1_Reference|mixamorig:LeftArm`, `Paladin:Hips`), 3ds Max Biped (`Bip01_L_UpperArm`),
 * Blender/UE5 (`upperarm_l`, `UpperArm.L`), or BVH (`LeftUpLeg`) into a clean lookup key.
 */
export function normalizeBoneName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  let s = rawName.trim();

  // Strip namespace or path prefixes separated by '|', '/', or ':'
  if (s.includes('|')) s = s.split('|').pop();
  if (s.includes('/')) s = s.split('/').pop();
  if (s.includes(':')) s = s.split(':').pop();

  s = s.toLowerCase();

  // Strip Mixamo numbered prefixes (e.g. mixamorig, mixamorig1 .. mixamorig99)
  s = s.replace(/^mixamorig\d*[_:]?/, '');

  // Strip Biped / Character / Armature prefixes
  s = s.replace(/^(bip01|bip001|bip|character\d*|char\d*|armature|skeleton|def|org|mch)[_:\s-]*/, '');

  // Handle Biped L/R tokens like "l_upperarm" or "r_forearm"
  s = s.replace(/^l[_.\s-]+(clavicle|shoulder|upperarm|forearm|lowerarm|hand|thigh|upleg|calf|leg|shin|foot|toe)/, 'left$1');
  s = s.replace(/^r[_.\s-]+(clavicle|shoulder|upperarm|forearm|lowerarm|hand|thigh|upleg|calf|leg|shin|foot|toe)/, 'right$1');

  // Handle Blender/UE5 suffix ".l" / "_l" / ".r" / "_r"
  s = s.replace(/[_.\s-]+l$/, 'l');
  s = s.replace(/[_.\s-]+r$/, 'r');

  // Remove remaining punctuation
  s = s.replace(/[:_.\-\s]/g, '');
  return s;
}

export function resolveBoneToSegment(rawName) {
  const normName = normalizeBoneName(rawName);
  if (!normName) return { normName: '', segmentName: null };

  // Ignore finger / thumb / eye / jaw / facial / twist / ik bones so they never hijack primary limb segments
  if (
    normName.includes('thumb') ||
    normName.includes('index') ||
    normName.includes('middle') ||
    normName.includes('ring') ||
    normName.includes('pinky') ||
    normName.includes('finger') ||
    normName.includes('eye') ||
    normName.includes('jaw') ||
    normName.includes('tongue') ||
    normName.includes('teeth') ||
    normName.includes('brow') ||
    normName.includes('twist') ||
    normName.includes('roll') ||
    normName.includes('ik') ||
    normName.includes('pole') ||
    normName.includes('weapon') ||
    normName.includes('end') ||
    normName.includes('top')
  ) {
    return { normName, segmentName: null };
  }

  const direct = BONE_TO_SEGMENT[normName];
  if (direct) {
    return { normName, segmentName: direct };
  }

  return { normName, segmentName: null };
}

export class MixamoCharacterBridge {
  constructor(scene, character, options = {}) {
    this.scene = scene;
    this.character = character;
    this.actorIndex = options.actorIndex || 0;
    this.tintColor = options.tintColor || (this.actorIndex === 0 ? null : 0xf97316);
    this.model = null;
    this.rawImportedModel = null;
    this.skinnedMeshes = [];
    this.skeleton = null;
    this.boneBindings = [];
    this.primarySegmentBones = {};
    this.hipsBones = [];
    this.hipsBone = null;
    this.hipsRestLocalPos = new THREE.Vector3();
    this.hipsRestWorldPos = new THREE.Vector3();
    this.hipsParentRestWorldInv = new THREE.Matrix4();
    this.baseAutoScale = 1.0;
    this.baseGroundOffsetY = 0.0;
    this.isLoaded = false;
    this.isVisible = false;

    // Interactive Rig Calibration Settings (adjustable in UI)
    this.calibration = {
      autoAlignTPose: true,      // Automatically measures A-pose arm/leg angles & aligns to physics T-pose
      armSpreadOffsetDeg: 0,     // Manual fine-tuning offset for shoulder/arm abduction (-45° to +45°)
      scaleMultiplier: 1.0,      // User scale multiplier on top of auto-1.75m height normalization
      groundOffsetY: 0.0,        // Vertical foot grounding offset in meters (-0.5m to +0.5m)
      yawOffsetDeg: 0,           // Facing direction adjustment (-180° to +180°)
      autoGroundClamp: true,     // Endorphin anti-ground-penetration foot contact solver
      footSoleOffset: 0.04,      // Height from foot bone to bottom of shoe/mesh
      thighClearanceDeg: 0,      // Stance width / thigh abduction angle to prevent inner-thigh clipping
      bodyGirthMultiplier: 1.0   // Scales Rapier physics colliders to match bulky or armored mesh volumes
    };

    this.characterHipHeight = 0.95;

    // Diagnostic info exposed to the UI
    this.rigDiagnostics = {
      modelName: 'None',
      skinnedMeshCount: 0,
      totalBones: 0,
      mappedSegmentsCount: 0,
      mappedSegments: [],
      detectedPose: 'T-Pose',
      leftArmAngleDeg: 0,
      embeddedAnimCount: 0,
      detectedFootSoleOffset: 0.04,
      detectedArmSpreadDeg: 0,
      detectedThighSpreadDeg: 0,
      detectedGirthMultiplier: 1.0
    };

    this.fbxLoader = new FBXLoader();
    this.gltfLoader = new GLTFLoader();
    this.bvhLoader = new BVHLoader();

    // Reusable math scratch objects
    this._tmpVec3 = new THREE.Vector3();
    this._tmpVec3B = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpQuat2 = new THREE.Quaternion();
    this._tmpQuat3 = new THREE.Quaternion();
    this._parentWorldQuat = new THREE.Quaternion();
    this._yawCorrectionQuat = new THREE.Quaternion();
  }

  // Load a model from an HTTP URL (e.g. /models/xbot.fbx)
  async loadFromUrl(url) {
    const lower = url.toLowerCase();
    const isGLTF = lower.endsWith('.glb') || lower.endsWith('.gltf');
    return new Promise((resolve, reject) => {
      if (isGLTF) {
        this.gltfLoader.load(
          url,
          (gltf) => {
            const root = gltf.scene || gltf.scenes?.[0];
            if (root && gltf.animations?.length) {
              root.animations = gltf.animations;
            }
            this.setupModel(root, url.split('/').pop());
            resolve(this.model);
          },
          undefined,
          reject
        );
      } else {
        this.fbxLoader.load(
          url,
          (fbx) => {
            this.setupModel(fbx, url.split('/').pop());
            resolve(this.model);
          },
          undefined,
          reject
        );
      }
    });
  }

  /**
   * Smart Universal File Loader:
   * Handles both Rigged Character Meshes (.fbx, .glb, .gltf) AND Animation Files (.fbx with or without skin, .glb, .gltf, .bvh).
   * Returns a structured result:
   * {
   *   hasSkin: boolean,
   *   model: THREE.Object3D | null,
   *   retargetedClips: Array<RetargetedClipData>,
   *   diagnostics: Object
   * }
   */
  async loadFromFile(file, options = { applySkinIfPresent: true, extractAnimations: true }) {
    const ext = file.name.split('.').pop().toLowerCase();
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const buffer = await file.arrayBuffer();

    if (ext === 'bvh') {
      const text = new TextDecoder().decode(buffer);
      const bvhResult = this.bvhLoader.parse(text);
      const retargeted = this.retargetBVHResult(bvhResult, baseName);
      return {
        hasSkin: false,
        model: null,
        retargetedClips: retargeted ? [retargeted] : [],
        diagnostics: this.rigDiagnostics
      };
    }

    const isGLTF = ext === 'glb' || ext === 'gltf';
    const parsedObj = await new Promise((resolve, reject) => {
      try {
        if (isGLTF) {
          this.gltfLoader.parse(
            buffer,
            '',
            (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0];
              if (root) root.animations = gltf.animations || [];
              resolve(root);
            },
            reject
          );
        } else {
          const fbx = this.fbxLoader.parse(buffer, '');
          resolve(fbx);
        }
      } catch (err) {
        reject(err);
      }
    });

    if (!parsedObj) {
      throw new Error('Failed to parse 3D file.');
    }

    // Check if the imported object contains any SkinnedMesh
    let skinnedCount = 0;
    parsedObj.traverse((child) => {
      if (child.isSkinnedMesh) skinnedCount++;
    });

    const hasSkin = skinnedCount > 0;
    const retargetedClips = [];

    // 1. Extract & Retarget any animations BEFORE mutating the scene hierarchy if needed
    if (options.extractAnimations && parsedObj.animations && parsedObj.animations.length > 0) {
      for (let i = 0; i < parsedObj.animations.length; i++) {
        const clip = parsedObj.animations[i];
        // Filter out trivial 0-length or 1-frame T-pose take unless it's a pure animation file
        if (clip && (clip.duration > 0.08 || !hasSkin)) {
          const clipLabel = parsedObj.animations.length === 1
            ? baseName
            : `${baseName} (${clip.name || 'Take ' + (i + 1)})`;
          const retargeted = this.retargetAnimationClip(parsedObj, clip, clipLabel);
          if (retargeted && retargeted.frames.length > 1) {
            retargetedClips.push(retargeted);
          }
        }
      }
    }

    // 2. If the file has a SkinnedMesh and caller wants to load the character skin, calibrate & bind it
    if (hasSkin && options.applySkinIfPresent !== false) {
      this.setupModel(parsedObj, file.name);
    }

    return {
      hasSkin,
      model: hasSkin ? this.model : null,
      retargetedClips,
      diagnostics: this.rigDiagnostics
    };
  }

  /**
   * Dedicated Animation File Loader (.fbx "With Skin" or "Without Skin", .glb/.gltf, .bvh)
   * Always extracts retargeted animation clips without replacing the current viewport character mesh
   * (unless no character mesh is loaded yet and the file has a skin).
   */
  async loadAnimationFile(file) {
    const applySkin = !this.isLoaded;
    return this.loadFromFile(file, {
      applySkinIfPresent: applySkin,
      extractAnimations: true
    });
  }

  // Re-run calibration when user adjusts T-pose alignment, arm spread, scale, ground offset, or yaw
  recalibrate() {
    if (!this.model) return;
    this.setupModel(this.model, this.rigDiagnostics.modelName, true);
  }

  // Initialize and calibrate the SkinnedMesh(es) to fit the 15-segment physics humanoid
  setupModel(model, modelLabel = 'Character', isRecalibration = false) {
    if (!isRecalibration && this.model && this.model !== model) {
      this.scene.remove(this.model);
      this.disposeModel(this.model);
    }

    this.model = model;
    this.skinnedMeshes = [];
    this.boneBindings = [];
    this.primarySegmentBones = {};
    this.hipsBones = [];
    this.hipsBone = null;

    // Reset root transform before calibration
    model.scale.setScalar(1);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);

    // 1. Find all SkinnedMeshes, repair FBX material quirks, and restore true Bind Pose (`skeleton.pose()`)
    model.traverse((child) => {
      if (child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false; // Prevent disappearing when ragdoll moves away from origin
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => this.enhanceMaterial(m));
          } else {
            this.enhanceMaterial(child.material);
          }
        }
        // CRITICAL FIX: Restore true bind pose from boneInverses so models exported while
        // previewing an animation on Mixamo.com are calibrated in clean T-Pose/A-Pose!
        if (child.skeleton && typeof child.skeleton.pose === 'function') {
          try {
            child.skeleton.pose();
          } catch (_) {
            // Fallback if boneInverses are malformed
          }
        }
        this.skinnedMeshes.push(child);
      }
    });

    if (this.skinnedMeshes.length === 0) {
      console.warn('MixamoBridge: No SkinnedMesh found in imported model.');
      return;
    }

    model.updateMatrixWorld(true);

    // 2. Collect ALL unique bones across the entire model and all skeletons in top-down parent-before-child order
    const boneSet = new Set();
    const orderedBones = [];
    model.traverse((node) => {
      if (node.isBone && !boneSet.has(node)) {
        boneSet.add(node);
        orderedBones.push(node);
      }
    });
    for (const sm of this.skinnedMeshes) {
      if (sm.skeleton && sm.skeleton.bones) {
        for (const b of sm.skeleton.bones) {
          if (b && !boneSet.has(b)) {
            boneSet.add(b);
            orderedBones.push(b);
          }
        }
      }
    }

    this.skeleton = this.skinnedMeshes[0].skeleton;

    // 3. Measure true skeleton vertical bounds from bone positions (prevents huge props/planes in FBX from breaking scale)
    const boneBox = new THREE.Box3();
    const tmpPos = new THREE.Vector3();
    for (const b of orderedBones) {
      b.getWorldPosition(tmpPos);
      boneBox.expandByPoint(tmpPos);
    }

    const meshBox = new THREE.Box3().setFromObject(model);
    const meshSize = new THREE.Vector3();
    meshBox.getSize(meshSize);
    const boneSize = new THREE.Vector3();
    boneBox.getSize(boneSize);

    // Estimate humanoid height: if meshBox is reasonable, use meshBox; if meshBox is wildly huge/tiny compared to skeleton, use boneBox * 1.12
    const targetHeight = 1.75;
    let rawHeight = meshSize.y;
    if (rawHeight < 0.05 || (boneSize.y > 0.05 && rawHeight > boneSize.y * 2.2)) {
      rawHeight = boneSize.y * 1.12;
    }
    rawHeight = Math.max(rawHeight, 0.01);

    this.baseAutoScale = targetHeight / rawHeight;
    const effectiveScale = this.baseAutoScale * (this.calibration.scaleMultiplier ?? 1.0);

    model.scale.setScalar(effectiveScale);
    model.position.set(0, 0, 0);
    model.rotation.set(0, THREE.MathUtils.degToRad(this.calibration.yawOffsetDeg || 0), 0);
    model.updateMatrixWorld(true);

    // Ground the character so the lowest foot/mesh point sits cleanly at Y = 0 (+ user groundOffsetY)
    const scaledBox = new THREE.Box3().setFromObject(model);
    if (isFinite(scaledBox.min.y) && Math.abs(scaledBox.min.y) < 10.0) {
      this.baseGroundOffsetY = -scaledBox.min.y;
    } else {
      this.baseGroundOffsetY = 0;
    }
    model.position.y = this.baseGroundOffsetY + (this.calibration.groundOffsetY || 0);
    model.updateMatrixWorld(true);

    // 4. Map bones to our 15 canonical physics segments and identify primary driving bones
    // Note: Multi-mesh Mixamo exports (like xbot.fbx with Beta_Surface + Beta_Joints) often have duplicate
    // child bones with the same name (`mixamorigHips` parented to `mixamorigHips`).
    const preliminaryBindings = [];
    for (const bone of orderedBones) {
      bone.matrixAutoUpdate = true;
      const { normName, segmentName } = resolveBoneToSegment(bone.name);

      // Check if this bone is a duplicate child of an already-mapped bone of the exact same normName
      const parentNorm = bone.parent ? normalizeBoneName(bone.parent.name) : '';
      const isDuplicateLeafHelper = (parentNorm === normName && normName !== '');

      const bindWorldQuat = new THREE.Quaternion();
      bone.getWorldQuaternion(bindWorldQuat);
      const bindWorldPos = new THREE.Vector3();
      bone.getWorldPosition(bindWorldPos);

      const entry = {
        bone,
        normName,
        segmentName: isDuplicateLeafHelper ? null : segmentName,
        isDuplicateLeafHelper,
        bindWorldQuat: bindWorldQuat.clone(),
        restWorldQuat: bindWorldQuat.clone(),
        restLocalQuat: bone.quaternion.clone(),
        bindWorldPos
      };

      preliminaryBindings.push(entry);

      if (!isDuplicateLeafHelper && segmentName) {
        // Keep the first (highest hierarchy) bone for each canonical segment, except for UpperSpine where spine2 refines spine1
        if (!this.primarySegmentBones[segmentName] || (segmentName === 'UpperSpine' && normName === 'spine1')) {
          this.primarySegmentBones[segmentName] = entry;
        }
      }

      if (!isDuplicateLeafHelper && (normName === 'hips' || normName === 'pelvis' || normName === 'hip' || normName === 'cog' || normName === 'waist')) {
        if (!this.hipsBone) {
          this.hipsBone = bone;
          this.hipsRestLocalPos.copy(bone.position);
          this.hipsRestWorldPos.setFromMatrixPosition(bone.matrixWorld);
          if (bone.parent) {
            this.hipsParentRestWorldInv.copy(bone.parent.matrixWorld).invert();
          } else {
            this.hipsParentRestWorldInv.identity();
          }
        }
        this.hipsBones.push({
          bone,
          restLocalPos: bone.position.clone(),
          restWorldPos: new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld),
          parentRestWorldInv: bone.parent ? bone.parent.matrixWorld.clone().invert() : new THREE.Matrix4().identity()
        });
      }
    }

    // Filter hipsBones so no bone is a descendant of another hipsBone (prevents double-transformation on nested rigs)
    this.hipsBones = this.hipsBones.filter(hEntry => {
      let curr = hEntry.bone.parent;
      while (curr) {
        if (this.hipsBones.some(other => other.bone === curr)) {
          return false;
        }
        curr = curr.parent;
      }
      return true;
    });
    if (this.hipsBones.length > 0 && (!this.hipsBone || !this.hipsBones.some(h => h.bone === this.hipsBone))) {
      this.hipsBone = this.hipsBones[0].bone;
    }

    // 5. Automatic A-Pose -> T-Pose Limb Alignment & Arm Spread Calibration
    // Computes per-segment world rotational correction so A-pose characters (or custom shoulder angles)
    // match the horizontal T-pose reference frame of our physics humanoid.
    const segmentAlignQuats = {};
    let detectedLeftArmAngleDeg = 0;

    for (const [segName, alignCfg] of Object.entries(LIMB_ALIGNMENT_CONFIG)) {
      const parentEntry = this.primarySegmentBones[segName];
      const childEntry = this.primarySegmentBones[alignCfg.childSeg];
      if (!parentEntry || !childEntry) continue;

      const limbVec = new THREE.Vector3().subVectors(childEntry.bindWorldPos, parentEntry.bindWorldPos);
      if (limbVec.lengthSq() < 1e-5) continue;
      limbVec.normalize();

      // Rotate target canonical direction by model yaw if any
      const targetDir = alignCfg.targetDir.clone();
      const yawRad = THREE.MathUtils.degToRad(this.calibration.yawOffsetDeg || 0);
      if (Math.abs(yawRad) > 1e-4) {
        targetDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
      }

      // Measure angle between bind-pose limb vector and canonical T-pose vector
      const angleRad = limbVec.angleTo(targetDir);
      const angleDeg = THREE.MathUtils.radToDeg(angleRad);
      if (segName === 'LeftUpperArm') {
        detectedLeftArmAngleDeg = angleDeg;
      }

      const alignQuat = new THREE.Quaternion();
      if (this.calibration.autoAlignTPose && angleDeg > 3.5 && angleDeg < 75.0) {
        alignQuat.setFromUnitVectors(limbVec, targetDir);
      }

      // Apply manual user Arm Spread Offset (abduction around Z axis) for arms
      const spreadDeg = this.calibration.armSpreadOffsetDeg || 0;
      if (Math.abs(spreadDeg) > 0.1 && (segName.includes('UpperArm') || segName.includes('Forearm'))) {
        const sign = segName.startsWith('Left') ? 1 : -1;
        const spreadQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(spreadDeg * sign)
        );
        alignQuat.premultiply(spreadQ);
      }

      // Apply Stance Width / Thigh Clearance Offset (abduction around Z axis) to prevent inner-thigh self-clipping
      const thighSpread = this.calibration.thighClearanceDeg || 0;
      if (Math.abs(thighSpread) > 0.1 && segName.includes('Thigh')) {
        const sign = segName.startsWith('Left') ? 1 : -1;
        const thighQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(thighSpread * sign)
        );
        alignQuat.premultiply(thighQ);
      }

      segmentAlignQuats[segName] = alignQuat;
    }

    // Propagate forearm alignment to hands if hands exist
    if (segmentAlignQuats['LeftForearm']) {
      segmentAlignQuats['LeftHand'] = segmentAlignQuats['LeftForearm'].clone();
    }
    if (segmentAlignQuats['RightForearm']) {
      segmentAlignQuats['RightHand'] = segmentAlignQuats['RightForearm'].clone();
    }

    // Apply alignment quaternions to each bone's restWorldQuat
    for (const entry of preliminaryBindings) {
      if (entry.segmentName && segmentAlignQuats[entry.segmentName]) {
        entry.restWorldQuat.multiplyQuaternions(segmentAlignQuats[entry.segmentName], entry.bindWorldQuat);
      } else {
        entry.restWorldQuat.copy(entry.bindWorldQuat);
      }
      this.boneBindings.push(entry);
    }

    // 6. NaturalMotion Endorphin Mesh Proportion Analysis:
    // Automatically measures foot sole height offset, shoulder/chest bulk, hip spacing, and body girth
    const footEntry = this.primarySegmentBones['LeftFoot'] || this.primarySegmentBones['RightFoot'];
    let detectedFootSoleOffset = 0.04;
    if (footEntry && isFinite(scaledBox.min.y)) {
      const diff = footEntry.bindWorldPos.y - scaledBox.min.y;
      if (diff > 0.005 && diff < 0.35) {
        detectedFootSoleOffset = diff;
      }
    }

    let characterHipHeight = 0.95;
    if (this.hipsBone) {
      characterHipHeight = Math.max(0.4, this.hipsRestWorldPos.y);
    }
    this.characterHipHeight = characterHipHeight;

    let detectedArmSpreadDeg = 0;
    const lArm = this.primarySegmentBones['LeftUpperArm'];
    const rArm = this.primarySegmentBones['RightUpperArm'];
    if (lArm && rArm) {
      const shoulderSpan = Math.abs(lArm.bindWorldPos.x - rArm.bindWorldPos.x);
      const excess = (shoulderSpan - 0.40) * 0.5;
      if (excess > 0.008) {
        const ratio = Math.min(0.65, excess / 0.28);
        detectedArmSpreadDeg = THREE.MathUtils.radToDeg(Math.asin(ratio));
      }
    }

    let detectedThighSpreadDeg = 0;
    const lThigh = this.primarySegmentBones['LeftThigh'];
    const rThigh = this.primarySegmentBones['RightThigh'];
    if (lThigh && rThigh) {
      const hipSpan = Math.abs(lThigh.bindWorldPos.x - rThigh.bindWorldPos.x);
      if (hipSpan < 0.20) {
        detectedThighSpreadDeg = 3.5;
      } else if (hipSpan > 0.28) {
        detectedThighSpreadDeg = 2.0;
      }
    }

    let detectedGirthMultiplier = 1.0;
    if (boneSize.x > 0.05 && meshSize.x > 0.05) {
      const ratio = (meshSize.x / boneSize.x);
      if (ratio > 1.15) {
        detectedGirthMultiplier = Math.min(1.45, ratio * 0.95);
      } else if (ratio < 0.85) {
        detectedGirthMultiplier = Math.max(0.75, ratio * 1.05);
      }
    }

    // Auto-initialize calibration defaults on first load of a model
    if (!isRecalibration) {
      if (detectedArmSpreadDeg > 0.5 && !this.calibration.armSpreadOffsetDeg) {
        this.calibration.armSpreadOffsetDeg = Math.round(detectedArmSpreadDeg);
      }
      if (detectedThighSpreadDeg > 0.5 && !this.calibration.thighClearanceDeg) {
        this.calibration.thighClearanceDeg = Math.round(detectedThighSpreadDeg);
      }
      this.calibration.footSoleOffset = Number(detectedFootSoleOffset.toFixed(3));
      this.calibration.bodyGirthMultiplier = Number(detectedGirthMultiplier.toFixed(2));
    }

    // Synchronize ground clamping, foot sole offset, and physics collider girth to character
    if (this.character) {
      this.character.groundClampingEnabled = this.calibration.autoGroundClamp !== false;
      this.character.footSoleOffset = this.calibration.footSoleOffset ?? 0.04;
      if (typeof this.character.setColliderGirth === 'function') {
        this.character.setColliderGirth(this.calibration.bodyGirthMultiplier ?? 1.0);
      }
    }

    // Update diagnostics
    const mappedSet = new Set();
    for (const b of this.boneBindings) {
      if (b.segmentName) mappedSet.add(b.segmentName);
    }
    this.rigDiagnostics = {
      modelName: modelLabel || model.name || 'Custom Character',
      skinnedMeshCount: this.skinnedMeshes.length,
      totalBones: this.boneBindings.length,
      mappedSegmentsCount: mappedSet.size,
      mappedSegments: Array.from(mappedSet),
      detectedPose: detectedLeftArmAngleDeg > 12 ? `A-Pose (${detectedLeftArmAngleDeg.toFixed(0)}° -> Auto T-Pose)` : `T-Pose (${detectedLeftArmAngleDeg.toFixed(0)}°)`,
      leftArmAngleDeg: Number(detectedLeftArmAngleDeg.toFixed(1)),
      embeddedAnimCount: model.animations ? model.animations.length : 0,
      detectedFootSoleOffset: Number(detectedFootSoleOffset.toFixed(3)),
      detectedArmSpreadDeg: Math.round(detectedArmSpreadDeg),
      detectedThighSpreadDeg: Math.round(detectedThighSpreadDeg),
      detectedGirthMultiplier: Number(detectedGirthMultiplier.toFixed(2))
    };

    if (!model.parent) {
      this.scene.add(model);
    }
    this.isLoaded = true;
    this.setVisible(this.isVisible);
    this.update();

    console.log(
      `MixamoBridge: Calibrated "${this.rigDiagnostics.modelName}" | Meshes: ${this.rigDiagnostics.skinnedMeshCount} | Bones: ${this.rigDiagnostics.totalBones} | Mapped Segments: ${this.rigDiagnostics.mappedSegmentsCount}/15 | Pose: ${this.rigDiagnostics.detectedPose}`
    );
  }

  enhanceMaterial(mat) {
    if (!mat) return;
    mat.side = THREE.DoubleSide;
    mat.shadowSide = THREE.DoubleSide;

    // Fix FBXLoader TransparencyFactor quirk where opaque Mixamo materials import with opacity 0 or unwanted transparency
    if (mat.opacity !== undefined && mat.opacity <= 0.05) {
      mat.opacity = 1.0;
      mat.transparent = false;
    } else if (mat.transparent && mat.opacity >= 0.98 && !mat.alphaMap) {
      mat.transparent = false;
    }

    if (mat.roughness !== undefined) {
      mat.roughness = Math.max(0.3, Math.min(0.85, mat.roughness || 0.45));
    }
    if (mat.metalness !== undefined) {
      mat.metalness = Math.min(0.4, mat.metalness || 0.15);
    }
    if (mat.shininess !== undefined) {
      mat.shininess = Math.min(45, mat.shininess);
    }
    if (this.tintColor) {
      if (mat.color) {
        mat.color.lerp(new THREE.Color(this.tintColor), 0.35);
      }
      if (mat.emissive) {
        mat.emissive.set(this.tintColor);
        mat.emissiveIntensity = 0.18;
      }
    }
    mat.needsUpdate = true;
  }

  // Update all bone local transforms from the physics character segments
  update() {
    if (!this.isLoaded || !this.isVisible || !this.character || !this.character.bodies) return;

    if (this.model) {
      this.model.updateMatrixWorld(true);
    }

    // 1. Compute rotational delta (currentWorldQuat * initWorldQuat^-1) for each physics segment.
    const deltaQuats = {};
    for (const [name, b] of Object.entries(this.character.bodies)) {
      const currentQuat = b.mesh ? b.mesh.quaternion : null;
      if (!currentQuat) continue;
      const initRotInv = this._tmpQuat.copy(b.initRot).invert();
      deltaQuats[name] = new THREE.Quaternion().multiplyQuaternions(currentQuat, initRotInv);
    }

    // 2. Drive root Hips world position from Pelvis displacement across all Hips bones
    const pelvisBody = this.character.bodies['Pelvis'];
    if (pelvisBody && pelvisBody.mesh && this.hipsBones.length > 0) {
      const pPos = pelvisBody.mesh.position;
      const dx = pPos.x - pelvisBody.initPos.x;
      const dy = pPos.y - pelvisBody.initPos.y;
      const dz = pPos.z - pelvisBody.initPos.z;

      for (const hEntry of this.hipsBones) {
        this._tmpVec3.set(
          hEntry.restWorldPos.x + dx,
          hEntry.restWorldPos.y + dy,
          hEntry.restWorldPos.z + dz
        );
        this._tmpVec3.applyMatrix4(hEntry.parentRestWorldInv);
        hEntry.bone.position.copy(this._tmpVec3);
      }
    }

    // 3. Drive hierarchical local bone rotations top-down (parent before child)
    if (this.model) {
      this.model.updateMatrix();
      this.model.updateMatrixWorld(true);
    }

    const yawRad = THREE.MathUtils.degToRad(this.calibration.yawOffsetDeg || 0);
    const hasYaw = Math.abs(yawRad) > 1e-4;
    if (hasYaw) {
      this._yawCorrectionQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
    }

    for (const binding of this.boneBindings) {
      const { bone, normName, segmentName, restWorldQuat, restLocalQuat, isDuplicateLeafHelper } = binding;

      if (isDuplicateLeafHelper) {
        // Duplicate helper bone (e.g. Beta_Joints child of Beta_Surface bone): keep identity/rest local transform so it follows parent 1:1
        bone.quaternion.copy(restLocalQuat);
      } else if (segmentName && deltaQuats[segmentName]) {
        let deltaQ = deltaQuats[segmentName];

        // Smooth 3-vertebra spine interpolation for Spine1 between LowerSpine and UpperSpine
        if (normName === 'spine1' && deltaQuats['LowerSpine'] && deltaQuats['UpperSpine']) {
          deltaQ = this._tmpQuat2.copy(deltaQuats['LowerSpine']).slerp(deltaQuats['UpperSpine'], 0.5);
        }

        // Target world rotation for this bone: qTargetWorld = deltaQ * restWorldQuat
        const qTargetWorld = this._tmpQuat.multiplyQuaternions(deltaQ, restWorldQuat);
        if (hasYaw) {
          qTargetWorld.premultiply(this._yawCorrectionQuat);
        }

        if (bone.parent) {
          bone.parent.getWorldQuaternion(this._parentWorldQuat);
          this._parentWorldQuat.invert();
          bone.quaternion.multiplyQuaternions(this._parentWorldQuat, qTargetWorld);
        } else {
          bone.quaternion.copy(qTargetWorld);
        }
      } else {
        // Finger/unmapped leaf bones keep their local bind rotation relative to their parent
        bone.quaternion.copy(restLocalQuat);
      }

      bone.updateMatrix();
      if (bone.parent) {
        bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
      } else {
        bone.matrixWorld.copy(bone.matrix);
      }
    }

    // 4. Ensure complete scene-graph matrixWorld propagation & refresh all GPU skinning matrices
    if (this.model) {
      this.model.updateMatrixWorld(true);
    }
    for (const sm of this.skinnedMeshes) {
      if (sm.skeleton) {
        sm.skeleton.update();
      }
    }
  }

  // ============================================================================
  // UNIVERSAL CUSTOM ANIMATION RETARGETING ENGINE (FBX / GLB / GLTF / BVH -> 15-BODY RIG)
  // ============================================================================

  /**
   * Retargets a `THREE.AnimationClip` on a source root object (`FBX` or `GLTF` scene)
   * into a 60Hz baked kinematic frame table for our 15-segment physics character.
   * Works whether `sourceRoot` has a `SkinnedMesh` ("With Skin") or only `THREE.Bone` / `Object3D` nodes ("Without Skin").
   */
  retargetAnimationClip(sourceRoot, clip, customName = null) {
    if (!sourceRoot || !clip) return null;

    // 1. Restore bind pose on any SkinnedMeshes first so we capture clean bind-pose transforms
    sourceRoot.scale.setScalar(1);
    sourceRoot.position.set(0, 0, 0);
    sourceRoot.rotation.set(0, 0, 0);
    let hasSkinnedMesh = false;
    sourceRoot.traverse((child) => {
      if (child.isSkinnedMesh) {
        hasSkinnedMesh = true;
        if (child.skeleton && typeof child.skeleton.pose === 'function') {
          try {
            child.skeleton.pose();
          } catch (_) {}
        }
      }
    });
    sourceRoot.updateMatrixWorld(true);

    // 2. Map source nodes/bones to our 15 physics segments
    const segmentSourceNodes = {};
    let hipsNode = null;
    let isMixamoNaming = false;
    let allLocalIdentity = true;

    sourceRoot.traverse((node) => {
      if (node.name && node.name.toLowerCase().includes('mixamo')) {
        isMixamoNaming = true;
      }
      const { normName, segmentName } = resolveBoneToSegment(node.name);
      if (!segmentName) return;

      const parentNorm = node.parent ? normalizeBoneName(node.parent.name) : '';
      if (parentNorm === normName && normName !== '') return; // Skip duplicate leaf helpers

      if (!segmentSourceNodes[segmentName] || (segmentName === 'UpperSpine' && normName === 'spine1')) {
        segmentSourceNodes[segmentName] = node;
        if (Math.abs(node.quaternion.w - 1.0) > 0.01) {
          allLocalIdentity = false;
        }
      }
      if (!hipsNode && (normName === 'hips' || normName === 'pelvis' || normName === 'root')) {
        hipsNode = node;
      }
    });

    if (!hipsNode && segmentSourceNodes['Pelvis']) {
      hipsNode = segmentSourceNodes['Pelvis'];
    }

    const mappedCount = Object.keys(segmentSourceNodes).length;
    if (mappedCount === 0) {
      console.warn(`MixamoBridge Retarget: Could not map any humanoid bones for clip "${clip.name}".`);
      return null;
    }

    // 3. Measure source bind-pose world rotations & positions
    // For "Without Skin" Mixamo FBX files (where hasSkinnedMesh is false and initial Lcl Rotation is already Frame 0),
    // use the active character's calibrated Mixamo T-Pose world quaternions or CANONICAL_MIXAMO_TPOSE_WORLD_QUATS!
    const srcBindWorldQuat = {};
    const srcBindWorldPos = {};
    for (const [segName, node] of Object.entries(segmentSourceNodes)) {
      srcBindWorldQuat[segName] = new THREE.Quaternion();
      node.getWorldQuaternion(srcBindWorldQuat[segName]);
      srcBindWorldPos[segName] = new THREE.Vector3();
      node.getWorldPosition(srcBindWorldPos[segName]);
    }

    const srcTPoseWorldQuat = {};
    const useCanonicalMixamoTPose = !hasSkinnedMesh && !allLocalIdentity && isMixamoNaming;

    if (useCanonicalMixamoTPose) {
      for (const segName of Object.keys(segmentSourceNodes)) {
        if (this.primarySegmentBones[segName]?.restWorldQuat) {
          srcTPoseWorldQuat[segName] = this.primarySegmentBones[segName].restWorldQuat.clone();
        } else if (CANONICAL_MIXAMO_TPOSE_WORLD_QUATS[segName]) {
          srcTPoseWorldQuat[segName] = CANONICAL_MIXAMO_TPOSE_WORLD_QUATS[segName].clone();
        } else {
          srcTPoseWorldQuat[segName] = srcBindWorldQuat[segName].clone();
        }
      }
    } else {
      for (const [segName, qBind] of Object.entries(srcBindWorldQuat)) {
        srcTPoseWorldQuat[segName] = qBind.clone();
      }

      // Align source limbs to canonical T-pose vectors if source bind pose is an A-pose
      for (const [segName, alignCfg] of Object.entries(LIMB_ALIGNMENT_CONFIG)) {
        const pPos = srcBindWorldPos[segName];
        const cPos = srcBindWorldPos[alignCfg.childSeg];
        if (!pPos || !cPos) continue;
        const limbVec = new THREE.Vector3().subVectors(cPos, pPos);
        if (limbVec.lengthSq() < 1e-5) continue;
        limbVec.normalize();
        const angleDeg = THREE.MathUtils.radToDeg(limbVec.angleTo(alignCfg.targetDir));
        if (angleDeg > 3.5 && angleDeg < 65.0) {
          const alignQ = new THREE.Quaternion().setFromUnitVectors(limbVec, alignCfg.targetDir);
          srcTPoseWorldQuat[segName].multiplyQuaternions(alignQ, srcBindWorldQuat[segName]);
        }
      }
      if (srcTPoseWorldQuat['LeftForearm'] && srcBindWorldQuat['LeftHand']) {
        const handDiff = srcTPoseWorldQuat['LeftForearm'].clone().multiply(srcBindWorldQuat['LeftForearm'].clone().invert());
        srcTPoseWorldQuat['LeftHand'].multiplyQuaternions(handDiff, srcBindWorldQuat['LeftHand']);
      }
      if (srcTPoseWorldQuat['RightForearm'] && srcBindWorldQuat['RightHand']) {
        const handDiff = srcTPoseWorldQuat['RightForearm'].clone().multiply(srcBindWorldQuat['RightForearm'].clone().invert());
        srcTPoseWorldQuat['RightHand'].multiplyQuaternions(handDiff, srcBindWorldQuat['RightHand']);
      }
    }

    // Invert source T-pose world quaternions for fast per-frame delta computation
    const srcTPoseWorldQuatInv = {};
    for (const [segName, qTPose] of Object.entries(srcTPoseWorldQuat)) {
      srcTPoseWorldQuatInv[segName] = qTPose.clone().invert();
    }

    // Measure source Hips rest height for root motion scaling to our 0.95m Pelvis height
    const restHipsPos = new THREE.Vector3();
    if (hipsNode) {
      hipsNode.getWorldPosition(restHipsPos);
    }

    // 4. Sample the AnimationClip at 60 FPS using THREE.AnimationMixer
    const sampleFps = 60;
    const duration = Math.max(clip.duration || 1.0, 1 / sampleFps);
    const totalFrames = Math.max(2, Math.ceil(duration * sampleFps));

    const mixer = new THREE.AnimationMixer(sourceRoot);
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();

    // Evaluate Frame 0 to determine root position reference & scale factor
    mixer.setTime(0);
    sourceRoot.updateMatrixWorld(true);

    const frame0HipsPos = new THREE.Vector3();
    if (hipsNode) {
      hipsNode.getWorldPosition(frame0HipsPos);
    }
    const refHipsY = Math.max(Math.abs(restHipsPos.y), Math.abs(frame0HipsPos.y), 0.1);
    const targetHipY = this.characterHipHeight || 0.95;
    const rootPosScale = targetHipY / refHipsY;

    const frames = [];
    const qCurWorld = new THREE.Quaternion();
    const eulScratch = new THREE.Euler(0, 0, 0, 'XYZ');

    for (let f = 0; f <= totalFrames; f++) {
      const t = Math.min(f / sampleFps, duration);
      mixer.setTime(t);
      sourceRoot.updateMatrixWorld(true);

      // Compute world rotation delta for each mapped segment:
      // deltaWorld[S] = qCurWorld(b, t) * (qTPoseWorld(b))^-1
      const segWorldTargetQuat = {};
      for (const [segName, def] of Object.entries(SKELETON_TREE)) {
        const node = segmentSourceNodes[segName];
        if (node && srcTPoseWorldQuatInv[segName]) {
          node.getWorldQuaternion(qCurWorld);
          segWorldTargetQuat[segName] = new THREE.Quaternion().multiplyQuaternions(
            qCurWorld,
            srcTPoseWorldQuatInv[segName]
          );
        } else if (def.parent && segWorldTargetQuat[def.parent]) {
          // Inherit parent world rotation if a minor segment (e.g. Shoulder/Neck) is unmapped in source clip
          segWorldTargetQuat[segName] = segWorldTargetQuat[def.parent].clone();
        } else {
          segWorldTargetQuat[segName] = new THREE.Quaternion();
        }
      }

      // Convert world target rotations into parent-relative local rotations for SKELETON_TREE
      const localRotations = {};
      const localQuaternions = {};
      for (const [segName, def] of Object.entries(SKELETON_TREE)) {
        const worldQ = segWorldTargetQuat[segName];
        let localQ;
        if (!def.parent) {
          localQ = worldQ.clone();
        } else {
          const parentWorldQ = segWorldTargetQuat[def.parent] || new THREE.Quaternion();
          localQ = parentWorldQ.clone().invert().multiply(worldQ);
        }
        eulScratch.setFromQuaternion(localQ, 'XYZ');
        localRotations[segName] = [eulScratch.x, eulScratch.y, eulScratch.z];
        localQuaternions[segName] = [localQ.x, localQ.y, localQ.z, localQ.w];
      }

      // Compute scaled root displacement relative to Frame 0
      const curHipsPos = new THREE.Vector3();
      if (hipsNode) {
        hipsNode.getWorldPosition(curHipsPos);
      }
      const rootOffset = [
        (curHipsPos.x - frame0HipsPos.x) * rootPosScale,
        (curHipsPos.y * rootPosScale) - targetHipY,
        (curHipsPos.z - frame0HipsPos.z) * rootPosScale
      ];

      frames.push({
        localRotations,
        localQuaternions,
        rootOffset
      });
    }

    mixer.stopAllAction();
    mixer.uncacheRoot(sourceRoot);

    // Estimate average horizontal root velocity (m/s)
    const firstOff = frames[0].rootOffset;
    const lastOff = frames[frames.length - 1].rootOffset;
    const dxTotal = lastOff[0] - firstOff[0];
    const dzTotal = lastOff[2] - firstOff[2];
    const avgSpeed = Math.hypot(dxTotal, dzTotal) / Math.max(duration, 0.05);

    const clipId = 'clip_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const cleanName = customName || clip.name || 'Imported Animation';

    console.log(
      `MixamoBridge Retarget: Baked "${cleanName}" | ${frames.length} frames (${duration.toFixed(2)}s @ 60fps) | Mapped ${mappedCount}/15 segments | Avg Root Speed: ${avgSpeed.toFixed(2)} m/s`
    );

    return {
      id: clipId,
      name: cleanName,
      duration,
      fps: sampleFps,
      totalFrames: frames.length,
      mappedSegmentsCount: mappedCount,
      avgRootSpeed: avgSpeed,
      frames
    };
  }

  /**
   * Retargets a parsed BVHLoader result (`{ skeleton, clip }`) into our 15-segment rig format.
   */
  retargetBVHResult(bvhResult, customName = 'BVH Mocap') {
    if (!bvhResult || !bvhResult.skeleton || !bvhResult.clip) return null;
    const rootGroup = new THREE.Group();
    const rootBones = bvhResult.skeleton.bones.filter((b) => !b.parent || !b.parent.isBone);
    for (const rb of rootBones) {
      rootGroup.add(rb);
    }
    rootGroup.updateMatrixWorld(true);
    return this.retargetAnimationClip(rootGroup, bvhResult.clip, customName);
  }

  // Toggle visibility: when Mixamo character is active, hide segmented capsule visual
  setVisible(visible) {
    this.isVisible = visible;
    if (this.model) {
      this.model.visible = visible;
    }

    // Hide or show the character's internal segmented mannequin meshes
    if (this.character && this.character.visualMeshes) {
      for (const mesh of this.character.visualMeshes) {
        mesh.visible = !visible;
      }
    }
  }

  disposeModel(model) {
    model.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  destroy() {
    if (this.model) {
      this.scene.remove(this.model);
      this.disposeModel(this.model);
      this.model = null;
    }
    this.boneBindings = [];
    this.skinnedMeshes = [];
    this.isLoaded = false;
    this.isVisible = false;
  }
}
