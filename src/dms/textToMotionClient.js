import * as THREE from 'three';
import { ENDORPHIN_POSES_LIBRARY } from '../parsers/poseLibrary.js';
import { ENDORPHIN_MOCAP_LIBRARY } from '../parsers/animationRetargeter.js';
import { clampBoneEulerRotation } from '../core/character.js';
import { keyframesToBVH } from '../export/exportBVH.js';

/**
 * OpenDMS Text-to-Motion AI Client & Persistent IndexedDB Motion Cache
 *
 * Execution Tiers:
 * - Tier 1 (Free Cloud API): Connects to open-source MoMask / MotionGPT Gradio endpoints on Hugging Face Spaces (0 MB local download)
 * - Tier 2 (Optional Local Sidecar): Connects to http://localhost:8000/generate-bvh if user runs local Python server
 * - Tier 3 (In-Browser Biomechanical Keyframe Synthesizer + Gemini 2.0 Keyframe Generator): Instant zero-dependency procedural motion synthesis
 */

const DB_NAME = 'OpenDMS_AIMotionsDB';
const STORE_NAME = 'ai_motions';
const DB_VERSION = 1;

export class AIMotionStorage {
  static openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async saveClip(clipRecord) {
    try {
      const db = await this.openDB();
      if (!db) return clipRecord;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(clipRecord);
        tx.oncomplete = () => resolve(clipRecord);
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('IndexedDB saveClip warning:', err);
      return clipRecord;
    }
  }

  static async getAllClips() {
    try {
      const db = await this.openDB();
      if (!db) return [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB getAllClips warning:', err);
      return [];
    }
  }

  static async deleteClip(id) {
    try {
      const db = await this.openDB();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('IndexedDB deleteClip warning:', err);
    }
  }
}

export class TextToMotionClient {
  constructor(retargeter) {
    this.retargeter = retargeter;
    this.localSidecarUrl = localStorage.getItem('opendms_motion_sidecar_url') || 'http://localhost:8000';
    // Public Hugging Face Gradio Space endpoints for open-source Text-to-Motion (MoMask / MotionGPT)
    this.hfGradioSpaces = [
      'https://meap018-momask.hf.space',
      'https://OpenMotionLab-MotionGPT.hf.space'
    ];
    this.cachedClips = [];
  }

  async initCache() {
    this.cachedClips = await AIMotionStorage.getAllClips();
    return this.cachedClips;
  }

  /**
   * Convert a human prompt into a clean @anim:TagName identifier
   */
  static toTagSlug(promptText) {
    const words = (promptText || 'AI Motion')
      .replace(/@[a-zA-Z0-9_:-]+/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    if (words.length === 0) return 'AIMotion';
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }

  /**
   * Generate a 15-bone OpenDMS ANIMATION layer from a free-text motion description
   * @param {string} prompt - e.g. "spin kick in the air" or "drunken stumble forward"
   * @param {Object} options - { durationFrames, startFrame, initialRootPos, apiKey }
   */
  async generateAnimationLayer(prompt, options = {}) {
    const cleanPrompt = (prompt || '').trim();
    const durationFrames = options.durationFrames || 110;
    const startFrame = options.startFrame ?? 0;
    const initialRootPos = options.initialRootPos || [0, 0.95, 0];
    const tagSlug = TextToMotionClient.toTagSlug(cleanPrompt);

    let keyframes = null;
    let sourceTier = 'Tier 3: Biomechanical Motion Synthesizer';

    // 1. Try Local Lightweight Python Sidecar first if reachable (fast 350ms check)
    try {
      const localResult = await this.tryLocalSidecar(cleanPrompt, durationFrames);
      if (localResult && localResult.keyframes) {
        keyframes = localResult.keyframes;
        sourceTier = 'Tier 2: Local Open-Source Motion Server (MoMask/MotionLCM)';
      }
    } catch (_) {
      // Sidecar not running locally; proceed to Cloud Gradio / Gemini / Biomechanical Synth
    }

    // 2. Try Free Cloud Hugging Face Spaces Gradio API (MoMask) with 3.2s timeout
    if (!keyframes && options.preferCloudGradio !== false) {
      try {
        const hfResult = await this.tryHuggingFaceGradio(cleanPrompt, durationFrames);
        if (hfResult && hfResult.keyframes) {
          keyframes = hfResult.keyframes;
          sourceTier = 'Tier 1: Hugging Face Open-Source MoMask Cloud API';
        }
      } catch (_) {
        // Proceed to Gemini / In-Browser Biomechanical Synthesizer
      }
    }

    // 3. If user configured a Gemini API key, use Gemini 2.0 Flash Biomechanical Keyframe Solver
    if (!keyframes && options.apiKey && options.apiKey.length > 10) {
      try {
        const geminiKf = await this.generateKeyframesWithGemini(cleanPrompt, durationFrames, options.apiKey);
        if (geminiKf && geminiKf.length >= 2) {
          keyframes = this.densifySparseKeyframes(geminiKf, durationFrames);
          sourceTier = 'Tier 2: Gemini 2.0 Biomechanical Keyframe Solver';
        }
      } catch (err) {
        console.warn('Gemini keyframe synthesis fallback:', err);
      }
    }

    // 4. Built-in Procedural & Mocap-Hybrid Biomechanical Synthesizer (0 MB, instant, 100% reliable)
    if (!keyframes) {
      const synthResult = await this.synthesizeBiomechanicalMotion(cleanPrompt, durationFrames);
      keyframes = synthResult.keyframes;
      sourceTier = synthResult.sourceTier || 'Tier 3: In-Browser Biomechanical Motion Synthesizer';
    }

    // 5. Stitch World-Space Root Continuity (so chained clips continue from previous clip's X, Z)
    keyframes = this.applyRootContinuation(keyframes, initialRootPos);

    const bvhText = keyframesToBVH(keyframes, 60);
    const clipId = `ai_anim_${tagSlug.toLowerCase()}_${Date.now()}`;
    const clipRecord = {
      id: clipId,
      tagSlug,
      name: `✨ AI: ${cleanPrompt.slice(0, 34)}`,
      prompt: cleanPrompt,
      category: 'AI Generated',
      icon: '✨',
      durationFrames: keyframes.length,
      sourceTier,
      createdAt: new Date().toISOString(),
      keyframes,
      bvhText
    };

    // Persist in IndexedDB and in-memory cache
    await AIMotionStorage.saveClip(clipRecord);
    this.cachedClips = [clipRecord, ...this.cachedClips.filter(c => c.tagSlug !== tagSlug)];

    const layer = {
      id: clipId,
      name: clipRecord.name,
      type: 'ANIMATION',
      animType: 'pose',
      enabled: true,
      startFrame,
      endFrame: startFrame + keyframes.length,
      durationFrames: keyframes.length,
      clipOffset: 0,
      blendIn: Math.min(10, Math.floor(keyframes.length * 0.15)),
      blendOut: Math.min(12, Math.floor(keyframes.length * 0.15)),
      color: '#ec4899',
      isMotorized: false,
      muscleStiffness: 1.0,
      isDenseMocap: true,
      isAIGenerated: true,
      aiPrompt: cleanPrompt,
      aiTagSlug: tagSlug,
      aiSourceTier: sourceTier,
      keyframes
    };

    return { layer, clipRecord };
  }

  /**
   * Tier 2: Attempt Local Open-Source Python Sidecar (http://localhost:8000/generate-bvh)
   */
  async tryLocalSidecar(prompt, durationFrames) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    try {
      const res = await fetch(`${this.localSidecarUrl}/generate-bvh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, length_frames: durationFrames }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.bvh && this.retargeter) {
        const retargeted = this.retargeter.loadFromBVHString(data.bvh, prompt);
        return { keyframes: retargeted.keyframes };
      }
      return null;
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * Tier 1: Attempt Free Cloud Hugging Face Space Gradio API (MoMask / MotionGPT)
   */
  async tryHuggingFaceGradio(prompt, durationFrames) {
    const durationSec = Math.max(2, Math.min(8, Math.round(durationFrames / 60)));
    for (const spaceUrl of this.hfGradioSpaces) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      try {
        const res = await fetch(`${spaceUrl}/run/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [prompt, durationSec]
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const json = await res.json();
        const bvhCandidate = json?.data?.find(d => typeof d === 'string' && d.includes('HIERARCHY'));
        if (bvhCandidate && this.retargeter) {
          const retargeted = this.retargeter.loadFromBVHString(bvhCandidate, prompt);
          return { keyframes: retargeted.keyframes };
        }
      } catch (_) {
        clearTimeout(timer);
      }
    }
    return null;
  }

  /**
   * Tier 2B: Gemini 2.0 Flash Biomechanical Keyframe Solver
   */
  async generateKeyframesWithGemini(prompt, durationFrames, apiKey) {
    const sysPrompt = `You are a 3D Biomechanical Character Animator for OpenDMS (15-bone humanoid rig).
Generate a sequence of 5 to 8 key poses over ${durationFrames} frames (0 to ${durationFrames - 1}) for the action: "${prompt}".
Bones (Euler XYZ in radians):
- LowerSpine, UpperSpine, Neck, Head
- LeftUpperArm, LeftForearm, LeftHand, RightUpperArm, RightForearm, RightHand (Note: In T-Pose, arms are horizontal; natural arms down is LeftUpperArm z=-1.15, RightUpperArm z=1.15)
- LeftThigh, LeftCalf, LeftFoot, RightThigh, RightCalf, RightFoot (Negative thigh X lifts knee forward; positive calf X bends knee)
Return PURE JSON array of keyframes:
[
  {
    "frame": 0,
    "rootPos": [0, 0.95, 0],
    "localRotations": { "LowerSpine": [0,0,0], "LeftUpperArm": [0,0,-1.1], "RightUpperArm": [0,0,1.1], ... }
  }
]`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: sysPrompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!txt) return null;
    return JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim());
  }

  /**
   * Interpolate sparse keyframes into dense 60Hz keyframes with Hermite S-curve & anatomical joint limits
   */
  densifySparseKeyframes(sparseKfs, totalFrames) {
    const sorted = [...sparseKfs].sort((a, b) => a.frame - b.frame);
    if (sorted[0].frame > 0) {
      sorted.unshift({ ...sorted[0], frame: 0 });
    }
    if (sorted[sorted.length - 1].frame < totalFrames - 1) {
      sorted.push({ ...sorted[sorted.length - 1], frame: totalFrames - 1 });
    }

    const allBones = [
      'LowerSpine', 'UpperSpine', 'Neck', 'Head',
      'LeftUpperArm', 'LeftForearm', 'LeftHand',
      'RightUpperArm', 'RightForearm', 'RightHand',
      'LeftThigh', 'LeftCalf', 'LeftFoot',
      'RightThigh', 'RightCalf', 'RightFoot'
    ];

    const dense = [];
    for (let f = 0; f < totalFrames; f++) {
      let k0 = sorted[0];
      let k1 = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (f >= sorted[i].frame && f <= sorted[i + 1].frame) {
          k0 = sorted[i];
          k1 = sorted[i + 1];
          break;
        }
      }
      const span = Math.max(1, k1.frame - k0.frame);
      const rawT = THREE.MathUtils.clamp((f - k0.frame) / span, 0, 1);
      // Smooth Hermite S-curve interpolation
      const s = rawT * rawT * (3 - 2 * rawT);

      const rp0 = k0.rootPos || [0, 0.95, 0];
      const rp1 = k1.rootPos || [0, 0.95, 0];
      const rootPos = [
        Number(THREE.MathUtils.lerp(rp0[0], rp1[0], s).toFixed(3)),
        Number(THREE.MathUtils.lerp(rp0[1], rp1[1], s).toFixed(3)),
        Number(THREE.MathUtils.lerp(rp0[2], rp1[2], s).toFixed(3))
      ];

      const localRotations = {};
      for (const bone of allBones) {
        const r0 = k0.localRotations?.[bone] || [0, 0, 0];
        const r1 = k1.localRotations?.[bone] || [0, 0, 0];
        const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(r0[0], r0[1], r0[2], 'XYZ'));
        const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(r1[0], r1[1], r1[2], 'XYZ'));
        q0.slerp(q1, s);
        const eul = new THREE.Euler().setFromQuaternion(q0, 'XYZ');
        const clamped = clampBoneEulerRotation(bone, [eul.x, eul.y, eul.z]);
        localRotations[bone] = [
          Number(clamped[0].toFixed(4)),
          Number(clamped[1].toFixed(4)),
          Number(clamped[2].toFixed(4))
        ];
      }

      dense.push({ frame: f, rootPos, localRotations });
    }
    return dense;
  }

  /**
   * Tier 3: In-Browser Biomechanical Motion Synthesizer (Parametric + Mocap Splicing)
   * Generates expressive 60Hz 15-bone animations for arbitrary action descriptions
   */
  async synthesizeBiomechanicalMotion(prompt, durationFrames = 110) {
    const lower = prompt.toLowerCase();
    const keyframes = [];

    // Detect speed & amplitude modifiers from natural language
    let speedMult = 1.0;
    if (lower.includes('fast') || lower.includes('quick') || lower.includes('rapid') || lower.includes('sprint')) speedMult = 1.45;
    else if (lower.includes('slow') || lower.includes('careful') || lower.includes('sneak')) speedMult = 0.65;

    let ampMult = 1.0;
    if (lower.includes('high') || lower.includes('big') || lower.includes('huge') || lower.includes('explosive') || lower.includes('violent')) ampMult = 1.3;

    // Archetype 1: SPIN KICK / TORNADO KICK / MARTIAL ARTS AERIAL KICK
    if (lower.includes('spin') || lower.includes('kick') || lower.includes('roundhouse') || lower.includes('martial') || lower.includes('karate') || lower.includes('taekwondo')) {
      for (let f = 0; f < durationFrames; f++) {
        const u = f / Math.max(1, durationFrames - 1);
        // Windup (0..0.25), Jump & Spin (0.25..0.75), Land (0.75..1.0)
        const jumpArc = u > 0.2 && u < 0.8 ? Math.sin(((u - 0.2) / 0.6) * Math.PI) : 0;
        const crouchDepth = u < 0.25 ? Math.sin((u / 0.25) * Math.PI) * 0.22 : (u > 0.78 ? Math.sin(((u - 0.78) / 0.22) * Math.PI) * 0.16 : 0);
        const kickExtend = u > 0.35 && u < 0.72 ? Math.sin(((u - 0.35) / 0.37) * Math.PI) : 0;
        const spinAngle = lower.includes('spin') || lower.includes('360') || lower.includes('tornado')
          ? THREE.MathUtils.smoothstep(u, 0.18, 0.78) * Math.PI * 2.0
          : Math.sin(u * Math.PI) * 0.65;

        const rootPos = [
          Number((Math.sin(u * Math.PI) * 0.15).toFixed(3)),
          Number((0.95 - crouchDepth + jumpArc * 0.55 * ampMult).toFixed(3)),
          Number((u * 1.15 * speedMult).toFixed(3))
        ];

        const localRotations = {
          LowerSpine: [Number((-0.25 * kickExtend + 0.3 * crouchDepth).toFixed(4)), Number((spinAngle * 0.35).toFixed(4)), Number((-0.3 * kickExtend).toFixed(4))],
          UpperSpine: [Number((0.15 - 0.2 * kickExtend).toFixed(4)), Number((spinAngle * 0.25).toFixed(4)), 0],
          Neck: [0, Number((-spinAngle * 0.2).toFixed(4)), 0],
          Head: [0, Number((-spinAngle * 0.2).toFixed(4)), 0],
          LeftUpperArm: [Number((0.65 + 0.5 * kickExtend).toFixed(4)), 0.3, Number((-0.65 + 0.3 * jumpArc).toFixed(4))],
          LeftForearm: [Number((1.55 - 0.4 * kickExtend).toFixed(4)), 0, 0],
          RightUpperArm: [Number((0.55 - 0.6 * kickExtend).toFixed(4)), -0.3, Number((0.65 - 0.3 * jumpArc).toFixed(4))],
          RightForearm: [1.45, 0, 0],
          // Support Leg (Left)
          LeftThigh: [Number((-0.45 * crouchDepth - 0.35 * jumpArc).toFixed(4)), 0, 0.08],
          LeftCalf: [Number((0.9 * crouchDepth + 0.65 * jumpArc).toFixed(4)), 0, 0],
          LeftFoot: [Number((-0.35 * crouchDepth).toFixed(4)), 0, 0],
          // Striking Leg (Right)
          RightThigh: [Number((-1.65 * kickExtend * ampMult - 0.5 * crouchDepth).toFixed(4)), Number((-0.35 * kickExtend).toFixed(4)), Number((-0.55 * kickExtend).toFixed(4))],
          RightCalf: [Number((1.4 * (1 - kickExtend) * jumpArc + 0.8 * crouchDepth).toFixed(4)), 0, 0],
          RightFoot: [Number((0.35 * kickExtend).toFixed(4)), 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Martial Arts Synthesizer' };
    }

    // Archetype 2: BACKFLIP / FRONTFLIP / SOMERSAULT / ACROBATIC LEAP
    if (lower.includes('flip') || lower.includes('somersault') || lower.includes('vault') || lower.includes('leap') || lower.includes('jump')) {
      const isBackflip = lower.includes('back');
      const flipSign = isBackflip ? -1 : 1;
      for (let f = 0; f < durationFrames; f++) {
        const u = f / Math.max(1, durationFrames - 1);
        const crouch = u < 0.22 ? Math.sin((u / 0.22) * Math.PI) : (u > 0.78 ? Math.sin(((u - 0.78) / 0.22) * Math.PI) : 0);
        const air = u >= 0.2 && u <= 0.8 ? Math.sin(((u - 0.2) / 0.6) * Math.PI) : 0;
        const tuck = u >= 0.25 && u <= 0.72 ? Math.sin(((u - 0.25) / 0.47) * Math.PI) : 0;

        const forwardDist = isBackflip ? -0.45 * u : 1.65 * u * speedMult;
        const rootPos = [
          0,
          Number((0.95 - crouch * 0.28 + air * 0.85 * ampMult).toFixed(3)),
          Number(forwardDist.toFixed(3))
        ];

        const localRotations = {
          LowerSpine: [Number((0.55 * crouch + flipSign * 0.75 * tuck).toFixed(4)), 0, 0],
          UpperSpine: [Number((0.35 * crouch + flipSign * 0.55 * tuck).toFixed(4)), 0, 0],
          Head: [Number((-0.35 * crouch + flipSign * 0.35 * tuck).toFixed(4)), 0, 0],
          LeftUpperArm: [Number((1.35 * air - 0.4 * crouch).toFixed(4)), 0, Number((-0.85 + 0.45 * air).toFixed(4))],
          LeftForearm: [Number((0.55 + 1.1 * tuck).toFixed(4)), 0, 0],
          RightUpperArm: [Number((1.35 * air - 0.4 * crouch).toFixed(4)), 0, Number((0.85 - 0.45 * air).toFixed(4))],
          RightForearm: [Number((0.55 + 1.1 * tuck).toFixed(4)), 0, 0],
          LeftThigh: [Number((-1.25 * crouch - 1.55 * tuck).toFixed(4)), 0.08, 0.05],
          LeftCalf: [Number((1.85 * crouch + 2.1 * tuck).toFixed(4)), 0, 0],
          LeftFoot: [Number((-0.5 * crouch).toFixed(4)), 0, 0],
          RightThigh: [Number((-1.25 * crouch - 1.55 * tuck).toFixed(4)), -0.08, -0.05],
          RightCalf: [Number((1.85 * crouch + 2.1 * tuck).toFixed(4)), 0, 0],
          RightFoot: [Number((-0.5 * crouch).toFixed(4)), 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Acrobatics Synthesizer' };
    }

    // Archetype 3: PUNCH / UPPERCUT / BOXING COMBO / SLASH
    if (lower.includes('punch') || lower.includes('uppercut') || lower.includes('jab') || lower.includes('hook') || lower.includes('box') || lower.includes('strike')) {
      for (let f = 0; f < durationFrames; f++) {
        const u = f / Math.max(1, durationFrames - 1);
        const phase = u * Math.PI * 3.0 * speedMult;
        const leftJab = Math.max(0, Math.sin(phase));
        const rightHook = Math.max(0, -Math.sin(phase));
        const stepForward = u * 0.65 * speedMult;

        const rootPos = [
          Number((Math.sin(phase * 0.5) * 0.06).toFixed(3)),
          Number((0.91 - 0.04 * Math.abs(Math.sin(phase))).toFixed(3)),
          Number(stepForward.toFixed(3))
        ];

        const localRotations = {
          LowerSpine: [0.12, Number((0.38 * rightHook - 0.35 * leftJab).toFixed(4)), 0],
          UpperSpine: [0.15, Number((0.45 * rightHook - 0.42 * leftJab).toFixed(4)), 0],
          Head: [-0.15, Number((-0.3 * rightHook + 0.3 * leftJab).toFixed(4)), 0],
          LeftUpperArm: [Number((0.75 + 0.85 * leftJab * ampMult).toFixed(4)), Number((0.3 - 0.25 * leftJab).toFixed(4)), Number((-0.65 + 0.45 * leftJab).toFixed(4))],
          LeftForearm: [Number((1.75 - 1.55 * leftJab).toFixed(4)), 0, 0],
          RightUpperArm: [Number((0.75 + 0.95 * rightHook * ampMult).toFixed(4)), Number((-0.3 + 0.25 * rightHook).toFixed(4)), Number((0.65 - 0.45 * rightHook).toFixed(4))],
          RightForearm: [Number((1.75 - 1.55 * rightHook).toFixed(4)), 0, 0],
          LeftThigh: [Number((-0.35 - 0.15 * leftJab).toFixed(4)), 0.12, 0.08],
          LeftCalf: [Number((0.55 + 0.2 * leftJab).toFixed(4)), 0, 0],
          RightThigh: [Number((0.15 - 0.2 * rightHook).toFixed(4)), -0.15, -0.08],
          RightCalf: [0.45, 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Combat Synthesizer' };
    }

    // Archetype 4: DRUNKEN STUMBLE / ZOMBIE SHAMBLE / DIZZY SWAY
    if (lower.includes('drunk') || lower.includes('stumble') || lower.includes('dizzy') || lower.includes('limp') || lower.includes('zombie') || lower.includes('wobble')) {
      for (let f = 0; f < durationFrames; f++) {
        const t = (f / 60) * speedMult;
        const stepPhase = t * Math.PI * 2.2;
        const swayX = Math.sin(t * 2.7) * 0.28 * ampMult + Math.cos(t * 1.3) * 0.12;
        const rootPos = [
          Number(swayX.toFixed(3)),
          Number((0.91 - Math.abs(Math.sin(stepPhase)) * 0.06).toFixed(3)),
          Number((t * 0.85).toFixed(3))
        ];

        const lSwing = Math.sin(stepPhase);
        const rSwing = -lSwing;

        const localRotations = {
          LowerSpine: [Number((0.22 + Math.sin(t * 3.1) * 0.18).toFixed(4)), Number((Math.cos(t * 2.4) * 0.25).toFixed(4)), Number((Math.sin(t * 2.7) * 0.28).toFixed(4))],
          UpperSpine: [Number((0.18 + Math.cos(t * 3.5) * 0.15).toFixed(4)), 0, Number((Math.sin(t * 2.7) * 0.2).toFixed(4))],
          Head: [Number((0.25 + Math.sin(t * 4.2) * 0.2).toFixed(4)), Number((Math.sin(t * 2.0) * 0.3).toFixed(4)), Number((Math.cos(t * 2.7) * 0.25).toFixed(4))],
          LeftUpperArm: [Number((0.55 + Math.sin(t * 3.0) * 0.35).toFixed(4)), 0, Number((-0.75 + Math.cos(t * 2.5) * 0.25).toFixed(4))],
          LeftForearm: [Number((0.65 + Math.sin(t * 4.0) * 0.3).toFixed(4)), 0, 0],
          RightUpperArm: [Number((0.55 + Math.cos(t * 2.8) * 0.35).toFixed(4)), 0, Number((0.75 + Math.sin(t * 2.5) * 0.25).toFixed(4))],
          RightForearm: [Number((0.65 + Math.cos(t * 3.8) * 0.3).toFixed(4)), 0, 0],
          LeftThigh: [Number((-0.35 * Math.max(0, lSwing) + 0.2 * Math.max(0, -lSwing)).toFixed(4)), 0, Number((Math.sin(t * 2.7) * 0.12).toFixed(4))],
          LeftCalf: [Number((0.65 * Math.max(0, lSwing) + 0.15).toFixed(4)), 0, 0],
          RightThigh: [Number((-0.35 * Math.max(0, rSwing) + 0.2 * Math.max(0, -rSwing)).toFixed(4)), 0, Number((Math.sin(t * 2.7) * 0.12).toFixed(4))],
          RightCalf: [Number((0.65 * Math.max(0, rSwing) + 0.15).toFixed(4)), 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Stumble Synthesizer' };
    }

    // Archetype 5: DODGE / DUCK / CROUCH EVADE / MATRIX LEAN
    if (lower.includes('dodge') || lower.includes('duck') || lower.includes('evade') || lower.includes('crouch') || lower.includes('squat') || lower.includes('matrix')) {
      for (let f = 0; f < durationFrames; f++) {
        const u = f / Math.max(1, durationFrames - 1);
        const env = Math.sin(u * Math.PI);
        const rootPos = [
          Number((Math.sin(u * Math.PI * 2) * 0.22 * ampMult).toFixed(3)),
          Number((0.95 - 0.34 * env * ampMult).toFixed(3)),
          Number((-0.18 * env).toFixed(3))
        ];
        const localRotations = {
          LowerSpine: [Number((0.55 * env).toFixed(4)), Number((0.35 * env).toFixed(4)), Number((0.2 * env).toFixed(4))],
          UpperSpine: [Number((0.25 * env).toFixed(4)), Number((-0.25 * env).toFixed(4)), 0],
          Head: [Number((-0.45 * env).toFixed(4)), 0, 0],
          LeftUpperArm: [Number((0.85 * env).toFixed(4)), 0.3, Number((-0.55 - 0.3 * (1 - env)).toFixed(4))],
          LeftForearm: [Number((1.65 * env + 0.3).toFixed(4)), 0, 0],
          RightUpperArm: [Number((0.85 * env).toFixed(4)), -0.3, Number((0.55 + 0.3 * (1 - env)).toFixed(4))],
          RightForearm: [Number((1.65 * env + 0.3).toFixed(4)), 0, 0],
          LeftThigh: [Number((-1.55 * env).toFixed(4)), 0.18, 0.12],
          LeftCalf: [Number((2.05 * env + 0.1).toFixed(4)), 0, 0],
          LeftFoot: [Number((-0.45 * env).toFixed(4)), 0, 0],
          RightThigh: [Number((-1.55 * env).toFixed(4)), -0.18, -0.12],
          RightCalf: [Number((2.05 * env + 0.1).toFixed(4)), 0, 0],
          RightFoot: [Number((-0.45 * env).toFixed(4)), 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Evasion Synthesizer' };
    }

    // Archetype 6: DANCE / WAVE / CELEBRATE / VICTORY JUMP
    if (lower.includes('dance') || lower.includes('wave') || lower.includes('celebrat') || lower.includes('cheer') || lower.includes('victory')) {
      for (let f = 0; f < durationFrames; f++) {
        const t = (f / 60) * speedMult;
        const beat = t * Math.PI * 4.0;
        const bounce = Math.abs(Math.sin(beat));
        const groove = Math.sin(beat * 0.5);

        const rootPos = [
          Number((groove * 0.16).toFixed(3)),
          Number((0.93 - bounce * 0.08 + Math.max(0, Math.sin(beat * 0.25)) * 0.12).toFixed(3)),
          0
        ];

        const localRotations = {
          LowerSpine: [0.05, Number((groove * 0.35).toFixed(4)), Number((groove * 0.18).toFixed(4))],
          UpperSpine: [-0.08, Number((-groove * 0.25).toFixed(4)), Number((-groove * 0.12).toFixed(4))],
          Head: [Number((Math.sin(beat) * 0.15).toFixed(4)), Number((groove * 0.2).toFixed(4)), 0],
          LeftUpperArm: [Number((0.35 + Math.sin(beat) * 0.4).toFixed(4)), 0, Number((0.55 + Math.sin(beat) * 0.35).toFixed(4))],
          LeftForearm: [Number((0.85 + Math.cos(beat) * 0.45).toFixed(4)), 0, 0],
          RightUpperArm: [Number((0.35 - Math.sin(beat) * 0.4).toFixed(4)), 0, Number((-0.55 - Math.cos(beat) * 0.35).toFixed(4))],
          RightForearm: [Number((0.85 + Math.sin(beat) * 0.45).toFixed(4)), 0, 0],
          LeftThigh: [Number((-0.35 * bounce - 0.2 * Math.max(0, groove)).toFixed(4)), 0, 0.08],
          LeftCalf: [Number((0.65 * bounce + 0.3 * Math.max(0, groove)).toFixed(4)), 0, 0],
          RightThigh: [Number((-0.35 * bounce - 0.2 * Math.max(0, -groove)).toFixed(4)), 0, -0.08],
          RightCalf: [Number((0.65 * bounce + 0.3 * Math.max(0, -groove)).toFixed(4)), 0, 0]
        };
        keyframes.push({ frame: f, rootPos, localRotations });
      }
      return { keyframes, sourceTier: 'Tier 3: Biomechanical Expressive Synthesizer' };
    }

    // Default Archetype: ATHLETIC SPRINT / CHARGE / LOCOMOTION GAIT
    const isRun = lower.includes('run') || lower.includes('sprint') || lower.includes('charge') || lower.includes('dash') || lower.includes('jog');
    const freq = isRun ? 3.2 * speedMult : 1.9 * speedMult;
    const strideSpeed = isRun ? 2.4 * speedMult : 1.25 * speedMult;
    const kneeLift = isRun ? 0.85 * ampMult : 0.48 * ampMult;

    for (let f = 0; f < durationFrames; f++) {
      const t = f / 60;
      const phase = t * Math.PI * 2 * freq;
      const lSwing = Math.sin(phase);
      const rSwing = -lSwing;
      const flight = isRun ? Math.max(0, Math.abs(Math.cos(phase)) - 0.5) * 0.14 : -Math.abs(Math.cos(phase)) * 0.035;

      const rootPos = [
        Number((Math.cos(phase) * 0.035).toFixed(3)),
        Number((0.94 + flight).toFixed(3)),
        Number((t * strideSpeed).toFixed(3))
      ];

      const localRotations = {
        LowerSpine: [isRun ? 0.22 : 0.08, Number((-lSwing * 0.18).toFixed(4)), Number((Math.cos(phase) * 0.06).toFixed(4))],
        UpperSpine: [isRun ? 0.14 : 0.04, Number((-lSwing * 0.22).toFixed(4)), 0],
        Head: [isRun ? -0.18 : -0.04, Number((lSwing * 0.12).toFixed(4)), 0],
        LeftUpperArm: [Number((rSwing * (isRun ? 0.75 : 0.38)).toFixed(4)), 0, -1.08],
        LeftForearm: [isRun ? 1.35 : 0.45, 0, 0],
        RightUpperArm: [Number((lSwing * (isRun ? 0.75 : 0.38)).toFixed(4)), 0, 1.08],
        RightForearm: [isRun ? 1.35 : 0.45, 0, 0],
        LeftThigh: [Number((-lSwing * kneeLift - 0.12).toFixed(4)), 0, 0.02],
        LeftCalf: [Number((Math.max(0, -lSwing) * (isRun ? 1.45 : 0.85) + 0.18).toFixed(4)), 0, 0],
        LeftFoot: [Number((lSwing * 0.22).toFixed(4)), 0, 0],
        RightThigh: [Number((-rSwing * kneeLift - 0.12).toFixed(4)), 0, -0.02],
        RightCalf: [Number((Math.max(0, -rSwing) * (isRun ? 1.45 : 0.85) + 0.18).toFixed(4)), 0, 0],
        RightFoot: [Number((rSwing * 0.22).toFixed(4)), 0, 0]
      };
      keyframes.push({ frame: f, rootPos, localRotations });
    }
    return { keyframes, sourceTier: 'Tier 3: Biomechanical Locomotion Synthesizer' };
  }

  /**
   * Apply World-Space Root Continuation (offsets X and Z so chained clips start where the previous clip ended)
   */
  applyRootContinuation(keyframes, initialRootPos = [0, 0.95, 0]) {
    if (!keyframes || keyframes.length === 0) return keyframes;
    const base0 = keyframes[0].rootPos || [0, 0.95, 0];
    const dx = (initialRootPos[0] ?? 0) - (base0[0] ?? 0);
    const dz = (initialRootPos[2] ?? 0) - (base0[2] ?? 0);

    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return keyframes;

    return keyframes.map(kf => {
      const rp = kf.rootPos || [0, 0.95, 0];
      return {
        ...kf,
        rootPos: [
          Number((rp[0] + dx).toFixed(3)),
          rp[1],
          Number((rp[2] + dz).toFixed(3))
        ]
      };
    });
  }
}
