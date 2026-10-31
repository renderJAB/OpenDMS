# OpenDMS Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Support on Gumroad](https://img.shields.io/badge/Support_on-Gumroad-ff90e8?logo=gumroad&logoColor=black)](https://renderjab.gumroad.com/l/opendms)
[![Three.js](https://img.shields.io/badge/Render-Three.js_r170-black?logo=three.js)](https://threejs.org/)
[![WebAssembly](https://img.shields.io/badge/Physics-WASM_Multi--Engine-654ff0?logo=webassembly)](https://webassembly.org/)

> **OpenDMS** is a high-performance, real-time 3D physics-driven character simulation and stunt animation suite. Built on WebAssembly and WebGL/Three.js, OpenDMS unites **Dynamic Motion Synthesis (DMS)**, multi-backend WASM physics, natural language AI stunt direction, and professional DCC timeline authoring into a clean, modern, standalone studio environment.

---

## ⚡ Core Capabilities & Subsystems

### 1. Biomechanical Character & Articulation
* **15-Segment Humanoid Plant**: Anatomically distributed masses (92.5 kg baseline), collision sphyls, and calibrated joint limits (`Pelvis`, `LowerSpine`, `UpperSpine`, `Neck`, `Head`, bilateral upper/lower arms and legs).
* **3-DOF Motorized Joint Drives**: Spring-damper servos running at 120 Hz fixed substepping ($F = -k_p (\theta - \theta_{\text{target}}) - k_d \dot{\theta}$) with 32-iteration Projected Gauss-Seidel constraint enforcement.
* **Dual-Mode Authoring**: Seamless transitions between **Authoritative Kinematic Keyframing** and **Active Motorized Torques / Passive Compliant Ragdoll**.
* **Anti-Ground-Penetration Solver**: Dynamic floor clamping prevents foot sinking regardless of footwear or tumble angle.

### 2. Biomechanical Zero-Moment-Point (ZMP) Dynamic Balance
* **Real-Time Capture Point Tracking**:
  $$x_{\text{ZMP}} = x_{\text{CoM}} + \frac{v_{\text{CoM}, x}}{\omega_0}, \quad z_{\text{ZMP}} = z_{\text{CoM}} + \frac{v_{\text{CoM}, z}}{\omega_0} \quad \text{where} \quad \omega_0 = \sqrt{\frac{g}{h_{\text{CoM}}}}$$
* **Adaptive Stepping Recovery**: When perturbed, the character dynamically steps the swing leg toward the Capture Point to restore upright equilibrium.
* **Torso & Arm Counter-Weighing**: Dissipates rotational momentum by flaring and counter-swinging arms during recovery strides.
* **Automatic Fall Transition**: Compliantly transitions into `catchFall` or ragdoll if tilt exceeds maximum recovery limits ($> 45^\circ$).

### 3. Event-Driven Reactive Triggers
* **Autonomous Physics Stunt Triggers**:
  * `Fixed Frame Timeline`: Standard linear timeline activation.
  * `On Collision / Impact Shock`: Activates behaviors when collision force exceeds a threshold (e.g. $> 35\text{ N}$).
  * `On Proximity to Target`: Activates when distance to an opponent or prop falls within range (e.g. $< 1.25\text{ m}$).
  * `On Loss of ZMP Balance`: Activates immediately when dynamic balance fails or tilt $> \theta_{\text{thresh}}$.
  * `On Body Ground Contact`: Activates upon floor plane collision.
* **Behavior Flow Graph (`🔀 FLOW`)**: Visual node-based inspector mapping reactive state transitions for Hero and Enemy actors in real time.

### 4. Dynamic Two-Way Contact Constraints (Mutual Grabs & Tackles)
* **Action-Reaction Coupling**: Spring-damper coupling engages when hands contact an opponent's pelvis or chest.
* **Shared Momentum Exchange**: Accurately simulates rolling takedowns, wrestling tackles, and tumbling collisions.
* **Configurable Break Force**: Automatically disengages when separation shear exceeds user-defined force thresholds ($450\text{ N} - 1500\text{ N}$).

### 5. Multi-Engine Physics Backends
Switch between 4 industry-standard physics engines on the fly:
1. **Rapier 3D (WASM)**: High-speed Rust-based solver with continuous collision detection (CCD) and joint motors.
2. **NVIDIA PhysX 5 (WASM WebIDL)**: Industry VFX and AAA gaming physics with robust articulation links.
3. **Jolt Physics (WASM)**: High-throughput multithreaded simulation engine.
4. **DeepMind MuJoCo (WASM)**: Contact-rich robotics engine designed for exact biomechanical joint torques.

### 6. Universal Rig Ingestion & Mocap Retargeting
* **Universal Humanoid Normalizer**: Automatically maps and retargets Mixamo, Unreal Mannequin, Blender Rigify, and BVH skeletons.
* **A-Pose to T-Pose Alignment**: Analyzes bind-pose arm angles and automatically aligns them to the physics rig.
* **48-Clip Built-in Animation Library**: Instant access to locomotion, combat, sports, and stunt mocap takes.

### 7. Production-Ready DCC Export Pipeline
* **1:1 Meter Calibrated BVH (`.bvh`)**: Hierarchical 19-bone humanoid motion curves at true world scale ($1.0 = 1\text{m}$), preventing $100\times$ scaling issues in Blender, Maya, and Unreal Engine 5.
* **Skinned Armature GLB (`.glb`)**: Exports an authentic, editable `THREE.Skeleton` armature hierarchy with glTF skin metadata rather than disconnected proxy boxes.

### 8. Conversational AI Stunt Choreographer
* Direct complex multi-character stunt sequences using natural language (offline grammar + optional Gemini 2.0 Flash API).
* Supports hybrid `@-tag` syntax: `@bhv:Tackle`, `@force:UpperSpine(65N,180deg)`, `@prop:Crate(pos:0,0.5,1.2)`.

---

## 🚀 Quickstart

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation
```bash
git clone https://github.com/your-username/OpenDMS.git
cd OpenDMS
npm install
```

### Running Locally
```bash
npm run dev
```
Open your browser to: **http://localhost:3000**

### Building for Production
```bash
npm run build
```
The optimized client bundle will be output to the `dist/` directory.

---

## ⌨️ Viewport & DCC Hotkeys

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause Simulation |
| `Ctrl + Space` | Reset & Re-Simulate from Frame 0 |
| `W` / `E` / `R` | Move / Rotate / Scale Gizmo |
| `F` | Focus Camera on Selected Bone / Prop |
| `G` | Toggle Center of Mass & Support Base Gizmos |
| `P` | Toggle Active Pose Mode |
| `I` | Insert Pose Keyframe at Current Playhead |
| `T` | Reset Active Character to Zero T-Pose |
| `Ctrl + Z` | Undo (50-Step Snapshot History) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |

---

## 💖 Support OpenDMS Development

OpenDMS is a free, 100% open-source software project built to bring modern, accessible physics stunt animation to indie animators, VFX artists, and game studios worldwide.

If OpenDMS saves you time or empowers your creative pipeline, please consider supporting continued development:

[![Support on Gumroad](https://img.shields.io/badge/Support_on-Gumroad-ff90e8?style=for-the-badge&logo=gumroad&logoColor=black)](https://renderjab.gumroad.com/l/opendms)

### Where Contributions Go:
* 🚀 **Physics Expansion**: Implementing Cascadeur-inspired ballistic flight arcs and fulcrum friction points.
* 🏃 **Animation & Preset Library**: Expanding high-fidelity stunt, parkour, and martial arts mocap takes.
* 🖥️ **Cross-Platform Desktop Apps**: Compiling dedicated, signed Windows and macOS offline desktop binaries.

---

## ⚖️ Legal & Clean-Room Statement

OpenDMS is an independent, 100% clean-room open-source software project written from scratch in JavaScript, TypeScript, WebGL, and WebAssembly. 

* OpenDMS is **not affiliated with, sponsored by, or endorsed by** NaturalMotion Ltd. or Take-Two Interactive Software, Inc.
* Any references to historical file formats (such as `.nmc`, `.ens`, or `.bvh`) are provided strictly for file format interoperability and data portability purposes under fair use.
* No proprietary source code, copyrighted binary libraries, or proprietary runtime assets from legacy commercial software are included in this repository.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
