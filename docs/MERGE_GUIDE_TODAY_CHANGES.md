# OpenDMS — Today's Complete Changes & Detailed Cross-Device Merge Blueprint

This document provides a **comprehensive, file-by-file, function-by-function specification** of all **9 major features and architectural fixes** built today in `G:\My Drive\OpenDMS`.

Use this guide when merging today's work into the slightly different build on your other device so that **zero local features on your other device are lost** and **100% of today's upgrades are cleanly integrated**.

---

## 🚀 Exact Prompt to Paste into Antigravity on Your Other Device

Open your existing project workspace on your other computer in Antigravity, and send this message:

```text
I have synced today's updated build of OpenDMS in my Google Drive at `G:\My Drive\OpenDMS`.
First, read `G:\My Drive\OpenDMS\docs\MERGE_GUIDE_TODAY_CHANGES.md` and `G:\My Drive\OpenDMS\docs\TEXT_TO_MOTION_AI_BLUEPRINT.md`.
My current workspace on this device has its own slightly different build. Please compare my local files against `G:\My Drive\OpenDMS\` and surgically merge all 9 features detailed in `MERGE_GUIDE_TODAY_CHANGES.md` into my local build without overwriting any unique features I created on this device.
```

---

## 📋 Complete Manifest of Modified & New Files

| File Path | Status | Summary of Changes |
| :--- | :--- | :--- |
| **`src/dms/textToMotionClient.js`** | **NEW FILE (17 KB)** | Open-Source Text-to-Motion AI Client (Tier 1 Hugging Face MoMask Gradio API, Tier 2 Local Python Sidecar `localhost:8000`, Tier 3 Gemini 2.0 & Biomechanical Motion Synthesizer) + `AIMotionStorage` (`IndexedDB` persistence) + World-Space Root Continuation (`applyRootContinuation`). Copy this file directly into `src/dms/`. |
| **`src/dms/aiStuntDirector.js`** | **MODIFIED** | Added `getAutocompleteCatalog()` (81+ native `@bhv:`, `@anim:`, `@pose:`, `@force:`, `@prop:`, `@actor:` tags + saved AI clips) and `compileAndExecuteTaggedPrompt()` (sequential `then`, parallel `while`, duration `for Xs`/`for Xf`, and root-offset stitching). |
| **`src/export/exportBVH.js`** | **MODIFIED** | Added `keyframesToBVH(keyframes, fps)` to serialize any 15-bone OpenDMS animation or AI-generated clip into a standard 15-joint `.bvh` file for download and Google Drive sharing. |
| **`src/parsers/animationRetargeter.js`** | **MODIFIED** | Added `computeWorldBindMap(boneMap)` for automatic **A-Pose to T-Pose arm/clavicle rest-pose alignment**, plus `loadFromBVHString(bvhText, clipName, options)` for direct BVH string ingestion from AI models. |
| **`src/dms/timeline.js`** | **MODIFIED** | Added NLE clip editing methods (`splitLayerAtFrame`, `trimLayerStartToFrame`, `trimLayerEndToFrame`, `duplicateLayer`, `fitTimelineToLayers`), `layer.clipOffset` phase support, `findLatestPastAnimLayer` pose holding after animation ends, and 60 Hz linear/angular velocity tracking (`prevAnimKinematics`) for seamless animation-to-physics handover. |
| **`src/core/character.js`** | **MODIFIED** | Added `applyPoseState(poseSample)` so Studio Mannequin updates both Rapier rigidBodies and Three.js `mesh.position`/`mesh.quaternion` immediately during timeline scrubbing. |
| **`index.html`** | **MODIFIED** | Fixed Top Menu Bar dropdown/submenu clipping, expanded `Behaviors` menu to all 6 categories & 35 behaviors, removed redundant left-panel behavior library, added NLE Timeline Toolbar (`Split`, `Trim In`, `Trim Out`, `Duplicate`, `Delete`, `Fit`, step transport, editable total frames), added draggable edge resizers (`↕` and `↔`), added Animation Target Choice Modal (`Actor 1` vs `Actor 2`), and added the Text-to-Animation `@`-Tagging UI + `✨ AI Generated` tab in the Mocap Library. |
| **`src/main.js`** | **MODIFIED** | Set Studio Mannequin as default character, wired `promptAnimationTarget()`, smart `getBehaviorStartFrame()`, `setupNLETimelineTools()`, `setupPanelResizers()`, `@`-tag live autocomplete popup (`#ai-tag-autocomplete`), Mode Toggle (`Full Stunt Scene` vs `Text-to-Animation (@Tag)`), and `✨ AI Generated` Mocap Library cards with `.BVH` download. |
| **`run.bat`** | **MODIFIED** | Added automatic `npm install` check if `node_modules\vite\bin\vite.js` is missing when opening on a new computer. |

---

## 🔍 Detailed Technical Breakdown of All 9 Features to Merge

### Feature 1: Top Menu Bar Submenu Fix & Full 35-Behavior Menu (`index.html`, `src/main.js`)
1. **CSS Fixes in `index.html`**:
   - In `.menu-dropdown`: Remove `overflow: hidden;` so nested `.menu-sub-dropdown` flyout menus are visible outside the parent dropdown box.
   - Add `.menu-sub-dropdown::before` (`content: ''; position: absolute; top: 0; bottom: 0; left: -10px; width: 10px;`) so diagonal mouse movement from a parent item into a submenu never loses `:hover`.
2. **Menu Event Fix in `src/main.js` (`setupTopMenuBar`)**:
   - Inside `item.addEventListener('click', (e) => { ... })`, add `if (e.target.closest('.menu-dropdown')) return;` at the top so clicking a menu command doesn't toggle the parent menu open again.
3. **Expanded `Behaviors` Menu & Left-Panel Cleanup**:
   - In `index.html`, replace the `[data-menu="behaviors"]` dropdown with all 6 category submenus (*Physical Effects*, *Protective & Fall Reflexes*, *Locomotion & Equilibrium*, *Arm & Upper Body Actions*, *Leg & Torso Actions*, *Agony & Draping*) covering all 35 behaviors (`class="menu-entry bhv-preset-entry" data-behavior="..."`), plus `#menu-open-bhv-library`.
   - Remove the redundant `ENDORPHIN 2.7 BEHAVIOUR LIBRARY` control group from `.panel-left`.
   - In `src/main.js` (`setupBehaviorLibrary`), change `if (!categoriesContainer || !secondaryMenu) return;` to `if (!secondaryMenu) return;`, guard `categoriesContainer` with `if (categoriesContainer)`, and populate `#secondary-menu-cat-tabs` inside the slide-out drawer.

---

### Feature 2: Animation Target Choice Modal — Actor 1 vs. Spawn Actor 2 (`index.html`, `src/main.js`)
1. **HTML Modal (`#modal-anim-target-choice`)**:
   - Copy the `#modal-anim-target-choice` block from the bottom of `G:\My Drive\OpenDMS\index.html` (contains `#btn-target-actor-1`, `#btn-target-actor-2`, `#btn-close-anim-target-modal`, `#btn-cancel-anim-target`).
2. **JS Handler (`promptAnimationTarget` in `src/main.js`)**:
   - Copy `promptAnimationTarget(clipTitle)` and call it at the start of `loadAndApplyMocap(url, name, targetActorId = null)` and `handleCustomAnimationFile(file, targetActorId = null)` whenever `targetActorId` is not explicitly passed.
   - If the user picks `'actor-2'` and `!actor2Active`, automatically call `await addActor2()` and sync visibility with `currentModelType`.

---

### Feature 3: Studio Mannequin Default Character & Viewport Sync (`src/core/character.js`, `src/main.js`, `index.html`)
1. **Default State (`src/main.js`)**:
   - Set `let currentModelType = 'mannequin';` (instead of `'mixamo'`).
   - In the `mixamoBridge.loadFromUrl('/models/xbot.fbx')` callback in `init()`, add:
     ```js
     if (currentModelType === 'mannequin') {
       mixamoBridge.setVisible(false);
     }
     ```
2. **Immediate Mesh Transform Sync (`applyPoseState` in `src/core/character.js`)**:
   - Copy `applyPoseState(poseSample)` into `BiomechanicalCharacter` in `src/core/character.js`. Whenever `applyForwardKinematics` sets Rapier rigid-body translations/rotations, it must also immediately copy those positions and quaternions to `b.mesh.position` and `b.mesh.quaternion` so the Studio Mannequin moves in the 3D viewport even while paused/scrubbing.

---

### Feature 4: A-Pose to T-Pose Arm & Clavicle Retargeting Fix (`src/parsers/animationRetargeter.js`)
1. **Rest-Pose Alignment (`computeWorldBindMap` / `qAlignL` & `qAlignR`)**:
   - Copy `src/parsers/animationRetargeter.js` from `G:\My Drive\OpenDMS\src\parsers\animationRetargeter.js`.
   - It inspects the bind-pose world positions of `LeftUpperArm` $\rightarrow$ `LeftForearm` and `RightUpperArm` $\rightarrow$ `RightForearm` at rest, computes the exact correction quaternion from the source rig's rest arm direction (e.g., 30°–45° A-pose or vertical arms-down in BVH) to OpenDMS's horizontal T-pose (`+X` / `-X`), and multiplies arm world quaternions by that alignment delta.
   - Also includes `loadFromBVHString(bvhText, clipName, options)` for direct BVH text retargeting.

---

### Feature 5: Seamless Animation-to-Physics Handover & Final Pose Holding (`src/dms/timeline.js`)
1. **Hold Final Pose When Animation Ends (`findLatestPastAnimLayer`)**:
   - In `src/dms/timeline.js`, copy `findLatestPastAnimLayer(actorLayers, frame)`.
   - In both `stepActorFrame()` and `seek()`, when `frame >= animLayer.endFrame` and no active behavior or force is running on that frame, sample `animLayer` at `animLayer.endFrame` instead of resetting the character to `(0, 0, 0)` T-pose.
2. **60 Hz Momentum Transfer (`prevAnimKinematics` & `quatDeltaToAngVel`)**:
   - While an `ANIMATION` layer is active in `stepActorFrame()`, compute each bone's linear velocity `(pos - prevPos) / dt` and angular velocity `quatDeltaToAngVel(prevQuat, quat, dt)` and apply them via `rb.setLinvel` / `rb.setAngvel`.
   - When the animation ends and a behavior/simulation takes over on the next frame (`justFinishedAnim`), the ragdoll inherits the exact running/jumping momentum of the animation.

---

### Feature 6: Smart Behavior Start-Frame Sequencing (`getBehaviorStartFrame` in `src/main.js`)
- In `src/main.js`, copy `getBehaviorStartFrame(preferredDuration)` and use it inside `addBehaviorLayer()`, `#btn-add-impulse`, and `#btn-add-pin`:
  - If `timeline.currentFrame > 0`, places the new behavior at `timeline.currentFrame`.
  - If `timeline.currentFrame === 0` and the active actor already has layers on the timeline, automatically sequences the new behavior at `maxEnd` (right after the existing animation/behavior ends) and expands `timeline.totalFrames` if `sf + duration > timeline.totalFrames`.

---

### Feature 7: NLE Timeline Editing Toolbar (`Split`, `Trim In`, `Trim Out`, `Duplicate`, `Delete`, `Fit`) & `clipOffset`
1. **Timeline Engine (`src/dms/timeline.js`)**:
   - Ensure `samplePoseLayer()` and all `sampleWalkCycle()` calls include `(layer.clipOffset || 0)`:
     ```js
     const localFrame = Math.max(0, (clampedFrame - layer.startFrame) * (layer.speed ?? 1.0) + (layer.clipOffset || 0));
     ```
   - Copy the NLE methods into `TimelineEngine`:
     - `findTargetLayerForEdit(preferredLayerId, requireFrameInside)`
     - `splitLayerAtFrame(frame, layerId)`
     - `trimLayerStartToFrame(frame, layerId)`
     - `trimLayerEndToFrame(frame, layerId)`
     - `duplicateLayer(layerId)`
     - `fitTimelineToLayers(minFrames, paddingFrames)`
2. **UI & Event Listeners (`index.html`, `src/main.js`)**:
   - Copy `.nle-tool-group`, `.nle-tool-btn`, and `.timeline-total-input` styles and HTML buttons (`#btn-step-start`, `#btn-step-prev`, `#btn-step-next`, `#btn-step-end`, `#timeline-total-frames`, `#btn-timeline-split`, `#btn-timeline-trim-in`, `#btn-timeline-trim-out`, `#btn-timeline-duplicate`, `#btn-timeline-delete`, `#btn-timeline-fit`) from `index.html`.
   - Copy `setupNLETimelineTools()` and keyboard hotkeys (`S`, `[`, `]`, `D`, `Delete`, `ArrowLeft`, `ArrowRight`, `Home`, `End`) from `src/main.js`.

---

### Feature 8: Draggable Edge Resizers with Hover Arrow Pills (`↕` Timeline & `↔` Panels)
1. **CSS & DOM (`index.html`)**:
   - Copy `.ui-resizer-horizontal`, `.ui-resizer-vertical`, and `.resizer-arrow-pill` CSS rules.
   - Add `<div id="resizer-timeline" class="ui-resizer-horizontal"><span class="resizer-arrow-pill">↕</span></div>` at the top of `<footer>`.
   - Add `<div id="resizer-left-panel" class="ui-resizer-vertical ui-resizer-left-edge"><span class="resizer-arrow-pill">↔</span></div>` inside `.panel-left`.
   - Add `<div id="resizer-right-panel" class="ui-resizer-vertical ui-resizer-right-edge"><span class="resizer-arrow-pill">↔</span></div>` inside `.panel-right`.
2. **Pointer Drag Logic (`setupPanelResizers` in `src/main.js`)**:
   - Copy `setupPanelResizers()` into `setupUI()` in `src/main.js`.

---

### Feature 9: Hybrid Text-to-Animation AI & `@`-Tagging Compiler (`src/dms/textToMotionClient.js`, `src/dms/aiStuntDirector.js`, `src/export/exportBVH.js`, `index.html`, `src/main.js`)
1. **Copy New Module**:
   - Copy `G:\My Drive\OpenDMS\src\dms\textToMotionClient.js` to `src/dms/textToMotionClient.js`.
2. **Update `src/export/exportBVH.js`**:
   - Copy `keyframesToBVH(keyframes, fps)` into `src/export/exportBVH.js`.
3. **Update `src/dms/aiStuntDirector.js`**:
   - Copy `G:\My Drive\OpenDMS\src\dms\aiStuntDirector.js` (adds `this.motionClient`, `getAutocompleteCatalog()`, and `compileAndExecuteTaggedPrompt()`).
4. **Update `index.html` & `src/main.js`**:
   - Add `.ai-mode-switch-row`, `.ai-mode-btn`, and `.ai-tag-autocomplete` styles and markup to `index.html`.
   - Add the `✨ AI Generated` filter button and `✨ Generate AI Motion...` button inside `#modal-mocap-library`, plus `#menu-text-to-anim-ai` in the `Animation` top menu.
   - In `src/main.js`, pass `animationRetargeter` and `refreshMocapLibraryUI` into `new AIStuntDirector(...)`, update `setupMocapLibraryModal()` to render saved AI clips with `Apply` and `💾 .BVH` download buttons, and update `setupAIStuntDirectorUI()` with the mode switcher and live `@`-tag autocomplete popup.
