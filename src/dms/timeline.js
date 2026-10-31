import * as THREE from 'three';
import { SKELETON_TREE, NATURAL_STANCE_ROTATIONS } from '../core/character.js';

export class TimelineEngine {
  constructor(character, dmsEngine) {
    this.character = character;
    this.dmsEngine = dmsEngine;
    this.totalFrames = 240;
    this.fps = 60;
    this.substeps = 2;
    this.currentFrame = 0;
    this.isSimulated = false;
    this.isPlaying = false;
    this.isBakingLive = false;
    this.simulationCache = [];

    // Multi-Actor Architecture (Actor 1 Hero, Actor 2 Opponent)
    this.actors = {};
    this.activeActorId = 'actor-1';

    // Default timeline is clean and blank (authoring canvas)
    this.layers = [];
    this.selectedLayerId = null;
    this.characterBridge = null;

    // Tracking for kinematic velocity & angular velocity calculation
    this.prevPositions = {};
    this.prevQuaternions = {};
    this.appliedPerturbations = new Set();
    this.constraintAnchors = {};
    this.hadKinematicAnimLastFrame = false;

    // Endorphin 2.7.1 Physical Effect Force Fields
    this.windForce = { x: 0, y: 0, z: 0 };
    this.twisterStrength = 0;

    // Retargeted Custom Animation Clips Registry (Mixamo FBX / GLB / GLTF / BVH)
    this.customAnimations = new Map();

    // Register primary actor after all state is initialized
    if (character && dmsEngine) {
      this.registerActor('actor-1', {
        id: 'actor-1',
        name: 'Actor 1 (Hero)',
        character: character,
        dmsEngine: dmsEngine
      });
    }
  }

  registerActor(actorId, actorData) {
    this.actors[actorId] = {
      id: actorId,
      name: actorData.name || (actorId === 'actor-1' ? 'Actor 1 (Hero)' : 'Actor 2 (Opponent)'),
      character: actorData.character,
      dmsEngine: actorData.dmsEngine,
      mixamoBridge: actorData.mixamoBridge || (actorId === 'actor-1' ? this.characterBridge : null),
      hadKinematicAnimLastFrame: false,
      prevPositions: {},
      prevQuaternions: {}
    };
    if (actorId === 'actor-1' || !this.character) {
      this.character = actorData.character;
      this.dmsEngine = actorData.dmsEngine;
    }
    this.invalidateSimulation();
  }

  unregisterActor(actorId) {
    if (this.actors[actorId]) {
      this.layers = this.layers.filter(l => (l.actorId || 'actor-1') !== actorId);
      delete this.actors[actorId];
      if (this.activeActorId === actorId) {
        this.activeActorId = Object.keys(this.actors)[0] || 'actor-1';
        if (this.actors[this.activeActorId]) {
          this.character = this.actors[this.activeActorId].character;
          this.dmsEngine = this.actors[this.activeActorId].dmsEngine;
        }
      }
      this.invalidateSimulation();
    }
  }

  getActor(actorId) {
    return this.actors[actorId] || (actorId === 'actor-1' ? {
      id: 'actor-1',
      name: 'Actor 1 (Hero)',
      character: this.character,
      dmsEngine: this.dmsEngine,
      mixamoBridge: this.characterBridge || null,
      hadKinematicAnimLastFrame: this.hadKinematicAnimLastFrame,
      prevPositions: this.prevPositions,
      prevQuaternions: this.prevQuaternions
    } : null);
  }

  getAllActors() {
    return Object.values(this.actors);
  }

  setActiveActor(actorId) {
    if (this.actors[actorId]) {
      this.activeActorId = actorId;
      this.character = this.actors[actorId].character;
      this.dmsEngine = this.actors[actorId].dmsEngine;
    }
  }

  registerCustomAnimation(clipData) {
    if (!clipData || !clipData.id || !Array.isArray(clipData.frames)) return null;
    this.customAnimations.set(clipData.id, clipData);
    return clipData;
  }

  getCustomAnimation(clipId) {
    return this.customAnimations.get(clipId) || null;
  }

  getAllCustomAnimations() {
    return Array.from(this.customAnimations.values());
  }

  // Compute 3D impulse vector from spherical Force Event parameters (magnitude, yawDeg, pitchDeg)
  static computeForceVector(magnitude = 45.0, yawDeg = 180.0, pitchDeg = 0.0) {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    const cosP = Math.cos(pitch);
    return {
      x: Number((magnitude * Math.sin(yaw) * cosP).toFixed(3)),
      y: Number((magnitude * Math.sin(pitch)).toFixed(3)),
      z: Number((magnitude * Math.cos(yaw) * cosP).toFixed(3))
    };
  }

  // NaturalMotion Endorphin 2.7.1 Hermite S-Curve Envelope (blendIn & blendOut transition crossfades)
  static computeLayerWeight(layer, frame) {
    if (!layer || !layer.enabled) return 0.0;
    const s = layer.startFrame ?? 0;
    const e = layer.endFrame ?? 60;
    if (frame < s || frame > e) return 0.0;

    const bIn = Math.max(0, layer.blendIn ?? 10);
    const bOut = Math.max(0, layer.blendOut ?? 10);
    const duration = e - s;

    if (duration <= 0) return 1.0;

    // Overlapping blendIn and blendOut (trapezoid becomes triangle)
    if (bIn + bOut > duration) {
      const mid = s + (duration * (bIn / (bIn + bOut)));
      if (frame <= mid) {
        const t = (frame - s) / Math.max(0.001, mid - s);
        return 3 * t * t - 2 * t * t * t;
      } else {
        const t = (e - frame) / Math.max(0.001, e - mid);
        return 3 * t * t - 2 * t * t * t;
      }
    }

    // Blend-in phase
    if (bIn > 0 && frame < s + bIn) {
      const t = (frame - s) / bIn;
      return 3 * t * t - 2 * t * t * t;
    }

    // Blend-out phase
    if (bOut > 0 && frame > e - bOut) {
      const t = (e - frame) / bOut;
      return 3 * t * t - 2 * t * t * t;
    }

    return 1.0;
  }

  // --- REORDER LAYERS UP / DOWN ---
  moveLayer(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.layers.length) return;
    if (toIndex < 0 || toIndex >= this.layers.length) return;

    const item = this.layers.splice(fromIndex, 1)[0];
    this.layers.splice(toIndex, 0, item);
    this.invalidateSimulation();
  }

  // --- UPDATE TIMING VIA DRAGGING ---
  updateLayerTiming(id, startFrame, endFrame) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;

    layer.startFrame = Math.max(0, Math.min(startFrame, this.totalFrames - 1));
    layer.endFrame = Math.max(layer.startFrame + 1, Math.min(endFrame, this.totalFrames));
    this.invalidateSimulation();
  }

  addLayer(layer) {
    let sf = layer.startFrame ?? 0;
    let ef = layer.endFrame ?? (sf + 60);
    if (sf >= ef) {
      ef = sf + 60;
    }
    if (ef > this.totalFrames) {
      this.totalFrames = Math.max(this.totalFrames, ef);
    }

    const newLayer = {
      id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      actorId: layer.actorId || this.activeActorId || 'actor-1',
      name: layer.name || 'New Layer',
      type: layer.type || 'BEHAVIOR',
      startFrame: sf,
      endFrame: ef,
      blendIn: layer.blendIn ?? 10,
      blendOut: layer.blendOut ?? 10,
      enabled: true,
      intensity: layer.intensity ?? 1.0,
      speed: layer.speed ?? 1.0,
      color: layer.color || '#3b82f6',

      // Endorphin Event-Driven Reactive Trigger Architecture
      triggerType: layer.triggerType || 'frame', // 'frame' | 'impact' | 'proximity' | 'loss_of_balance' | 'ground_contact'
      triggerThreshold: layer.triggerThreshold ?? 35.0, // Force in N, distance in m, or angle in deg
      triggerTarget: layer.triggerTarget || 'auto', // 'auto' | 'actor-2' | 'actor-1' | 'floor' | 'prop'
      isTriggered: false,
      triggeredAtFrame: null,
      durationFrames: Math.max(15, ef - sf),

      // Dynamic Two-Way Contact Constraints (Mutual Grabs & Tackles)
      grabTarget: layer.grabTarget || 'none', // 'none' | 'actor-2' | 'actor-1' | 'prop'
      grabBodyPart: layer.grabBodyPart || 'Pelvis', // Target segment to grapple onto
      grabBreakForce: layer.grabBreakForce ?? 450.0, // Breaking shear limit in N
      isGrabCoupled: false,

      ...layer
    };

    if (newLayer.type === 'PERTURBATION') {
      newLayer.targetBody = newLayer.targetBody || 'UpperSpine';
      newLayer.magnitude = newLayer.magnitude ?? 65.0;
      newLayer.yawDeg = newLayer.yawDeg ?? 180.0;
      newLayer.pitchDeg = newLayer.pitchDeg ?? 8.0;
      newLayer.forceMode = newLayer.forceMode || 'impulse';
      newLayer.impulse = TimelineEngine.computeForceVector(
        newLayer.magnitude * (newLayer.intensity ?? 1.0),
        newLayer.yawDeg,
        newLayer.pitchDeg
      );
      newLayer.color = newLayer.color || '#dc2626';
    } else if (newLayer.type === 'CONSTRAINT') {
      newLayer.targetBody = newLayer.targetBody || 'LeftHand';
      newLayer.constraintType = newLayer.constraintType || 'lock';
      newLayer.pinTarget = newLayer.pinTarget || newLayer.targetProp || 'world';
      newLayer.targetProp = newLayer.targetProp || (newLayer.pinTarget !== 'world' ? newLayer.pinTarget : 'crate');
      newLayer.targetPos = newLayer.targetPos || { x: 0, y: 0.85, z: 1.0 };
      newLayer.strength = newLayer.strength ?? 1.0;
      newLayer.triggerDistance = newLayer.triggerDistance ?? 0.25;
      newLayer.breakForce = newLayer.breakForce ?? 550.0;
      newLayer.stiffness = newLayer.stiffness ?? 850.0;
      newLayer.damping = newLayer.damping ?? 45.0;
      newLayer.isBroken = false;
      newLayer.isEngaged = false;
      newLayer.contactOffset = null;
      newLayer.color = newLayer.color || '#10b981';
    } else if (newLayer.type === 'ACTIVE_POSE') {
      newLayer.poseKey = newLayer.poseKey || 'crouching';
      newLayer.strength = newLayer.strength ?? 50.0;
      newLayer.color = newLayer.color || '#ec4899';
    } else if (newLayer.type === 'BEHAVIOR') {
      newLayer.selectionSet = newLayer.selectionSet || 'all';
      newLayer.bodyPartMask = newLayer.bodyPartMask || 'auto';
      newLayer.targetObject = newLayer.targetObject || newLayer.targetProp || 'none';
      newLayer.targetProp = newLayer.targetProp || newLayer.targetObject || 'none';
      newLayer.targetPos = newLayer.targetPos || null;
      newLayer.lookAt = newLayer.lookAt !== undefined ? newLayer.lookAt : true;
      newLayer.lookAtWeight = newLayer.lookAtWeight ?? 1.0;
      newLayer.lookAtTarget = newLayer.lookAtTarget || null;
      newLayer.reachHand = newLayer.reachHand || 'both';
      newLayer.usePrediction = newLayer.usePrediction !== undefined ? newLayer.usePrediction : true;
      newLayer.predictionRate = newLayer.predictionRate ?? 0.2;
      newLayer.trajectoryOffset = newLayer.trajectoryOffset ?? 0.0;
      newLayer.interceptionOffsetX = newLayer.interceptionOffsetX ?? 0.0;
      newLayer.interceptionOffsetY = newLayer.interceptionOffsetY ?? 0.0;
      newLayer.interceptionOffsetZ = newLayer.interceptionOffsetZ ?? 0.0;
      newLayer.exaggeration = newLayer.exaggeration ?? 0.0;
      newLayer.delay = newLayer.delay ?? 0.0;
      newLayer.characterAccelThreshold = newLayer.characterAccelThreshold ?? 20.0;
      newLayer.targetAccelThreshold = newLayer.targetAccelThreshold ?? 0.05;
    } else if (newLayer.type === 'ANIMATION') {
      if (newLayer.animType === 'pose' || Array.isArray(newLayer.keyframes)) {
        newLayer.animType = 'pose';
        newLayer.keyframes = newLayer.keyframes || [];
        newLayer.color = newLayer.color || '#a855f7';
        newLayer.isMotorized = newLayer.isMotorized !== false;
        newLayer.muscleStiffness = newLayer.muscleStiffness ?? 1.0;
      } else {
        newLayer.animType = newLayer.animType || (newLayer.clipId ? 'custom' : 'walk');
        newLayer.gaitStyle = newLayer.gaitStyle || 'walk';
        newLayer.clipId = newLayer.clipId || null;
        newLayer.inPlace = newLayer.inPlace !== undefined ? newLayer.inPlace : false;
        newLayer.loop = newLayer.loop !== undefined ? newLayer.loop : true;
        newLayer.yawOffsetDeg = newLayer.yawOffsetDeg ?? 0;
        newLayer.armSpreadDeg = newLayer.armSpreadDeg ?? 0;
        newLayer.color = newLayer.color || '#2563eb';
      }
    }

    this.layers.unshift(newLayer);
    this.selectedLayerId = newLayer.id;
    this.invalidateSimulation();
    return newLayer;
  }

  removeLayer(id) {
    this.layers = this.layers.filter(l => l.id !== id);
    if (this.selectedLayerId === id) {
      this.selectedLayerId = this.layers.length > 0 ? this.layers[0].id : null;
    }
    this.invalidateSimulation();
  }

  // --- NLE TIMELINE EDITING TOOLS (SPLIT, TRIM IN/OUT, DUPLICATE, FIT) ---
  findTargetLayerForEdit(preferredLayerId = null, requireFrameInside = false) {
    const targetId = preferredLayerId || this.selectedLayerId;
    if (targetId) {
      const sel = this.layers.find(l => l.id === targetId);
      if (sel) {
        if (!requireFrameInside || (this.currentFrame > sel.startFrame && this.currentFrame < sel.endFrame)) {
          return sel;
        }
      }
    }
    const actorId = this.activeActorId || 'actor-1';
    if (requireFrameInside) {
      return this.layers.find(l => l.enabled && (l.actorId || 'actor-1') === actorId && this.currentFrame > l.startFrame && this.currentFrame < l.endFrame)
        || this.layers.find(l => l.enabled && this.currentFrame > l.startFrame && this.currentFrame < l.endFrame)
        || null;
    }
    return this.layers.find(l => l.enabled && (l.actorId || 'actor-1') === actorId && this.currentFrame >= l.startFrame && this.currentFrame <= l.endFrame)
      || this.layers.find(l => (l.actorId || 'actor-1') === actorId)
      || this.layers[0]
      || null;
  }

  splitLayerAtFrame(frame = this.currentFrame, layerId = null) {
    const f = Math.round(frame);
    const layer = this.findTargetLayerForEdit(layerId, true);
    if (!layer || f <= layer.startFrame || f >= layer.endFrame) {
      return null;
    }

    const origEnd = layer.endFrame;
    const origStart = layer.startFrame;
    const speed = layer.speed ?? 1.0;
    const baseClipOffset = layer.clipOffset || 0;
    const splitOffsetDelta = Math.round((f - origStart) * speed);

    // 1. Shorten left segment to end at split point
    layer.endFrame = f;

    // 2. Clone right segment starting at split point
    const rightLayer = {
      ...layer,
      id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: layer.name.includes('(Part 2)') ? layer.name : `${layer.name} (Part 2)`,
      startFrame: f,
      endFrame: origEnd,
      clipOffset: baseClipOffset + splitOffsetDelta
    };

    if (layer.type === 'ANIMATION' && layer.animType === 'pose' && !layer.isDenseMocap && Array.isArray(layer.keyframes)) {
      const allKfs = layer.keyframes.map(k => ({
        frame: k.frame,
        rootPos: Array.isArray(k.rootPos) ? [...k.rootPos] : [k.rootPos.x, k.rootPos.y, k.rootPos.z],
        localRotations: JSON.parse(JSON.stringify(k.localRotations || {}))
      }));
      const splitPose = this.samplePoseLayer(layer, f);
      const boundaryKf = splitPose ? {
        frame: f,
        rootPos: [splitPose.rootPos.x, splitPose.rootPos.y, splitPose.rootPos.z],
        localRotations: JSON.parse(JSON.stringify(splitPose.localRotations || {}))
      } : null;

      layer.keyframes = allKfs.filter(k => k.frame <= f);
      if (boundaryKf && !layer.keyframes.some(k => k.frame === f)) {
        layer.keyframes.push(boundaryKf);
      }
      rightLayer.keyframes = allKfs.filter(k => k.frame >= f);
      if (boundaryKf && !rightLayer.keyframes.some(k => k.frame === f)) {
        rightLayer.keyframes.unshift(JSON.parse(JSON.stringify(boundaryKf)));
      }
    }

    const idx = this.layers.findIndex(l => l.id === layer.id);
    if (idx >= 0) {
      this.layers.splice(idx + 1, 0, rightLayer);
    } else {
      this.layers.push(rightLayer);
    }

    this.selectedLayerId = rightLayer.id;
    this.invalidateSimulation();
    return { leftLayer: layer, rightLayer };
  }

  trimLayerStartToFrame(frame = this.currentFrame, layerId = null) {
    const f = Math.round(frame);
    const layer = this.findTargetLayerForEdit(layerId, false);
    if (!layer || f <= layer.startFrame || f >= layer.endFrame) {
      return null;
    }
    const delta = Math.round((f - layer.startFrame) * (layer.speed ?? 1.0));
    layer.clipOffset = (layer.clipOffset || 0) + delta;
    layer.startFrame = f;
    this.selectedLayerId = layer.id;
    this.invalidateSimulation();
    return layer;
  }

  trimLayerEndToFrame(frame = this.currentFrame, layerId = null) {
    const f = Math.round(frame);
    const layer = this.findTargetLayerForEdit(layerId, false);
    if (!layer || f <= layer.startFrame || f >= layer.endFrame) {
      return null;
    }
    layer.endFrame = f;
    this.selectedLayerId = layer.id;
    this.invalidateSimulation();
    return layer;
  }

  duplicateLayer(layerId = null) {
    const layer = this.findTargetLayerForEdit(layerId, false);
    if (!layer) return null;

    const dur = Math.max(5, layer.endFrame - layer.startFrame);
    const sf = layer.endFrame;
    const ef = sf + dur;
    if (ef > this.totalFrames) {
      this.totalFrames = Math.max(this.totalFrames, ef + 10);
    }

    const copy = {
      ...layer,
      id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: layer.name.includes('(Copy)') ? layer.name : `${layer.name} (Copy)`,
      startFrame: sf,
      endFrame: ef
    };

    if (layer.type === 'ANIMATION' && layer.animType === 'pose' && !layer.isDenseMocap && Array.isArray(layer.keyframes)) {
      const shift = sf - layer.startFrame;
      copy.keyframes = layer.keyframes.map(k => ({
        frame: k.frame + shift,
        rootPos: Array.isArray(k.rootPos) ? [...k.rootPos] : [k.rootPos.x, k.rootPos.y, k.rootPos.z],
        localRotations: JSON.parse(JSON.stringify(k.localRotations || {}))
      }));
    }

    const idx = this.layers.findIndex(l => l.id === layer.id);
    if (idx >= 0) {
      this.layers.splice(idx + 1, 0, copy);
    } else {
      this.layers.push(copy);
    }

    this.selectedLayerId = copy.id;
    this.invalidateSimulation();
    return copy;
  }

  fitTimelineToLayers(minFrames = 60, paddingFrames = 20) {
    let maxEnd = 0;
    for (const l of this.layers) {
      if (l.enabled && l.endFrame > maxEnd) {
        maxEnd = l.endFrame;
      }
    }
    this.totalFrames = maxEnd > 0 ? Math.max(minFrames, maxEnd + paddingFrames) : 240;
    if (this.currentFrame > this.totalFrames) {
      this.currentFrame = this.totalFrames;
    }
    this.invalidateSimulation();
    return this.totalFrames;
  }

  setFps(newFps) {
    const valid = Math.max(12, Math.min(240, Math.round(Number(newFps) || 60)));
    if (this.fps !== valid) {
      this.fps = valid;
      this.invalidateSimulation();
    }
    return this.fps;
  }

  // --- ACTIVE POSE & KEYFRAME TRACK METHODS (NATURALMOTION ENDORPHIN 2.7.1) ---
  samplePoseLayer(layer, frame) {
    if (!layer || !layer.keyframes || layer.keyframes.length === 0) {
      return null;
    }

    const kfs = layer.keyframes;

    // Direct O(1) sampling for dense motion capture streams (supports clipOffset & speed)
    if (layer.isDenseMocap) {
      const clipOffset = layer.clipOffset || 0;
      const speed = layer.speed ?? 1.0;
      const relFrame = Math.max(0, Math.min(kfs.length - 1, Math.round((frame - (layer.startFrame || 0)) * speed + clipOffset)));
      const k = kfs[relFrame] || kfs[0];
      const r = Array.isArray(k.rootPos) ? k.rootPos : [k.rootPos.x, k.rootPos.y, k.rootPos.z];
      return {
        rootPos: new THREE.Vector3(r[0], r[1], r[2]),
        localRotations: k.localRotations,
        isDenseMocap: true
      };
    }

    if (kfs.length === 1 || frame <= kfs[0].frame) {
      const k = kfs[0];
      return {
        rootPos: new THREE.Vector3(...(Array.isArray(k.rootPos) ? k.rootPos : [k.rootPos.x, k.rootPos.y, k.rootPos.z])),
        localRotations: JSON.parse(JSON.stringify(k.localRotations || {}))
      };
    }
    const lastK = kfs[kfs.length - 1];
    if (frame >= lastK.frame) {
      return {
        rootPos: new THREE.Vector3(...(Array.isArray(lastK.rootPos) ? lastK.rootPos : [lastK.rootPos.x, lastK.rootPos.y, lastK.rootPos.z])),
        localRotations: JSON.parse(JSON.stringify(lastK.localRotations || {}))
      };
    }

    // Find bounding keyframes k0 and k1
    let k0 = kfs[0];
    let k1 = kfs[1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
        k0 = kfs[i];
        k1 = kfs[i + 1];
        break;
      }
    }

    const span = Math.max(1, k1.frame - k0.frame);
    const t = THREE.MathUtils.clamp((frame - k0.frame) / span, 0, 1);
    const alpha = 3 * t * t - 2 * t * t * t;

    const r0 = Array.isArray(k0.rootPos) ? k0.rootPos : [k0.rootPos.x, k0.rootPos.y, k0.rootPos.z];
    const r1 = Array.isArray(k1.rootPos) ? k1.rootPos : [k1.rootPos.x, k1.rootPos.y, k1.rootPos.z];
    const rootPos = new THREE.Vector3(
      THREE.MathUtils.lerp(r0[0], r1[0], alpha),
      THREE.MathUtils.lerp(r0[1], r1[1], alpha),
      THREE.MathUtils.lerp(r0[2], r1[2], alpha)
    );

    const localRotations = {};
    const allBones = new Set([
      ...Object.keys(k0.localRotations || {}),
      ...Object.keys(k1.localRotations || {})
    ]);

    for (const bone of allBones) {
      const eul0 = k0.localRotations?.[bone] || [0, 0, 0];
      const eul1 = k1.localRotations?.[bone] || [0, 0, 0];
      const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul0));
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul1));
      q0.slerp(q1, alpha);
      const euler = new THREE.Euler().setFromQuaternion(q0);
      localRotations[bone] = [euler.x, euler.y, euler.z];
    }

    return { rootPos, localRotations };
  }

  addPoseKeyframe(actorId, frame, rootPos, localRotations, layerId = null) {
    let layer = layerId ? this.layers.find(l => l.id === layerId) : null;
    if (!layer) {
      layer = this.layers.find(l => (l.actorId || 'actor-1') === actorId && l.type === 'ANIMATION' && l.animType === 'pose');
    }
    if (!layer) {
      layer = this.addLayer({
        actorId: actorId,
        name: 'Active Pose Track',
        type: 'ANIMATION',
        animType: 'pose',
        startFrame: Math.max(0, frame - 10),
        endFrame: Math.min(this.totalFrames, frame + 60),
        blendIn: 5,
        blendOut: 5,
        color: '#a855f7',
        isMotorized: true,
        muscleStiffness: 1.0,
        keyframes: []
      });
    }

    if (!layer.keyframes) layer.keyframes = [];

    const existingIdx = layer.keyframes.findIndex(k => k.frame === frame);
    const rPos = Array.isArray(rootPos) ? rootPos : [rootPos.x, rootPos.y, rootPos.z];
    const newKf = {
      frame,
      rootPos: rPos,
      localRotations: JSON.parse(JSON.stringify(localRotations || {}))
    };

    if (existingIdx >= 0) {
      layer.keyframes[existingIdx] = newKf;
    } else {
      layer.keyframes.push(newKf);
      layer.keyframes.sort((a, b) => a.frame - b.frame);
    }

    if (frame < layer.startFrame) layer.startFrame = Math.max(0, frame);
    if (frame > layer.endFrame) layer.endFrame = Math.min(this.totalFrames, frame);

    this.invalidateSimulation();
    return { layer, keyframe: newKf };
  }

  removePoseKeyframe(layerId, frame) {
    const layer = this.layers.find(l => l.id === layerId);
    if (!layer || !layer.keyframes) return false;
    const initialLen = layer.keyframes.length;
    layer.keyframes = layer.keyframes.filter(k => k.frame !== frame);
    if (layer.keyframes.length !== initialLen) {
      this.invalidateSimulation();
      return true;
    }
    return false;
  }

  getSelectedLayer() {
    return this.layers.find(l => l.id === this.selectedLayerId) || null;
  }

  _resetActorTracking() {
    this.interruptedAnimIds = new Set();
    for (const a of Object.values(this.actors || {})) {
      a.prevPositions = {};
      a.prevQuaternions = {};
      a.simToAnimOffsets = {};
      a.hadKinematicAnimLastFrame = false;
      a.interruptedAnimIds = new Set();
      if (a.character) {
        a.character.constrainedLimbJoints = null;
        a.character.activeConstrainedBones = null;
        if (a.character.bodies && !a.character.isKinematic) {
          for (const b of Object.values(a.character.bodies)) {
            if (b.rigidBody && typeof b.rigidBody.bodyType === 'function' && b.rigidBody.bodyType() !== 0) {
              b.rigidBody.setBodyType(0, true);
            }
          }
        }
      }
    }
  }

  invalidateSimulation() {
    this.isSimulated = false;
    this.simulationCache = [];
    this.prevPositions = {};
    this.prevQuaternions = {};
    if (this.appliedPerturbations) this.appliedPerturbations.clear();
    this.interruptedAnimIds = new Set();
    this.constraintAnchors = {};
    this.hadKinematicAnimLastFrame = false;
    this._resetActorTracking();
    for (const l of this.layers) {
      if (l.type === 'CONSTRAINT') {
        l.isBroken = false;
        l.isEngaged = false;
        l.contactOffset = null;
      }
    }
  }

  // Partial Re-Simulation (Original Endorphin 2.7.1 Green Cache Bar Truncation from Frame N)
  invalidateSimulationFromFrame(startFrame = 0) {
    const f = Math.max(0, Math.floor(startFrame));
    if (f <= 0 || !this.simulationCache || this.simulationCache.length <= f) {
      this.invalidateSimulation();
      return;
    }
    this.simulationCache.length = f;
    this.isSimulated = false;
    if (this.appliedPerturbations) {
      for (const p of this.layers) {
        if (p.type === 'PERTURBATION' && p.startFrame >= f) {
          this.appliedPerturbations.delete(p.id);
        }
      }
    }
    for (const a of Object.values(this.actors || {})) {
      if (a.interruptedAnimIds) {
        for (const l of this.layers) {
          if (l.type === 'ANIMATION' && l.startFrame >= f) {
            a.interruptedAnimIds.delete(l.id);
          }
        }
      }
    }
    for (const l of this.layers) {
      if (l.startFrame >= f) {
        if (l.type === 'CONSTRAINT') {
          l.isBroken = false;
          l.isEngaged = false;
          l.contactOffset = null;
          if (this.constraintAnchors) delete this.constraintAnchors[l.id];
        }
        if (l.triggerType && l.triggerType !== 'frame' && l.triggeredAtFrame !== null && l.triggeredAtFrame >= f) {
          l.isTriggered = false;
          l.triggeredAtFrame = null;
        }
      }
    }
  }

  // --- COMPREHENSIVE RESIMULATION & STATE RESET ---
  resetSimulation() {
    this.currentFrame = 0;
    this.simulationCache = [];
    this.prevPositions = {};
    this.prevQuaternions = {};
    if (this.appliedPerturbations) this.appliedPerturbations.clear();
    this.constraintAnchors = {};
    this.hadKinematicAnimLastFrame = false;
    this.isSimulated = false;
    this.isBakingLive = false;
    this.isPlaying = false;
    this._resetActorTracking();

    const actorList = Object.values(this.actors);
    const actors = actorList.length > 0
      ? actorList
      : [{ character: this.character, dmsEngine: this.dmsEngine }];
    for (const a of actors) {
      if (a.character) {
        if (a.character.balanceControlEnabled && typeof a.character.resetToNaturalStance === 'function') {
          a.character.resetToNaturalStance();
        } else {
          a.character.resetToTPose();
        }
        if (a.character.sensors) a.character.sensors.reset();
        if (a.character.dynamicBalance) a.character.dynamicBalance.reset();
      }
      if (a.dmsEngine) a.dmsEngine.reset();
    }

    if (this.propsManager && typeof this.propsManager.reset === 'function') {
      this.propsManager.reset();
    }

    for (const l of this.layers) {
      l.isTriggered = false;
      l.triggeredAtFrame = null;
      l.isGrabCoupled = false;
      if (l.type === 'CONSTRAINT') {
        l.isEngaged = false;
        l.isBroken = false;
        l.contactOffset = null;
      }
    }
  }

  // --- BIOMECHANICAL HUMAN LOCOMOTION ENGINE (MULTI-GAIT FOURIER KINEMATICS) ---
  // Note: Returns rootPos in character-local space (around 0, 0.94, z);
  // BiomechanicalCharacter.applyForwardKinematics applies spawnYaw & spawnOffset.
  sampleWalkCycle(frame, speed = 1.0, intensity = 1.0, gaitStyle = 'walk') {
    const t = (frame / this.fps) * Math.max(0.1, speed);
    const amp = THREE.MathUtils.clamp(intensity, 0.1, 2.5);

    let omega = 5.8;
    let baseVel = 1.35;
    let baseHeight = 0.942;
    let bounceAmp = 0.022;
    let swayAmp = 0.026;
    let hipSwingAmp = 0.36;
    let kneeYieldAmp = 0.22;
    let kneeSwingAmp = 0.96;
    let armSwingAmp = 0.38;
    let forwardLean = 0.048;
    let baseKneeBend = 0.10;
    let elbowBaseBend = 0.32;

    if (gaitStyle === 'jog') {
      omega = 8.6;
      baseVel = 2.85;
      baseHeight = 0.930;
      bounceAmp = 0.046;
      swayAmp = 0.034;
      hipSwingAmp = 0.54;
      kneeYieldAmp = 0.30;
      kneeSwingAmp = 1.42;
      armSwingAmp = 0.65;
      forwardLean = 0.155;
      baseKneeBend = 0.14;
      elbowBaseBend = 0.85;
    } else if (gaitStyle === 'stalk') {
      omega = 4.2;
      baseVel = 0.68;
      baseHeight = 0.825;
      bounceAmp = 0.008;
      swayAmp = 0.038;
      hipSwingAmp = 0.28;
      kneeYieldAmp = 0.20;
      kneeSwingAmp = 1.15;
      armSwingAmp = 0.18;
      forwardLean = 0.180;
      baseKneeBend = 0.44;
      elbowBaseBend = 0.40;
    } else if (gaitStyle === 'limp') {
      omega = 5.2;
      baseVel = 0.95;
      baseHeight = 0.925;
      bounceAmp = 0.028;
      swayAmp = 0.045;
      hipSwingAmp = 0.32;
      kneeYieldAmp = 0.24;
      kneeSwingAmp = 0.85;
      armSwingAmp = 0.25;
      forwardLean = 0.060;
      baseKneeBend = 0.12;
      elbowBaseBend = 0.32;
    }

    const walkVel = baseVel * Math.min(2.0, Math.max(0.4, amp));
    const phase = t * omega;

    let phiL = phase % (2 * Math.PI);
    let phiR = (phase + Math.PI) % (2 * Math.PI);
    if (gaitStyle === 'limp') {
      const pMod = phase % (2 * Math.PI);
      if (pMod < Math.PI * 0.7) {
        phiL = (pMod / 0.7);
        phiR = phiL + Math.PI;
      } else {
        const u = (pMod - Math.PI * 0.7) / 1.3;
        phiL = Math.PI + u * Math.PI;
        phiR = u * Math.PI;
      }
    }

    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const c2 = Math.cos(2 * phase);

    const rootPos = new THREE.Vector3(
      (swayAmp * s * amp) + (gaitStyle === 'limp' ? 0.035 * amp : 0),
      baseHeight - (bounceAmp * c2 * amp),
      t * walkVel
    );

    const calcLegKinematics = (phi, isLeft) => {
      const normPhi = ((phi % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      const isStance = normPhi < Math.PI;
      const hipFlexion = (-hipSwingAmp * Math.cos(normPhi) - 0.04) * amp;

      let kneeFlexion = baseKneeBend;
      if (isStance) {
        const u = normPhi / Math.PI;
        kneeFlexion += (kneeYieldAmp * Math.pow(Math.sin(Math.PI * u), 1.6)) * amp;
      } else {
        const u = (normPhi - Math.PI) / Math.PI;
        kneeFlexion += (kneeSwingAmp * Math.pow(Math.sin(Math.PI * u), 1.4)) * amp;
      }

      let ankleFlexion = 0;
      if (isStance) {
        ankleFlexion = (-0.20 * Math.cos(normPhi) + 0.16 * Math.sin(normPhi)) * amp;
      } else {
        ankleFlexion = (-0.18 * Math.sin(normPhi - Math.PI)) * amp;
      }

      const hipAdduction = isLeft ? (-0.025 * Math.cos(normPhi) * amp) : (0.025 * Math.cos(normPhi) * amp);
      return { hipFlexion, kneeFlexion, ankleFlexion, hipAdduction };
    };

    const leftLeg = calcLegKinematics(phiL, true);
    const rightLeg = calcLegKinematics(phiR, false);

    const pelvisYaw = -0.088 * s * amp;
    const pelvisRoll = 0.038 * c * amp + (gaitStyle === 'limp' ? 0.06 * amp : 0);
    const spineCounterYaw = 0.065 * s * amp;
    const spineCounterRoll = -0.025 * c * amp - (gaitStyle === 'limp' ? 0.05 * amp : 0);

    const armL_swing = armSwingAmp * Math.cos(phiL) * amp;
    const armR_swing = armSwingAmp * Math.cos(phiR) * amp;

    const localRotations = {
      Pelvis: [forwardLean * amp, pelvisYaw, pelvisRoll],
      LowerSpine: [0.04 * amp, spineCounterYaw * 0.7, spineCounterRoll * 0.7],
      UpperSpine: [0.05 * amp, spineCounterYaw, spineCounterRoll],
      Neck: [-0.04 * amp, -0.03 * s * amp, 0.015 * c * amp],
      Head: [-0.03 * amp, -0.02 * s * amp, 0],

      LeftThigh: [leftLeg.hipFlexion, 0, leftLeg.hipAdduction],
      LeftCalf: [leftLeg.kneeFlexion, 0, 0],
      LeftFoot: [leftLeg.ankleFlexion, 0, 0],

      RightThigh: [rightLeg.hipFlexion, 0, rightLeg.hipAdduction],
      RightCalf: [rightLeg.kneeFlexion, 0, 0],
      RightFoot: [rightLeg.ankleFlexion, 0, 0],

      LeftShoulder: [0, -0.03 * s * amp, -0.06],
      LeftUpperArm: [0.03 * c, -armL_swing, -1.25],
      LeftForearm: [0, -elbowBaseBend - (0.35 * Math.max(0, -Math.cos(phiL)) * amp), 0],
      LeftHand: [0, 0, -0.08],

      RightShoulder: [0, -0.03 * s * amp, 0.06],
      RightUpperArm: [-0.03 * c, -armR_swing, 1.25],
      RightForearm: [0, elbowBaseBend + (0.35 * Math.max(0, -Math.cos(phiR)) * amp), 0],
      RightHand: [0, 0, 0.08]
    };

    if (gaitStyle === 'limp') {
      localRotations.LeftUpperArm = [0.1, 0.15, -0.95];
      localRotations.LeftForearm = [0, -0.85, 0];
    }

    return { rootPos, localRotations, walkVel };
  }

  // --- SAMPLE RETARGETED CUSTOM ANIMATION CLIP (MIXAMO FBX / GLB / GLTF / BVH) ---
  sampleRetargetedClip(layer, localFrame) {
    const clip = this.customAnimations.get(layer.clipId);
    if (!clip || !clip.frames || clip.frames.length === 0) {
      return this.sampleWalkCycle(localFrame, layer.speed ?? 1.0, layer.intensity ?? 1.0, layer.gaitStyle || 'walk');
    }

    const numFrames = clip.frames.length;
    const maxIdx = Math.max(1, numFrames - 1);
    const speed = Math.max(0.05, layer.speed ?? 1.0);
    const intensity = THREE.MathUtils.clamp(layer.intensity ?? 1.0, 0.0, 2.0);
    const isLoop = layer.loop !== false;
    const inPlace = Boolean(layer.inPlace);

    const rawFrame = Math.max(0, localFrame * speed + (layer.clipOffset || 0));
    let loopCycleCount = 0;
    let fPos = rawFrame;

    if (isLoop && maxIdx > 0) {
      loopCycleCount = Math.floor(rawFrame / maxIdx);
      fPos = rawFrame % maxIdx;
    } else {
      fPos = Math.min(rawFrame, maxIdx);
    }

    const idx0 = Math.min(Math.floor(fPos), maxIdx);
    const idx1 = Math.min(idx0 + 1, maxIdx);
    const alpha = fPos - idx0;

    const frameA = clip.frames[idx0];
    const frameB = clip.frames[idx1] || frameA;

    const qA = new THREE.Quaternion();
    const qB = new THREE.Quaternion();
    const qId = new THREE.Quaternion();
    const eul = new THREE.Euler(0, 0, 0, 'XYZ');
    const localRotations = {};

    const bridgeArm = this.characterBridge?.calibration?.armSpreadOffsetDeg || 0;
    const totalArmSpread = (layer.armSpreadDeg || 0) + bridgeArm;
    const armSpreadRad = THREE.MathUtils.degToRad(totalArmSpread);

    const bridgeThigh = this.characterBridge?.calibration?.thighClearanceDeg || 0;
    const totalThighSpread = (layer.thighSpreadDeg || 0) + bridgeThigh;
    const thighSpreadRad = THREE.MathUtils.degToRad(totalThighSpread);

    const yawRad = THREE.MathUtils.degToRad(layer.yawOffsetDeg || 0);

    for (const segName of Object.keys(SKELETON_TREE)) {
      const qaArr = frameA.localQuaternions?.[segName];
      const qbArr = frameB.localQuaternions?.[segName];

      if (qaArr && qbArr) {
        qA.set(qaArr[0], qaArr[1], qaArr[2], qaArr[3]);
        qB.set(qbArr[0], qbArr[1], qbArr[2], qbArr[3]);
        qA.slerp(qB, alpha);

        if (Math.abs(intensity - 1.0) > 0.01) {
          if (intensity <= 1.0) {
            qId.set(0, 0, 0, 1);
            qA.copy(qId.slerp(qA, intensity));
          } else {
            eul.setFromQuaternion(qA, 'XYZ');
            qA.setFromEuler(new THREE.Euler(eul.x * intensity, eul.y * intensity, eul.z * intensity, 'XYZ'));
          }
        }

        if (segName === 'Pelvis' && Math.abs(yawRad) > 1e-4) {
          const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
          qA.premultiply(qYaw);
        }

        if (Math.abs(armSpreadRad) > 1e-4 && (segName === 'LeftUpperArm' || segName === 'RightUpperArm')) {
          const sign = segName === 'LeftUpperArm' ? -1 : 1;
          const qSpread = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), armSpreadRad * sign);
          qA.multiply(qSpread);
        }

        if (Math.abs(thighSpreadRad) > 1e-4 && (segName === 'LeftThigh' || segName === 'RightThigh')) {
          const sign = segName === 'LeftThigh' ? 1 : -1;
          const qSpread = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), thighSpreadRad * sign);
          qA.multiply(qSpread);
        }

        eul.setFromQuaternion(qA, 'XYZ');
        localRotations[segName] = [eul.x, eul.y, eul.z];
      } else {
        const ra = frameA.localRotations?.[segName] || [0, 0, 0];
        const rb = frameB.localRotations?.[segName] || ra;
        localRotations[segName] = [
          (ra[0] + (rb[0] - ra[0]) * alpha) * intensity,
          (ra[1] + (rb[1] - ra[1]) * alpha) * intensity,
          (ra[2] + (rb[2] - ra[2]) * alpha) * intensity
        ];
      }
    }

    const offA = frameA.rootOffset || [0, 0, 0];
    const offB = frameB.rootOffset || offA;
    let dx = offA[0] + (offB[0] - offA[0]) * alpha;
    const dy = (offA[1] + (offB[1] - offA[1]) * alpha) * Math.min(intensity, 1.25);
    let dz = offA[2] + (offB[2] - offA[2]) * alpha;

    if (!inPlace && loopCycleCount > 0) {
      const firstOff = clip.frames[0].rootOffset || [0, 0, 0];
      const lastOff = clip.frames[maxIdx].rootOffset || [0, 0, 0];
      dx += loopCycleCount * (lastOff[0] - firstOff[0]);
      dz += loopCycleCount * (lastOff[2] - firstOff[2]);
    }

    if (inPlace) {
      dx = 0;
      dz = 0;
    } else if (Math.abs(yawRad) > 1e-4) {
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const rdx = dx * cosY + dz * sinY;
      const rdz = -dx * sinY + dz * cosY;
      dx = rdx;
      dz = rdz;
    }

    const rootPos = new THREE.Vector3(
      dx,
      Math.max(0.15, 0.95 + dy),
      dz
    );

    const walkVel = inPlace ? 0 : (clip.avgRootSpeed || 1.35) * speed;
    return { rootPos, localRotations, walkVel };
  }

  // --- UNIFIED ANIMATION LAYER SAMPLER (POSE TRACKS + RETARGETED CLIPS + PROCEDURAL GAITS) ---
  sampleAnimationLayer(layer, localFrame, absFrame = null) {
    if (!layer) {
      return { rootPos: new THREE.Vector3(0, 0.95, 0), localRotations: {}, walkVel: 0 };
    }

    if (layer.animType === 'pose' || (Array.isArray(layer.keyframes) && layer.keyframes.length > 0)) {
      const f = absFrame !== null ? absFrame : ((layer.startFrame || 0) + localFrame);
      const poseSample = this.samplePoseLayer(layer, f);
      if (poseSample) {
        return { ...poseSample, walkVel: 0 };
      }
    }

    if (layer.clipId && this.customAnimations.has(layer.clipId)) {
      return this.sampleRetargetedClip(layer, localFrame);
    }

    const sample = this.sampleWalkCycle(
      localFrame + (layer.clipOffset || 0),
      layer.speed ?? 1.0,
      layer.intensity ?? 1.0,
      layer.gaitStyle || 'walk'
    );

    if (layer.inPlace) {
      sample.rootPos.x = 0;
      sample.rootPos.z = 0;
      sample.walkVel = 0;
    } else if (layer.yawOffsetDeg && Math.abs(layer.yawOffsetDeg) > 0.1) {
      const yawRad = THREE.MathUtils.degToRad(layer.yawOffsetDeg);
      const dx = sample.rootPos.x;
      const dz = sample.rootPos.z;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      sample.rootPos.x = dx * cosY + dz * sinY;
      sample.rootPos.z = -dx * sinY + dz * cosY;
      if (sample.localRotations.Pelvis) {
        sample.localRotations.Pelvis[1] += yawRad;
      }
    }

    const bridgeArm = this.characterBridge?.calibration?.armSpreadOffsetDeg || 0;
    const totalArmSpread = (layer.armSpreadDeg || 0) + bridgeArm;
    if (Math.abs(totalArmSpread) > 0.1) {
      const spreadRad = THREE.MathUtils.degToRad(totalArmSpread);
      if (sample.localRotations.LeftUpperArm) {
        sample.localRotations.LeftUpperArm[2] += spreadRad;
      }
      if (sample.localRotations.RightUpperArm) {
        sample.localRotations.RightUpperArm[2] -= spreadRad;
      }
    }

    const bridgeThigh = this.characterBridge?.calibration?.thighClearanceDeg || 0;
    const totalThighSpread = (layer.thighSpreadDeg || 0) + bridgeThigh;
    if (Math.abs(totalThighSpread) > 0.1) {
      const thighSpreadRad = THREE.MathUtils.degToRad(totalThighSpread);
      if (sample.localRotations.LeftThigh) {
        sample.localRotations.LeftThigh[2] += thighSpreadRad;
      }
      if (sample.localRotations.RightThigh) {
        sample.localRotations.RightThigh[2] -= thighSpreadRad;
      }
    }

    return sample;
  }

  // --- ENDORPHIN EVENT-DRIVEN REACTIVE TRIGGER & CONDITION SOLVER ---
  isLayerActiveAtFrame(l, f, actor) {
    if (!l.enabled) return false;
    const layerActorId = l.actorId || 'actor-1';
    if (layerActorId !== actor.id) return false;

    // Standard fixed-time timeline window
    if (!l.triggerType || l.triggerType === 'frame') {
      return f >= l.startFrame && f <= l.endFrame;
    }

    // Event-driven reactive trigger (impact, proximity, loss_of_balance, ground_contact)
    if (l.isTriggered && l.triggeredAtFrame !== null) {
      const dur = l.durationFrames || Math.max(15, l.endFrame - l.startFrame);
      return f >= l.triggeredAtFrame && f <= (l.triggeredAtFrame + dur);
    }

    return false;
  }

  evaluateLayerTriggers(actor, f) {
    const actorId = actor.id;
    const char = actor.character;
    if (!char) return;

    for (const l of this.layers) {
      if (!l.enabled) continue;
      if ((l.actorId || 'actor-1') !== actorId) continue;
      if (!l.triggerType || l.triggerType === 'frame' || l.isTriggered) continue;

      // Allow trigger monitoring starting at defined startFrame window (or frame 0)
      if (f < (l.startFrame || 0)) continue;

      let triggered = false;
      const thresh = l.triggerThreshold ?? 35.0;

      switch (l.triggerType) {
        case 'impact': {
          const hasImpact = (char.impactShockTimer && char.impactShockTimer > 0.05);
          const hasFallVelocity = (char.sensors && Math.abs(char.sensors.verticalVelocity) > 1.8);
          const activeHit = this.layers.some(p => p.enabled && p.type === 'PERTURBATION' && (p.actorId || 'actor-1') === actorId && f >= p.startFrame && f <= p.endFrame && (p.magnitude || 0) >= thresh * 0.6);
          triggered = Boolean(hasImpact || activeHit || hasFallVelocity);
          break;
        }
        case 'proximity': {
          let targetPos = null;
          const otherActorId = actorId === 'actor-1' ? 'actor-2' : 'actor-1';
          const otherActor = this.actors[otherActorId];
          if (otherActor?.character?.bodies?.['Pelvis']?.rigidBody) {
            const tr = otherActor.character.bodies['Pelvis'].rigidBody.translation();
            targetPos = new THREE.Vector3(tr.x, tr.y, tr.z);
          } else if (l.targetProp && this.propsManager) {
            const p = this.propsManager.getPropById(l.targetProp);
            if (p?.mesh) targetPos = p.mesh.position;
          }

          if (targetPos && char.bodies?.['Pelvis']?.rigidBody) {
            const pTr = char.bodies['Pelvis'].rigidBody.translation();
            const curPos = new THREE.Vector3(pTr.x, pTr.y, pTr.z);
            const dist = curPos.distanceTo(targetPos);
            triggered = dist <= Math.max(0.2, thresh);
          }
          break;
        }
        case 'loss_of_balance': {
          const isLOB = Boolean(char.isLossOfBalance);
          const tilt = char.sensors?.tiltAngle || 0;
          triggered = isLOB || (tilt >= thresh);
          break;
        }
        case 'ground_contact': {
          triggered = Boolean(char.sensors?.bodyGrounded || (char.sensors?.handsGrounded && f > 5));
          break;
        }
      }

      if (triggered) {
        l.isTriggered = true;
        l.triggeredAtFrame = f;
      }
    }
  }

  // --- DYNAMIC TWO-WAY MUTUAL CONTACT & GRAB CONSTRAINTS (TACKLE / GRACTION COUPLING) ---
  enforceDynamicTwoWayGrabs(f) {
    for (const l of this.layers) {
      if (!l.enabled || !l.grabTarget || l.grabTarget === 'none') continue;
      const grabberActor = this.actors[l.actorId || 'actor-1'];
      const targetActor = this.actors[l.grabTarget];
      if (!grabberActor?.character || !targetActor?.character) continue;

      const gChar = grabberActor.character;
      const tChar = targetActor.character;

      // Active during the behavior duration
      const isActive = this.isLayerActiveAtFrame(l, f, grabberActor);
      if (!isActive) {
        l.isGrabCoupled = false;
        continue;
      }

      const targetPart = l.grabBodyPart || 'Pelvis';
      const tBody = tChar.bodies[targetPart];
      if (!tBody?.rigidBody) continue;

      const lHand = gChar.bodies['LeftHand'];
      const rHand = gChar.bodies['RightHand'];
      const hands = [lHand, rHand].filter(h => h && h.rigidBody);
      if (hands.length === 0) continue;

      const tPos = tBody.rigidBody.translation();
      const tVec = new THREE.Vector3(tPos.x, tPos.y, tPos.z);
      const tVel = tBody.rigidBody.linvel();

      for (const h of hands) {
        const hPos = h.rigidBody.translation();
        const hVec = new THREE.Vector3(hPos.x, hPos.y, hPos.z);
        const dist = hVec.distanceTo(tVec);

        // Contact proximity trigger for grab (< 0.45m)
        if (dist <= 0.45 || l.isGrabCoupled) {
          l.isGrabCoupled = true;
          const hVel = h.rigidBody.linvel();

          // Calculate spring-damper coupling force
          const deltaPos = new THREE.Vector3().subVectors(tVec, hVec);
          const deltaVel = new THREE.Vector3(tVel.x - hVel.x, tVel.y - hVel.y, tVel.z - hVel.z);

          const stiffness = 850.0;
          const damping = 45.0;
          const force = deltaPos.multiplyScalar(stiffness).sub(deltaVel.multiplyScalar(damping));
          const forceMag = force.length();

          // Check break force limit
          const breakLimit = l.grabBreakForce ?? 450.0;
          if (forceMag > breakLimit && dist > 0.48) {
            l.isGrabCoupled = false;
            continue;
          }

          // Apply mutual action-reaction impulse transfer
          const dt = (1 / this.fps) / (this.substeps || 2);
          const impulse = force.multiplyScalar(dt);
          impulse.clampLength(0, 15.0);

          // Hero pulls toward target, Target gets pulled by Hero
          h.rigidBody.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
          tBody.rigidBody.applyImpulse({ x: -impulse.x, y: -impulse.y, z: -impulse.z }, true);
        }
      }
    }
  }

  // --- STEP A SINGLE SIMULATION FRAME (FOR LIVE BAKING & RENDERING) ---
  stepSingleSimulationFrame(f, stepPhysicsFn) {
    const substeps = this.substeps || 2;
    const dt = (1 / this.fps) / substeps;
    const actorList = Object.values(this.actors);
    const actorsToStep = actorList.length > 0 ? actorList : [{
      id: 'actor-1',
      character: this.character,
      dmsEngine: this.dmsEngine,
      hadKinematicAnimLastFrame: this.hadKinematicAnimLastFrame,
      prevPositions: this.prevPositions,
      prevQuaternions: this.prevQuaternions
    }];

    for (let s = 0; s < substeps; s++) {
      for (const actor of actorsToStep) {
        this.stepActorFrame(actor, f, dt, s);
      }

      // Dynamic Two-Way Contact Constraints (Hero & Enemy Tackles/Grabs)
      this.enforceDynamicTwoWayGrabs(f);

      if (typeof stepPhysicsFn === 'function') {
        stepPhysicsFn(dt);
      }

      // Post-step solid pin adherence across all actors
      for (const actor of actorsToStep) {
        this.enforcePostStepConstraints(actor, f);
      }
    }

    // Synchronize visual meshes for real-time live simulation rendering
    for (const actor of actorsToStep) {
      if (actor.character && actor.character.bodies) {
        for (const [name, b] of Object.entries(actor.character.bodies)) {
          const tr = b.rigidBody.translation();
          const rot = b.rigidBody.rotation();
          if (b.mesh) {
            b.mesh.position.set(tr.x, tr.y, tr.z);
            b.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
          }
        }
      }
      const bridge = actor.mixamoBridge || (actor.id === 'actor-1' ? this.characterBridge : null);
      if (bridge && bridge.isVisible) {
        bridge.update();
      }
    }

    // Save mathematical keyframe data for all actors & props
    const frameData = {
      frame: f,
      time: f / this.fps,
      bodies: {},
      actors: {},
      props: {},
      constraints: {}
    };

    const actorsToRecord = actorList.length > 0 ? actorList : [{ id: 'actor-1', character: this.character }];

    for (const actor of actorsToRecord) {
      frameData.actors[actor.id] = { bodies: {} };
      if (actor.character && actor.character.bodies) {
        for (const [name, b] of Object.entries(actor.character.bodies)) {
          const tr = b.rigidBody.translation();
          const rot = b.rigidBody.rotation();
          frameData.actors[actor.id].bodies[name] = {
            position: [tr.x, tr.y, tr.z],
            rotation: [rot.x, rot.y, rot.z, rot.w]
          };
          if (actor.id === 'actor-1') {
            frameData.bodies[name] = frameData.actors[actor.id].bodies[name];
          }
        }
      }
    }

    if (this.propsManager && this.propsManager.props) {
      for (const p of this.propsManager.props) {
        if (p.rigidBody) {
          const tr = p.rigidBody.translation();
          const rot = p.rigidBody.rotation();
          frameData.props[p.id] = {
            position: [tr.x, tr.y, tr.z],
            rotation: [rot.x, rot.y, rot.z, rot.w]
          };
        }
      }
    }
    const activeConstraints = this.layers.filter(l => l.enabled && l.type === 'CONSTRAINT' && f >= l.startFrame && f <= l.endFrame);
    for (const c of activeConstraints) {
      frameData.constraints[c.id] = {
        isEngaged: c.isEngaged,
        isBroken: c.isBroken
      };
    }

    // Record Event-Driven Reactive Trigger states into cache
    frameData.layerTriggers = {};
    for (const l of this.layers) {
      if (l.isTriggered && l.triggeredAtFrame !== null) {
        frameData.layerTriggers[l.id] = l.triggeredAtFrame;
      }
    }

    this.simulationCache[f] = frameData;
  }

  stepActorFrame(actor, f, dt, substepIdx = 0) {
    const actorId = actor.id;
    const char = actor.character;
    const dms = actor.dmsEngine;
    if (!char || !dms) return;

    // Evaluate dynamic event-driven triggers (impact, proximity, balance loss, ground contact)
    if (substepIdx === 0) {
      this.evaluateLayerTriggers(actor, f);
    }

    const activeAnim = this.layers.find(l => l.type === 'ANIMATION' && this.isLayerActiveAtFrame(l, f, actor));
    const activePerturbations = this.layers.filter(l => l.type === 'PERTURBATION' && this.isLayerActiveAtFrame(l, f, actor));
    const activeBehaviors = this.layers.filter(l => l.type === 'BEHAVIOR' && this.isLayerActiveAtFrame(l, f, actor));
    const activeConstraints = this.layers.filter(l => l.type === 'CONSTRAINT' && this.isLayerActiveAtFrame(l, f, actor));
    const activePoses = this.layers.filter(l => l.type === 'ACTIVE_POSE' && this.isLayerActiveAtFrame(l, f, actor));

    if (!actor.interruptedAnimIds) actor.interruptedAnimIds = new Set();
    const isAnimInterrupted = Boolean(activeAnim && actor.interruptedAnimIds.has(activeAnim.id));
    const forceHitActive = activePerturbations.length > 0;
    if (forceHitActive && activeAnim) {
      actor.interruptedAnimIds.add(activeAnim.id);
    }

    const rawAnimWeight = (activeAnim && !isAnimInterrupted) ? TimelineEngine.computeLayerWeight(activeAnim, f) : 0;

    // When no behavior or constraint is actively blending over the animation and no force has struck,
    // let kinematic animation run cleanly through its entire duration (f <= activeAnim.endFrame),
    // rather than letting blendOut prematurely abandon kinematic mode and dump momentum into a ragdoll fling.
    const isKinematicCleanRun = activeAnim && !isAnimInterrupted && activeBehaviors.length === 0 && !forceHitActive && activeConstraints.length === 0;
    const animWeight = (forceHitActive || isAnimInterrupted) ? 0.0 : (isKinematicCleanRun ? 1.0 : rawAnimWeight);

    const isPoseTrack = Boolean(activeAnim && !isAnimInterrupted && (activeAnim.animType === 'pose' || (Array.isArray(activeAnim.keyframes) && activeAnim.keyframes.length > 0)));

    if (animWeight >= 0.999 && isPoseTrack && activeAnim.isMotorized !== false && activeBehaviors.length === 0 && !forceHitActive) {
      // 1A. ENDORPHIN ACTIVE MOTORIZED POSE (DYNAMIC PHYSICS WITH JOINT TORQUES STRIVING TO POSE)
      if (char.isKinematic) {
        char.setDynamicMode(true);
      }
      actor.hadKinematicAnimLastFrame = false;
      const poseSample = this.samplePoseLayer(activeAnim, f);
      if (poseSample) {
        for (const j of char.joints) {
          const rot = poseSample.localRotations[j.childName];
          if (rot) {
            j.targetAngle.set(rot[0], rot[1], rot[2]);
          }
        }
        char.muscleStiffness = 300.0 * (activeAnim.muscleStiffness ?? 1.0);
        char.isPureRagdoll = false;
      }
      char.update(dt);
    } else if (animWeight >= 0.999 && activeAnim && (!isPoseTrack || !activeAnim.isMotorized)) {
      // 1B. PURE KINEMATIC ANIMATION (Procedural Gait, Retargeted Clip, or Non-Motorized Pose Track)
      const sample = this.sampleAnimationLayer(activeAnim, f - activeAnim.startFrame, f);

      // Endorphin 2.7.1 Sim-to-Anim Root Matching (seamless continuation from simulated Pelvis horizontal root)
      if (!actor.simToAnimOffsets) actor.simToAnimOffsets = {};
      if (activeAnim.startFrame > 0 && activeAnim.matchSimulatedRoot !== false) {
        if (!actor.hadKinematicAnimLastFrame && !actor.simToAnimOffsets[activeAnim.id]) {
          const pelvisBody = char.bodies?.['Pelvis'];
          if (pelvisBody && pelvisBody.rigidBody) {
            const pTr = pelvisBody.rigidBody.translation();
            const spawnOff = char.spawnOffset || { x: 0, y: 0, z: 0 };
            const yaw = char.spawnYaw || 0;
            const worldDx = pTr.x - spawnOff.x;
            const worldDz = pTr.z - spawnOff.z;
            const cosY = Math.cos(-yaw);
            const sinY = Math.sin(-yaw);
            const localPelvisX = worldDx * cosY - worldDz * sinY;
            const localPelvisZ = worldDx * sinY + worldDz * cosY;
            actor.simToAnimOffsets[activeAnim.id] = {
              x: localPelvisX - sample.rootPos.x,
              z: localPelvisZ - sample.rootPos.z
            };
          }
        }
        const off = actor.simToAnimOffsets[activeAnim.id];
        if (off) {
          sample.rootPos.x += off.x;
          sample.rootPos.z += off.z;
        }
      }

      actor.hadKinematicAnimLastFrame = true;
      char.setDynamicMode(false);

      if (substepIdx === 0) {
        for (const [name, b] of Object.entries(char.bodies)) {
          const t = b.rigidBody.translation();
          const r = b.rigidBody.rotation();
          actor.prevPositions[name] = new THREE.Vector3(t.x, t.y, t.z);
          actor.prevQuaternions[name] = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        }
      }

      char.applyForwardKinematics(sample.rootPos, sample.localRotations);
    } else {
      // 2. DYNAMIC PHYSICS & BEHAVIOR SIMULATION (with Endorphin-grade smooth transition crossfading)
      if (char.isKinematic) {
        char.setDynamicMode(true);
        const invDt = this.fps;

        // Simulation Takeover Settings from the cut/past animation layer
        const animLayers = this.layers.filter(l => l.enabled && l.type === 'ANIMATION' && (l.actorId || 'actor-1') === actorId);
        const cutAnim = animLayers.filter(l => l.endFrame <= f).sort((a, b) => b.endFrame - a.endFrame)[0];
        const takeoverMode = cutAnim?.simTakeoverMode || 'active_hold';
        const velMultiplier = cutAnim?.velocityCarry ?? 1.0;

        for (const [name, b] of Object.entries(char.bodies)) {
          if (actor.hadKinematicAnimLastFrame && actor.prevPositions[name]) {
            if (takeoverMode === 'freeze') {
              // Stationary in-place physics: cancel linear and angular velocity at cut point
              b.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
              b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
              continue;
            }

            const curPos = b.rigidBody.translation();
            const p = actor.prevPositions[name];
            const linVel = new THREE.Vector3(curPos.x - p.x, curPos.y - p.y, curPos.z - p.z).multiplyScalar(invDt * velMultiplier);
            // Endorphin True Inertial Momentum Carry (unclamped up to 16.0 m/s for full athletic jumps/sprints)
            const maxSpeed = forceHitActive ? 1.5 : 16.0;
            if (forceHitActive) linVel.multiplyScalar(0.4);
            linVel.clampLength(0, maxSpeed);
            b.rigidBody.setLinvel({ x: linVel.x, y: linVel.y, z: linVel.z }, true);

            if (actor.prevQuaternions[name]) {
              const curRot = b.rigidBody.rotation();
              const qCur = new THREE.Quaternion(curRot.x, curRot.y, curRot.z, curRot.w);
              const qDiff = qCur.multiply(actor.prevQuaternions[name].clone().invert());
              if (qDiff.w < 0) {
                qDiff.x = -qDiff.x; qDiff.y = -qDiff.y; qDiff.z = -qDiff.z; qDiff.w = -qDiff.w;
              }
              const angle = 2 * Math.acos(Math.min(1, Math.max(-1, qDiff.w)));
              const s = Math.sqrt(Math.max(0, 1 - qDiff.w * qDiff.w));
              if (s > 0.001 && angle > 0.001) {
                const angVel = new THREE.Vector3(qDiff.x / s, qDiff.y / s, qDiff.z / s).multiplyScalar(angle * invDt * velMultiplier);
                const maxAngSpeed = forceHitActive ? 3.0 : 12.0;
                if (forceHitActive) angVel.multiplyScalar(0.5);
                angVel.clampLength(0, maxAngSpeed);
                b.rigidBody.setAngvel({ x: angVel.x, y: angVel.y, z: angVel.z }, true);
              } else {
                b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
              }
            } else {
              b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
            }
          } else {
            b.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
      }
      actor.hadKinematicAnimLastFrame = false;

      // Prepare base rotations for behaviors to blend over or take over from
      let baseRotations = null;
      if (activeAnim) {
        const animSample = this.sampleAnimationLayer(activeAnim, f - activeAnim.startFrame, f);
        if (animSample) baseRotations = animSample.localRotations;
      } else {
        const animLayers = this.layers.filter(l => l.enabled && l.type === 'ANIMATION' && (l.actorId || 'actor-1') === actorId);
        const pastAnim = animLayers.filter(l => l.endFrame <= f).sort((a, b) => b.endFrame - a.endFrame)[0];
        if (pastAnim) {
          const lastSample = this.sampleAnimationLayer(pastAnim, pastAnim.endFrame - pastAnim.startFrame, pastAnim.endFrame);
          if (lastSample) baseRotations = lastSample.localRotations;
        }
      }
      dms.baseRotations = baseRotations;

      // Sync active behavior flags, Hermite blend weights, and parameters into DMSBehaviorEngine
      for (const k in dms.activeBehaviors) {
        dms.activeBehaviors[k] = false;
        dms.behaviorWeights[k] = 0.0;
      }

      let totalActiveBehaviorWeight = 0;
      let activeLookAtTarget = null;
      let maxLookAtWeight = 0;

      for (const bLayer of activeBehaviors) {
        const bKey = bLayer.behavior;
        if (bKey) {
          const w = TimelineEngine.computeLayerWeight(bLayer, f);
          const effectiveW = w * (bLayer.intensity ?? 1.0);
          if (effectiveW > 0.001) {
            dms.activeBehaviors[bKey] = true;
            dms.behaviorWeights[bKey] = effectiveW;

            // Resolve Target Actor for multi-character interactions (Tackle, Shove, HitReact, IK)
            let targetPos = null;
            let targetActorObj = null;
            if (bLayer.targetActorId) {
              targetActorObj = this.getActor(bLayer.targetActorId);
            } else {
              const otherActor = Object.values(this.actors).find(a => a.id !== actorId);
              if (otherActor) targetActorObj = otherActor;
            }

            if (targetActorObj && targetActorObj.character && targetActorObj.character.bodies) {
              const targetBone = targetActorObj.character.bodies[bLayer.targetBone || 'UpperSpine'] || targetActorObj.character.bodies['Pelvis'];
              if (targetBone && targetBone.rigidBody) {
                const tr = targetBone.rigidBody.translation();
                targetPos = { x: tr.x, y: tr.y, z: tr.z };
              }
            }

            const propId = bLayer.targetObject && bLayer.targetObject !== 'none' ? bLayer.targetObject : bLayer.targetProp;
            if (!targetPos && propId && propId !== 'none' && this.propsManager && this.propsManager.props) {
              const p = this.propsManager.props.find(pr => pr.id === propId || pr.type === propId);
              if (p) {
                if (p.rigidBody && typeof p.rigidBody.translation === 'function') {
                  const pt = p.rigidBody.translation();
                  targetPos = { x: pt.x, y: pt.y, z: pt.z };
                } else if (p.mesh && p.mesh.position) {
                  targetPos = { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z };
                }
              }
            }
            if (!targetPos && bLayer.targetPos) {
              targetPos = bLayer.targetPos;
            }

            bLayer.targetPos = targetPos;
            dms.behaviorParams[bKey] = {
              intensity: bLayer.intensity ?? 1.0,
              speed: bLayer.speed ?? 1.0,
              blendWeight: w,
              bodyPartMask: bLayer.bodyPartMask || 'auto',
              selectionSet: bLayer.selectionSet || 'all',
              targetObject: bLayer.targetObject || bLayer.targetProp || 'none',
              targetPos: targetPos,
              targetActorId: targetActorObj?.id || null,
              lookAt: bLayer.lookAt !== undefined ? bLayer.lookAt : true,
              reachHand: bLayer.reachHand || 'both',
              usePrediction: bLayer.usePrediction !== undefined ? bLayer.usePrediction : true,
              predictionRate: bLayer.predictionRate ?? 0.2,
              trajectoryOffset: bLayer.trajectoryOffset ?? 0.0,
              interceptionOffsetX: bLayer.interceptionOffsetX ?? 0.0,
              interceptionOffsetY: bLayer.interceptionOffsetY ?? 0.0,
              interceptionOffsetZ: bLayer.interceptionOffsetZ ?? 0.0,
              exaggeration: bLayer.exaggeration ?? 0.0,
              delay: bLayer.delay ?? 0.0,
              characterAccelThreshold: bLayer.characterAccelThreshold ?? 20.0,
              targetAccelThreshold: bLayer.targetAccelThreshold ?? 0.05,
              layerStartFrame: bLayer.startFrame ?? 0
            };

            if ((bLayer.lookAt || bKey === 'handsReachLookAt' || bKey === 'reachHold') && (bLayer.lookAtTarget || targetPos)) {
              const lWeight = effectiveW * (bLayer.lookAtWeight ?? 1.0);
              if (lWeight > maxLookAtWeight) {
                maxLookAtWeight = lWeight;
                activeLookAtTarget = bLayer.lookAtTarget || targetPos;
              }
            }

            if (bKey !== 'ragdoll') {
              totalActiveBehaviorWeight += effectiveW;
            }
          }
        }
      }

      if (maxLookAtWeight > 0.001 && activeLookAtTarget) {
        dms.setLookAt(activeLookAtTarget, maxLookAtWeight);
      } else {
        dms.setLookAt(null, 0);
      }

      const ragdollWeight = dms.behaviorWeights['ragdoll'] || 0;
      const isExplicitRagdoll = ragdollWeight > 0.5;
      const hasActiveTracks = (totalActiveBehaviorWeight >= 0.01 || animWeight >= 0.01);

      if (isExplicitRagdoll) {
        char.isPureRagdoll = true;
      } else if (!hasActiveTracks) {
        // Base Timeline State (No explicit behavior or animation tracks)
        const animLayers = this.layers.filter(l => l.enabled && l.type === 'ANIMATION' && (l.actorId || 'actor-1') === actorId);
        const pastAnim = animLayers.filter(l => l.endFrame <= f).sort((a, b) => b.endFrame - a.endFrame)[0];
        const takeoverMode = pastAnim?.simTakeoverMode || 'active_hold';
        const stiffMultiplier = pastAnim?.takeoverStiffness ?? 1.0;

        if (pastAnim && takeoverMode === 'ragdoll') {
          // 1. RAGDOLL TAKEOVER: Zero muscle stiffness, limp gravitational release
          char.isPureRagdoll = true;
          char.muscleStiffness = 0.0;
          char.muscleDamping = 10.0;
          char.allowGroundActiveMotor = false;
        } else if (pastAnim && takeoverMode === 'blend_out') {
          // 2. BLEND-OUT TAKEOVER: Smooth progressive crossfade into relaxed ragdoll over blendOut frames
          const elapsed = f - pastAnim.endFrame;
          const blendFrames = Math.max(1, pastAnim.blendOut || 12);
          const progress = Math.min(1.0, elapsed / blendFrames);
          const fadeWeight = 1.0 - progress;

          if (fadeWeight > 0.02) {
            char.isPureRagdoll = false;
            char.muscleStiffness = 320.0 * stiffMultiplier * fadeWeight;
            char.muscleDamping = 35.0 * Math.max(0.2, fadeWeight);
            char.allowGroundActiveMotor = stiffMultiplier >= 0.7;
            if (char.joints && baseRotations) {
              for (const j of char.joints) {
                const rot = baseRotations[j.childName] || NATURAL_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
                j.targetAngle.x = rot[0];
                j.targetAngle.y = rot[1];
                j.targetAngle.z = rot[2];
              }
            }
          } else {
            char.isPureRagdoll = true;
            char.muscleStiffness = 0.0;
            char.allowGroundActiveMotor = false;
          }
        } else if (pastAnim && (takeoverMode === 'active_hold' || takeoverMode === 'freeze') && baseRotations) {
          // 3. ACTIVE HOLD / FREEZE TAKEOVER: Motorized pose hold with user-controlled stiffness
          char.isPureRagdoll = false;
          char.muscleStiffness = 320.0 * stiffMultiplier;
          char.muscleDamping = 35.0 * Math.sqrt(Math.max(0.05, stiffMultiplier));
          char.allowGroundActiveMotor = stiffMultiplier >= 0.7;

          if (char.joints) {
            for (const j of char.joints) {
              const rot = baseRotations[j.childName] || NATURAL_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
              j.targetAngle.x = rot[0];
              j.targetAngle.y = rot[1];
              j.targetAngle.z = rot[2];
            }
          }

          // If high stiffness is selected (>= 70%), support pelvis height so the legs don't collapse into a heap under gravity
          const pelvis = char.bodies['Pelvis'];
          if (pelvis && pelvis.rigidBody && stiffMultiplier >= 0.7) {
            const pTr = pelvis.rigidBody.translation();
            const pVel = pelvis.rigidBody.linvel ? pelvis.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
            if (pTr.y < 0.94 && pTr.y > 0.35 && (pVel.y || 0) < 0.2) {
              const supForce = (0.94 - pTr.y) * 2200.0 * stiffMultiplier * dt;
              pelvis.rigidBody.applyImpulse({ x: 0, y: Math.min(supForce, 38.0), z: 0 }, true);
            }
          }
        } else if (char.balanceControlEnabled) {
          // Autonomous Active Dynamic Balance (Boston Dynamics Standing Equilibrium)
          char.isPureRagdoll = false;
          char.muscleStiffness = 300.0;
          char.muscleDamping = 35.0;
          if (char.joints) {
            for (const j of char.joints) {
              const defRot = NATURAL_STANCE_ROTATIONS[j.childName] || [0, 0, 0];
              j.targetAngle.x = defRot[0];
              j.targetAngle.y = defRot[1];
              j.targetAngle.z = defRot[2];
            }
          }
        } else {
          char.isPureRagdoll = true;
          char.muscleStiffness = 0.0;
          char.allowGroundActiveMotor = false;
        }
      } else {
        char.isPureRagdoll = false;
      }

      // Constraint Limb Compliance & Kinematic Anchor Management
      const activeConstrainedBones = new Set();
      const constrainedLimbJoints = new Set();
      for (const c of activeConstraints) {
        if (c.isBroken) continue;
        const w = TimelineEngine.computeLayerWeight(c, f);
        if (w >= 0.5) {
          const bName = c.targetBody || 'LeftHand';
          activeConstrainedBones.add(bName);
          let curr = bName;
          while (curr) {
            const def = SKELETON_TREE[curr];
            if (def && def.parent) {
              constrainedLimbJoints.add(`${def.parent}_to_${curr}`);
              curr = def.parent;
              if (curr === 'UpperSpine' || curr === 'Pelvis') break;
            } else {
              break;
            }
          }
        }
      }
      char.constrainedLimbJoints = constrainedLimbJoints;
      char.activeConstrainedBones = activeConstrainedBones;

      for (const [bName, b] of Object.entries(char.bodies)) {
        if (!activeConstrainedBones.has(bName) && !char.isKinematic) {
          if (b.rigidBody && typeof b.rigidBody.bodyType === 'function' && b.rigidBody.bodyType() !== 0) {
            b.rigidBody.setBodyType(0, true);
          }
        }
      }

      if (this.propsManager) {
        this.propsManager.applyFluidForces(char, dt);
      }
      if (dms.activeBehaviors.fluid && (!this.propsManager || this.propsManager.props.filter(p => p.type === 'fluid').length === 0)) {
        const waterSurfaceY = 0.65;
        for (const [name, b] of Object.entries(char.bodies)) {
          const t = b.rigidBody.translation();
          if (t.y < waterSurfaceY) {
            const submRatio = Math.min((waterSurfaceY - t.y) / 0.4, 1.0);
            const bForce = submRatio * (b.mass * 9.81 * 1.35);
            b.rigidBody.applyImpulse({ x: 0, y: bForce * dt, z: 0 }, true);
            const vel = b.rigidBody.linvel();
            b.rigidBody.applyImpulse({
              x: -vel.x * b.mass * 2.8 * dt,
              y: -vel.y * b.mass * 3.2 * dt,
              z: -vel.z * b.mass * 2.8 * dt
            }, true);
          }
        }
      }

      // Update DMS behaviors (multi-layer limb-masked stack-ordered blending)
      dms.update(dt, activeBehaviors, f, TimelineEngine.computeLayerWeight, this.propsManager);

      // Animation-to-Physics Crossfade (Endorphin Simulation Blending)
      if (animWeight > 0.001 && activeAnim) {
        const animSample = this.sampleAnimationLayer(activeAnim, f - activeAnim.startFrame, f);
        if (animSample) {
          for (const j of char.joints) {
            const rot = animSample.localRotations[j.childName];
            if (rot) {
              j.targetAngle.x = j.targetAngle.x * (1 - animWeight) + rot[0] * animWeight;
              j.targetAngle.y = j.targetAngle.y * (1 - animWeight) + rot[1] * animWeight;
              j.targetAngle.z = j.targetAngle.z * (1 - animWeight) + rot[2] * animWeight;
            }
          }

          const pelvis = char.bodies['Pelvis'];
          const sensors = char.sensors || { tiltAngle: 0 };
          const isFallen = pelvis ? (pelvis.rigidBody.translation().y < 0.55 || sensors.tiltAngle > 38.0) : false;
          if (pelvis && !isFallen && animSample.walkVel && !isAnimInterrupted && !forceHitActive) {
            const yaw = char.spawnYaw || 0;
            const fwdZ = Math.cos(yaw) * animSample.walkVel * 10.0 * animWeight;
            const fwdX = Math.sin(yaw) * animSample.walkVel * 10.0 * animWeight;
            pelvis.rigidBody.applyImpulse({ x: fwdX * dt, y: 0, z: fwdZ * dt }, true);
          }
        }
        const baseStiff = 300.0 * (activeAnim.muscleStiffness ?? 1.0) * animWeight;
        const complianceScale = totalActiveBehaviorWeight > 0.01 ? 0.65 : 1.0;
        char.muscleStiffness = Math.max(60.0, baseStiff * complianceScale);
        char.isPureRagdoll = false;
      }

      // Discrete Perturbations / Force Effector Events
      for (const p of activePerturbations) {
        const vec = (p.magnitude !== undefined && p.yawDeg !== undefined)
          ? TimelineEngine.computeForceVector(p.magnitude * (p.intensity ?? 1.0), p.yawDeg, p.pitchDeg ?? 0)
          : p.impulse;

        if (p.forceMode === 'continuous') {
          if (typeof char.applyForceEffector === 'function') {
            char.applyForceEffector(p.targetBody || 'UpperSpine', vec, true);
          } else {
            const scale = (1 / this.fps) * 2.2;
            char.applyImpulseToBody(p.targetBody || 'UpperSpine', { x: vec.x * scale, y: vec.y * scale, z: vec.z * scale });
          }
        } else if (!this.appliedPerturbations.has(p.id)) {
          this.appliedPerturbations.add(p.id);
          if (typeof char.applyForceEffector === 'function') {
            char.applyForceEffector(p.targetBody || 'UpperSpine', vec, false);
          } else {
            char.applyImpulseToBody(p.targetBody || 'UpperSpine', vec);
          }
        }
      }

      // Wind / Pusher force field
      let pusherFx = this.windForce.x;
      let pusherFy = this.windForce.y;
      let pusherFz = this.windForce.z;

      const pusherLayer = activeBehaviors.find(b => b.behavior === 'pusher');
      if (pusherLayer) {
        const pw = TimelineEngine.computeLayerWeight(pusherLayer, f) * (pusherLayer.intensity ?? 1.0);
        pusherFz += -24.0 * pw * (pusherLayer.speed ?? 1.0);
      }

      if (pusherFx !== 0 || pusherFy !== 0 || pusherFz !== 0) {
        for (const [name, b] of Object.entries(char.bodies)) {
          const massScale = b.mass / 75.0;
          b.rigidBody.applyImpulse({
            x: pusherFx * massScale * dt * 2.0,
            y: pusherFy * massScale * dt * 2.0,
            z: pusherFz * massScale * dt * 2.0
          }, true);
        }
      }

      // Twister vortex force field
      let effectiveTwister = this.twisterStrength || 0;
      const twisterLayer = activeBehaviors.find(b => b.behavior === 'twister');
      if (twisterLayer) {
        const tw = TimelineEngine.computeLayerWeight(twisterLayer, f) * (twisterLayer.intensity ?? 1.0);
        effectiveTwister = Math.max(effectiveTwister, tw * 14.0 * (twisterLayer.speed ?? 1.0));
      }

      if (effectiveTwister > 0) {
        const vortexStrength = effectiveTwister;
        const pCenter = char.bodies['Pelvis'].rigidBody.translation();
        for (const [name, b] of Object.entries(char.bodies)) {
          const t = b.rigidBody.translation();
          const rx = t.x - pCenter.x;
          const rz = t.z - pCenter.z;
          const fx = -rz * vortexStrength * b.mass * 2.2 + (-t.x * vortexStrength * 0.4);
          const fz = rx * vortexStrength * b.mass * 2.2 + (-t.z * vortexStrength * 0.4);
          const fy = vortexStrength * b.mass * 0.18;
          b.rigidBody.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
        }
      }

      // Active Pose Matching
      for (const pose of activePoses) {
        const w = TimelineEngine.computeLayerWeight(pose, f);
        if (w > 0.001 && typeof char.applyActivePose === 'function') {
          char.applyActivePose(pose.poseKey || 'crouching', (pose.strength ?? 50.0) * w);
        }
      }

      // Dynamic muscle stiffness modulation for Legs Straighten
      if (dms.activeBehaviors.legsStraighten) {
        const sw = (dms.behaviorWeights.legsStraighten ?? 0);
        char.muscleStiffness = THREE.MathUtils.lerp(300.0, 550.0, sw);
      }

      // Enforce Endorphin 2.7.1 Bone Constraints (World Pin, Prop/Object Pinning, Actor-to-Actor Bone Pinning, Hold Proximity, Spring)
      if (!this.constraintAnchors) this.constraintAnchors = {};
      for (const c of activeConstraints) {
        if (c.isBroken) continue;
        const bName = c.targetBody || 'LeftHand';
        const curB = char.bodies[bName];
        if (!curB || !curB.rigidBody) continue;

        const propKey = (c.pinTarget && c.pinTarget !== 'world') ? c.pinTarget : (c.targetProp && c.targetProp !== 'none' ? c.targetProp : null);
        let targetActorBody = null;
        let targetProp = null;
        if (propKey && typeof propKey === 'string' && propKey.startsWith('actor:')) {
          const parts = propKey.split(':');
          const tActorId = parts[1] || (actorId === 'actor-1' ? 'actor-2' : 'actor-1');
          const tBoneName = parts[2] || 'UpperSpine';
          targetActorBody = this.actors?.[tActorId]?.character?.bodies?.[tBoneName] || null;
        } else if (propKey) {
          targetProp = this.propsManager?.getPropById?.(propKey) || this.propsManager?.props?.find(pr => pr.id === propKey || pr.type === propKey) || null;
        }
        const targetRigidRef = targetActorBody || targetProp;

        if (!this.constraintAnchors[c.id]) {
          const tr = curB.rigidBody.translation();
          const rot = curB.rigidBody.rotation();
          const bQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
          if (targetRigidRef && targetRigidRef.rigidBody) {
            const pTr = targetRigidRef.rigidBody.translation();
            const pRot = targetRigidRef.rigidBody.rotation();
            const pQuat = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);
            const bPos = new THREE.Vector3(tr.x, tr.y, tr.z);
            const pPos = new THREE.Vector3(pTr.x, pTr.y, pTr.z);
            const localOffset = bPos.sub(pPos).applyQuaternion(pQuat.clone().invert());
            const localBoneQuat = pQuat.clone().invert().multiply(bQuat);
            this.constraintAnchors[c.id] = {
              type: targetActorBody ? 'actor' : 'prop',
              propId: propKey,
              localOffset: { x: localOffset.x, y: localOffset.y, z: localOffset.z },
              localBoneQuat: { x: localBoneQuat.x, y: localBoneQuat.y, z: localBoneQuat.z, w: localBoneQuat.w }
            };
          } else {
            this.constraintAnchors[c.id] = {
              type: 'world',
              x: tr.x,
              y: tr.y,
              z: tr.z,
              rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
            };
          }
        }

        let anchor;
        let anchorLinvel = { x: 0, y: 0, z: 0 };
        let targetRotation = null;
        let anchorAngvel = { x: 0, y: 0, z: 0 };

        const entry = this.constraintAnchors[c.id];
        if (entry && (entry.type === 'prop' || entry.type === 'actor') && targetRigidRef && targetRigidRef.rigidBody) {
          const pTr = targetRigidRef.rigidBody.translation();
          const pRot = targetRigidRef.rigidBody.rotation();
          const pQuat = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);
          const pPos = new THREE.Vector3(pTr.x, pTr.y, pTr.z);
          const off = new THREE.Vector3(entry.localOffset.x, entry.localOffset.y, entry.localOffset.z);
          const r = off.clone().applyQuaternion(pQuat);
          const worldAnchor = r.clone().add(pPos);
          anchor = { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z };

          const plv = targetRigidRef.rigidBody.linvel();
          const pav = targetRigidRef.rigidBody.angvel();
          anchorLinvel = {
            x: plv.x + (pav.y * r.z - pav.z * r.y),
            y: plv.y + (pav.z * r.x - pav.x * r.z),
            z: plv.z + (pav.x * r.y - pav.y * r.x)
          };
          anchorAngvel = { x: pav.x, y: pav.y, z: pav.z };

          if (entry.localBoneQuat) {
            const lq = new THREE.Quaternion(entry.localBoneQuat.x, entry.localBoneQuat.y, entry.localBoneQuat.z, entry.localBoneQuat.w);
            targetRotation = pQuat.clone().multiply(lq);
          }
        } else if (entry) {
          anchor = { x: entry.x, y: entry.y, z: entry.z };
          if (entry.rot) {
            targetRotation = new THREE.Quaternion(entry.rot.x, entry.rot.y, entry.rot.z, entry.rot.w);
          }
        } else {
          const tr = curB.rigidBody.translation();
          anchor = { x: tr.x, y: tr.y, z: tr.z };
        }

        const w = TimelineEngine.computeLayerWeight(c, f);
        const effectiveStrength = (c.strength ?? 1.0) * w;
        const curPos = curB.rigidBody.translation();
        const distToAnchor = Math.hypot(anchor.x - curPos.x, anchor.y - curPos.y, anchor.z - curPos.z);

        if (c.constraintType === 'HOLD_PROXIMITY' || c.constraintType === 'proximityHold') {
          const trig = c.triggerDistance ?? 0.25;
          if (!c.isEngaged && distToAnchor <= trig) {
            c.isEngaged = true;
            c.contactOffset = {
              x: curPos.x - anchor.x,
              y: curPos.y - anchor.y,
              z: curPos.z - anchor.z
            };
          }
          if (c.isEngaged) {
            const targetX = anchor.x + (c.contactOffset?.x ?? 0);
            const targetY = anchor.y + (c.contactOffset?.y ?? 0);
            const targetZ = anchor.z + (c.contactOffset?.z ?? 0);

            const dx = targetX - curPos.x;
            const dy = targetY - curPos.y;
            const dz = targetZ - curPos.z;

            const curLv = curB.rigidBody.linvel();
            const dvx = anchorLinvel.x - curLv.x;
            const dvy = anchorLinvel.y - curLv.y;
            const dvz = anchorLinvel.z - curLv.z;

            const k = (c.stiffness ?? 850.0) * effectiveStrength;
            const damp = c.damping ?? 45.0;

            const fx = k * dx + damp * dvx;
            const fy = k * dy + damp * dvy;
            const fz = k * dz + damp * dvz;
            const fMag = Math.hypot(fx, fy, fz);

            if (fMag > (c.breakForce ?? 550.0)) {
              c.isBroken = true;
              c.isEngaged = false;
              if (typeof char.releaseBoneConstraint === 'function') char.releaseBoneConstraint(bName);
            } else {
              curB.rigidBody.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
              if (targetRigidRef && targetRigidRef.rigidBody) {
                targetRigidRef.rigidBody.applyImpulse({ x: -fx * dt, y: -fy * dt, z: -fz * dt }, true);
              }
            }
          }
        } else if (c.constraintType === 'SPRING') {
          const dx = anchor.x - curPos.x;
          const dy = anchor.y - curPos.y;
          const dz = anchor.z - curPos.z;
          const curLv = curB.rigidBody.linvel();
          const dvx = anchorLinvel.x - curLv.x;
          const dvy = anchorLinvel.y - curLv.y;
          const dvz = anchorLinvel.z - curLv.z;

          const k = (c.stiffness ?? 400.0) * effectiveStrength;
          const damp = c.damping ?? 20.0;
          const fx = k * dx + damp * dvx;
          const fy = k * dy + damp * dvy;
          const fz = k * dz + damp * dvz;
          const fMag = Math.hypot(fx, fy, fz);

          if (fMag > (c.breakForce ?? 800.0)) {
            c.isBroken = true;
            if (typeof char.releaseBoneConstraint === 'function') char.releaseBoneConstraint(bName);
          } else {
            curB.rigidBody.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
            if (targetRigidRef && targetRigidRef.rigidBody) {
              targetRigidRef.rigidBody.applyImpulse({ x: -fx * dt, y: -fy * dt, z: -fz * dt }, true);
            }
          }
        } else {
          // lock, lockPosition, lockOrientation, PIN
          if (c.breakForce && isFinite(c.breakForce) && c.breakForce > 0) {
            const tensionEst = distToAnchor * 1200.0 * effectiveStrength;
            if (tensionEst > c.breakForce) {
              c.isBroken = true;
              if (typeof char.releaseBoneConstraint === 'function') char.releaseBoneConstraint(bName);
              continue;
            }
          }
          if (typeof char.applyBoneConstraint === 'function') {
            char.applyBoneConstraint(bName, c.constraintType || 'lock', anchor, effectiveStrength, anchorLinvel, targetRotation, anchorAngvel);
          }
        }
      }

      char.update(dt);
    }

    if (substepIdx === 0) {
      for (const [name, b] of Object.entries(char.bodies)) {
        const t = b.rigidBody.translation();
        const r = b.rigidBody.rotation();
        actor.prevPositions[name] = new THREE.Vector3(t.x, t.y, t.z);
        actor.prevQuaternions[name] = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      }
    }
  }

  enforcePostStepConstraints(actor, f) {
    const actorId = actor.id;
    const char = actor.character;
    if (!char || !char.bodies || !this.constraintAnchors) return;

    const activeConstraints = this.layers.filter(l => l.enabled && l.type === 'CONSTRAINT' && (l.actorId || 'actor-1') === actorId && f >= l.startFrame && f <= l.endFrame);
    for (const c of activeConstraints) {
      if (c.isBroken) continue;
      if (c.constraintType === 'HOLD_PROXIMITY' || c.constraintType === 'proximityHold' || c.constraintType === 'SPRING') continue;
      const w = TimelineEngine.computeLayerWeight(c, f);
      const effectiveStrength = (c.strength ?? 1.0) * w;
      if (effectiveStrength >= 0.85) {
        const bName = c.targetBody || 'LeftHand';
        const curB = char.bodies[bName];
        if (!curB || !curB.rigidBody) continue;

        const propKey = (c.pinTarget && c.pinTarget !== 'world') ? c.pinTarget : (c.targetProp && c.targetProp !== 'none' ? c.targetProp : null);
        let targetActorBody = null;
        let targetProp = null;
        if (propKey && typeof propKey === 'string' && propKey.startsWith('actor:')) {
          const parts = propKey.split(':');
          const tActorId = parts[1] || (actorId === 'actor-1' ? 'actor-2' : 'actor-1');
          const tBoneName = parts[2] || 'UpperSpine';
          targetActorBody = this.actors?.[tActorId]?.character?.bodies?.[tBoneName] || null;
        } else if (propKey) {
          targetProp = this.propsManager?.getPropById?.(propKey) || this.propsManager?.props?.find(pr => pr.id === propKey || pr.type === propKey) || null;
        }
        const targetRigidRef = targetActorBody || targetProp;
        const entry = this.constraintAnchors[c.id];
        if (!entry) continue;

        let pAnchor;
        let pLinvel = { x: 0, y: 0, z: 0 };
        let pAngvel = { x: 0, y: 0, z: 0 };
        let pTargetRot = null;

        if ((entry.type === 'prop' || entry.type === 'actor') && targetRigidRef && targetRigidRef.rigidBody) {
          const pTr = targetRigidRef.rigidBody.translation();
          const pRot = targetRigidRef.rigidBody.rotation();
          const pQuat = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);
          const pPos = new THREE.Vector3(pTr.x, pTr.y, pTr.z);
          const off = new THREE.Vector3(entry.localOffset.x, entry.localOffset.y, entry.localOffset.z);
          const r = off.clone().applyQuaternion(pQuat);
          const worldAnchor = r.clone().add(pPos);
          pAnchor = { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z };

          const plv = targetRigidRef.rigidBody.linvel();
          const pav = targetRigidRef.rigidBody.angvel();
          pLinvel = {
            x: plv.x + (pav.y * r.z - pav.z * r.y),
            y: plv.y + (pav.z * r.x - pav.x * r.z),
            z: plv.z + (pav.x * r.y - pav.y * r.x)
          };
          pAngvel = { x: pav.x, y: pav.y, z: pav.z };

          if (entry.localBoneQuat) {
            const lq = new THREE.Quaternion(entry.localBoneQuat.x, entry.localBoneQuat.y, entry.localBoneQuat.z, entry.localBoneQuat.w);
            pTargetRot = pQuat.clone().multiply(lq);
          }
        } else {
          pAnchor = { x: entry.x, y: entry.y, z: entry.z };
          if (entry.rot) {
            pTargetRot = new THREE.Quaternion(entry.rot.x, entry.rot.y, entry.rot.z, entry.rot.w);
          }
        }

        const cType = c.constraintType || 'lock';
        if (cType === 'lock' || cType === 'lockPosition' || cType === 'PIN') {
          curB.rigidBody.setTranslation(pAnchor, true);
          if (curB.mesh) curB.mesh.position.set(pAnchor.x, pAnchor.y, pAnchor.z);
          curB.rigidBody.setLinvel(pLinvel, true);
        }
        if (cType === 'lock' || cType === 'lockOrientation') {
          if (pTargetRot) {
            curB.rigidBody.setRotation(pTargetRot, true);
            if (curB.mesh) curB.mesh.quaternion.copy(pTargetRot);
          }
          curB.rigidBody.setAngvel(pAngvel, true);
        }
      }
    }
  }

  seek(frameIdx) {
    this.currentFrame = Math.max(0, Math.min(frameIdx, this.totalFrames - 1));

    const actorList = Object.values(this.actors);
    const actors = actorList.length > 0 ? actorList : [{
      id: 'actor-1',
      character: this.character,
      dmsEngine: this.dmsEngine,
      mixamoBridge: this.characterBridge || null
    }];

    if (this.simulationCache && this.simulationCache[this.currentFrame]) {
      const data = this.simulationCache[this.currentFrame];

      for (const actor of actors) {
        const actorData = (data.actors && data.actors[actor.id]) ? data.actors[actor.id] : (actor.id === 'actor-1' ? data : null);
        if (actorData && actorData.bodies && actor.character && actor.character.bodies) {
          for (const [name, tr] of Object.entries(actorData.bodies)) {
            const b = actor.character.bodies[name];
            if (b) {
              b.mesh.position.set(...tr.position);
              b.mesh.quaternion.set(...tr.rotation);
              if (b.rigidBody) {
                b.rigidBody.setTranslation({ x: tr.position[0], y: tr.position[1], z: tr.position[2] }, true);
                b.rigidBody.setRotation({ x: tr.rotation[0], y: tr.rotation[1], z: tr.rotation[2], w: tr.rotation[3] }, true);
              }
            }
          }
        }
        const bridge = actor.mixamoBridge || (actor.id === 'actor-1' ? this.characterBridge : null);
        if (bridge && bridge.isVisible) {
          bridge.update();
        }
      }

      if (data.props && this.propsManager && this.propsManager.props) {
        for (const p of this.propsManager.props) {
          if (!p.isDynamic && p.initPos) {
            p.mesh.position.set(p.initPos.x, p.initPos.y, p.initPos.z);
            if (p.initRot) p.mesh.quaternion.set(p.initRot.x, p.initRot.y, p.initRot.z, p.initRot.w);
            p.rigidBody.setTranslation(p.initPos, true);
            if (p.initRot) p.rigidBody.setRotation(p.initRot, true);
            continue;
          }
          const ptr = data.props[p.id];
          if (ptr && p.mesh && p.rigidBody) {
            p.mesh.position.set(...ptr.position);
            p.mesh.quaternion.set(...ptr.rotation);
            p.rigidBody.setTranslation({ x: ptr.position[0], y: ptr.position[1], z: ptr.position[2] }, true);
            p.rigidBody.setRotation({ x: ptr.rotation[0], y: ptr.rotation[1], z: ptr.rotation[2], w: ptr.rotation[3] }, true);
          }
        }
      }
      if (data.constraints) {
        for (const [id, cState] of Object.entries(data.constraints)) {
          const cl = this.layers.find(l => l.id === id);
          if (cl) {
            cl.isEngaged = cState.isEngaged;
            cl.isBroken = cState.isBroken;
          }
        }
      }

      if (data.layerTriggers) {
        for (const l of this.layers) {
          if (data.layerTriggers[l.id] !== undefined) {
            l.isTriggered = true;
            l.triggeredAtFrame = data.layerTriggers[l.id];
          } else if (l.triggerType && l.triggerType !== 'frame') {
            l.isTriggered = false;
            l.triggeredAtFrame = null;
          }
        }
      }
    } else {
      // Unbaked frame seek (kinematic animation, pose track, held past/future pose, natural stance, or T-pose)
      for (const actor of actors) {
        if (!actor.character) continue;
        const activeAnim = this.layers.find(l => l.enabled && l.type === 'ANIMATION' && (l.actorId || 'actor-1') === actor.id && this.currentFrame >= l.startFrame && this.currentFrame <= l.endFrame);
        const hasIdleStance = this.layers.some(l => l.enabled && l.type === 'BEHAVIOR' && l.behavior === 'idleStance' && (l.actorId || 'actor-1') === actor.id);

        if (activeAnim) {
          const isPose = activeAnim.animType === 'pose' || (Array.isArray(activeAnim.keyframes) && activeAnim.keyframes.length > 0);
          if (isPose) {
            const poseSample = this.samplePoseLayer(activeAnim, this.currentFrame);
            if (poseSample && typeof actor.character.applyPoseState === 'function') {
              actor.character.applyPoseState(poseSample);
            } else if (poseSample) {
              actor.character.applyForwardKinematics(poseSample.rootPos, poseSample.localRotations);
            }
          } else {
            const sample = this.sampleAnimationLayer(activeAnim, this.currentFrame - activeAnim.startFrame, this.currentFrame);
            actor.character.applyForwardKinematics(sample.rootPos, sample.localRotations);
          }
        } else {
          const animLayers = this.layers.filter(l => l.enabled && l.type === 'ANIMATION' && (l.actorId || 'actor-1') === actor.id);
          const pastAnim = animLayers.filter(l => l.endFrame <= this.currentFrame).sort((a, b) => b.endFrame - a.endFrame)[0];
          const futureAnim = animLayers.filter(l => l.startFrame >= this.currentFrame).sort((a, b) => a.startFrame - b.startFrame)[0];

          if (pastAnim) {
            const isPose = pastAnim.animType === 'pose' || (Array.isArray(pastAnim.keyframes) && pastAnim.keyframes.length > 0);
            if (isPose) {
              const sample = this.samplePoseLayer(pastAnim, pastAnim.endFrame);
              if (sample && typeof actor.character.applyPoseState === 'function') {
                actor.character.applyPoseState(sample);
              } else if (sample) {
                actor.character.applyForwardKinematics(sample.rootPos, sample.localRotations);
              }
            } else {
              const sample = this.sampleAnimationLayer(pastAnim, pastAnim.endFrame - pastAnim.startFrame, pastAnim.endFrame);
              actor.character.applyForwardKinematics(sample.rootPos, sample.localRotations);
            }
          } else if (futureAnim) {
            const isPose = futureAnim.animType === 'pose' || (Array.isArray(futureAnim.keyframes) && futureAnim.keyframes.length > 0);
            if (isPose) {
              const sample = this.samplePoseLayer(futureAnim, futureAnim.startFrame);
              if (sample && typeof actor.character.applyPoseState === 'function') {
                actor.character.applyPoseState(sample);
              } else if (sample) {
                actor.character.applyForwardKinematics(sample.rootPos, sample.localRotations);
              }
            } else {
              const sample = this.sampleAnimationLayer(futureAnim, 0, futureAnim.startFrame);
              actor.character.applyForwardKinematics(sample.rootPos, sample.localRotations);
            }
          } else if (hasIdleStance || this.layers.length > 0) {
            if (typeof actor.character.resetToNaturalStance === 'function') {
              actor.character.resetToNaturalStance();
            } else {
              actor.character.resetToTPose();
            }
          } else {
            actor.character.resetToTPose();
          }
        }
        const bridge = actor.mixamoBridge || (actor.id === 'actor-1' ? this.characterBridge : null);
        if (bridge && bridge.isVisible) {
          bridge.update();
        }
      }
      if (this.propsManager && typeof this.propsManager.reset === 'function') {
        this.propsManager.reset();
      }
    }
  }
}
