import { BEHAVIOR_DEFINITIONS } from './behaviors.js';
import { TimelineEngine } from './timeline.js';
import { ENDORPHIN_MOCAP_LIBRARY } from '../parsers/animationRetargeter.js';
import { ENDORPHIN_POSES_LIBRARY } from '../parsers/poseLibrary.js';
import { TextToMotionClient } from './textToMotionClient.js';

/**
 * AI Stunt Director & Hybrid @-Tagging Text-to-Animation Compiler
 * Dual-mode AI:
 *  1. Full Stunt Scene Mode: Instant offline semantic physics parser + optional Gemini API integration.
 *  2. Text-to-Animation & @-Tagging Compiler: Combines native @bhv:, @anim:, @pose:, @force:, @prop:, @actor:
 *     tags with Open-Source Text-to-Motion AI (MoMask / MotionLCM / Biomechanical Synthesizer).
 */
export class AIStuntDirector {
  constructor(context = {}) {
    this.context = context; // { timeline, character, actor2Character, propsManager, animationRetargeter, callbacks }
    this.history = [];
    this.apiKey = localStorage.getItem('opendms_gemini_api_key') || '';
    this.mode = 'stunt'; // 'stunt' | 'motion'
    this.motionClient = new TextToMotionClient(context.animationRetargeter || null);
    this.motionClient.initCache();
  }

  setRetargeter(retargeter) {
    this.context.animationRetargeter = retargeter;
    this.motionClient.retargeter = retargeter;
  }

  /**
   * Build the complete catalog of native @ tags for autocomplete & compiler resolution
   */
  getAutocompleteCatalog() {
    const items = [];

    // 1. All 35 Native Endorphin Behaviors (@bhv:)
    for (const [key, def] of Object.entries(BEHAVIOR_DEFINITIONS)) {
      const pascal = key.charAt(0).toUpperCase() + key.slice(1);
      items.push({
        tag: `@bhv:${pascal}`,
        rawKey: key,
        type: 'bhv',
        label: def.name,
        category: `Behavior (${def.category || 'protective'})`,
        icon: def.icon || '⚡',
        color: def.color || '#38bdf8',
        desc: def.desc || ''
      });
    }

    // 2. All Saved AI Motions in IndexedDB (@anim:)
    if (this.motionClient && Array.isArray(this.motionClient.cachedClips)) {
      for (const aiClip of this.motionClient.cachedClips) {
        items.push({
          tag: `@anim:${aiClip.tagSlug}`,
          rawKey: aiClip.id,
          aiClipRecord: aiClip,
          type: 'anim',
          label: aiClip.name,
          category: 'AI Generated Motion',
          icon: '✨',
          color: '#ec4899',
          desc: `AI Text-to-Motion (${aiClip.durationFrames}f): "${aiClip.prompt}"`
        });
      }
    }

    // 3. All 48 Bundled Endorphin Mocap Clips (@anim:)
    for (const item of ENDORPHIN_MOCAP_LIBRARY) {
      const slug = item.name.replace(/[^a-zA-Z0-9]/g, '');
      items.push({
        tag: `@anim:${slug}`,
        rawKey: item.file,
        mocapItem: item,
        type: 'anim',
        label: item.name,
        category: `Mocap (${item.category})`,
        icon: item.icon || '🏃',
        color: '#10b981',
        desc: `Native ${item.file.endsWith('.bvh') ? 'BVH' : 'FBX'} Motion Capture: ${item.file}`
      });
    }

    // 4. All 25 Endorphin Poses (@pose:)
    for (const pose of ENDORPHIN_POSES_LIBRARY) {
      const slug = pose.name.replace(/[^a-zA-Z0-9]/g, '');
      items.push({
        tag: `@pose:${slug}`,
        rawKey: pose.id,
        poseItem: pose,
        type: 'pose',
        label: pose.name,
        category: `Pose (${pose.category})`,
        icon: pose.icon || '🧍',
        color: '#a855f7',
        desc: pose.description || ''
      });
    }

    // 5. Built-in Force & Field Presets (@force:)
    const forces = [
      { slug: 'ChestShove', label: 'Chest Shove Impulse (60N)', body: 'UpperSpine', mag: 60, yaw: 180, pitch: 8, icon: '💥' },
      { slug: 'BackTackle', label: 'Rear Tackle Impact (75N)', body: 'Pelvis', mag: 75, yaw: 0, pitch: 12, icon: '🏈' },
      { slug: 'HeadStrike', label: 'Head Hook Impulse (45N)', body: 'Head', mag: 45, yaw: 90, pitch: 5, icon: '🥊' },
      { slug: 'LegSweep', label: 'Ankle / Calf Sweep (55N)', body: 'LeftCalf', mag: 55, yaw: 180, pitch: 15, icon: '🦵' },
      { slug: 'UpwardBlast', label: 'Explosion Launch Upward (95N)', body: 'Pelvis', mag: 95, yaw: 180, pitch: 42, icon: '🚀' }
    ];
    for (const f of forces) {
      items.push({
        tag: `@force:${f.slug}`,
        rawKey: f.slug,
        forceItem: f,
        type: 'force',
        label: f.label,
        category: 'Force Impulse',
        icon: f.icon,
        color: '#f43f5e',
        desc: `Applies ${f.mag} N·s directional impulse to ${f.body}`
      });
    }

    // 6. Scene Props (@prop:) & Actors (@actor:)
    const propsAndActors = [
      { tag: '@prop:Crate', type: 'prop', rawKey: 'crate', label: 'Spawn Hurdle Crate', category: 'Prop', icon: '📦', color: '#f59e0b', desc: 'Spawns physical wooden obstacle crate ahead of character' },
      { tag: '@prop:FluidPool', type: 'prop', rawKey: 'fluid', label: 'Spawn Water Pool', category: 'Prop', icon: '🌊', color: '#0284c7', desc: 'Spawns 3D hydrodynamic buoyancy water pool' },
      { tag: '@prop:Projectile', type: 'prop', rawKey: 'projectile', label: 'Launch Bowling Ball', category: 'Prop', icon: '⚽', color: '#ef4444', desc: 'Fires high-velocity physical sphere at torso' },
      { tag: '@actor:1', type: 'actor', rawKey: 'actor-1', label: 'Target Actor 1 (Hero)', category: 'Actor', icon: '🔵', color: '#38bdf8', desc: 'Routes subsequent animations & behaviors to Actor 1' },
      { tag: '@actor:2', type: 'actor', rawKey: 'actor-2', label: 'Target Actor 2 (Opponent)', category: 'Actor', icon: '🟠', color: '#f97316', desc: 'Spawns and routes subsequent tracks to Actor 2' }
    ];
    items.push(...propsAndActors);

    return items;
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    if (this.apiKey) {
      localStorage.setItem('opendms_gemini_api_key', this.apiKey);
    } else {
      localStorage.removeItem('opendms_gemini_api_key');
    }
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Process a natural language director prompt or @-tagged Text-to-Animation statement
   * @param {string} prompt - e.g. "@anim:FastWalk then spin kick in the air then @bhv:CatchFall"
   * @param {Object} options - { forceMode: 'stunt' | 'motion' }
   * @returns {Promise<{ content: string, plan: Object, executed: boolean, generatedClips?: Array }>}
   */
  async processPrompt(prompt, options = {}) {
    const cleanPrompt = (prompt || '').trim();
    if (!cleanPrompt) {
      return { content: 'Please provide a prompt (e.g. `@anim:FastWalk then spin kick in the air then @bhv:CatchFall`).', plan: null, executed: false };
    }

    this.history.push({ role: 'user', content: cleanPrompt });

    const activeMode = options.forceMode || this.mode || 'stunt';
    const hasAtTags = /@(?:bhv|anim|pose|force|prop|actor):/i.test(cleanPrompt);

    // Route to Hybrid @-Tagging & Text-to-Animation Compiler if in 'motion' mode OR if prompt uses @ tags
    if (activeMode === 'motion' || hasAtTags) {
      const compileResult = await this.compileAndExecuteTaggedPrompt(cleanPrompt, options);
      const reply = {
        role: 'assistant',
        content: compileResult.summary,
        plan: compileResult.plan,
        generatedClips: compileResult.generatedClips || [],
        executed: true
      };
      this.history.push(reply);
      return reply;
    }

    let plan = null;
    let explanation = '';

    // If Gemini API Key is available, attempt Tier 2 Cloud Intelligence with fallback
    if (this.hasApiKey()) {
      try {
        const geminiResult = await this.callGeminiAPI(cleanPrompt);
        plan = geminiResult.plan;
        explanation = geminiResult.explanation;
      } catch (err) {
        console.warn('Gemini API call failed, falling back to Tier 1 Offline Semantic Parser:', err);
        plan = this.parsePromptOffline(cleanPrompt);
        explanation = plan.explanation;
      }
    } else {
      // Tier 1: Built-in Offline Semantic Physics Matcher
      plan = this.parsePromptOffline(cleanPrompt);
      explanation = plan.explanation;
    }

    // Execute the generated stunt plan into OpenDMS
    const execResult = this.executeStuntPlan(plan);

    const reply = {
      role: 'assistant',
      content: `${explanation}\n\n${execResult.summary}`,
      plan,
      executed: true
    };
    this.history.push(reply);

    return reply;
  }

  /**
   * Alias for processPrompt used by Quick AI Stunt Choreography preset buttons
   */
  async executePrompt(prompt, options = {}) {
    return this.processPrompt(prompt, options);
  }

  /**
   * HYBRID @-TAGGING & TEXT-TO-ANIMATION COMPILER
   * Supports:
   *  - Sequential chaining: "then", "->", "followed by", "afterward"
   *  - Simultaneous layering: "while", "with", "+"
   *  - Native tags: @bhv:Name, @anim:Name, @pose:Name, @force:Name, @prop:Name, @actor:1|2
   *  - Free-text AI segments: Any untagged action text is synthesized into a 15-bone ANIMATION clip
   */
  async compileAndExecuteTaggedPrompt(prompt, options = {}) {
    const ctx = this.context;
    const timeline = ctx?.timeline;
    if (!timeline) {
      return { summary: '⚠️ Timeline context not initialized.', plan: null, generatedClips: [] };
    }

    const catalog = this.getAutocompleteCatalog();
    const resolveTag = (tagStr) => {
      const lowerTag = tagStr.toLowerCase();
      return catalog.find(item => item.tag.toLowerCase() === lowerTag) ||
             catalog.find(item => item.tag.toLowerCase().startsWith(lowerTag));
    };

    let currentActorId = timeline.activeActorId || 'actor-1';
    // Determine starting frame: if options.replaceTimeline is false and playhead > 0, start at playhead
    let cursorFrame = 0;
    if (options.appendToTimeline) {
      const actorLayers = timeline.layers.filter(l => l.enabled && (l.actorId || 'actor-1') === currentActorId);
      for (const l of actorLayers) {
        if (l.endFrame > cursorFrame) cursorFrame = l.endFrame;
      }
    } else if (timeline.currentFrame > 0) {
      cursorFrame = timeline.currentFrame;
    } else {
      // Clear existing layers for a clean sequence compilation when starting at frame 0
      timeline.layers = [];
    }

    let currentRootPos = [0, 0.95, 0];
    // If appending after an existing animation layer, inherit its final rootPos
    const prevAnimLayers = timeline.layers.filter(l => l.type === 'ANIMATION' && (l.actorId || 'actor-1') === currentActorId && l.keyframes?.length > 0);
    if (prevAnimLayers.length > 0) {
      const latest = prevAnimLayers.reduce((a, b) => (a.endFrame > b.endFrame ? a : b));
      const lastKf = latest.keyframes[latest.keyframes.length - 1];
      if (lastKf?.rootPos) {
        currentRootPos = Array.isArray(lastKf.rootPos) ? [...lastKf.rootPos] : [lastKf.rootPos.x, lastKf.rootPos.y, lastKf.rootPos.z];
      }
    }

    // Split prompt into sequential stages by "then", "->", "followed by", "afterward", or ";"
    const sequentialStages = prompt
      .split(/\b(?:then|followed by|afterward|and then)\b|->|;/i)
      .map(s => s.trim())
      .filter(Boolean);

    const logSteps = [];
    const generatedClips = [];
    let addedLayersCount = 0;

    for (let sIdx = 0; sIdx < sequentialStages.length; sIdx++) {
      const stageText = sequentialStages[sIdx];
      // Split a sequential stage into simultaneous parallel clauses by "while", "with", or "+"
      const parallelClauses = stageText
        .split(/\b(?:while|during)\b|\+/i)
        .map(c => c.trim())
        .filter(Boolean);

      let stageStartFrame = cursorFrame;
      let stageMaxEndFrame = cursorFrame;

      for (let cIdx = 0; cIdx < parallelClauses.length; cIdx++) {
        let clause = parallelClauses[cIdx];

        // Extract optional duration modifier: e.g. "for 2s", "for 90f", "for 90 frames"
        let explicitFrames = null;
        const durSecMatch = clause.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b/i);
        const durFrameMatch = clause.match(/\bfor\s+(\d+)\s*(?:f|frames)\b/i);
        if (durSecMatch) {
          explicitFrames = Math.max(20, Math.round(parseFloat(durSecMatch[1]) * 60));
          clause = clause.replace(durSecMatch[0], '').trim();
        } else if (durFrameMatch) {
          explicitFrames = Math.max(15, parseInt(durFrameMatch[1], 10));
          clause = clause.replace(durFrameMatch[0], '').trim();
        }

        // Extract all @tags inside this clause
        const tagMatches = clause.match(/@(?:bhv|anim|pose|force|prop|actor):[a-zA-Z0-9_-]+/gi) || [];
        const freeText = clause
          .replace(/@(?:bhv|anim|pose|force|prop|actor):[a-zA-Z0-9_-]+/gi, '')
          .replace(/^[,.\s]+|[,.\s]+$/g, '')
          .trim();

        // 1. Process any @tags in the clause
        for (const rawTag of tagMatches) {
          const item = resolveTag(rawTag);
          if (!item) {
            logSteps.push(`⚠️ Unrecognized tag \`${rawTag}\` (skipped)`);
            continue;
          }

          if (item.type === 'actor') {
            currentActorId = item.rawKey;
            if (currentActorId === 'actor-2' && typeof ctx.addActor2 === 'function') {
              await ctx.addActor2();
            }
            timeline.activeActorId = currentActorId;
            logSteps.push(`${item.icon} Switched target character to **${item.label}**`);
          } else if (item.type === 'prop') {
            if (ctx.propsManager) {
              const ox = ctx.character?.spawnOffset?.x ?? 0;
              const oz = ctx.character?.spawnOffset?.z ?? 0;
              if (item.rawKey === 'crate') ctx.propsManager.spawnHurdleCrate({ x: ox, y: 0.22, z: oz + 1.1 });
              else if (item.rawKey === 'fluid') ctx.propsManager.spawnFluidVolume({ x: ox, y: 0.35, z: oz + 1.1 }, { x: 3.5, y: 0.7, z: 3.5 });
              else if (item.rawKey === 'projectile') {
                const pos = ctx.character?.bodies?.['UpperSpine']?.rigidBody?.translation?.() || { x: 0, y: 1.15, z: 0 };
                ctx.propsManager.launchProjectile({ x: pos.x, y: 1.25, z: pos.z + 3.8 }, { x: pos.x, y: Math.max(0.6, pos.y), z: pos.z }, 16.0);
              }
              logSteps.push(`${item.icon} **${item.tag}**: Spawned physical prop (${item.label})`);
            }
          } else if (item.type === 'bhv') {
            const def = BEHAVIOR_DEFINITIONS[item.rawKey];
            const dur = explicitFrames || (cIdx > 0 && stageMaxEndFrame > stageStartFrame ? (stageMaxEndFrame - stageStartFrame) : (def?.defaultDuration || 120));
            const sf = stageStartFrame;
            const ef = sf + dur;
            timeline.addLayer({
              actorId: currentActorId,
              name: def.name,
              type: 'BEHAVIOR',
              behavior: item.rawKey,
              startFrame: sf,
              endFrame: ef,
              blendIn: 10,
              blendOut: 12,
              intensity: 1.0,
              speed: 1.0,
              color: def.color || '#38bdf8'
            });
            addedLayersCount++;
            if (ef > stageMaxEndFrame) stageMaxEndFrame = ef;
            logSteps.push(`${item.icon} **${item.tag}** → Added native behavior **${def.name}** (${sf}f–${ef}f)`);
          } else if (item.type === 'force') {
            const fDef = item.forceItem;
            const sf = stageStartFrame;
            const ef = sf + (explicitFrames || 14);
            timeline.addLayer({
              actorId: currentActorId,
              name: `Force: ${fDef.label}`,
              type: 'PERTURBATION',
              targetBody: fDef.body,
              magnitude: fDef.mag,
              yawDeg: fDef.yaw,
              pitchDeg: fDef.pitch,
              forceMode: 'impulse',
              intensity: 1.0,
              startFrame: sf,
              endFrame: ef,
              color: '#f43f5e'
            });
            addedLayersCount++;
            if (ef > stageMaxEndFrame) stageMaxEndFrame = ef;
            logSteps.push(`${item.icon} **${item.tag}** → Applied ${fDef.mag}N impulse on \`${fDef.body}\` (${sf}f–${ef}f)`);
          } else if (item.type === 'pose') {
            const pDef = item.poseItem;
            const dur = explicitFrames || 45;
            const sf = stageStartFrame;
            const ef = sf + dur;
            const poseRoot = [
              currentRootPos[0],
              pDef.rootPos?.[1] ?? 0.95,
              currentRootPos[2]
            ];
            const kfs = [];
            for (let f = 0; f < dur; f++) {
              kfs.push({
                frame: f,
                rootPos: [...poseRoot],
                localRotations: JSON.parse(JSON.stringify(pDef.localRotations || {}))
              });
            }
            timeline.addLayer({
              actorId: currentActorId,
              name: `Pose: ${pDef.name}`,
              type: 'ANIMATION',
              animType: 'pose',
              startFrame: sf,
              endFrame: ef,
              durationFrames: dur,
              clipOffset: 0,
              blendIn: 10,
              blendOut: 10,
              color: '#a855f7',
              isDenseMocap: true,
              keyframes: kfs
            });
            addedLayersCount++;
            if (ef > stageMaxEndFrame) stageMaxEndFrame = ef;
            logSteps.push(`${item.icon} **${item.tag}** → Applied posture **${pDef.name}** (${sf}f–${ef}f)`);
          } else if (item.type === 'anim') {
            const sf = stageStartFrame;
            let animLayer = null;

            if (item.aiClipRecord) {
              const kfs = this.motionClient.applyRootContinuation(item.aiClipRecord.keyframes, currentRootPos);
              const dur = explicitFrames ? Math.min(explicitFrames, kfs.length) : kfs.length;
              animLayer = {
                id: `anim_ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                actorId: currentActorId,
                name: item.aiClipRecord.name,
                type: 'ANIMATION',
                animType: 'pose',
                enabled: true,
                startFrame: sf,
                endFrame: sf + dur,
                durationFrames: kfs.length,
                clipOffset: 0,
                blendIn: 10,
                blendOut: 12,
                color: '#ec4899',
                isDenseMocap: true,
                keyframes: kfs
              };
            } else if (this.motionClient.retargeter && item.rawKey) {
              try {
                const loaded = await this.motionClient.retargeter.loadFromUrl(item.rawKey, item.label, { startFrame: sf });
                loaded.keyframes = this.motionClient.applyRootContinuation(loaded.keyframes, currentRootPos);
                const dur = explicitFrames ? Math.min(explicitFrames, loaded.durationFrames) : Math.min(180, loaded.durationFrames);
                loaded.actorId = currentActorId;
                loaded.startFrame = sf;
                loaded.endFrame = sf + dur;
                loaded.clipOffset = 0;
                animLayer = loaded;
              } catch (err) {
                console.warn('Failed to load native mocap in tag:', err);
              }
            }

            if (animLayer) {
              timeline.layers.unshift(animLayer);
              timeline.selectedLayerId = animLayer.id;
              addedLayersCount++;
              const usedKfs = animLayer.keyframes[Math.min(animLayer.keyframes.length - 1, animLayer.endFrame - animLayer.startFrame - 1)];
              if (usedKfs?.rootPos) {
                currentRootPos = [...usedKfs.rootPos];
              }
              if (animLayer.endFrame > stageMaxEndFrame) stageMaxEndFrame = animLayer.endFrame;
              logSteps.push(`${item.icon} **${item.tag}** → Retargeted **${item.label}** (${animLayer.startFrame}f–${animLayer.endFrame}f)`);
            }
          }
        }

        // 2. If there is untagged free-text action in this clause, synthesize it via TextToMotionClient!
        if (freeText.length > 2) {
          const sf = stageStartFrame;
          const dur = explicitFrames || 100;
          const { layer, clipRecord } = await this.motionClient.generateAnimationLayer(freeText, {
            durationFrames: dur,
            startFrame: sf,
            initialRootPos: currentRootPos,
            apiKey: this.apiKey
          });
          layer.actorId = currentActorId;
          timeline.layers.unshift(layer);
          timeline.selectedLayerId = layer.id;
          addedLayersCount++;
          generatedClips.push(clipRecord);

          const lastKf = layer.keyframes[layer.keyframes.length - 1];
          if (lastKf?.rootPos) {
            currentRootPos = [...lastKf.rootPos];
          }
          if (layer.endFrame > stageMaxEndFrame) stageMaxEndFrame = layer.endFrame;

          logSteps.push(`✨ **AI Text-to-Motion** (\`${freeText}\`) → Generated **${layer.durationFrames}f** 15-bone animation (${sf}f–${layer.endFrame}f) & saved as \`@anim:${clipRecord.tagSlug}\``);
        }
      }

      // Advance sequential cursor to the end of this stage
      if (stageMaxEndFrame > cursorFrame) {
        cursorFrame = stageMaxEndFrame;
      }
    }

    // Expand timeline totalFrames if needed
    if (cursorFrame > timeline.totalFrames) {
      timeline.totalFrames = Math.max(timeline.totalFrames, cursorFrame + 15);
      const totalInput = document.getElementById('timeline-total-frames');
      if (totalInput) totalInput.value = timeline.totalFrames;
      const slider = document.getElementById('timeline-slider');
      if (slider) slider.max = timeline.totalFrames;
    }

    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);

    if (typeof ctx.renderTimelineLayers === 'function') ctx.renderTimelineLayers();
    if (typeof ctx.renderLayerInspector === 'function') ctx.renderLayerInspector();
    if (typeof ctx.updateSimulationStatusUI === 'function') ctx.updateSimulationStatusUI();
    if (typeof ctx.refreshMocapLibraryUI === 'function') ctx.refreshMocapLibraryUI();

    const summaryLines = [
      `🎯 **Compiled Hybrid Sequence (${addedLayersCount} track${addedLayersCount === 1 ? '' : 's'})**:`,
      ...logSteps.map(s => `• ${s}`)
    ];
    if (generatedClips.length > 0) {
      summaryLines.push(`\n💾 Saved **${generatedClips.length}** new AI clip(s) to the **Motion Capture Library (✨ AI Generated tab)**.`);
    }

    return {
      summary: summaryLines.join('\n'),
      plan: { layersCount: addedLayersCount, endFrame: cursorFrame },
      generatedClips
    };
  }

  /**
   * TIER 1: Comprehensive Offline Semantic Physics Matcher (100% offline, zero-latency)
   */
  parsePromptOffline(text) {
    const lower = text.toLowerCase();
    const plan = {
      staging: null,
      spawnActor2: false,
      clearTimeline: false,
      props: [],
      wind: null,
      twister: null,
      layers: [],
      autoSimulate: false,
      explanation: ''
    };

    // 1. Detect Actor References
    const mentionsActor2 = lower.includes('actor 2') || lower.includes('opponent') || lower.includes('defender') || lower.includes('both');
    const mentionsActor1 = lower.includes('actor 1') || lower.includes('hero') || !mentionsActor2;

    if (mentionsActor2) {
      plan.spawnActor2 = true;
    }

    // 2. Detect Staging Intent
    if (lower.includes('face to face') || lower.includes('facing each other') || lower.includes('confront')) {
      plan.staging = 'face-to-face';
      plan.spawnActor2 = true;
    } else if (lower.includes('run up') || lower.includes('run-up') || lower.includes('charge')) {
      plan.staging = 'tackle-runup';
      plan.spawnActor2 = true;
    } else if (lower.includes('side by side') || lower.includes('next to each other')) {
      plan.staging = 'side-by-side';
      plan.spawnActor2 = true;
    } else if (lower.includes('behind') || lower.includes('pursue') || lower.includes('chase')) {
      plan.staging = 'pursue';
      plan.spawnActor2 = true;
    }

    // 3. Detect Intensity & Force Multipliers
    let forceMultiplier = 1.0;
    if (lower.includes('violent') || lower.includes('brutal') || lower.includes('massive') || lower.includes('heavy') || lower.includes('super hard')) {
      forceMultiplier = 2.0;
    } else if (lower.includes('hard') || lower.includes('strong')) {
      forceMultiplier = 1.4;
    } else if (lower.includes('gentle') || lower.includes('soft') || lower.includes('light')) {
      forceMultiplier = 0.55;
    }

    // 4. Detect Timing (frames / seconds)
    let startFrame = 0;
    const atFrameMatch = lower.match(/(?:at|after|from)\s+frame\s+(\d+)/);
    if (atFrameMatch) {
      startFrame = parseInt(atFrameMatch[1], 10);
    } else if (lower.includes('after walk')) {
      startFrame = 60;
    }

    // 5. Detect Stunt Actions & Behaviors
    const explanations = [];

    // NATURAL STANDING STANCE / ACTIVE BALANCE
    if ((lower.includes('balance') || lower.includes('stand') || lower.includes('idle') || lower.includes('stance') || lower.includes('alive')) && !lower.includes('tackle') && !lower.includes('shove') && !lower.includes('trip')) {
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Natural Standing Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: 240,
        blendIn: 0,
        blendOut: 15,
        intensity: 1.0 * forceMultiplier,
        color: '#0ea5e9'
      });
      if (mentionsActor2) {
        plan.layers.push({
          actorId: 'actor-2',
          name: 'Natural Standing Balance',
          type: 'BEHAVIOR',
          behavior: 'idleStance',
          startFrame: 0,
          endFrame: 240,
          blendIn: 0,
          blendOut: 15,
          intensity: 1.0 * forceMultiplier,
          color: '#f97316'
        });
      }
      explanations.push(`🧍 **Natural Standing Balance**: Activated biological equilibrium on both feet with breathing micro-sway, relaxed arm resting posture, and compliant knee suspension.`);
    }

    // TACKLE STUNT
    else if (lower.includes('tackle')) {
      plan.spawnActor2 = true;
      if (!plan.staging) plan.staging = 'tackle-runup';

      // Actor 1 starts in Natural Stance Balance
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Natural Stance Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: 45,
        blendIn: 0,
        blendOut: 15,
        color: '#0ea5e9'
      });

      // Actor 2 Ready Stance before launch
      plan.layers.push({
        actorId: 'actor-2',
        name: 'Ready Stance Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: Math.max(10, (startFrame || 35)),
        blendIn: 0,
        blendOut: 10,
        color: '#f97316'
      });

      // Actor 2 Tackle Charge (Reactive Event-Driven Proximity Trigger & 2-Way Contact Grab)
      plan.layers.push({
        actorId: 'actor-2',
        name: 'Tackle & Wrap Takedown',
        type: 'BEHAVIOR',
        behavior: 'tackle',
        startFrame: Math.max(10, startFrame || 35),
        endFrame: Math.min(240, (startFrame || 35) + 120),
        blendIn: 10,
        blendOut: 20,
        intensity: 1.1 * forceMultiplier,
        speed: 1.1,
        color: '#dc2626',
        triggerType: 'proximity',
        triggerThreshold: 1.25,
        triggerTarget: 'actor-1',
        grabTarget: 'actor-1',
        grabBodyPart: 'Pelvis',
        grabBreakForce: 520.0
      });

      // Actor 1 Hit Reaction & Knee Absorption
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Dynamic Hit Reaction (Chest)',
        type: 'BEHAVIOR',
        behavior: 'hitReaction',
        startFrame: (startFrame || 35) + 8,
        endFrame: (startFrame || 35) + 95,
        blendIn: 8,
        blendOut: 15,
        intensity: 1.1 * forceMultiplier,
        color: '#f97316',
        triggerType: 'impact',
        triggerThreshold: 30.0
      });

      // Actor 1 Catch Fall Impact Reflex (Triggered on Ground/Collision Impact)
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Catch Fall Impact Reflex',
        type: 'BEHAVIOR',
        behavior: 'catchFall',
        startFrame: (startFrame || 35) + 40,
        endFrame: 240,
        blendIn: 12,
        blendOut: 20,
        intensity: 1.0,
        color: '#059669',
        triggerType: 'loss_of_balance',
        triggerThreshold: 35.0
      });

      explanations.push(`🏈 **Reactive Tackle Stunt**: Staged Actor 2 in tackle run-up. Both actors start in compliant Natural Standing Balance. Actor 2 initiates dynamic proximity-triggered tackle with 2-way pelvic grab coupling, triggering Actor 1 impact recoil and automatic loss-of-balance CatchFall reflex.`);
    }

    // CHEST SHOVE / PUNCH STUNT
    else if (lower.includes('shove') || lower.includes('push') || lower.includes('punch') || lower.includes('strike')) {
      plan.spawnActor2 = true;
      if (!plan.staging) plan.staging = 'face-to-face';

      const sf = startFrame || 25;

      // Actor 1 starts in Natural Standing Balance before shove
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Natural Stance Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: sf + 30,
        blendIn: 0,
        blendOut: 15,
        color: '#0ea5e9'
      });

      // Actor 2 starts in Ready Stance before shoving
      plan.layers.push({
        actorId: 'actor-2',
        name: 'Ready Stance Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: sf + 5,
        blendIn: 0,
        blendOut: 10,
        color: '#f97316'
      });

      // Actor 2 delivers Chest Shove
      plan.layers.push({
        actorId: 'actor-2',
        name: 'Chest Shove & Push',
        type: 'BEHAVIOR',
        behavior: 'chestShove',
        startFrame: sf,
        endFrame: sf + 80,
        blendIn: 10,
        blendOut: 15,
        intensity: 1.2 * forceMultiplier,
        color: '#ea580c'
      });

      // Actor 1 Impact Force
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Force on UpperSpine',
        type: 'PERTURBATION',
        targetBody: 'UpperSpine',
        startFrame: sf + 10,
        endFrame: sf + 20,
        magnitude: 48.0 * forceMultiplier,
        yawDeg: 180.0,
        pitchDeg: 6.0,
        color: '#dc2626'
      });

      // Actor 1 Hit Reaction with Knee Yield
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Hit Reaction Recoil',
        type: 'BEHAVIOR',
        behavior: 'hitReaction',
        startFrame: sf + 12,
        endFrame: sf + 90,
        blendIn: 6,
        blendOut: 15,
        intensity: 1.0 * forceMultiplier,
        color: '#f59e0b'
      });

      // Actor 1 Stagger Recovery Steps to preserve equilibrium
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Stagger Recovery Steps',
        type: 'BEHAVIOR',
        behavior: 'stagger',
        startFrame: sf + 35,
        endFrame: sf + 140,
        blendIn: 10,
        blendOut: 20,
        intensity: 1.0,
        color: '#eab308'
      });

      // Actor 1 Catch Fall if momentum carries them backward
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Catch Fall Ground Reach',
        type: 'BEHAVIOR',
        behavior: 'catchFall',
        startFrame: sf + 90,
        endFrame: 240,
        blendIn: 15,
        blendOut: 10,
        intensity: 1.0,
        color: '#059669'
      });

      explanations.push(`💥 **Chest Shove**: Staged actors Face-to-Face. Both characters begin in Natural Standing Balance; Actor 2 lunges forward with chest shove, Actor 1 absorbs the impulse through knee compliance, takes staggering recovery steps, and reaches hands in breakfall.`);
    }

    // HURDLE CRATE TRIP STUNT
    else if (lower.includes('trip') || lower.includes('stumble') || lower.includes('hurdle') || lower.includes('obstacle') || lower.includes('crate')) {
      plan.props.push('crate');
      const sf = startFrame || 50;

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Walk Gait',
        type: 'ANIMATION',
        animType: 'walk',
        startFrame: 0,
        endFrame: sf,
        blendIn: 0,
        blendOut: 10,
        color: '#2563eb'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Force on LeftCalf (Trip)',
        type: 'PERTURBATION',
        targetBody: 'LeftCalf',
        startFrame: sf,
        endFrame: sf + 10,
        magnitude: 48.0 * forceMultiplier,
        yawDeg: 180.0,
        pitchDeg: 0.0,
        color: '#ef4444'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Stagger Trip Strides',
        type: 'BEHAVIOR',
        behavior: 'stagger',
        startFrame: sf + 4,
        endFrame: sf + 55,
        blendIn: 6,
        blendOut: 12,
        intensity: 1.2 * forceMultiplier,
        color: '#eab308'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Catch Fall Protective Reflex',
        type: 'BEHAVIOR',
        behavior: 'catchFall',
        startFrame: sf + 35,
        endFrame: 170,
        blendIn: 10,
        blendOut: 15,
        intensity: 1.0,
        color: '#059669'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Ground Rest / Agony',
        type: 'BEHAVIOR',
        behavior: 'ragdoll',
        startFrame: 150,
        endFrame: 240,
        blendIn: 15,
        blendOut: 0,
        intensity: 1.0,
        color: '#7c3aed'
      });

      explanations.push(`🪜 **Obstacle Trip**: Spawned physical hurdle crate. Added walking gait into trip impact force on LeftCalf, stumbling recovery steps, and forward catch fall arm reach.`);
    }

    // PROJECTILE / BOWLING BALL STUNT
    else if (lower.includes('ball') || lower.includes('projectile') || lower.includes('cannon') || lower.includes('shoot')) {
      plan.props.push('projectile');
      const sf = startFrame || 25;

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Natural Standing Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: sf + 20,
        blendIn: 0,
        blendOut: 12,
        color: '#0ea5e9'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Protective Head Shield',
        type: 'BEHAVIOR',
        behavior: 'headShield',
        startFrame: Math.max(0, sf - 10),
        endFrame: sf + 35,
        blendIn: 8,
        blendOut: 12,
        intensity: 1.0,
        color: '#f59e0b'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Dynamic Hit Reaction',
        type: 'BEHAVIOR',
        behavior: 'hitReaction',
        startFrame: sf + 8,
        endFrame: sf + 80,
        blendIn: 5,
        blendOut: 15,
        intensity: 1.1 * forceMultiplier,
        color: '#ef4444'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Stagger Balance Recovery',
        type: 'BEHAVIOR',
        behavior: 'stagger',
        startFrame: sf + 40,
        endFrame: 240,
        blendIn: 10,
        blendOut: 15,
        intensity: 1.0,
        color: '#eab308'
      });

      explanations.push(`⚽ **Projectile Strike**: Character begins in compliant Natural Standing Balance, executes anticipation head shield, absorbs high-velocity impact with knee yield, and stumbles into recovery.`);
    }

    // FLUID / WATER POOL STUNT
    else if (lower.includes('water') || lower.includes('fluid') || lower.includes('pool') || lower.includes('swim') || lower.includes('drown')) {
      plan.props.push('fluid');
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Jump & Dive',
        type: 'BEHAVIOR',
        behavior: 'jumpDive',
        startFrame: 0,
        endFrame: 80,
        intensity: 1.0,
        color: '#0284c7'
      });

      plan.layers.push({
        actorId: 'actor-1',
        name: 'Water Swimming & Buoyancy',
        type: 'BEHAVIOR',
        behavior: 'fluid',
        startFrame: 30,
        endFrame: 240,
        intensity: 1.1 * forceMultiplier,
        color: '#38bdf8'
      });

      explanations.push(`🌊 **Water Swimming**: Spawned 3D hydrodynamic water pool. Added Jump & Dive entry into buoyant fluid swimming locomotion.`);
    }

    // WIND / TORNADO / VORTEX STUNT
    else if (lower.includes('wind') || lower.includes('twister') || lower.includes('tornado') || lower.includes('vortex') || lower.includes('storm')) {
      if (lower.includes('twister') || lower.includes('tornado') || lower.includes('vortex')) {
        plan.twister = 16.0 * forceMultiplier;
        plan.layers.push({
          actorId: 'actor-1',
          name: 'Panicked Air Flail',
          type: 'BEHAVIOR',
          behavior: 'flail',
          startFrame: 10,
          endFrame: 200,
          intensity: 1.2,
          color: '#a855f7'
        });
        explanations.push(`🌪️ **Twister Vortex**: Activated ${plan.twister} rad/s rotational vortex field with airborne flailing.`);
      } else {
        plan.wind = 25.0 * forceMultiplier;
        plan.layers.push({
          actorId: 'actor-1',
          name: 'Pusher Wind Blast',
          type: 'BEHAVIOR',
          behavior: 'pusher',
          startFrame: 0,
          endFrame: 140,
          intensity: 1.0,
          color: '#38bdf8'
        });
        plan.layers.push({
          actorId: 'actor-1',
          name: 'Stiff Brace Impact',
          type: 'BEHAVIOR',
          behavior: 'braceImpact',
          startFrame: 15,
          endFrame: 180,
          intensity: 1.0,
          color: '#f97316'
        });
        explanations.push(`💨 **Wind Blast**: Activated 25N continuous wind force field with full-body muscle brace response.`);
      }
    }

    // DEFAULT / GENERIC REFLEX FALL OR RAGDOLL
    else {
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Natural Standing Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: 140,
        blendIn: 0,
        blendOut: 20,
        intensity: 1.0 * forceMultiplier,
        color: '#0ea5e9'
      });
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Catch Fall Reflex',
        type: 'BEHAVIOR',
        behavior: 'catchFall',
        startFrame: 120,
        endFrame: 200,
        blendIn: 15,
        blendOut: 15,
        intensity: 1.0 * forceMultiplier,
        color: '#059669'
      });
      plan.layers.push({
        actorId: 'actor-1',
        name: 'Ragdoll Ground Rest',
        type: 'BEHAVIOR',
        behavior: 'ragdoll',
        startFrame: 180,
        endFrame: 240,
        blendIn: 15,
        blendOut: 0,
        intensity: 1.0,
        color: '#7c3aed'
      });
      explanations.push(`🧍 **Natural Balance to Ground Rest**: Starts in living Natural Standing Balance with compliant suspension, transitioning smoothly through protective breakfall into relaxed equilibrium.`);
    }

    plan.explanation = explanations.join('\n\n');
    return plan;
  }

  /**
   * TIER 2: Gemini API Cloud Intelligence (Deep Cinematic Reasoning)
   */
  async function_call_gemini(prompt) {
    // Handled in callGeminiAPI
  }

  async callGeminiAPI(prompt) {
    const systemPrompt = `You are the Lead Hollywood AI Stunt Coordinator and Biomechanics Physicist for OpenDMS, the high-performance real-time biomechanical simulation platform.
Given a director's natural language request, return ONLY a valid JSON object matching this schema:
{
  "explanation": "Cinematic and biomechanical explanation of your stunt design and physics setup",
  "spawnActor2": boolean,
  "staging": "face-to-face" | "tackle-runup" | "side-by-side" | "pursue" | null,
  "props": ["crate" | "projectile" | "fluid"],
  "wind": number | null,
  "twister": number | null,
  "layers": [
    {
      "actorId": "actor-1" | "actor-2",
      "name": string,
      "type": "BEHAVIOR" | "ANIMATION" | "PERTURBATION",
      "behavior": string (e.g. tackle, chestShove, hitReaction, catchFall, ragdoll, jumpDive, flail, fluid, pusher),
      "animType": "walk" | null,
      "targetBody": string (for PERTURBATION: UpperSpine, LeftCalf, Head, Pelvis),
      "magnitude": number (for PERTURBATION: 10 to 120),
      "yawDeg": number (0 to 360),
      "pitchDeg": number (-45 to 45),
      "startFrame": number (0 to 240),
      "endFrame": number (startFrame + 10 to 240),
      "intensity": number (0.5 to 2.5),
      "speed": number (0.5 to 2.0),
      "color": string (hex color)
    }
  ]
}
Return PURE JSON only, no markdown ticks, no preamble.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nDIRECTOR REQUEST: "${prompt}"` }] }
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error('No content returned from Gemini.');

    const cleanJson = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
    const plan = JSON.parse(cleanJson);
    return {
      plan,
      explanation: plan.explanation || 'Designed customized multi-actor stunt sequence via Gemini AI.'
    };
  }

  /**
   * Execute the parsed plan against the live OpenDMS session
   */
  executeStuntPlan(plan) {
    const ctx = this.context;
    if (!ctx || !ctx.timeline) {
      return { summary: '⚠️ Context not bound to timeline.', count: 0 };
    }

    const timeline = ctx.timeline;

    // 1. Spawning / Staging Actor 2
    if (plan.spawnActor2 && typeof ctx.addActor2 === 'function') {
      ctx.addActor2();
    }

    if (plan.staging && typeof ctx.applyStagingPreset === 'function') {
      ctx.applyStagingPreset(plan.staging);
    }

    // 2. Physical Props
    if (plan.props && ctx.propsManager) {
      for (const p of plan.props) {
        if (p === 'crate') {
          const ox = ctx.character?.spawnOffset?.x ?? 0;
          const oz = ctx.character?.spawnOffset?.z ?? 0;
          ctx.propsManager.spawnHurdleCrate({ x: ox, y: 0.22, z: oz + 1.1 });
        } else if (p === 'projectile') {
          const pos = ctx.character?.bodies?.['UpperSpine']?.rigidBody?.translation?.() || { x: 0, y: 1.15, z: 0 };
          ctx.propsManager.launchProjectile(
            { x: pos.x, y: 1.25, z: pos.z + 3.8 },
            { x: pos.x, y: Math.max(0.6, pos.y), z: pos.z },
            16.0
          );
        } else if (p === 'fluid') {
          const ox = ctx.character?.spawnOffset?.x ?? 0;
          const oz = ctx.character?.spawnOffset?.z ?? 0;
          ctx.propsManager.spawnFluidVolume({ x: ox, y: 0.35, z: oz + 1.1 }, { x: 3.5, y: 0.7, z: 3.5 });
        }
      }
    }

    // 3. Wind / Twister Force Fields
    if (plan.wind !== null && plan.wind !== undefined) {
      timeline.windForce = { x: 0, y: 0, z: -plan.wind * 3.5 };
      const windSlider = document.getElementById('wind-slider');
      const windVal = document.getElementById('wind-val');
      if (windSlider) windSlider.value = plan.wind;
      if (windVal) windVal.textContent = `${plan.wind} N`;
    }

    if (plan.twister !== null && plan.twister !== undefined) {
      timeline.twisterStrength = plan.twister;
      const twisterSlider = document.getElementById('twister-slider');
      const twisterVal = document.getElementById('twister-val');
      if (twisterSlider) twisterSlider.value = plan.twister;
      if (twisterVal) twisterVal.textContent = `${plan.twister} rad/s`;
    }

    // 4. Add Layers to Timeline
    if (plan.layers && plan.layers.length > 0) {
      // Clear existing layers if creating a fresh scene
      timeline.layers = [];

      for (const l of plan.layers) {
        timeline.addLayer({
          ...l,
          actorId: l.actorId || 'actor-1'
        });
      }
    }

    // 5. Invalidate and re-render UI
    timeline.invalidateSimulation();
    timeline.seek(0);

    if (typeof ctx.renderTimelineLayers === 'function') ctx.renderTimelineLayers();
    if (typeof ctx.renderLayerInspector === 'function') ctx.renderLayerInspector();
    if (typeof ctx.updateSimulationStatusUI === 'function') ctx.updateSimulationStatusUI();

    return {
      summary: `🎬 **Executed Stunt**: Configured **${plan.layers?.length || 0} timeline tracks**${plan.staging ? ` with staging \`${plan.staging}\`` : ''}. Ready to simulate!`,
      count: plan.layers?.length || 0
    };
  }
}
