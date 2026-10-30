# OpenDMS — Endorphin 2.5.2 / 2.7.1 Parity & Physics Upgrade Blueprint
*(Self-Contained Handoff & Execution Plan for Model Transition)*

> [!IMPORTANT]
> **How to Use This Blueprint if Switching Models / Resuming**:
> 1. All Reverse Engineering (REA) and User Design Interview (`/grill-me`) steps are **100% COMPLETE**. Do **not** re-interview the user or re-run binary decompression.
> 2. Read the **Execution Checklist** below to see which items are marked `[x]` (completed) vs `[ ]` (pending).
> 3. Execute the remaining phases in order (**Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 Verification**), updating the checkboxes in this file as each step is completed.

---

## 1. Confirmed User Decisions (from `/grill-me`)
1. **Execution Scope & Order**: Implement **all** proposed improvements across the codebase, starting immediately with **Phase 1 (8 Critical Runtime Bugs & Multi-Engine Crashes)**.
2. **Physics Engine & Rig Architecture**:
   - Keep the **15-bone core rig** (`Pelvis`, `LowerSpine`, `UpperSpine`, `Neck`, `Head`, `LeftUpperArm`, `LeftForearm`, `LeftHand`, `RightUpperArm`, `RightForearm`, `RightHand`, `LeftThigh`, `LeftCalf`, `LeftFoot`, `RightThigh`, `RightCalf`, `RightFoot`) for 100% compatibility with all mocaps, Mixamo X-Bot, and exporters, while folding Clavicle (`LeftShoulder`/`RightShoulder`) rotations cleanly into `LeftUpperArm`/`RightUpperArm` during retargeting.
   - Port Original Endorphin's **4 Virtual Muscles** (`LeftArmVirtualMuscle`, `RightArmVirtualMuscle`, `LeftLegVirtualMuscle`, `RightLegVirtualMuscle`), **Named Effector Calibrations**, **Dual Soft/Hard Joint Limits**, and **8 Native Contact Materials**.
3. **Multi-Engine Strategy**:
   - Fix all runtime crashes across **`Jolt`**, **`MuJoCo`**, and **`PhysX`** so all 4 engines run without throwing errors.
   - Make **`Rapier` + `Jolt`** the flagship engines for the new Virtual Muscle and Effector Calibration systems.
4. **Missing Endorphin 2.5.2 / 2.7.1 Features**:
   - Implement all 4 missing feature groups in sequence:
     1. Timeline Sim-to-Anim Root Matching & Partial Re-Simulation (`invalidateSimulationFromFrame`)
     2. Actor-to-Actor Bone Constraints & Breakable/Proximity Constraints
     3. Endorphin 2.7.1 Behavior Upgrades (`reachHold`, `balanceWithProps`, `jump`, `armsWindmill`, `fluid`) + `SELECTION_SETS` UI
     4. Native `.nmc` / `.ens` / `.nma` File Ingestion
5. **Workspace Cleanup**:
   - **[COMPLETED]** Removed stale Oct 17 duplicate root files (`main.js`, `character.js`, `behaviors.js`, `timeline.js`, `physics.js`, `props.js`, `sensors.js`, `sequencer.js`, `mixamo.js`, `endorphinParser.js`, `exportBVH.js`, `X Bot.fbx`, `xbot.fbx`) and duplicate root directories (`core/`, `dms/`, `parsers/`, `export/`, `models/`, `docs/docs/`).

---

## 2. Master Execution Checklist

- [x] **Phase 0: REA Analysis, Parity Audit, `/grill-me` Decisions, & Stale Root File Cleanup**
- [x] **Phase 1: Fix All 8 Critical Runtime Bugs & Multi-Engine Crashes**
  - [x] **1.1** Fix double `character.update(dt)` per substep in `src/dms/timeline.js` (lines 1230-1236) and normalize `'HOLD_PROXIMITY'` / `'proximityHold'` (lines 1794, 1899)
  - [x] **1.2** Fix Quick Behavior button keys in `index.html` (lines 2590-2602: `'catchFall'`, `'headProtect'`, `'stagger'`, `'tackle'`)
  - [x] **1.3** Add `executePrompt` alias to `AIStuntDirector` in `src/dms/aiStuntDirector.js` (line 210)
  - [x] **1.4** Fix `buildRulerTicks()`, `openBehaviorDrawer()`, `#btn-add-hold-constraint`, `currentSetGroundMaterialFn`, and Multi-Actor (`Actor 2`) picking/gizmo/inspector/GLB-export in `src/main.js`
  - [x] **1.5** Fix `PhysXCharacter` crashes & missing methods in `src/core/characterPhysx.js`
  - [x] **1.6** Fix `JoltCharacter` crashes (`ENDORPHIN_ACTIVE_POSES` import, `SetGroupID`, `spawnYaw`, `updateZMPBalance`) in `src/core/characterJolt.js`
  - [x] **1.7** Fix `MujocoCharacter` crashes (`ENDORPHIN_ACTIVE_POSES` import, `j.actuatorIds` in `applyActivePose`, `spawnYaw`, `updateZMPBalance`) in `src/core/characterMujoco.js`
- [x] **Phase 2: Port Original Endorphin Physics Engine Mechanics**
  - [x] **2.1** Port all 8 Native Endorphin Contact Materials (`default`, `skin`, `ice`, `rubber`, `sponge`, `steel`, `tarmac`, `velcro`) across `src/core/physics.js`, `src/core/physicsJolt.js`, `src/core/physicsMujoco.js`, `src/core/physicsPhysx.js`, and `index.html`
  - [x] **2.2** Port the 4 Virtual Muscles (`LeftArmVirtualMuscle`, `RightArmVirtualMuscle`, `LeftLegVirtualMuscle`, `RightLegVirtualMuscle`), `ENDORPHIN_EFFECTOR_CALIBRATIONS`, and Dual Soft/Hard Joint Limit zones into `src/core/character.js` and `src/core/characterJolt.js`
  - [x] **2.3** Fix Clavicle (`LeftShoulder`/`RightShoulder`) folding into `LeftUpperArm`/`RightUpperArm` in `src/parsers/animationRetargeter.js`
- [x] **Phase 3: Implement Missing Endorphin 2.5.2 / 2.7.1 Features**
  - [x] **3.1** Implement Partial Re-Simulation (`invalidateSimulationFromFrame(startFrame)`) and Sim-to-Anim Root Matching (`matchSimulatedRoot`) in `src/dms/timeline.js`
  - [x] **3.2** Implement Actor-to-Actor Bone Constraints (`pinTarget: 'actor:actor-2:UpperSpine'`) & Breakable Threshold UI in `src/dms/timeline.js` and `src/main.js`
  - [x] **3.3** Upgrade Endorphin 2.7.1 Behaviors (`reachHold`, `balanceWithProps`, `jump`/`jumpAndDive`, `armsWindmill`, `fluid`) + expose `SELECTION_SETS` selector in `src/dms/behaviors.js` and `src/main.js`
  - [x] **3.4** Upgrade `EndorphinParser` (`.nmc`, `.ens`, `.nma`, `.nme` 20-byte trailer stripping + scene/pose ingestion) and wire `#file-input` in `src/main.js`
- [x] **Phase 4: Build & Verification**
  - [x] **4.1** Run `npm run build` via Vite and verify zero syntax/bundle errors.

---

## 3. Detailed Technical Specifications by Phase

### PHASE 1: Fix All 8 Critical Runtime Bugs & Multi-Engine Crashes

#### Step 1.1 — `src/dms/timeline.js`
1. **Remove duplicate `actor.character.update(dt)` call in `stepSingleSimulationFrame`** (lines 1230–1236):
   - `this.stepActorFrame(actor, f, dt, s)` already calls `char.update(dt)` at lines 1369 and 1878. Calling it again at lines 1233–1235 runs PD motor torques, ZMP stepping, and sensor timers twice per substep.
2. **Support both `'HOLD_PROXIMITY'` and `'proximityHold'`** (lines 1794 and 1899).

#### Step 1.2 — `index.html`
- In Quick Behaviours (lines 2590–2601), replace `'catch-fall'`, `'protect-head'`, `'stagger-steps'`, `'tackle-charge'` with `'catchFall'`, `'headProtect'`, `'stagger'`, `'tackle'`.

#### Step 1.3 — `src/dms/aiStuntDirector.js`
- Add `async executePrompt(prompt, options = {}) { return this.processPrompt(prompt, options); }` right after `processPrompt` (line 210).

#### Step 1.4 — `src/main.js`
1. Add key alias map inside `addBehaviorLayer(behaviorKey)` and define `openBehaviorDrawer(category = 'all')` (`window.openBehaviorDrawer = openBehaviorDrawer`).
2. Alias `const buildRulerTicks = renderTimelineRuler; window.buildRulerTicks = renderTimelineRuler;` and replace calls at lines 7822, 7895, 9014, 9195, 9235, 9271.
3. Replace direct `setGroundMaterial(...)` calls at lines 397, 6726, 6734 with `(currentSetGroundMaterialFn || setGroundMaterial)(...)`.
4. Change `#btn-add-hold-constraint` (line 7640) `constraintType` to `'HOLD_PROXIMITY'`.
5. Update Multi-Actor (`Actor 2`) functions (`transformControls` drag handler at line 581, `getClosestCharacterBoneToWorldPoint` at 1408, `getClosestCharacterBoneToRay` at 1452, `updateForceArrowGizmo` at 1492, `updateBiomechanicalGizmos` at 1589, `updateBoneTrajectory` at 1768, `selectBone` at 4445, `renderBoneInspector` at 4498, `updateBoneInspectorLive` at 4636, and `triggerExportGLTFScene` at 7681).

#### Step 1.5 — `src/core/characterPhysx.js`
1. Import `ENDORPHIN_ACTIVE_POSES` from `./character.js`.
2. Initialize `targetAngle: new THREE.Euler(0, 0, 0)`, `childName: name`, `config`, `stiffness`, `damping` in `setupJoints()`.
3. Implement proper relative PD torque drive toward `j.targetAngle` in `applyMotorTorques(dt)`.
4. Add `applyActivePose(poseKey, strength)` and `updateZMPBalance(dt)`.

#### Step 1.6 — `src/core/characterJolt.js`
1. Import `ENDORPHIN_ACTIVE_POSES` from `./character.js`.
2. Fix `SetGroupID((this.actorIndex || 0) + 1)` at line 231.
3. Add `spawnYaw` and anti-ground foot clamping in `applyForwardKinematics`.
4. Add `updateZMPBalance(dt)` and invoke in `update(dt)`.

#### Step 1.7 — `src/core/characterMujoco.js`
1. Import `ENDORPHIN_ACTIVE_POSES` from `./character.js`.
2. Fix `applyActivePose` (lines 831–847) to use `j.actuatorIds` and update `j.targetAngle`.
3. Add `spawnYaw` support in `applyForwardKinematics` and `updateZMPBalance(dt)`.

---

### PHASE 2: Port Original Endorphin Physics Engine Mechanics
- **2.1**: Add all 8 Native Endorphin Contact Materials (`default`, `skin`, `ice`, `rubber`, `sponge`, `steel`, `tarmac`, `velcro`) across all 4 physics backends and `#ground-material-select` in `index.html`.
- **2.2**: Add `ENDORPHIN_EFFECTOR_CALIBRATIONS` and `applyVirtualMuscleDrive(limbKey, targetWorldPos, options)` (modeling `LeftArmVirtualMuscle`, `RightArmVirtualMuscle`, `LeftLegVirtualMuscle`, `RightLegVirtualMuscle` from `Standard Simulation Character.nmc`) to `BiomechanicalCharacter` (`src/core/character.js`) and `JoltCharacter` (`src/core/characterJolt.js`), and wire into `src/dms/behaviors.js`.
- **2.3**: Fold `LeftShoulder`/`RightShoulder` clavicle rotations into `LeftUpperArm`/`RightUpperArm` in `src/parsers/animationRetargeter.js`.

---

### PHASE 3: Implement Missing Endorphin 2.5.2 / 2.7.1 Features
- **3.1**: Add `invalidateSimulationFromFrame(startFrame)` and dynamic Sim-to-Anim root matching (`matchSimulatedRoot`) in `src/dms/timeline.js`.
- **3.2**: Add Actor-to-Actor bone constraints (`pinTarget: 'actor:actor-2:UpperSpine'`) and breakable threshold UI in `src/dms/timeline.js` and `src/main.js`.
- **3.3**: Upgrade `reachHold`, `balanceWithProps`, `jump`/`jumpAndDive`, `armsWindmill`, and `fluid` in `src/dms/behaviors.js`, and expose `SELECTION_SETS` in `src/main.js`.
- **3.4**: Upgrade `EndorphinParser` in `src/parsers/endorphinParser.js` (strip 20-byte trailer magic `72 a0 05 a1 c1 9e 8d e3 cc 94 70 05 d5 de 53 63`, add `parseSceneENS` and `parsePoseNMA`) and wire `#file-input` in `src/main.js`.
