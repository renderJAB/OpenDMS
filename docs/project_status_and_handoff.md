# OpenDMS (Endorphin Parallel) — Project Status & Handoff Guide

This document captures the complete architectural state, verified features, file layout, and instructions to resume development seamlessly on another machine or in a fresh AI session.

---

## 1. Project Overview & Architecture
OpenDMS is a high-fidelity web-based Dynamic Motion Synthesis (DMS) and biomechanical character simulation engine built in Three.js and Rapier 3D WASM, achieving architectural parity with NaturalMotion Endorphin 2.7.1.

### Core Systems Implemented & Verified
1. **Biomechanical Humanoid (`src/core/character.js`)**:
   - **14-Group Collision Matrix (`COLLISION_GROUPS`)**: Dedicated groups for `LeftHand` (`0x0040`) and `RightHand` (`0x0200`). Full mutual collision between hands, arms, torso, head, and legs. Zero binding at adjacent joint pivots.
   - **Continuous Collision Detection (CCD)**: Active on all dynamic bodies (`rb.enableCcd(true)` and `world.integrationParameters.maxCcdSubsteps = 4`). Completely eliminates high-speed limb and chest tunneling during heavy impact forces.
   - **Native WASM Joint Limits & Implicit ForceBased Motors**: Asymmetric 3-DOF angular limits on spine, hips, neck, and 1-DOF hinges on knees and elbows matching Endorphin `StandardCharacter.xml`.
   - **Passive Postural Column Ragdoll**: Upright postural stiffness that relaxes smoothly to physiological joint viscosity when off balance so falling limbs drop at true $9.81\text{ m/s}^2$ gravity.
2. **Endorphin-Grade Timeline Blending (`src/dms/timeline.js`)**:
   - **Hermite S-Curve Envelope (`computeLayerWeight`)**: Smooth $S(\tau) = 3\tau^2 - 2\tau^3$ blend-in and blend-out curves over configurable frame durations (default 10 frames).
   - **Animation-to-Physics Crossfade**: During the `blendOut` window of kinematic animations (e.g. walk cycle), joint motors track the animated gait with fading stiffness, momentum is preserved, and dynamic behaviors / ragdoll take over without popping.
3. **Dynamic DMS Behaviors (`src/dms/behaviors.js`)**:
   - Active Balance (LIPM + Ankle/Hip strategy), Directional Catch Fall, Arms Windmill / Flail, Head Protect / Flinch, Stagger Steps, Crouch / Landing Absorption, Jump & Launch, Ground Writhing, and Pure Ragdoll.
   - All behaviors smoothly modulated via `THREE.MathUtils.lerp` using the timeline layer weights.
4. **Mixamo & Studio Mannequin Visualization (`src/core/mixamo.js`)**:
   - Mixamo `X Bot.fbx` skinned mesh bridge with local-space root displacement and rotation delta binding.
   - Stylized PBR Mannequin with visor, armor plates, and visible hinge pins.
5. **Interactive Viewport & Inspector UI (`src/main.js` & `index.html`)**:
   - **Right-Side Property Inspector**: Live tuning of Strength/Intensity, Speed, Start/End timing, and **Blend In / Blend Out** frame durations.
   - **3D Move Axis Gizmo**: Interactive W-key translate arrows for character X/Y/Z placement.
   - **Directional Force Effector**: Click any bone in 3D to apply directional impulse hits with spherical yaw/pitch/magnitude controls.
   - **Timeline Sequencer**: Multi-track draggable bars with visual blend-in and blend-out gradient wedges and `⧗ 10f in / 10f out` badges.

---

## 2. Quick Start on Any New Machine

### Prerequisites
1. Install **Node.js** (v18, v20, or v22 LTS recommended) from [nodejs.org](https://nodejs.org).

### Steps to Run
1. Copy or extract this project folder to the new computer.
2. Open terminal in this folder and install dependencies:
   ```cmd
   npm install
   ```
3. Run the development server:
   - **Windows**: Double-click `run.bat` (automatically clears port 3000 and opens your browser).
   - **Cross-platform**: Run `npm run dev`.
4. Open your browser to: **`http://localhost:3000`**.

---

## 3. Resume Prompt for Antigravity (AI Assistant)
If continuing this project with an AI assistant on another machine, copy and paste this prompt:

```text
I am continuing development of OpenDMS (NaturalMotion Endorphin parallel engine in Three.js and Rapier WASM).
Please read `docs/project_status_and_handoff.md`, `docs/anatomical_ragdoll_blueprint.md`, and `docs/endorphin_271_comparison_and_roadmap.md` to pick up our exact progress.
The dev server runs with `run.bat` or `npm run dev` on http://localhost:3000.
```
