import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initPhysics, stepPhysics, setGroundMaterial, resetPhysicsWorld } from './core/physics.js';
import { initMujocoPhysics, stepMujocoPhysics, setMujocoGroundMaterial, cleanupMujoco } from './core/physicsMujoco.js';
import { MujocoCharacter } from './core/characterMujoco.js';
import { initJoltPhysics, stepJoltPhysics, setJoltGroundMaterial, cleanupJolt } from './core/physicsJolt.js';
import { JoltCharacter } from './core/characterJolt.js';
import { initPhysxPhysics, stepPhysxPhysics, setPhysxGroundMaterial, cleanupPhysx } from './core/physicsPhysx.js';
import { PhysXCharacter } from './core/characterPhysx.js';
import { PropsManager } from './core/props.js';
import { BiomechanicalCharacter, SKELETON_TREE, ENDORPHIN_ACTIVE_POSES, JOINT_CONFIGS, getJointConfigForBone, clampBoneEulerRotation, NATURAL_STANCE_ROTATIONS } from './core/character.js';
import { DMSBehaviorEngine, ENDORPHIN_BEHAVIOR_CATEGORIES, getBehaviorDefaultMaskLabel, BEHAVIOR_DEFINITIONS, SELECTION_SETS } from './dms/behaviors.js';
import { TimelineEngine } from './dms/timeline.js';
import { EndorphinParser } from './parsers/endorphinParser.js';
import { exportToBVH } from './export/exportBVH.js';
import { exportSceneToGLB, exportArmatureToGLB, downloadBinaryFile } from './export/exportGLB.js';
import { exportToGLTF } from './export/exportGLTF.js';
import { MixamoCharacterBridge } from './core/mixamo.js';
import { AIStuntDirector } from './dms/aiStuntDirector.js';
import { AnimationRetargeter, ENDORPHIN_MOCAP_LIBRARY } from './parsers/animationRetargeter.js';
import { ENDORPHIN_POSES_LIBRARY, applyPosePresetToCharacter } from './parsers/poseLibrary.js';
import { HistoryManager } from './dms/history.js';

let currentEngineName = 'rapier';
let currentStepPhysicsFn = stepPhysics;
let currentSetGroundMaterialFn = setGroundMaterial;
let currentEngineData = null;

export const historyManager = new HistoryManager({ maxSteps: 50 });
window.historyManager = historyManager;

const BEHAVIOR_KEY_ALIASES = {
  'catch-fall': 'catchFall',
  'protect-head': 'headProtect',
  'stagger-steps': 'stagger',
  'tackle-charge': 'tackle'
};

function getActiveCharacter() {
  return (timeline && timeline.activeActorId === 'actor-2' && actor2Active && actor2Character) ? actor2Character : character;
}

function addBehaviorLayer(rawKey) {
  const key = BEHAVIOR_KEY_ALIASES[rawKey] || rawKey;
  const bItem = (typeof BEHAVIOR_DEFINITIONS !== 'undefined' && BEHAVIOR_DEFINITIONS[key]) ? BEHAVIOR_DEFINITIONS[key] : { key, name: key, defaultDuration: 120 };
  const targetActor = (timeline && timeline.activeActorId) ? timeline.activeActorId : 'actor-1';
  const animLayer = (timeline && timeline.layers) ? timeline.layers.find(l => l.type === 'ANIMATION' && (l.actorId || 'actor-1') === targetActor) : null;
  const sf = key === 'ragdoll' ? 120 : (animLayer ? animLayer.endFrame : 0);
  const dur = bItem.defaultDuration || 120;
  if (timeline) {
    historyManager.pushState(`Add ${bItem.name || key}`);
    timeline.addLayer({
      name: bItem.name || key,
      type: 'BEHAVIOR',
      actorId: targetActor,
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + dur),
      behavior: key,
      bodyPartMask: 'auto',
      intensity: 1.0,
      speed: 1.0,
      color: bItem.color || '#0284c7'
    });
    timeline.invalidateSimulation();
    if (typeof renderTimelineLayers === 'function') renderTimelineLayers();
    if (typeof renderLayerInspector === 'function') renderLayerInspector();
    if (typeof updateSimulationStatusUI === 'function') updateSimulationStatusUI();
    if (typeof closeAllMenus === 'function') closeAllMenus();
    showNotification(`Added ${bItem.name || key} to ${targetActor === 'actor-2' ? 'Actor 2 (Opponent)' : 'Actor 1 (Hero)'}`, 'success');
  }
}
window.addBehaviorLayer = addBehaviorLayer;

function openBehaviorDrawer(category = 'all') {
  if (typeof switchLeftPanelTab === 'function') {
    switchLeftPanelTab('library');
  }
  const cascade = document.getElementById('left-behavior-cascade');
  if (cascade) {
    cascade.style.display = cascade.style.display === 'none' ? 'flex' : 'flex';
    const targetRow = category && category !== 'all'
      ? cascade.querySelector(`[data-cat-id="${category}"]`)
      : cascade.querySelector('.cascade-category-item');
    if (targetRow) targetRow.click();
  }
}
window.openBehaviorDrawer = openBehaviorDrawer;

let scene, camera, renderer, controls;
let transformControls, charGizmoAnchor;
let moveGizmoEnabled = true;
let selectedPropId = null;
let physicsWorld;
let character;
let dmsEngine;
let timeline;
let propsManager;
let mixamoBridge;
let aiDirector;
let animationRetargeter;
let currentModelType = 'mannequin'; // 'mannequin' (default) | 'mixamo' | 'sam' | 'custom'
let clock = new THREE.Clock();

// NaturalMotion Endorphin Active Pose & Manual Animation Authoring
let isPoseMode = false;
let selectedPoseBone = 'Pelvis';
let isAutoKeyEnabled = false;
let poseTransformControls = null;
let poseGizmoAnchor = null;
let poseHighlightMesh = null;
let poseGizmoMode = 'rotate'; // 'rotate' or 'translate'

// Multi-Character Actor 2 State
let actor2Character = null;
let actor2DmsEngine = null;
let actor2MixamoBridge = null;
let actor2Active = false;
let timelineActorFilter = 'all'; // 'all' | 'actor-1' | 'actor-2'

// Endorphin Notification Toast System
function showNotification(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = 'position: fixed; top: 38px; left: 50%; transform: translateX(-50%); z-index: 99999; display: flex; flex-direction: column; gap: 6px; pointer-events: none;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'rgba(16, 185, 129, 0.95)' : type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(30, 41, 59, 0.95)';
  const border = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#38bdf8';
  toast.style.cssText = `background: ${bg}; border: 1px solid ${border}; color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 500; box-shadow: 0 4px 15px rgba(0,0,0,0.5); backdrop-filter: blur(8px); transition: all 0.25s ease; opacity: 0; transform: translateY(-8px); pointer-events: auto;`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}
window.showNotification = showNotification;

// Environment & Light references
let hemiLight, dirLight, gridHelper, groundMesh;

// Endorphin 2.7.1 Biomechanical Viewport Visualisation Gizmos + Force Arrow Gizmo + Target Indicator
let gizmosGroup;
let gizmosVisible = true;
let comMesh, plumbLine, groundReticle, supportPolygonLine;
let targetIndicatorLine, targetIndicatorReticle;
let forceArrowHelper, selectedBoneHighlightMesh;
let selectedTargetBone = 'UpperSpine';

// Endorphin 2.7.1 Bone Simulation Trajectory Visualizer (Broken/Dashed Lines)
let trajectoryGroup;
let trajectoryLine, trajectoryStartMarker, trajectoryEndMarker, trajectoryPlayheadMesh;

const BODY_PART_NAMES = Object.keys(SKELETON_TREE);

// Outliner & Hierarchy State
let activeLeftTab = 'library';
let outlinerCollapsedNodes = new Set(['node-env-group']);
let selectedOutlinerNodeId = null;
let outlinerSearchQuery = '';

// Viewport Skeleton HUD State
let isHudBoneTreeMinimized = false;
let hudBoneSearchQuery = '';
let hudCollapsedNodes = new Set();

// Recursive Skeleton Hierarchy (NaturalMotion Endorphin Articulated Tree)
export const SKELETON_HIERARCHY = {
  name: 'Pelvis',
  label: 'Pelvis',
  role: 'Pelvic Root Core',
  children: [
    {
      name: 'LowerSpine',
      label: 'LowerSpine',
      role: 'Lumbar Spine Core',
      children: [
        {
          name: 'UpperSpine',
          label: 'UpperSpine',
          role: 'Thoracic Ribcage Shield',
          children: [
            {
              name: 'Neck',
              label: 'Neck',
              role: 'Cervical Articulation',
              children: [
                { name: 'Head', label: 'Head', role: 'Cranial Dome & Visor' }
              ]
            },
            {
              name: 'LeftShoulder',
              label: 'LeftShoulder',
              role: 'Clavicle Strut',
              children: [
                {
                  name: 'LeftUpperArm',
                  label: 'LeftUpperArm',
                  role: 'Humerus & Deltoid',
                  children: [
                    {
                      name: 'LeftForearm',
                      label: 'LeftForearm',
                      role: 'Radius & Ulna',
                      children: [
                        { name: 'LeftHand', label: 'LeftHand', role: 'Palmar Plate' }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              name: 'RightShoulder',
              label: 'RightShoulder',
              role: 'Clavicle Strut',
              children: [
                {
                  name: 'RightUpperArm',
                  label: 'RightUpperArm',
                  role: 'Humerus & Deltoid',
                  children: [
                    {
                      name: 'RightForearm',
                      label: 'RightForearm',
                      role: 'Radius & Ulna',
                      children: [
                        { name: 'RightHand', label: 'RightHand', role: 'Palmar Plate' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      name: 'LeftThigh',
      label: 'LeftThigh',
      role: 'Femur & Quad Plate',
      children: [
        {
          name: 'LeftCalf',
          label: 'LeftCalf',
          role: 'Tibia & Calf Muscle',
          children: [
            { name: 'LeftFoot', label: 'LeftFoot', role: 'Sole Grip & Tarsals' }
          ]
        }
      ]
    },
    {
      name: 'RightThigh',
      label: 'RightThigh',
      role: 'Femur & Quad Plate',
      children: [
        {
          name: 'RightCalf',
          label: 'RightCalf',
          role: 'Tibia & Calf Muscle',
          children: [
            { name: 'RightFoot', label: 'RightFoot', role: 'Sole Grip & Tarsals' }
          ]
        }
      ]
    }
  ]
};

async function init() {
  const container = document.getElementById('viewport-container');

  // 1. Scene Setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1d);
  scene.fog = new THREE.FogExp2(0x0a0f1d, 0.04);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 1.4, 3.8);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.0, 0);

  // 2. Lighting & Floor
  hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.7);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
  dirLight.position.set(3, 7, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 20;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  gridHelper = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.1 });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 3. Initialize Physics World, Character & Props Manager
  const physicsData = await initPhysics();
  physicsWorld = physicsData.world;
  currentEngineData = physicsData;

  propsManager = new PropsManager(physicsWorld, scene);
  character = new BiomechanicalCharacter(physicsWorld, scene, { x: 0, y: 0.95, z: 0 });
  dmsEngine = new DMSBehaviorEngine(character, propsManager);
  timeline = new TimelineEngine(character, dmsEngine);
  timeline.propsManager = propsManager;
  window.scenePropsManager = propsManager;
  window.timeline = timeline;
  window.character = character;
  window.propsManager = propsManager;

  animationRetargeter = new AnimationRetargeter();

  aiDirector = new AIStuntDirector({
    timeline,
    character,
    propsManager,
    animationRetargeter,
    addActor2,
    applyStagingPreset,
    renderTimelineLayers,
    renderLayerInspector,
    updateSimulationStatusUI,
    refreshMocapLibraryUI: () => {
      if (typeof window.refreshMocapLibraryCards === 'function') {
        window.refreshMocapLibraryCards();
      }
    }
  });
  window.aiDirector = aiDirector;

  // Initialize History (Undo/Redo) Manager
  historyManager.init({
    timeline,
    propsManager,
    character,
    getActor2: () => (actor2Active ? actor2Character : null),
    setSceneDuration: (frames) => setSceneDuration(frames),
    setActor2State: (a2Data) => {
      if (a2Data.isActive && !actor2Active) {
        addActor2().then(() => {
          if (actor2Character && a2Data.spawnOffset) {
            actor2Character.setSpawnOffset(a2Data.spawnOffset.x, a2Data.spawnOffset.y, a2Data.spawnOffset.z);
            actor2Character.spawnYaw = a2Data.spawnYaw || 0;
            actor2Character.resetToTPose();
          }
        });
      } else if (!a2Data.isActive && actor2Active) {
        removeActor2();
      } else if (actor2Character && a2Data.spawnOffset) {
        actor2Character.setSpawnOffset(a2Data.spawnOffset.x, a2Data.spawnOffset.y, a2Data.spawnOffset.z);
        actor2Character.spawnYaw = a2Data.spawnYaw || 0;
        actor2Character.resetToTPose();
      }
    },
    getEnvironment: () => ({
      wind: document.getElementById('wind-slider')?.value || 0,
      twister: document.getElementById('twister-slider')?.value || 0,
      stiffness: document.getElementById('stiffness-slider')?.value || 300,
      groundMaterial: document.getElementById('ground-material-select')?.value || 'concrete'
    }),
    setEnvironment: (env) => {
      if (!env) return;
      if (env.wind !== undefined) {
        const ws = document.getElementById('wind-slider');
        const wv = document.getElementById('wind-val');
        if (ws) ws.value = env.wind;
        if (wv) wv.textContent = `${env.wind} N`;
        timeline.windForce = { x: 0, y: 0, z: -parseFloat(env.wind) * 3.5 };
      }
      if (env.twister !== undefined) {
        const ts = document.getElementById('twister-slider');
        const tv = document.getElementById('twister-val');
        if (ts) ts.value = env.twister;
        if (tv) tv.textContent = `${env.twister} rad/s`;
        timeline.twisterStrength = parseFloat(env.twister);
      }
      if (env.stiffness !== undefined) {
        const ss = document.getElementById('stiffness-slider');
        const sv = document.getElementById('stiff-val');
        if (ss) ss.value = env.stiffness;
        if (sv) sv.textContent = `${env.stiffness} Nm`;
        character.muscleStiffness = parseFloat(env.stiffness);
        character.muscleDamping = Math.max(10, character.muscleStiffness * 0.12);
      }
      if (env.groundMaterial) {
        const gms = document.getElementById('ground-material-select');
        if (gms) gms.value = env.groundMaterial;
        (currentSetGroundMaterialFn || setGroundMaterial)(env.groundMaterial);
      }
    },
    onStateRestored: () => {
      renderTimelineLayers();
      renderLayerInspector();
      renderSceneOutliner();
      updateSimulationStatusUI();
      if (charGizmoAnchor && character?.spawnOffset) {
        charGizmoAnchor.position.set(character.spawnOffset.x, character.spawnOffset.y + 0.95, character.spawnOffset.z);
      }
    }
  });

  mixamoBridge = new MixamoCharacterBridge(scene, character);
  timeline.characterBridge = mixamoBridge;
  timeline.mixamoBridge = mixamoBridge;
  if (timeline.actors && timeline.actors['actor-1']) {
    timeline.actors['actor-1'].mixamoBridge = mixamoBridge;
  }
  mixamoBridge.loadFromUrl('/models/xbot.fbx').then(() => {
    console.log('Mixamo X-Bot character loaded (cached in background).');
    mixamoBridge.setVisible(false); // Studio Mannequin is default active model!
    updateModelUI();
  }).catch((err) => {
    console.warn('X-Bot FBX not loaded, using Studio Mannequin:', err);
    mixamoBridge.setVisible(false);
    updateModelUI();
  });

  // Initialize Biomechanical Visualization Gizmos, 3D Move Axis Gizmo & Force Vector Arrow
  initBiomechanicalGizmos();
  initTrajectoryVisualizer();
  initCharacterMoveGizmo();
  initViewportBonePicking();
  initPoseControls();

  character.resetToTPose();

  setupUI();
  renderTimelineRuler();
  renderTimelineLayers();
  renderLayerInspector();
  renderSceneOutliner();
  renderViewportBoneTree();

  window.addEventListener('resize', onWindowResize);

  // 4. Main Animation & Live Simulation Render Loop (Exact 60Hz Real-Time Accumulator)
  let playbackTimer = 0;
  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const speed = timeline.playbackSpeed || 1.0;
    const frameInterval = (1 / timeline.fps) / speed;

    // LIVE SIMULATION RENDER IN PROGRESS
    if (timeline.isBakingLive) {
      playbackTimer += delta;
      let stepsThisTick = 0;
      while (playbackTimer >= frameInterval && timeline.isBakingLive && stepsThisTick < 4) {
        playbackTimer -= frameInterval;
        stepsThisTick++;

        timeline.stepSingleSimulationFrame(timeline.currentFrame, currentStepPhysicsFn);
        timeline.currentFrame++;

        if (timeline.currentFrame >= timeline.totalFrames) {
          timeline.isBakingLive = false;
          timeline.isSimulated = true;
          timeline.isPlaying = false; // Never autoplay! Pause at final frame and let user scrub or resimulate
          timeline.currentFrame = timeline.totalFrames - 1;
          playbackTimer = 0;
          updateSimulationStatusUI();
          updateTimelineUI();
          updateBoneTrajectory();
          break;
        }
      }
      updateTimelineUI();
    }
    // PLAYING TIMELINE FRAMES (BAKED SIMULATION OR LIVE AUTHORING PREVIEW)
    else if (timeline.isPlaying) {
      playbackTimer += delta;
      let stepsThisTick = 0;
      while (playbackTimer >= frameInterval && stepsThisTick < 4) {
        playbackTimer -= frameInterval;
        stepsThisTick++;

        let nextFrame = timeline.currentFrame + 1;
        const maxReviewFrame = (timeline.simulationCache && timeline.simulationCache.length > 0)
          ? timeline.simulationCache.length
          : timeline.totalFrames;
        if (nextFrame >= maxReviewFrame) {
          nextFrame = 0;
        }
        timeline.seek(nextFrame);
      }
      updateTimelineUI();
      updateTrajectoryPlayheadOnly();
    } else {
      playbackTimer = 0;
    }

    if (propsManager) {
      propsManager.update();
    }

    if (mixamoBridge && mixamoBridge.isVisible) {
      mixamoBridge.update();
    }
    if (actor2MixamoBridge && actor2MixamoBridge.isVisible) {
      actor2MixamoBridge.update();
    }

    if (gizmosVisible) {
      updateBiomechanicalGizmos();
    }

    updateForceArrowGizmo();
    updateBoneInspectorLive();
    updateZMPBalanceUI();

    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}

// --- 3D INTERACTIVE TRANSFORM GIZMO FOR CHARACTER & PROP POSITIONING (MOVE, ROTATE, SCALE) ---
let currentTransformMode = 'translate';

function setTransformMode(mode) {
  if (mode !== 'translate' && mode !== 'rotate' && mode !== 'scale') return;
  currentTransformMode = mode;
  if (transformControls) {
    transformControls.setMode(mode);
  }
  document.querySelectorAll('.transform-mode-btn').forEach(btn => btn.classList.remove('active'));
  const btnId = mode === 'translate' ? 'btn-transform-move' : `btn-transform-${mode}`;
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('active');
}

function initCharacterMoveGizmo() {
  if (charGizmoAnchor) {
    charGizmoAnchor.position.set(0, 0.95, 0);
    charGizmoAnchor.updateMatrixWorld();
    return;
  }
  charGizmoAnchor = new THREE.Object3D();
  charGizmoAnchor.position.set(0, 0.95, 0);
  scene.add(charGizmoAnchor);

  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode(currentTransformMode);
  transformControls.setSize(0.75);
  transformControls.attach(charGizmoAnchor);

  // In Three.js r160+, TransformControls.getHelper() or transformControls itself can be added to scene
  const gizmoHelper = typeof transformControls.getHelper === 'function'
    ? transformControls.getHelper()
    : transformControls;
  scene.add(gizmoHelper);

  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    if (event.value) {
      historyManager.pushState(selectedPropId ? 'Move Prop' : 'Move Character');
    }
  });

  transformControls.addEventListener('objectChange', () => {
    if (selectedPropId) {
      const prop = propsManager?.props.find(p => p.id === selectedPropId);
      if (prop) {
        prop.updateTransformFromMesh();
        updatePropInspectorFields(prop);
        if (!timeline.isBakingLive) {
          timeline.invalidateSimulation();
          updateSimulationStatusUI();
        }
      }
      return;
    }

    if (currentTransformMode === 'translate') {
      const nx = charGizmoAnchor.position.x;
      const ny = Math.max(0, charGizmoAnchor.position.y - 0.95);
      const nz = charGizmoAnchor.position.z;
      charGizmoAnchor.position.y = ny + 0.95;
      if (timeline && timeline.activeActorId === 'actor-2' && actor2Active && actor2Character) {
        const cx = Number(THREE.MathUtils.clamp(nx, -10, 10).toFixed(2));
        const cy = Number(THREE.MathUtils.clamp(ny, 0, 8).toFixed(2));
        const cz = Number(THREE.MathUtils.clamp(nz, -10, 10).toFixed(2));
        actor2Character.setSpawnOffset(cx, cy, cz);
        if (!timeline.isBakingLive) {
          timeline.invalidateSimulation();
          timeline.seek(timeline.currentFrame);
          if (actor2MixamoBridge && actor2MixamoBridge.isVisible) actor2MixamoBridge.update();
          updateSimulationStatusUI();
        }
      } else {
        setCharacterSpawnPosition(nx, ny, nz, true);
      }
    }
  });
}

function setCharacterSpawnPosition(x, y, z, fromGizmo = false) {
  const cx = Number(THREE.MathUtils.clamp(x, -10, 10).toFixed(2));
  const cy = Number(THREE.MathUtils.clamp(y, 0, 8).toFixed(2));
  const cz = Number(THREE.MathUtils.clamp(z, -10, 10).toFixed(2));

  character.setSpawnOffset(cx, cy, cz);

  if (!fromGizmo && charGizmoAnchor) {
    charGizmoAnchor.position.set(cx, cy + 0.95, cz);
  }

  // Sync UI sliders
  const sx = document.getElementById('char-pos-x');
  const sy = document.getElementById('char-pos-y');
  const sz = document.getElementById('char-pos-z');
  const vx = document.getElementById('char-pos-x-val');
  const vy = document.getElementById('char-pos-y-val');
  const vz = document.getElementById('char-pos-z-val');
  if (sx) sx.value = cx;
  if (sy) sy.value = cy;
  if (sz) sz.value = cz;
  if (vx) vx.textContent = `${cx.toFixed(2)} m`;
  if (vy) vy.textContent = `${cy.toFixed(2)} m`;
  if (vz) vz.textContent = `${cz.toFixed(2)} m`;

  if (!timeline.isBakingLive) {
    timeline.invalidateSimulation();
    timeline.seek(timeline.currentFrame);
    if (mixamoBridge && mixamoBridge.isVisible) {
      mixamoBridge.update();
    }
    updateSimulationStatusUI();
  }
}

// --- 3D VIEWPORT BONE & PROP PICKING & DIRECTIONAL FORCE ARROW GIZMO ---
function initViewportBonePicking() {
  // Force vector 3D arrow helper (Endorphin Force Event arrow)
  forceArrowHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1.2, 0),
    0.85,
    0xf43f5e,
    0.22,
    0.14
  );
  forceArrowHelper.visible = false;
  scene.add(forceArrowHelper);

  // Subtle wireframe highlight sphere on targeted body part
  const hlGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true, transparent: true, opacity: 0.75 });
  selectedBoneHighlightMesh = new THREE.Mesh(hlGeo, hlMat);
  selectedBoneHighlightMesh.visible = false;
  scene.add(selectedBoneHighlightMesh);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downPos = { x: 0, y: 0 };

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
    if (transformControls && transformControls.dragging) return;
    if (poseTransformControls && poseTransformControls.dragging) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;

    // 1. Check if user clicked on any Prop in the 3D scene
    if (!isPoseMode && propsManager && propsManager.props.length > 0) {
      const propMeshes = propsManager.props.map(p => p.mesh).filter(Boolean);
      const propIntersects = raycaster.intersectObjects(propMeshes, true);
      if (propIntersects.length > 0) {
        let hitObj = propIntersects[0].object;
        while (hitObj && !hitObj.userData?.isProp && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData?.propId) {
          selectProp(hitObj.userData.propId);
          return;
        }
      }
    }

    // 2. Direct raycast on character 3D meshes (Biomechanical Studio Mannequin)
    if (activeChar && activeChar.bodies) {
      const charMeshes = Object.values(activeChar.bodies).map(b => b.mesh).filter(Boolean);
      const charIntersects = raycaster.intersectObjects(charMeshes, true);
      if (charIntersects.length > 0) {
        for (const hit of charIntersects) {
          let curr = hit.object;
          while (curr) {
            if (curr.userData?.bodyName && activeChar.bodies[curr.userData.bodyName]) {
              if (isPoseMode) {
                selectPoseBone(curr.userData.bodyName);
              } else {
                selectBone(curr.userData.bodyName);
              }
              return;
            }
            for (const [name, b] of Object.entries(activeChar.bodies)) {
              if (b.mesh === curr) {
                if (isPoseMode) {
                  selectPoseBone(name);
                } else {
                  selectBone(name);
                }
                return;
              }
            }
            curr = curr.parent;
          }
        }
      }
    }

    // 3. Direct raycast on Mixamo Skinned Meshes (if loaded and visible)
    if (mixamoBridge && mixamoBridge.isVisible && mixamoBridge.skinnedMeshes && mixamoBridge.skinnedMeshes.length > 0) {
      const skinIntersects = raycaster.intersectObjects(mixamoBridge.skinnedMeshes, true);
      if (skinIntersects.length > 0) {
        const closestBone = getClosestCharacterBoneToWorldPoint(skinIntersects[0].point);
        if (closestBone) {
          if (isPoseMode) {
            selectPoseBone(closestBone);
          } else {
            selectBone(closestBone);
          }
          return;
        }
      }
    }

    // 4. Proximity fallback: Distance from ray to 3D bone segments
    if (activeChar && activeChar.bodies) {
      const bestBone = getClosestCharacterBoneToRay(raycaster.ray, 0.22);
      if (bestBone) {
        if (isPoseMode) {
          selectPoseBone(bestBone);
        } else {
          selectBone(bestBone);
        }
        return;
      }
    }

    // 5. Clicked empty space: deselect bone & prop
    if (!isPoseMode) {
      deselectBone();
      deselectProp();
    }
  });
}

// --- ACTIVE POSE & MANUAL KEYFRAME ANIMATION ENGINE (ENDORPHIN 2.7.1 & BLENDER POSE MODE) ---
function initPoseControls() {
  poseGizmoAnchor = new THREE.Object3D();
  poseGizmoAnchor.position.set(0, 0.95, 0);
  scene.add(poseGizmoAnchor);

  poseTransformControls = new TransformControls(camera, renderer.domElement);
  poseTransformControls.setMode('rotate');
  poseTransformControls.setSize(0.72);
  poseTransformControls.attach(poseGizmoAnchor);

  const poseHelper = typeof poseTransformControls.getHelper === 'function'
    ? poseTransformControls.getHelper()
    : poseTransformControls;
  scene.add(poseHelper);
  poseHelper.visible = false;
  poseTransformControls.enabled = false;

  // Visual selection outline / bounding mesh for selected bone
  const hlGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const hlMat = new THREE.MeshBasicMaterial({
    color: 0xc084fc,
    wireframe: true,
    transparent: true,
    opacity: 0.9
  });
  poseHighlightMesh = new THREE.Mesh(hlGeo, hlMat);
  poseHighlightMesh.visible = false;
  scene.add(poseHighlightMesh);

  poseTransformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    if (event.value) {
      historyManager.pushState(`Pose Bone: ${selectedPoseBone || 'Joint'}`);
    }
  });

  poseTransformControls.addEventListener('objectChange', () => {
    if (!isPoseMode || !selectedPoseBone) return;
    const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
    if (!activeChar || !activeChar.bodies || !activeChar.bodies[selectedPoseBone]) return;

    if (selectedPoseBone === 'Pelvis' && poseGizmoMode === 'translate') {
      const pos = poseGizmoAnchor.position;
      activeChar.setPoseRootPosition(pos.x, pos.y, pos.z);
    } else {
      const def = SKELETON_TREE[selectedPoseBone];
      let localQ;
      if (!def || !def.parent) {
        const yaw = activeChar.spawnYaw || 0;
        const qYaw = yaw !== 0 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : new THREE.Quaternion();
        localQ = qYaw.clone().invert().multiply(poseGizmoAnchor.quaternion);
      } else {
        const parentBody = activeChar.bodies[def.parent];
        if (parentBody && parentBody.mesh) {
          const parentWorldQ = parentBody.mesh.quaternion;
          localQ = parentWorldQ.clone().invert().multiply(poseGizmoAnchor.quaternion);
        } else {
          localQ = poseGizmoAnchor.quaternion.clone();
        }
      }

      const eul = new THREE.Euler().setFromQuaternion(localQ, 'XYZ');
      const clamped = clampBoneEulerRotation(selectedPoseBone, eul);
      activeChar.setBoneLocalRotation(selectedPoseBone, clamped.x, clamped.y, clamped.z);

      const boneMesh = activeChar.bodies[selectedPoseBone].mesh;
      if (boneMesh) {
        poseGizmoAnchor.quaternion.copy(boneMesh.quaternion);
        if (poseHighlightMesh) poseHighlightMesh.quaternion.copy(boneMesh.quaternion);
      }
    }

    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    if (actor2MixamoBridge && actor2MixamoBridge.isVisible) actor2MixamoBridge.update();

    if (isAutoKeyEnabled) {
      recordCurrentPoseKeyframe();
    }

    syncPoseInspectorValues();
  });
}

function selectPoseBone(boneName) {
  selectedPoseBone = boneName;
  const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (!activeChar || !activeChar.bodies || !activeChar.bodies[boneName]) return;

  const b = activeChar.bodies[boneName];
  if (b && b.mesh) {
    poseGizmoAnchor.position.copy(b.mesh.position);
    poseGizmoAnchor.quaternion.copy(b.mesh.quaternion);

    if (boneName === 'Pelvis') {
      poseTransformControls.setMode(poseGizmoMode);
    } else {
      poseTransformControls.setMode('rotate');
    }

    const poseHelper = typeof poseTransformControls.getHelper === 'function'
      ? poseTransformControls.getHelper()
      : poseTransformControls;
    poseHelper.visible = isPoseMode;
    poseTransformControls.enabled = isPoseMode;

    if (poseHighlightMesh) {
      const radius = b.radius || 0.08;
      const height = (b.height || 0.16) + radius * 2;
      poseHighlightMesh.scale.set(radius * 3.0, height * 1.05, radius * 3.0);
      poseHighlightMesh.position.copy(b.mesh.position);
      poseHighlightMesh.quaternion.copy(b.mesh.quaternion);
      poseHighlightMesh.visible = isPoseMode;
    }

    renderPoseInspector();
  }
}

function togglePoseMode(forceState = null) {
  isPoseMode = (forceState !== null) ? forceState : !isPoseMode;

  const btn = document.getElementById('btn-toggle-pose-mode');
  const poseGroup = document.getElementById('pose-inspector-group');
  const poseHelper = poseTransformControls ? (typeof poseTransformControls.getHelper === 'function' ? poseTransformControls.getHelper() : poseTransformControls) : null;

  if (isPoseMode) {
    if (btn) {
      btn.textContent = '🦴 Active Pose Mode: ON';
      btn.style.borderColor = '#c084fc';
      btn.style.color = '#f3e8ff';
      btn.style.background = 'rgba(168, 85, 247, 0.35)';
      btn.style.boxShadow = '0 0 12px rgba(168, 85, 247, 0.5)';
    }

    if (transformControls) {
      const helper = typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls;
      helper.visible = false;
      transformControls.enabled = false;
    }

    if (poseHelper) {
      poseHelper.visible = true;
      poseTransformControls.enabled = true;
    }
    if (poseHighlightMesh) {
      poseHighlightMesh.visible = true;
    }
    if (poseGroup) {
      poseGroup.style.display = 'flex';
    }

    const tabInspector = document.getElementById('tab-btn-inspector');
    if (tabInspector) tabInspector.click();
    if (typeof switchRightPanelContext === 'function') switchRightPanelContext('track');
    if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();

    selectPoseBone(selectedPoseBone || 'Pelvis');
  } else {
    if (btn) {
      btn.textContent = '🦴 Active Pose Mode: OFF';
      btn.style.borderColor = '#a855f7';
      btn.style.color = '#d8b4fe';
      btn.style.background = 'rgba(168, 85, 247, 0.1)';
      btn.style.boxShadow = 'none';
    }

    if (poseHelper) {
      poseHelper.visible = false;
      poseTransformControls.enabled = false;
    }
    if (poseHighlightMesh) {
      poseHighlightMesh.visible = false;
    }
    if (poseGroup) {
      poseGroup.style.display = 'none';
    }
    if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();

    if (transformControls && moveGizmoEnabled && !timeline.isBakingLive) {
      const helper = typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls;
      helper.visible = true;
      transformControls.enabled = true;
    }
  }
}

function recordCurrentPoseKeyframe() {
  const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (!activeChar || typeof activeChar.getPoseState !== 'function') return;

  historyManager.pushState(`Keyframe Pose @ F:${timeline.currentFrame}`);
  const pose = activeChar.getPoseState();
  const res = timeline.addPoseKeyframe(
    timeline.activeActorId || 'actor-1',
    timeline.currentFrame,
    pose.rootPos,
    pose.localRotations
  );

  renderTimelineLayers();
  renderPoseInspector();
  updateSimulationStatusUI();
  showNotification(`Recorded Pose Keyframe @ Frame ${timeline.currentFrame}`, 'success');
  return res;
}

function applyPosePreset(poseId) {
  const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (!activeChar) return;

  const preset = ENDORPHIN_POSES_LIBRARY.find(p => p.id === poseId);
  if (!preset) return;

  historyManager.pushState(`Apply Pose: ${preset.name}`);
  applyPosePresetToCharacter(activeChar, poseId);

  const activeBridge = (timeline.activeActorId === 'actor-2' && actor2MixamoBridge) ? actor2MixamoBridge : mixamoBridge;
  if (activeBridge && activeBridge.isVisible) {
    activeBridge.update();
  }

  if (isPoseMode && selectedPoseBone) {
    selectPoseBone(selectedPoseBone);
  }

  if (isAutoKeyEnabled) {
    recordCurrentPoseKeyframe();
  }

  if (isPoseMode) {
    renderPoseInspector();
    syncPoseInspectorValues();
  }

  timeline.invalidateSimulation();
  updateSimulationStatusUI();
  showNotification(`Applied Pose: ${preset.name}`, 'success');
}

function renderPoseInspector() {
  const contentEl = document.getElementById('pose-inspector-content');
  if (!contentEl) return;

  const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (!activeChar || !activeChar.currentPose) return;

  const boneName = selectedPoseBone || 'Pelvis';
  const cfg = getJointConfigForBone(boneName);
  const isPelvis = boneName === 'Pelvis';

  const curPose = activeChar.currentPose.localRotations[boneName] || [0, 0, 0];
  const degX = (curPose[0] * THREE.MathUtils.RAD2DEG).toFixed(1);
  const degY = (curPose[1] * THREE.MathUtils.RAD2DEG).toFixed(1);
  const degZ = (curPose[2] * THREE.MathUtils.RAD2DEG).toFixed(1);

  let limDesc = 'Root 3D Position & Orientation';
  let minX = -180, maxX = 180;
  let minY = -180, maxY = 180;
  let minZ = -180, maxZ = 180;

  if (cfg) {
    if (cfg.type === 'revolute') {
      const l0 = (cfg.limits[0] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const l1 = (cfg.limits[1] * THREE.MathUtils.RAD2DEG).toFixed(0);
      limDesc = `1-DOF Anatomical Hinge: [${l0}°, ${l1}°]`;
      if (cfg.axis.x !== 0) { minX = cfg.limits[0] * THREE.MathUtils.RAD2DEG; maxX = cfg.limits[1] * THREE.MathUtils.RAD2DEG; }
      if (cfg.axis.y !== 0) { minY = cfg.limits[0] * THREE.MathUtils.RAD2DEG; maxY = cfg.limits[1] * THREE.MathUtils.RAD2DEG; }
      if (cfg.axis.z !== 0) { minZ = cfg.limits[0] * THREE.MathUtils.RAD2DEG; maxZ = cfg.limits[1] * THREE.MathUtils.RAD2DEG; }
    } else {
      const x0 = (cfg.xLimits[0] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const x1 = (cfg.xLimits[1] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const y0 = (cfg.yLimits[0] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const y1 = (cfg.yLimits[1] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const z0 = (cfg.zLimits[0] * THREE.MathUtils.RAD2DEG).toFixed(0);
      const z1 = (cfg.zLimits[1] * THREE.MathUtils.RAD2DEG).toFixed(0);
      limDesc = `3-DOF Limits: X[${x0}°,${x1}°] Y[${y0}°,${y1}°] Z[${z0}°,${z1}°]`;
      minX = cfg.xLimits[0] * THREE.MathUtils.RAD2DEG; maxX = cfg.xLimits[1] * THREE.MathUtils.RAD2DEG;
      minY = cfg.yLimits[0] * THREE.MathUtils.RAD2DEG; maxY = cfg.yLimits[1] * THREE.MathUtils.RAD2DEG;
      minZ = cfg.zLimits[0] * THREE.MathUtils.RAD2DEG; maxZ = cfg.zLimits[1] * THREE.MathUtils.RAD2DEG;
    }
  }

  const boneOptions = Object.keys(SKELETON_TREE).map(b =>
    `<option value="${b}" ${b === boneName ? 'selected' : ''}>${b}</option>`
  ).join('');

  let pelvisControlsHtml = '';
  if (isPelvis) {
    pelvisControlsHtml = `
      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <button class="btn ${poseGizmoMode === 'rotate' ? 'active' : ''}" id="btn-pose-mode-rot" style="flex: 1; padding: 4px; font-size: 10.5px;">Rotate (E)</button>
        <button class="btn ${poseGizmoMode === 'translate' ? 'active' : ''}" id="btn-pose-mode-trans" style="flex: 1; padding: 4px; font-size: 10.5px;">Translate (W)</button>
      </div>
    `;
  }

  contentEl.innerHTML = `
    <div class="inspector-row">
      <label><span>Selected Bone</span><span style="color: #c084fc;">Click in 3D</span></label>
      <select class="inspector-select" id="pose-bone-select" style="border-color: #a855f7;">${boneOptions}</select>
    </div>
    <div style="font-size: 10px; color: #94a3b8; background: #070b14; padding: 5px 8px; border-radius: 4px; border: 1px solid #1e293b;">
      <span style="color: #a855f7; font-weight: 700;">${limDesc}</span>
    </div>
    ${pelvisControlsHtml}
    <div class="inspector-row">
      <label><span>Pitch / X Rotation</span><span id="pose-rot-x-val" style="color: #f87171;">${degX}°</span></label>
      <input type="range" id="pose-rot-x" min="${minX.toFixed(0)}" max="${maxX.toFixed(0)}" step="0.5" value="${degX}" style="width: 100%; accent-color: #ef4444;" ${cfg?.type === 'revolute' && cfg.axis.x === 0 ? 'disabled' : ''}>
    </div>
    <div class="inspector-row">
      <label><span>Yaw / Y Rotation</span><span id="pose-rot-y-val" style="color: #4ade80;">${degY}°</span></label>
      <input type="range" id="pose-rot-y" min="${minY.toFixed(0)}" max="${maxY.toFixed(0)}" step="0.5" value="${degY}" style="width: 100%; accent-color: #22c55e;" ${cfg?.type === 'revolute' && cfg.axis.y === 0 ? 'disabled' : ''}>
    </div>
    <div class="inspector-row">
      <label><span>Roll / Z Rotation</span><span id="pose-rot-z-val" style="color: #60a5fa;">${degZ}°</span></label>
      <input type="range" id="pose-rot-z" min="${minZ.toFixed(0)}" max="${maxZ.toFixed(0)}" step="0.5" value="${degZ}" style="width: 100%; accent-color: #3b82f6;" ${cfg?.type === 'revolute' && cfg.axis.z === 0 ? 'disabled' : ''}>
    </div>

    <div style="display: flex; gap: 6px; margin-top: 8px;">
      <button class="btn btn-simulate" id="btn-pose-key-now" style="flex: 1.5; padding: 6px; font-size: 11px;">◆ Key Pose @ F${timeline.currentFrame}</button>
      <button class="btn" id="btn-pose-reset-bone" style="flex: 1; padding: 6px; font-size: 10.5px;">↺ Reset Bone</button>
    </div>
    <div style="display: flex; gap: 6px; margin-top: 4px;">
      <button class="btn" id="btn-pose-natural-stance" style="flex: 1; padding: 5px; font-size: 10px; border-color: #0ea5e9; color: #7dd3fc;">Natural Stance</button>
      <button class="btn" id="btn-pose-tpose" style="flex: 1; padding: 5px; font-size: 10px;">Zero T-Pose</button>
    </div>
    <div class="inspector-row" style="margin-top: 8px; border-top: 1px solid #1e293b; padding-top: 8px;">
      <label><span>DMS Pose Preset</span><span style="color: #a855f7;">16 Poses</span></label>
      <select class="inspector-select" id="pose-preset-quick-select" style="border-color: #a855f7; font-size: 10px;">
        <option value="">-- Apply Pose Preset --</option>
        ${ENDORPHIN_POSES_LIBRARY.map(p => `<option value="${p.id}">${p.icon} ${p.name}</option>`).join('')}
      </select>
    </div>
  `;

  document.getElementById('pose-preset-quick-select')?.addEventListener('change', (e) => {
    const poseId = e.target.value;
    if (!poseId) return;
    applyPosePreset(poseId);
  });

  document.getElementById('pose-bone-select')?.addEventListener('change', (e) => {
    selectPoseBone(e.target.value);
  });

  document.getElementById('btn-pose-mode-rot')?.addEventListener('click', () => {
    poseGizmoMode = 'rotate';
    poseTransformControls.setMode('rotate');
    renderPoseInspector();
  });
  document.getElementById('btn-pose-mode-trans')?.addEventListener('click', () => {
    poseGizmoMode = 'translate';
    poseTransformControls.setMode('translate');
    renderPoseInspector();
  });

  const onSliderChange = () => {
    const rx = parseFloat(document.getElementById('pose-rot-x').value) * THREE.MathUtils.DEG2RAD;
    const ry = parseFloat(document.getElementById('pose-rot-y').value) * THREE.MathUtils.DEG2RAD;
    const rz = parseFloat(document.getElementById('pose-rot-z').value) * THREE.MathUtils.DEG2RAD;
    activeChar.setBoneLocalRotation(boneName, rx, ry, rz);

    const boneMesh = activeChar.bodies[boneName]?.mesh;
    if (boneMesh) {
      poseGizmoAnchor.quaternion.copy(boneMesh.quaternion);
      if (poseHighlightMesh) poseHighlightMesh.quaternion.copy(boneMesh.quaternion);
    }
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();

    if (isAutoKeyEnabled) recordCurrentPoseKeyframe();
    syncPoseInspectorValues();
  };

  document.getElementById('pose-rot-x')?.addEventListener('input', onSliderChange);
  document.getElementById('pose-rot-y')?.addEventListener('input', onSliderChange);
  document.getElementById('pose-rot-z')?.addEventListener('input', onSliderChange);

  document.getElementById('btn-pose-key-now')?.addEventListener('click', () => {
    recordCurrentPoseKeyframe();
  });

  document.getElementById('btn-pose-reset-bone')?.addEventListener('click', () => {
    activeChar.setBoneLocalRotation(boneName, 0, 0, 0);
    const boneMesh = activeChar.bodies[boneName]?.mesh;
    if (boneMesh) {
      poseGizmoAnchor.quaternion.copy(boneMesh.quaternion);
      if (poseHighlightMesh) poseHighlightMesh.quaternion.copy(boneMesh.quaternion);
    }
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    if (isAutoKeyEnabled) recordCurrentPoseKeyframe();
    renderPoseInspector();
  });

  document.getElementById('btn-pose-natural-stance')?.addEventListener('click', () => {
    activeChar.resetToNaturalStance();
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    selectPoseBone(selectedPoseBone);
    if (isAutoKeyEnabled) recordCurrentPoseKeyframe();
    renderPoseInspector();
  });

  document.getElementById('btn-pose-tpose')?.addEventListener('click', () => {
    activeChar.resetToTPose();
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    selectPoseBone(selectedPoseBone);
    if (isAutoKeyEnabled) recordCurrentPoseKeyframe();
    renderPoseInspector();
  });
}

function syncPoseInspectorValues() {
  const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (!activeChar || !activeChar.currentPose || !selectedPoseBone) return;
  const curPose = activeChar.currentPose.localRotations[selectedPoseBone] || [0, 0, 0];
  const degX = (curPose[0] * THREE.MathUtils.RAD2DEG).toFixed(1);
  const degY = (curPose[1] * THREE.MathUtils.RAD2DEG).toFixed(1);
  const degZ = (curPose[2] * THREE.MathUtils.RAD2DEG).toFixed(1);

  const vx = document.getElementById('pose-rot-x-val');
  const vy = document.getElementById('pose-rot-y-val');
  const vz = document.getElementById('pose-rot-z-val');
  const sx = document.getElementById('pose-rot-x');
  const sy = document.getElementById('pose-rot-y');
  const sz = document.getElementById('pose-rot-z');

  if (vx) vx.textContent = `${degX}°`;
  if (vy) vy.textContent = `${degY}°`;
  if (vz) vz.textContent = `${degZ}°`;
  if (sx && !sx.matches(':focus')) sx.value = degX;
  if (sy && !sy.matches(':focus')) sy.value = degY;
  if (sz && !sz.matches(':focus')) sz.value = degZ;
}

// =====================================================================
// MULTI-CHARACTER: Actor 2 instance + staging
// =====================================================================
async function addActor2() {
  if (actor2Active) return;

  if (currentEngineName === 'mujoco') {
    alert('Multi-character staging requires Rapier, Jolt, or PhysX 5. Please switch the physics engine to Rapier, Jolt, or PhysX first.');
    return;
  }

  historyManager.pushState('Add Actor 2 (Opponent)');

  const spawnPos = { x: 0.8, y: 0.95, z: -1.6 };

  if (currentEngineName === 'rapier') {
    if (!physicsWorld) {
      alert('Rapier physics engine is not initialized.');
      return;
    }
    actor2Character = new BiomechanicalCharacter(physicsWorld, scene, spawnPos, 1, {
      actorId: 'actor-2',
      actorColor: 0xfb923c
    });
  } else if (currentEngineName === 'jolt') {
    actor2Character = new JoltCharacter(currentEngineData, scene, spawnPos, 1, {
      actorId: 'actor-2',
      actorColor: 0xfb923c
    });
  } else if (currentEngineName === 'physx') {
    actor2Character = new PhysXCharacter(currentEngineData, scene, spawnPos, 1, {
      actorId: 'actor-2',
      actorColor: 0xfb923c
    });
  }

  if (!actor2Character) return;

  actor2Character.setSpawnOffset(spawnPos.x, 0, spawnPos.z);
  actor2Character.resetToTPose();

  actor2DmsEngine = new DMSBehaviorEngine(actor2Character, propsManager);
  actor2MixamoBridge = new MixamoCharacterBridge(scene, actor2Character, { actorIndex: 1, tintColor: 0xfb923c });
  if (currentModelType === 'mannequin') {
    actor2MixamoBridge.setVisible(false);
  }

  timeline.registerActor('actor-2', {
    id: 'actor-2',
    name: 'Actor 2 (Opponent)',
    character: actor2Character,
    dmsEngine: actor2DmsEngine,
    mixamoBridge: actor2MixamoBridge
  });

  actor2Active = true;
  timeline.invalidateSimulation();
  timeline.seek(0);
  updateActorStagingUI();
  if (typeof renderSceneOutliner === 'function') renderSceneOutliner();
  showNotification('Actor 2 (Opponent) spawned at (0.8, 0, -1.6)', 'success');
}

function removeActor2() {
  if (!actor2Active) return;
  historyManager.pushState('Remove Actor 2');
  timeline.unregisterActor('actor-2');

  if (actor2MixamoBridge) {
    actor2MixamoBridge.destroy && actor2MixamoBridge.destroy();
    actor2MixamoBridge = null;
  }
  if (actor2Character) {
    actor2Character.destroy && actor2Character.destroy();
    actor2Character = null;
  }
  actor2DmsEngine = null;
  actor2Active = false;

  timeline.setActiveActor('actor-1');
  updateActorStagingUI();
}

function setActiveActorUI(actorId) {
  timeline.setActiveActor(actorId);

  const t1 = document.getElementById('actor-tab-1');
  const t2 = document.getElementById('actor-tab-2');
  if (t1) {
    t1.className = 'actor-tab' + (actorId === 'actor-1' ? ' active-a1' : '');
  }
  if (t2) {
    t2.className = 'actor-tab' + (actorId === 'actor-2' && actor2Active ? ' active-a2' : '');
    t2.style.opacity = actor2Active ? '1' : '0.4';
  }

  // Update Move Gizmo anchor to the active character's spawn position
  const activeChar = (actorId === 'actor-2' && actor2Character) ? actor2Character : character;
  if (charGizmoAnchor && activeChar) {
    charGizmoAnchor.position.set(
      activeChar.spawnOffset.x,
      activeChar.spawnOffset.y + 0.95,
      activeChar.spawnOffset.z
    );
    charGizmoAnchor.updateMatrixWorld();
  }

  // Synchronize Pose Controls to active actor's body pose
  if (typeof updatePoseBoneVisuals === 'function') updatePoseBoneVisuals();
  renderTimelineLayers();
  renderLayerInspector();
  if (typeof renderSceneOutliner === 'function') renderSceneOutliner();
}

function updateActorStagingUI() {
  const badge = document.getElementById('actor-count-badge');
  const btn = document.getElementById('btn-toggle-actor2');
  const t2 = document.getElementById('actor-tab-2');

  if (badge) badge.textContent = actor2Active ? '2 ACTORS' : '1 ACTOR';
  if (btn) {
    btn.textContent = actor2Active ? '✕ Remove Opponent (Actor 2)' : '＋ Add Opponent (Actor 2)';
    btn.classList.toggle('active', actor2Active);
  }
  if (t2) {
    t2.style.opacity = actor2Active ? '1' : '0.4';
    if (!actor2Active) t2.className = 'actor-tab';
  }

  setActiveActorUI(timeline.activeActorId);
  renderTimelineLayers();
  updateSimulationStatusUI();
}

function applyStagingPreset(presetName) {
  if (!actor2Active) {
    addActor2().then(() => {
      if (actor2Active) applyStagingPreset(presetName);
    });
    return;
  }

  historyManager.pushState(`Staging: ${presetName}`);

  let a1Pos, a1Yaw, a2Pos, a2Yaw;

  switch (presetName) {
    case 'face-to-face':
      a1Pos = { x: -0.8, y: 0, z: 0 }; a1Yaw = Math.PI / 2;
      a2Pos = { x: 0.8, y: 0, z: 0 };  a2Yaw = -Math.PI / 2;
      break;
    case 'tackle-runup':
      a1Pos = { x: 0, y: 0, z: 1.5 };  a1Yaw = Math.PI;
      a2Pos = { x: 0, y: 0, z: -1.5 }; a2Yaw = 0;
      break;
    case 'side-by-side':
      a1Pos = { x: -0.5, y: 0, z: 0 }; a1Yaw = 0;
      a2Pos = { x: 0.5, y: 0, z: 0 };  a2Yaw = 0;
      break;
    case 'pursue':
      a1Pos = { x: 0, y: 0, z: 1.0 };  a1Yaw = Math.PI;
      a2Pos = { x: 0, y: 0, z: -1.0 }; a2Yaw = Math.PI;
      break;
    default:
      return;
  }

  character.setSpawnOffset(a1Pos.x, a1Pos.y, a1Pos.z);
  character.spawnYaw = a1Yaw;
  character.resetToTPose();
  setCharacterSpawnPosition(a1Pos.x, a1Pos.y, a1Pos.z, false);

  if (actor2Character && actor2Character.setSpawnTransform) {
    actor2Character.setSpawnTransform(a2Pos.x, a2Pos.y, a2Pos.z, a2Yaw);
  } else if (actor2Character) {
    actor2Character.setSpawnOffset(a2Pos.x, a2Pos.y, a2Pos.z);
    actor2Character.resetToTPose();
  }

  timeline.invalidateSimulation();
  updateSimulationStatusUI();
}

function setupActorStagingUI() {
  const btnToggleActor2 = document.getElementById('btn-toggle-actor2');
  if (btnToggleActor2) {
    btnToggleActor2.addEventListener('click', () => {
      if (actor2Active) {
        removeActor2();
      } else {
        addActor2();
      }
    });
  }

  const tab1 = document.getElementById('actor-tab-1');
  if (tab1) {
    tab1.addEventListener('click', () => setActiveActorUI('actor-1'));
  }

  const tab2 = document.getElementById('actor-tab-2');
  if (tab2) {
    tab2.addEventListener('click', async () => {
      if (!actor2Active) {
        await addActor2();
      }
      setActiveActorUI('actor-2');
      showNotification('Active Editing: Actor 2 (Enemy)', 'info');
    });
  }

  const stageMap = {
    'btn-stage-face-to-face': 'face-to-face',
    'btn-stage-tackle-runup': 'tackle-runup',
    'btn-stage-side-by-side': 'side-by-side',
    'btn-stage-pursue': 'pursue'
  };
  for (const [btnId, preset] of Object.entries(stageMap)) {
    const el = document.getElementById(btnId);
    if (el) el.addEventListener('click', () => applyStagingPreset(preset));
  }
}

// Spatial helper: Finds the anatomically closest character bone to a 3D world coordinate
function getClosestCharacterBoneToWorldPoint(point) {
  const candidates = [{ id: 'actor-1', char: character }];
  if (actor2Active && actor2Character) {
    candidates.push({ id: 'actor-2', char: actor2Character });
  }
  let bestName = null;
  let bestActorId = null;
  let bestDistSq = Infinity;

  const invRot = new THREE.Quaternion();
  const localPt = new THREE.Vector3();

  for (const cand of candidates) {
    if (!cand.char || !cand.char.bodies) continue;
    for (const [name, b] of Object.entries(cand.char.bodies)) {
      if (!b.mesh) continue;
      const meshPos = b.mesh.position;
      invRot.copy(b.mesh.quaternion).invert();
      localPt.copy(point).sub(meshPos).applyQuaternion(invRot);

      const h = b.height || 0.20;
      const halfH = h * 0.5;
      let closestX = 0, closestY = 0, closestZ = 0;

      if (b.type === 'capsule_x' || b.type === 'box') {
        closestX = THREE.MathUtils.clamp(localPt.x, -halfH, halfH);
      } else if (b.type === 'box_foot') {
        closestZ = THREE.MathUtils.clamp(localPt.z, -halfH, halfH);
      } else if (b.type === 'sphere') {
        // (0,0,0)
      } else {
        closestY = THREE.MathUtils.clamp(localPt.y, -halfH, halfH);
      }

      const dx = localPt.x - closestX;
      const dy = localPt.y - closestY;
      const dz = localPt.z - closestZ;
      const surfaceDist = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - (b.radius || 0.06));
      const distSq = surfaceDist * surfaceDist;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestName = name;
        bestActorId = cand.id;
      }
    }
  }

  if (bestActorId && timeline && timeline.activeActorId !== bestActorId) {
    setActiveActorUI(bestActorId);
  }
  return bestName;
}

// Spatial helper: Resolves closest character bone along a 3D ray segment
function getClosestCharacterBoneToRay(ray, maxDist = 0.22) {
  const candidates = [{ id: 'actor-1', char: character }];
  if (actor2Active && actor2Character) {
    candidates.push({ id: 'actor-2', char: actor2Character });
  }
  let bestName = null;
  let bestActorId = null;
  let bestDist = maxDist;

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const segPt = new THREE.Vector3();

  for (const cand of candidates) {
    if (!cand.char || !cand.char.bodies) continue;
    for (const [name, b] of Object.entries(cand.char.bodies)) {
      if (!b.mesh) continue;
      const pos = b.mesh.position;
      const q = b.mesh.quaternion;
      const halfH = (b.height || 0.20) * 0.5;

      let axis = new THREE.Vector3(0, 1, 0);
      if (b.type === 'capsule_x' || b.type === 'box') {
        axis.set(1, 0, 0);
      } else if (b.type === 'box_foot') {
        axis.set(0, 0, 1);
      }
      axis.applyQuaternion(q);

      p0.copy(pos).addScaledVector(axis, -halfH);
      p1.copy(pos).addScaledVector(axis, halfH);

      for (let s = 0; s <= 1.0; s += 0.25) {
        segPt.lerpVectors(p0, p1, s);
        const d = ray.distanceToPoint(segPt) - (b.radius || 0.05);
        if (d < bestDist) {
          bestDist = d;
          bestName = name;
          bestActorId = cand.id;
        }
      }
    }
  }

  if (bestActorId && timeline && timeline.activeActorId !== bestActorId) {
    setActiveActorUI(bestActorId);
  }
  return bestName;
}

function updateForceArrowGizmo() {
  const activeChar = getActiveCharacter();
  if (!forceArrowHelper || !selectedBoneHighlightMesh || !activeChar) return;
  const selLayer = timeline.getSelectedLayer();
  if (selLayer && selLayer.type === 'PERTURBATION') {
    const layerChar = (selLayer.actorId === 'actor-2' && actor2Active && actor2Character) ? actor2Character : activeChar;
    const targetName = selLayer.targetBody || selectedTargetBone || 'UpperSpine';
    const b = layerChar.bodies[targetName] || layerChar.bodies['UpperSpine'];
    if (b && b.mesh) {
      const targetPos = b.mesh.position.clone();
      const vec = TimelineEngine.computeForceVector(
        (selLayer.magnitude ?? 45) * (selLayer.intensity ?? 1.0),
        selLayer.yawDeg ?? 180,
        selLayer.pitchDeg ?? 0
      );
      const dir = new THREE.Vector3(vec.x, vec.y, vec.z);
      const len = THREE.MathUtils.clamp(dir.length() * 0.018, 0.35, 1.6);
      if (dir.lengthSq() > 0.0001) {
        dir.normalize();
      } else {
        dir.set(0, 0, -1);
      }

      // Position arrow tip pointing INTO or OUT from the targeted bone
      const arrowOrigin = targetPos.clone().sub(dir.clone().multiplyScalar(len));
      forceArrowHelper.position.copy(arrowOrigin);
      forceArrowHelper.setDirection(dir);
      forceArrowHelper.setLength(len, 0.22, 0.14);
      forceArrowHelper.visible = true;

      selectedBoneHighlightMesh.position.copy(targetPos);
      selectedBoneHighlightMesh.visible = true;
      return;
    }
  }
  forceArrowHelper.visible = false;
  selectedBoneHighlightMesh.visible = false;
}

// --- ENDORPHIN 2.7.1 BIOMECHANICAL GIZMOS (CENTER OF MASS & BASE OF SUPPORT) ---
function initBiomechanicalGizmos() {
  if (gizmosGroup) return;
  gizmosGroup = new THREE.Group();

  const comGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const comMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
  comMesh = new THREE.Mesh(comGeo, comMat);
  const comCore = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  comMesh.add(comCore);
  gizmosGroup.add(comMesh);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
  plumbLine = new THREE.Line(lineGeo, lineMat);
  gizmosGroup.add(plumbLine);

  const reticleGeo = new THREE.RingGeometry(0.05, 0.08, 32);
  reticleGeo.rotateX(-Math.PI / 2);
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
  groundReticle = new THREE.Mesh(reticleGeo, reticleMat);
  gizmosGroup.add(groundReticle);

  const polyGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const polyMat = new THREE.LineBasicMaterial({ color: 0x10b981 });
  supportPolygonLine = new THREE.LineLoop(polyGeo, polyMat);
  gizmosGroup.add(supportPolygonLine);

  // Endorphin 2.7.1 Behavior Target Link Line & Reticle Gizmo
  const targetLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const targetLineMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.06,
    gapSize: 0.04,
    transparent: true,
    opacity: 0.95
  });
  targetIndicatorLine = new THREE.Line(targetLineGeo, targetLineMat);
  targetIndicatorLine.visible = false;
  gizmosGroup.add(targetIndicatorLine);

  const targetReticleGeo = new THREE.RingGeometry(0.14, 0.18, 32);
  const targetReticleMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  targetIndicatorReticle = new THREE.Mesh(targetReticleGeo, targetReticleMat);
  targetIndicatorReticle.visible = false;
  gizmosGroup.add(targetIndicatorReticle);

  scene.add(gizmosGroup);
}

function updateBiomechanicalGizmos() {
  const activeChar = getActiveCharacter();
  if (!gizmosGroup || !gizmosVisible || !activeChar || !activeChar.sensors) return;

  // Keep move gizmo synced to Pelvis during authoring mode
  if (charGizmoAnchor && !timeline.isBakingLive && !timeline.isPlaying && !(transformControls && transformControls.dragging)) {
    const p = activeChar.bodies['Pelvis']?.mesh?.position;
    if (p) {
      charGizmoAnchor.position.set(p.x, p.y, p.z);
    }
  }

  // Keep pose gizmo synced to selected bone in Pose Mode
  if (isPoseMode && selectedPoseBone && poseGizmoAnchor && !(poseTransformControls && poseTransformControls.dragging)) {
    const bMesh = activeChar?.bodies?.[selectedPoseBone]?.mesh;
    if (bMesh) {
      poseGizmoAnchor.position.copy(bMesh.position);
      poseGizmoAnchor.quaternion.copy(bMesh.quaternion);
      if (poseHighlightMesh) {
        poseHighlightMesh.position.copy(bMesh.position);
        poseHighlightMesh.quaternion.copy(bMesh.quaternion);
      }
    }
  }

  const com = activeChar.sensors.centerOfMass;
  comMesh.position.copy(com);

  const points = [
    com.clone(),
    new THREE.Vector3(com.x, 0.005, com.z)
  ];
  plumbLine.geometry.setFromPoints(points);
  groundReticle.position.set(com.x, 0.005, com.z);

  const leftFoot = activeChar.bodies['LeftFoot'];
  const rightFoot = activeChar.bodies['RightFoot'];
  if (leftFoot && rightFoot) {
    const lPos = leftFoot.rigidBody.translation();
    const rPos = rightFoot.rigidBody.translation();

    const polyPoints = [
      new THREE.Vector3(lPos.x - 0.07, 0.005, lPos.z - 0.12),
      new THREE.Vector3(lPos.x + 0.07, 0.005, lPos.z - 0.12),
      new THREE.Vector3(rPos.x + 0.07, 0.005, rPos.z - 0.12),
      new THREE.Vector3(rPos.x + 0.07, 0.005, rPos.z + 0.12),
      new THREE.Vector3(rPos.x - 0.07, 0.005, rPos.z + 0.12),
      new THREE.Vector3(lPos.x - 0.07, 0.005, lPos.z + 0.12)
    ];
    supportPolygonLine.geometry.setFromPoints(polyPoints);

    const minX = Math.min(lPos.x, rPos.x) - 0.08;
    const maxX = Math.max(lPos.x, rPos.x) + 0.08;
    const minZ = Math.min(lPos.z, rPos.z) - 0.14;
    const maxZ = Math.max(lPos.z, rPos.z) + 0.14;

    const isStable = (com.x >= minX && com.x <= maxX && com.z >= minZ && com.z <= maxZ && com.y > 0.45);
    const colorHex = isStable ? 0x10b981 : 0xef4444;

    comMesh.material.color.setHex(colorHex);
    plumbLine.material.color.setHex(colorHex);
    groundReticle.material.color.setHex(colorHex);
    supportPolygonLine.material.color.setHex(colorHex);
  }

  // --- ENDORPHIN 2.7.1 BEHAVIOR TARGET OBJECT LINK LINE & RETICLE ---
  const selectedLayer = timeline.getSelectedLayer();
  if (selectedLayer && selectedLayer.enabled && selectedLayer.targetObject && selectedLayer.targetObject !== 'none' && propsManager) {
    const prop = propsManager.getPropById(selectedLayer.targetObject);
    if (prop) {
      let tPos = null;
      if (prop.rigidBody) {
        const tr = prop.rigidBody.translation();
        tPos = new THREE.Vector3(tr.x, tr.y, tr.z);
      } else if (prop.mesh) {
        tPos = prop.mesh.position.clone();
      }

      if (tPos) {
        let originBoneName = 'UpperSpine';
        if (selectedLayer.behavior === 'reachHold') {
          if (selectedLayer.reachHand === 'left') originBoneName = 'LeftHand';
          else if (selectedLayer.reachHand === 'right') originBoneName = 'RightHand';
          else originBoneName = 'UpperSpine';
        } else if (selectedLayer.behavior === 'lookAt') {
          originBoneName = 'Head';
        } else if (selectedLayer.behavior === 'legsReach') {
          originBoneName = 'LeftFoot';
        } else if (selectedLayer.behavior === 'tackle') {
          originBoneName = 'Pelvis';
        }

        const originBody = character.bodies[originBoneName] || character.bodies['UpperSpine'];
        let bPos = new THREE.Vector3(0, 1.2, 0);
        if (originBody) {
          if (originBody.rigidBody) {
            const tr = originBody.rigidBody.translation();
            bPos.set(tr.x, tr.y, tr.z);
          } else if (originBody.mesh) {
            bPos.copy(originBody.mesh.position);
          }
        }

        if (targetIndicatorLine) {
          targetIndicatorLine.geometry.setFromPoints([bPos, tPos]);
          targetIndicatorLine.computeLineDistances();
          targetIndicatorLine.visible = true;
        }

        if (targetIndicatorReticle) {
          targetIndicatorReticle.position.copy(tPos);
          if (camera) targetIndicatorReticle.lookAt(camera.position);
          targetIndicatorReticle.visible = true;
        }
      } else {
        if (targetIndicatorLine) targetIndicatorLine.visible = false;
        if (targetIndicatorReticle) targetIndicatorReticle.visible = false;
      }
    } else {
      if (targetIndicatorLine) targetIndicatorLine.visible = false;
      if (targetIndicatorReticle) targetIndicatorReticle.visible = false;
    }
  } else {
    if (targetIndicatorLine) targetIndicatorLine.visible = false;
    if (targetIndicatorReticle) targetIndicatorReticle.visible = false;
  }
}

// --- ENDORPHIN 2.7.1 BONE SIMULATION TRAJECTORY VISUALIZER (BROKEN / DASHED LINES) ---
function initTrajectoryVisualizer() {
  trajectoryGroup = new THREE.Group();
  trajectoryGroup.name = 'BoneTrajectoryVisualizerGroup';

  // 1. Broken / Dashed line connecting simulation keyframes
  const trajGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const trajMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.05,
    gapSize: 0.035,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  trajectoryLine = new THREE.Line(trajGeo, trajMat);
  trajectoryGroup.add(trajectoryLine);

  // 2. Start Frame Marker (Green node @ Frame 0)
  const startGeo = new THREE.SphereGeometry(0.028, 16, 16);
  const startMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  trajectoryStartMarker = new THREE.Mesh(startGeo, startMat);
  trajectoryGroup.add(trajectoryStartMarker);

  // 3. End Frame Marker (Crimson node @ Final Frame)
  const endGeo = new THREE.SphereGeometry(0.028, 16, 16);
  const endMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  trajectoryEndMarker = new THREE.Mesh(endGeo, endMat);
  trajectoryGroup.add(trajectoryEndMarker);

  // 4. Playhead Reticle (Bright Yellow dynamic tracking sphere at current timeline position)
  const playheadGroup = new THREE.Group();
  const playheadOuter = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true })
  );
  const playheadCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  playheadGroup.add(playheadOuter, playheadCore);
  trajectoryPlayheadMesh = playheadGroup;
  trajectoryGroup.add(trajectoryPlayheadMesh);

  trajectoryGroup.visible = false;
  scene.add(trajectoryGroup);
}

function updateBoneTrajectory() {
  if (!trajectoryGroup) return;

  // Only display when a bone is selected and a baked simulation cache exists
  if (!selectedTargetBone || !timeline || !timeline.simulationCache || timeline.simulationCache.length < 2) {
    trajectoryGroup.visible = false;
    return;
  }

  const boneName = selectedTargetBone;
  const activeActorId = timeline.activeActorId || 'actor-1';
  const points = [];
  const totalCached = timeline.simulationCache.length;

  for (let f = 0; f < totalCached; f++) {
    const frameData = timeline.simulationCache[f];
    const actorBodies = (activeActorId === 'actor-2' && frameData?.actors?.['actor-2']?.bodies)
      ? frameData.actors['actor-2'].bodies
      : frameData?.bodies;
    if (actorBodies && actorBodies[boneName]) {
      const p = actorBodies[boneName].position;
      points.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
  }

  if (points.length < 2) {
    trajectoryGroup.visible = false;
    return;
  }

  // Rebuild dashed trajectory line with computed line distances
  trajectoryLine.geometry.dispose();
  const newGeo = new THREE.BufferGeometry().setFromPoints(points);
  newGeo.computeLineDistances(); // REQUIRED for LineDashedMaterial
  trajectoryLine.geometry = newGeo;

  // Position start (frame 0) & end (final frame) markers
  trajectoryStartMarker.position.copy(points[0]);
  trajectoryEndMarker.position.copy(points[points.length - 1]);

  // Update dynamic playhead reticle
  const curF = Math.min(timeline.currentFrame, points.length - 1);
  if (points[curF]) {
    trajectoryPlayheadMesh.position.copy(points[curF]);
    trajectoryPlayheadMesh.visible = true;
  } else {
    trajectoryPlayheadMesh.visible = false;
  }

  trajectoryGroup.visible = true;
}

function updateTrajectoryPlayheadOnly() {
  if (!trajectoryGroup || !trajectoryGroup.visible || !selectedTargetBone) return;
  if (!timeline || !timeline.simulationCache || timeline.simulationCache.length < 2) return;

  const curF = Math.min(timeline.currentFrame, timeline.simulationCache.length - 1);
  const frameData = timeline.simulationCache[curF];
  const activeActorId = timeline.activeActorId || 'actor-1';
  const actorBodies = (activeActorId === 'actor-2' && frameData?.actors?.['actor-2']?.bodies)
    ? frameData.actors['actor-2'].bodies
    : frameData?.bodies;
  const curPos = actorBodies?.[selectedTargetBone]?.position;
  if (curPos && trajectoryPlayheadMesh) {
    trajectoryPlayheadMesh.position.set(curPos[0], curPos[1], curPos[2]);
  }
}

function clearBoneTrajectory() {
  if (trajectoryGroup) {
    trajectoryGroup.visible = false;
  }
}

function updateSimulatedShadeUI() {
  const shadeEl = document.getElementById('timeline-simulated-shade');
  const rulerBarEl = document.getElementById('timeline-ruler-cache-bar');
  const endMarkerEl = document.getElementById('timeline-shade-end-marker');

  const cachedCount = Array.isArray(timeline.simulationCache) ? timeline.simulationCache.length : 0;
  const total = Math.max(1, timeline.totalFrames);

  if (cachedCount > 0) {
    const pct = THREE.MathUtils.clamp((cachedCount / total) * 100, 0, 100);
    const widthStr = `${pct.toFixed(2)}%`;
    if (shadeEl) {
      shadeEl.style.display = 'block';
      shadeEl.style.width = widthStr;
    }
    if (rulerBarEl) {
      rulerBarEl.style.display = 'block';
      rulerBarEl.style.width = widthStr;
    }
    if (endMarkerEl) {
      endMarkerEl.style.display = 'block';
      endMarkerEl.textContent = `${cachedCount}f`;
    }
  } else {
    if (shadeEl) {
      shadeEl.style.width = '0%';
      shadeEl.style.display = 'none';
    }
    if (rulerBarEl) {
      rulerBarEl.style.width = '0%';
      rulerBarEl.style.display = 'none';
    }
    if (endMarkerEl) {
      endMarkerEl.style.display = 'none';
    }
  }
}

function updateTimelineUI() {
  const frameEl = document.getElementById('tel-frame');
  const sliderEl = document.getElementById('timeline-slider');
  const playheadEl = document.getElementById('timeline-playhead-line');
  if (frameEl) frameEl.textContent = timeline.currentFrame;
  if (sliderEl) sliderEl.value = timeline.currentFrame;
  if (playheadEl) {
    const pct = (timeline.currentFrame / Math.max(1, timeline.totalFrames)) * 100;
    playheadEl.style.left = `${THREE.MathUtils.clamp(pct, 0, 100)}%`;
  }
  updateSimulatedShadeUI();
}

function startLiveSimulation(fromFrame = 0) {
  if (fromFrame === 0) {
    timeline.resetSimulation();
  } else {
    timeline.isSimulated = false;
  }
  timeline.isBakingLive = true;
  timeline.isPlaying = false;
  updateSimulationStatusUI();
  updateTimelineUI();
}

function stopLiveSimulation() {
  if (!timeline.isBakingLive) return;
  timeline.isBakingLive = false;
  const cachedCount = Array.isArray(timeline.simulationCache) ? timeline.simulationCache.length : 0;
  timeline.isSimulated = cachedCount > 0;
  timeline.isPlaying = false; // Never autoplay on stop - pause and let user decide
  playbackTimer = 0;
  updateSimulationStatusUI();
  updateTimelineUI();
  updateBoneTrajectory();
}

function scrubToFrame(frameIdx) {
  if (timeline.isBakingLive) {
    stopLiveSimulation();
  }
  timeline.isPlaying = false;
  const clamped = THREE.MathUtils.clamp(Math.round(frameIdx), 0, timeline.totalFrames - 1);
  timeline.seek(clamped);
  if (mixamoBridge && mixamoBridge.isVisible) {
    mixamoBridge.update();
  }
  updateTrajectoryPlayheadOnly();
  updateTimelineUI();
  updateSimulationStatusUI();
}

function formatLayerBarLabel(layer) {
  let badgeSummary = '';
  if (layer.type === 'PERTURBATION') {
    badgeSummary = `${layer.targetBody || 'Spine'} (${Math.round(layer.magnitude ?? 65)}N @ ${Math.round(layer.yawDeg ?? 180)}°)`;
  } else if (layer.type === 'CONSTRAINT') {
    badgeSummary = `Pin: ${layer.targetBody || 'LeftHand'} [${layer.constraintType || 'lock'}]`;
  } else if (layer.type === 'ACTIVE_POSE') {
    badgeSummary = `Pose: ${layer.poseKey || 'crouch'} (${Math.round(layer.strength ?? 50)}%)`;
  } else if (layer.type === 'ANIMATION') {
    const gait = (layer.gaitStyle || 'walk').toUpperCase();
    badgeSummary = `Gait: ${gait} · ${Math.round((layer.intensity ?? 1.0) * 100)}% · ${(layer.speed ?? 1.0).toFixed(1)}x`;
  } else {
    badgeSummary = `${Math.round((layer.intensity ?? 1.0) * 100)}% · ${(layer.speed ?? 1.0).toFixed(1)}x`;
    if (layer.targetObject && layer.targetObject !== 'none' && propsManager) {
      const p = propsManager.getPropById(layer.targetObject);
      badgeSummary += ` · 🎯 ${p?.name || 'Target'}`;
    }
  }

  const blendBadge = (layer.blendIn !== undefined || layer.blendOut !== undefined)
    ? ` | ⧗ ${layer.blendIn ?? 10}f in / ${layer.blendOut ?? 10}f out`
    : '';

  return `${layer.name} [${badgeSummary}] (F${layer.startFrame}–F${layer.endFrame}${blendBadge})`;
}

function applyBarVisualStyles(barEl, layer) {
  const leftPercent = (layer.startFrame / timeline.totalFrames) * 100;
  const widthPercent = ((layer.endFrame - layer.startFrame) / timeline.totalFrames) * 100;
  barEl.style.left = `${leftPercent}%`;
  barEl.style.width = `${Math.max(widthPercent, 2.2)}%`;
  barEl.style.backgroundColor = layer.color;
  barEl.style.opacity = layer.enabled ? '1.0' : '0.35';

  const durationFrames = Math.max(1, layer.endFrame - layer.startFrame);
  const blendInPct = Math.min(48, ((layer.blendIn ?? 10) / durationFrames) * 100);
  const blendOutPct = Math.min(48, ((layer.blendOut ?? 10) / durationFrames) * 100);
  if (blendInPct > 0 || blendOutPct > 0) {
    barEl.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.32) 0%, transparent ${blendInPct}%, transparent ${100 - blendOutPct}%, rgba(0,0,0,0.40) 100%)`;
  } else {
    barEl.style.backgroundImage = 'none';
  }

  const labelEl = barEl.querySelector('.bar-label');
  if (labelEl) {
    labelEl.textContent = formatLayerBarLabel(layer);
  }
}

// ==========================================================================
// SETTING & LIBRARY EXPLANATION KNOWLEDGE BASE (ENDORPHIN 2.7.1)
// ==========================================================================
export const SETTING_EXPLANATIONS = {
  // --- Dynamic Behavior Inspector Settings ---
  'insp-intensity': {
    title: 'Behavior Strength / Intensity',
    category: 'Muscle PD Motor Gain',
    icon: '⚡',
    desc: 'Scales the maximum torque limits and proportional-derivative (PD) muscle servo stiffness for the active behavior.',
    effect: 'Higher values produce stiff, energetic muscle action resisting impacts; lower values allow external impacts to overpower limbs into compliant yielding.'
  },
  'insp-speed': {
    title: 'Reflex / Cycle Speed',
    category: 'Temporal Kinetics',
    icon: '⏱️',
    desc: 'Modulates temporal frequency and cycle playback rate of rhythmic behaviors (stepping, flailing, reach arcs).',
    effect: 'Values >1.0x create sharp rapid twitches and fast reflexes; values <1.0x produce slow-motion, deliberate reactions.'
  },
  'insp-behavior-target': {
    title: 'Target Object / Prop',
    category: 'Spatial Guidance',
    icon: '🎯',
    desc: 'Binds a physical scene object or prop as the 3D target for goal-directed behaviors (Reach, Look At, Tackle).',
    effect: 'Limb reach effectors, head gaze, and momentum redirect directly toward the real-time position of this object.'
  },
  'insp-behavior-reach-hand': {
    title: 'Reaching Arm Selector',
    category: 'Anatomical Isolation',
    icon: '🖐️',
    desc: 'Determines whether Both Arms, Left Arm Only, or Right Arm Only executes the goal-directed reach.',
    effect: 'Isolating one arm leaves the opposing arm free to perform independent balance reactions or flail naturally.'
  },
  'insp-behavior-lookat': {
    title: 'Look At Target (Dynamic Gaze)',
    category: 'Cervical & Gaze Tracking',
    icon: '👀',
    desc: 'Toggles cervical and cranial joint motors to dynamically orient the character face toward the target.',
    effect: 'Applies up to 30 Nm rotational torque to Neck/Head joints to continuously track the moving object.'
  },
  'insp-use-prediction': {
    title: 'Use Trajectory Prediction',
    category: 'Ballistic Interception',
    icon: '🎯',
    desc: 'Enables Endorphin 2.7.1 ballistic trajectory prediction for dynamic moving targets.',
    effect: 'Calculates parabolic flight paths ahead of time using target velocity and gravity, guiding hands to intercept incoming items.'
  },
  'insp-predrate': {
    title: 'Prediction Rate (Lookahead Horizon)',
    category: 'Ballistic Interception',
    icon: '📈',
    desc: 'Sets the future lookahead time horizon (in seconds) used to extrapolate moving target trajectories.',
    effect: 'Higher rates lead fast-moving targets further ahead along their flight arc; lower rates aim closer to instantaneous position.'
  },
  'insp-trajoff': {
    title: 'Trajectory Offset',
    category: 'Ballistic Interception',
    icon: '↔️',
    desc: 'Shifts reach contact point forward or backward along the target tangential velocity path.',
    effect: 'Positive values intercept moving targets early along flight path; negative values trail behind incoming projectiles.'
  },
  'insp-intercept-x': {
    title: 'Interception Offset X (Lateral)',
    category: 'Spatial Offset',
    icon: '📐',
    desc: 'Lateral Cartesian offset (in meters) added to the target contact position along the X axis.',
    effect: 'Offsets target contact to the left or right of the object geometric center.'
  },
  'insp-intercept-y': {
    title: 'Interception Offset Y (Elevation)',
    category: 'Spatial Offset',
    icon: '📐',
    desc: 'Vertical Cartesian offset (in meters) added to the target contact position along the Y axis.',
    effect: 'Allows targeting the top handle, rim, or bottom of a prop rather than its geometric midpoint.'
  },
  'insp-intercept-z': {
    title: 'Interception Offset Z (Depth)',
    category: 'Spatial Offset',
    icon: '📐',
    desc: 'Forward/backward Cartesian offset (in meters) added to the target contact position along the Z axis.',
    effect: 'Offsets contact forward or backward along depth.'
  },
  'insp-exaggeration': {
    title: 'Exaggeration (Arc Curvature)',
    category: 'Stylized Kinematics',
    icon: '🌊',
    desc: 'Amplifies parabolic curve curvature and preparatory wind-up of reaching arm motions.',
    effect: 'Produces theatrical, stylized swooping reach arcs instead of straight Euclidean line reaches.'
  },
  'insp-delay': {
    title: 'Reaction Latency (Delay)',
    category: 'Human Reflex Timing',
    icon: '⏳',
    desc: 'Simulates physiological sensory processing latency before initiating motor response.',
    effect: 'Postpones the onset of tracking or reaching by the specified seconds, creating realistic human perception latency.'
  },
  'insp-characcel': {
    title: 'Character Acceleration Threshold',
    category: 'Reflex Override',
    icon: '💥',
    desc: 'Maximum character acceleration allowed before goal-directed behavior yields.',
    effect: 'If an explosion or violent impact accelerates the character beyond this limit, reaching yields to protective tumble reflexes.'
  },
  'insp-targetaccel': {
    title: 'Target Acceleration Threshold',
    category: 'Target Filtering',
    icon: '🛡️',
    desc: 'Filters out erratic target velocity spikes when computing ballistic intercepts.',
    effect: 'Prevents reaching arms from violently twitching when targets bounce off floors or walls.'
  },
  'insp-body-mask': {
    title: 'Body Part Mask (Layering Filter)',
    category: 'Skeletal Layering',
    icon: '🎭',
    desc: 'Restricts torque output to Whole Body, Arms Only, Legs Only, or Torso/Head Only.',
    effect: 'Enables complex layered choreography: e.g. Jump running on the lower body while Arms Flail or Reach runs on the upper body.'
  },
  'insp-blendin': {
    title: 'Blend In Transition (Frames)',
    category: 'Hermite Curve Blending',
    icon: '⧗',
    desc: 'Hermite S-curve ramp-up duration at the start of the timeline track.',
    effect: 'Smoothly transitions motor targets from the previous pose or ragdoll state without sudden impulse jerks or solver snaps.'
  },
  'insp-blendout': {
    title: 'Blend Out Transition (Frames)',
    category: 'Hermite Curve Blending',
    icon: '⧖',
    desc: 'Hermite S-curve fade-out duration at the end of the timeline track.',
    effect: 'Gradually yields joint motor authority back to subsequent timeline layers or passive ragdoll, ensuring seamless continuity.'
  },
  'insp-enabled': {
    title: 'Track Active Toggle',
    category: 'Sequencer Control',
    icon: '🔘',
    desc: 'Toggles whether this track contributes motor torques to the physics simulation.',
    effect: 'When unchecked, the track is bypassed entirely during simulation bake without needing to delete it from the timeline.'
  },
  'insp-start': {
    title: 'Track Start Frame',
    category: 'Timeline Sequencing',
    icon: '⏮️',
    desc: 'The exact frame index where this event or behavior begins its activation.',
    effect: 'Controls the temporal onset of the behavior relative to the 60fps simulation clock.'
  },
  'insp-end': {
    title: 'Track End Frame',
    category: 'Timeline Sequencing',
    icon: '⏭️',
    desc: 'The frame index where the behavior finishes its active duration.',
    effect: 'Determines how long the behavior drives character muscles before yielding to subsequent tracks or passive ragdoll.'
  },
  'insp-duration': {
    title: 'Track Duration (Frames)',
    category: 'Timeline Sequencing',
    icon: '⏱️',
    desc: 'Total frame length of the active timeline block.',
    effect: 'Editing duration stretches or compresses the active execution window of the behavior.'
  },

  // --- Bone Constraint / Pin Settings ---
  'insp-constraint-body': {
    title: 'Constrained Bone / Body Part',
    category: 'Kinematic Anchor',
    icon: '📌',
    desc: 'Selects which articulated bone is locked or pinned in space.',
    effect: 'Converts the bone into an infinite-mass Kinematic anchor in Rapier, holding zero drift with connected limbs swinging freely.'
  },
  'insp-constraint-pin-target': {
    title: 'Pin Target Assignment',
    category: 'Object Coupling',
    icon: '🔗',
    desc: 'Assigns whether the bone is pinned to World Space coordinates or attached to a scene Prop.',
    effect: 'When attached to a dynamic moving prop, the pinned bone moves and rotates compliantly in lockstep with the prop physical motion.'
  },
  'insp-constraint-type': {
    title: 'Constraint Nature (6-DOF)',
    category: 'Degrees of Freedom',
    icon: '🔒',
    desc: 'Selects Lock All (Position & Rotation), Lock Position Only (free ball-joint pivot), or Lock Orientation.',
    effect: "'Lock Position Only' allows connected limbs to freely swing like a true physical pendulum while holding the pivot firmly in space."
  },
  'insp-constraint-strength': {
    title: 'Constraint Rigidity',
    category: 'Coupling Stiffness',
    icon: '💪',
    desc: 'Spring stiffness multiplier for the constraint attachment.',
    effect: 'Higher values ensure zero spatial drift; lower values provide soft, bungee-like compliant elastic suspension.'
  },
  'insp-constraint-break-force': {
    title: 'Break Force Threshold',
    category: 'Tension Snapping',
    icon: '⚡',
    desc: 'Maximum mechanical tension in Newtons that the constraint can sustain before snapping.',
    effect: 'If character inertia or external impacts exceed this threshold, the pin automatically breaks and character transitions to free physical motion.'
  },
  'insp-constraint-trigger-dist': {
    title: 'Trigger Contact Distance',
    category: 'Proximity Latching',
    icon: '🧲',
    desc: 'Maximum proximity distance in meters required to activate auto-latching on contact.',
    effect: 'When bone approaches within this sphere radius of the anchor or prop surface, it latches on automatically and preserves contact offset.'
  },
  'physics-engine-select': {
    title: 'Active Physics Engine',
    category: 'Physics Solver Backend',
    icon: '⚛️',
    desc: 'Selects the active real-time physics solver: Rapier 3D, MuJoCo, Jolt, or NVIDIA PhysX 5.',
    effect: 'Switches the underlying articulated solver, constraint resolution, and stiction friction dynamics in real time.'
  },

  // --- Active Pose Settings ---
  'insp-pose-key': {
    title: 'Target Pose Preset',
    category: 'Target Pose Matrix',
    icon: '🥋',
    desc: 'Selects an authentic Endorphin joint configuration (Crouch, Arms Raised, Foetal, Sitting, Weapon Hold).',
    effect: 'Drives internal joint motors toward target radian angles, enabling keyframed biological posturing.'
  },
  'insp-pose-strength': {
    title: 'Pose Match Strength',
    category: 'Muscle Tone',
    icon: '💪',
    desc: 'Stiffness percentage for achieving the preset angles against gravity and external forces.',
    effect: 'At 100%, character muscles hold rigid pose geometry; at lower percentages, limbs yield realistically under physical load.'
  },

  // --- Force Event / Impulse Settings ---
  'insp-target-body': {
    title: 'Impact Target Bone',
    category: 'Kinetic Energy Transfer',
    icon: '🎯',
    desc: 'The specific anatomical bone where the external force or push is applied.',
    effect: 'Applies linear momentum directly to this rigid body, causing realistic biomechanical recoil and torque transfer through joints.'
  },
  'insp-force-mode': {
    title: 'Force Application Mode',
    category: 'Kinetic Energy Transfer',
    icon: '⚡',
    desc: 'Selects Instant Impact Impulse (single-frame strike) vs Continuous Push (sustained shove over duration).',
    effect: 'Instant impulse produces sharp, dramatic shock recoil; continuous push applies sustained acceleration over the layer duration.'
  },
  'insp-magnitude': {
    title: 'Force Magnitude (N·s / N)',
    category: 'Kinetic Energy Transfer',
    icon: '💥',
    desc: 'Peak mechanical momentum or push force exerted on the target bone.',
    effect: 'Light forces (10–40 N·s) induce gentle balance staggers; heavy forces (80–250 N·s) violently throw the character off balance.'
  },
  'insp-yaw': {
    title: 'Horizontal Direction (Yaw)',
    category: 'Vector Direction',
    icon: '🧭',
    desc: 'Compass heading of the applied force vector around the vertical Y axis (0° Front, ±90° Side, 180° Back).',
    effect: 'Determines whether the character gets struck from the front, blindsided from the side, or pushed from behind.'
  },
  'insp-pitch': {
    title: 'Vertical Angle (Pitch)',
    category: 'Vector Direction',
    icon: '📐',
    desc: 'Elevation incline of the force vector above or below the horizontal ground plane.',
    effect: 'Positive angles push the character upward into the air; negative angles smash the bone downward into the floor.'
  },
  'insp-gait-style': {
    title: 'Animation Clip / Gait Source',
    category: 'Kinematic & Retargeted Motion',
    icon: '🎬',
    desc: 'Selects between built-in Fourier biomechanical gaits (Walk, Jog, Stalk, Limp) or any imported & retargeted custom animation (.fbx, .glb, .bvh).',
    effect: 'Drives full-body skeletal kinematics and transfers linear/angular momentum into Rapier 3D physics when transitioning to ragdoll or active behaviors.'
  },
  'insp-anim-source': {
    title: 'Animation Source / Retargeted Clip',
    category: 'Motion Retargeting',
    icon: '🎬',
    desc: 'Selects either a procedural biomechanical gait or a custom retargeted animation clip imported from Mixamo (.fbx), GLTF (.glb), or Mocap (.bvh).',
    effect: 'Automatically maps source bone rotations and scaled Hips displacement onto the 15-segment physics character and active 3D skin.'
  },
  'btn-insp-import-anim': {
    title: 'Import & Retarget Custom Animation',
    category: 'Mixamo / Mocap Pipeline',
    icon: '📂',
    desc: 'Loads an external animation file (.fbx With or Without Skin, .glb/.gltf, or .bvh) and bakes a 60Hz retargeted motion clip.',
    effect: 'Immediately applies the retargeted animation to the character on screen and sequences it on this timeline track.'
  },
  'insp-anim-inplace': {
    title: 'In-Place Mode (Lock Horizontal Root)',
    category: 'Root Motion Control',
    icon: '📍',
    desc: 'Locks horizontal (X/Z) pelvis translation while preserving vertical hip bounce and full-body joint rotations.',
    effect: 'When unchecked, full 3D root motion moves the character across the floor and transfers forward momentum into physics; when checked, the character animates in place.'
  },
  'insp-anim-loop': {
    title: 'Loop Animation Clip',
    category: 'Timeline Playback',
    icon: '🔁',
    desc: 'Controls whether the animation repeats continuously when the timeline track is longer than a single clip cycle.',
    effect: 'Accumulates seamless root displacement across loop cycles when Root Motion is enabled, or holds the final pose when unchecked.'
  },
  'insp-anim-yaw': {
    title: 'Animation Facing Yaw Offset',
    category: 'Spatial Orientation',
    icon: '🧭',
    desc: 'Rotates the heading direction of the animation and its root motion vector around the vertical Y axis (-180° to +180°).',
    effect: 'Fixes imported animations that face backward (-Z) or sideways (±X), or directs the character toward a specific scene obstacle.'
  },
  'insp-anim-arm-spread': {
    title: 'Animation Arm Spread Offset',
    category: 'Retargeting Fine-Tune',
    icon: '🙆',
    desc: 'Adjusts left and right upper-arm abduction angle (-45° inward to +45° outward) during animation playback.',
    effect: 'Prevents hands/arms from clipping into wide character torsos or corrects A-pose vs T-pose shoulder offsets in custom mocap clips.'
  },
  'cal-auto-tpose': {
    title: 'Auto A-Pose → T-Pose Limb Alignment',
    category: 'Rig Calibration',
    icon: '🧍',
    desc: 'Automatically measures bind-pose arm and leg bone vectors and aligns angled A-pose rigs to the horizontal T-pose physics reference frame.',
    effect: 'Prevents arms from crossing inside the chest when importing characters modeled in a 30°–45° A-pose.'
  },
  'cal-auto-ground-clamp': {
    title: 'Anti-Ground-Penetration Foot Clamp',
    category: 'Ground & Contact Solver',
    icon: '🦶',
    desc: 'Endorphin-style ground contact solver that prevents feet, boots, or shoes from clipping below the floor during animation playback.',
    effect: 'Dynamically elevates the character whenever a foot reaches below Y = 0.0, keeping foot soles perfectly flush with the ground.'
  },
  'cal-foot-sole-offset': {
    title: 'Foot Sole Margin Offset',
    category: 'Ground & Contact Solver',
    icon: '👞',
    desc: 'Vertical distance between the foot/ankle bone pivot and the lowest point of the character shoe or sole.',
    effect: 'Compensates for thick combat boot soles, heels, or barefoot characters, ensuring exact floor contact without ground penetration.'
  },
  'cal-thigh-spread': {
    title: 'Thigh Clearance (Stance Width)',
    category: 'Self-Clipping Prevention',
    icon: '🦵',
    desc: 'Applies lateral abduction (outward spread) to the left and right thighs during animation and walk cycles.',
    effect: 'Eliminates inner-thigh mesh self-intersection and rubbing on muscular, stylized, or heavily armored characters.'
  },
  'cal-body-girth': {
    title: 'Body Girth & Physics Collider Padding',
    category: 'Self-Clipping & Physics',
    icon: '🛡️',
    desc: 'Scales the radius of Rapier 3D collision capsules on the character body (0.6x to 1.8x).',
    effect: 'Prevents arms, hands, and legs from penetrating the torso or each other during dynamic ragdoll and behavior physics simulations.'
  },
  'cal-arm-spread': {
    title: 'Rig Arm Clearance (Spread Offset)',
    category: 'Rig Calibration',
    icon: '🙆',
    desc: 'Manually fine-tunes rest-pose shoulder/upper-arm abduction angle (-30° to +45°) on the imported 3D character mesh.',
    effect: 'Widens the arm swing arc away from wide chests, hips, or armor plates, eliminating arm-to-torso self-clipping.'
  },
  'cal-scale-mult': {
    title: 'Character Rig Scale Multiplier',
    category: 'Rig Calibration',
    icon: '⤢',
    desc: 'Fine-tunes the overall size of the imported 3D character skin on top of automatic 1.75m height normalization.',
    effect: 'Matches stylized, bulky, or non-standard character proportions to the physics collision capsules.'
  },
  'cal-ground-y': {
    title: 'Foot Grounding Vertical Offset (Y)',
    category: 'Rig Calibration',
    icon: '👟',
    desc: 'Shifts the imported 3D character mesh vertically relative to the ground plane (-0.60m to +0.60m).',
    effect: 'Eliminates floating feet or sunken soles caused by thick boots, heels, or origin offsets in custom FBX/GLB rigs.'
  },
  'cal-yaw-offset': {
    title: 'Character Mesh Facing Yaw Offset',
    category: 'Rig Calibration',
    icon: '🧭',
    desc: 'Rotates the imported 3D character skin around the vertical Y axis (-180° to +180°).',
    effect: 'Aligns characters exported facing -Z or ±X so they face forward (+Z) in lockstep with the physics humanoid.'
  },
  'btn-import-retarget-anim': {
    title: 'Import & Retarget Custom Animation',
    category: 'Mixamo / Mocap Retargeter',
    icon: '🎬',
    desc: 'Import any Mixamo FBX (With Skin or Without Skin), GLB/GLTF, or BVH animation file and retarget it onto the studio character.',
    effect: 'Automatically extracts bone rotations and scaled root motion, creating a timeline Animation track that blends seamlessly into Rapier 3D physics.'
  },
  'btn-import-custom-rig': {
    title: 'Import Custom Rigged Character',
    category: 'Character Rig Pipeline',
    icon: '📂',
    desc: 'Load a custom rigged humanoid character (.fbx, .glb, .gltf) from Mixamo, Blender, Unreal, or Unity.',
    effect: 'Restores true bind pose, maps all humanoid bones across multi-mesh skeletons, auto-aligns A-pose limbs to T-pose, and binds to the physics ragdoll.'
  },

  // --- Prop Inspector Settings ---
  'prop-mode-sim': {
    title: 'Simulated Dynamic Prop',
    category: 'Physics Mode',
    icon: '⚡',
    desc: 'Enables dynamic Rapier rigid body physics with gravity, velocity momentum, and restitution.',
    effect: 'Reacts to character kicks, impacts, and tumbling forces with authentic 6-DOF physical response.'
  },
  'prop-mode-static': {
    title: 'Static Fixed Prop',
    category: 'Physics Mode',
    icon: '🔒',
    desc: 'Locks prop at placed world coordinates as an unyielding physical obstacle.',
    effect: 'Characters collide and bounce off the obstacle without shifting its position.'
  },
  'prop-mass-slider': {
    title: 'Prop Physical Mass',
    category: 'Inertia & Weight',
    icon: '⚖️',
    desc: 'Adjusts physical weight (kg) and rotational inertia in the Rapier physics solver.',
    effect: 'Heavy props (50-100 kg) knock characters over on impact; lighter props fly away effortlessly when struck.'
  },
  'prop-pos-x': {
    title: 'Prop X Position (Left/Right)',
    category: '3D Transform',
    icon: '↔️',
    desc: 'Lateral placement in world space meters along the red X axis.',
    effect: 'Shifts prop left or right across the stage.'
  },
  'prop-pos-y': {
    title: 'Prop Y Elevation (Height)',
    category: '3D Transform',
    icon: '↕️',
    desc: 'Vertical elevation in world space meters along the green Y axis.',
    effect: 'Elevates prop above floor for drops, or aligns with character chest/head.'
  },
  'prop-pos-z': {
    title: 'Prop Z Position (Depth)',
    category: '3D Transform',
    icon: '🔃',
    desc: 'Forward/backward placement in world space meters along the blue Z axis.',
    effect: 'Positions prop in front of or behind the character walking trajectory.'
  },
  'prop-rot-x': {
    title: 'Prop Pitch (X Rotation)',
    category: '3D Transform',
    icon: '↻',
    desc: 'Tilt angle around the lateral X axis in degrees.',
    effect: 'Angles ramps or obstacles to alter trip angles.'
  },
  'prop-rot-y': {
    title: 'Prop Yaw (Y Rotation)',
    category: '3D Transform',
    icon: '↻',
    desc: 'Heading rotation around the vertical Y axis in degrees.',
    effect: 'Orients facing direction of obstacles or platforms.'
  },
  'prop-rot-z': {
    title: 'Prop Roll (Z Rotation)',
    category: '3D Transform',
    icon: '↻',
    desc: 'Bank tilt around the depth Z axis in degrees.',
    effect: 'Banks or rolls props to create slanted surfaces.'
  },
  'prop-scale-uni': {
    title: 'Uniform Prop Scale',
    category: 'Geometry & Bounds',
    icon: '⤢',
    desc: 'Uniformly scales visual mesh and physical collider volume.',
    effect: 'Proportionately expands or shrinks the prop in all 3 dimensions.'
  },

  // --- Left Sidebar & DMS Library Items ---
  'btn-add-walk-anim': {
    title: '+ Walk Cycle (Frames 0–60)',
    category: 'Kinematic Locomotion',
    icon: '🏃',
    desc: 'Injects a priority 60-frame forward bipedal walking gait across all limbs.',
    effect: 'Propels the character across the scene before transitioning into dynamic autonomous reactions.'
  },
  'btn-add-impulse': {
    title: '+ Force Event on Bone',
    category: 'External Impact',
    icon: '🎯',
    desc: 'Spawns a directional impact impulse on any bone with an interactive 3D arrow gizmo.',
    effect: 'Simulates punches, explosions, or vehicle hits to test reactive balance and stumbles.'
  },
  'btn-add-pose-event': {
    title: '+ Active Pose Event',
    category: 'Joint Keyframing',
    icon: '🥋',
    desc: 'Adds an active pose segment from the Endorphin joint angle library.',
    effect: 'Drives muscles to assume specific postures (Crouch, Foetal, Tactical Grip, etc.).'
  },
  'btn-add-constraint-event': {
    title: '+ Bone Constraint / Pin',
    category: 'Kinematic World Anchor',
    icon: '📌',
    desc: 'Anchors any selected bone to a fixed world point or scene prop.',
    effect: 'Simulates gymnastics high bar, ledge hanging, handcuffs, or pinned limb reactions.'
  },
  'btn-prop-box': {
    title: 'Spawn Box / Cube Prop',
    category: 'Physical Prop',
    icon: '🧊',
    desc: 'Spawns a rigid box prop with sharp edge contacts and stable stacking physics.',
    effect: 'Ideal for building walls, crates, or collision barriers.'
  },
  'btn-prop-sphere': {
    title: 'Spawn Sphere / Ball Prop',
    category: 'Physical Prop',
    icon: '⚽',
    desc: 'Spawns a spherical prop that rolls freely across the ground plane.',
    effect: 'Rolls into character feet to cause loss of balance, or acts as a catchable projectile.'
  },
  'btn-prop-cylinder': {
    title: 'Spawn Cylinder / Pillar Prop',
    category: 'Physical Prop',
    icon: '🥫',
    desc: 'Spawns a cylindrical column or barrel.',
    effect: 'Acts as upright pillars or rolling barrels depending on placed orientation.'
  },
  'btn-prop-capsule': {
    title: 'Spawn Capsule / Pill Prop',
    category: 'Physical Prop',
    icon: '💊',
    desc: 'Spawns a capsule with rounded hemispherical end caps.',
    effect: 'Smooth collision contours prevent edge-snagging during sliding contacts.'
  },
  'btn-prop-crate': {
    title: 'Spawn Hurdle Crate Prop',
    category: 'Obstacle Preset',
    icon: '📦',
    desc: 'Spawns a wooden low-hurdle crate directly in the character forward path.',
    effect: 'Trips the lower shins during walking, triggering autonomous trip & catch-fall reactions.'
  },
  'btn-prop-step': {
    title: 'Spawn Stepping Platform Prop',
    category: 'Obstacle Preset',
    icon: '🪜',
    desc: 'Spawns an elevated stepping block or curb.',
    effect: 'Tests step-up climbing or drop-landing compliant crouch absorption.'
  },
  'btn-prop-projectile': {
    title: 'Launch Cannonball Projectile',
    category: 'Dynamic Impact',
    icon: '💣',
    desc: 'Launches a high-velocity 25 kg cannonball directly at the character.',
    effect: 'Demonstrates violent ballistic impact shocks and full ragdoll knockdown reactions.'
  },
  'btn-prop-fluid': {
    title: 'Spawn Water Pool Volume',
    category: 'Fluid Simulation',
    icon: '🌊',
    desc: 'Spawns a physical fluid volume with buoyancy and viscous velocity damping.',
    effect: 'Characters float upward based on submerged volume and experience underwater drag.'
  },
  'btn-clear-props': {
    title: 'Clear All Physical Props',
    category: 'Scene Cleanup',
    icon: '🧹',
    desc: 'Removes all physical props and obstacles from the scene.',
    effect: 'Resets the environment back to an empty ground plane.'
  },
  'ground-material-select': {
    title: 'Ground Surface Material (CMF)',
    category: 'Contact Mechanics',
    icon: '🧱',
    desc: 'Selects Coulomb friction and restitution of the ground floor plane.',
    effect: 'Ice (friction 0.03) causes realistic slipping; Concrete (1.4) provides firm grip; Rubber bounces.'
  },
  'wind-slider': {
    title: 'Pusher Wind Field',
    category: 'Environmental Force Field',
    icon: '💨',
    desc: 'Continuous aerodynamic wind force pushing against character bodies.',
    effect: 'Forces the active balance system to continuously lean into the wind to maintain equilibrium.'
  },
  'twister-slider': {
    title: 'Twister Vortex Field',
    category: 'Environmental Force Field',
    icon: '🌪️',
    desc: 'Rotational angular vortex applying centrifugal air currents around origin.',
    effect: 'Spins ragdoll limbs and loose props in a swirling aerial funnel.'
  },
  'stiffness-slider': {
    title: 'Muscle Rig Calibration',
    category: 'Biomechanical Motors',
    icon: '💪',
    desc: 'Global PD servo stiffness across all anatomical joints (50 Nm to 600 Nm).',
    effect: '500 Nm = athletic & firm; 300 Nm = normal human; 150 Nm = tired/relaxed; 60 Nm = limp ragdoll.'
  },
  'btn-preset-walk-trip': {
    title: 'Walk → Trip → Catch Fall Preset',
    category: 'Scenario Preset',
    icon: '🚶',
    desc: 'Endorphin showcase: locomotion, obstacle snag collision, trip loss of balance, and protective arm catch fall.',
    effect: 'Demonstrates multi-phase autonomous motor synthesis: kinematic stride -> leg impact -> arm reach & floor cushion -> ragdoll rest.'
  },
  'btn-preset-jog-hit': {
    title: 'Athletic Jog → Heavy Chest Hit → Flip',
    category: 'Scenario Preset',
    icon: '🏃',
    desc: 'High-speed athletic running gait colliding with a 115N chest impact, launching into mid-air tumble flail and flip.',
    effect: 'Demonstrates high forward momentum preservation across the kinematic-to-physics transition with explosive mid-air reaction.'
  },
  'btn-preset-walk-stumble': {
    title: 'Walk → Lateral Shove → Stagger',
    category: 'Scenario Preset',
    icon: '💫',
    desc: 'Brisk walk struck by a 90° lateral shove, triggering compensatory flail and recovery crouching stance.',
    effect: 'Demonstrates multi-layer behavior blending and active pose matching for dynamic balance recovery.'
  },
  'btn-preset-stalk-trip': {
    title: 'Cautious Stalk → Snag Trip → Dive',
    category: 'Scenario Preset',
    icon: '🕵️',
    desc: 'Low-CoM stealth crouched stalking tripped at the foot, executing an evasive forward dive roll.',
    effect: 'Showcases crouched bipedal kinematics transitioning into low-profile floor tumble dynamics.'
  },
  'btn-preset-ragdoll': {
    title: 'Pure Ragdoll Drop Preset',
    category: 'Scenario Preset',
    icon: '🍂',
    desc: 'Clears all timeline layers to observe natural unpowered articulated skeletal drop.',
    effect: 'Demonstrates unpowered multi-body articulated ragdoll physics, joint limits, and floor collision.'
  },
  'btn-clear-layers': {
    title: 'Clear All Timeline Layers',
    category: 'Sequencer Reset',
    icon: '🗑️',
    desc: 'Removes all timeline tracks, returning the timeline to blank authoring state.',
    effect: 'Clears simulation cache and resets character to initial T-pose.'
  },

  // --- Left Panel Category Headers ---
  'category-whole_body': {
    title: 'Whole Body Behaviours',
    category: 'Dynamic Motion Synthesis',
    icon: '🧍',
    desc: 'Full-body coordinated motor controllers including balance, staggering, jumping, and falling.',
    effect: 'Drives all 19 bones synergistically to manage center-of-mass and posture.'
  },
  'category-hand_and_arm': {
    title: 'Hand & Arm Behaviours',
    category: 'Dynamic Motion Synthesis',
    icon: '🖐️',
    desc: 'Upper-body autonomous reflexes including protective facial shielding, reaching, flailing, and rolling.',
    effect: 'Overrides or layers upon torso and arm joints without interrupting leg locomotion.'
  },
  'category-leg_behaviours': {
    title: 'Leg Behaviours',
    category: 'Dynamic Motion Synthesis',
    icon: '🦵',
    desc: 'Lower-body actions including landing anticipation, defensive kicking, and leg straightening.',
    effect: 'Controls hips, knees, and ankles for ground contact management.'
  },
  'category-physical_effects': {
    title: 'Physical Effect Behaviours',
    category: 'Dynamic Motion Synthesis',
    icon: '💨',
    desc: 'Global physical modulation including aerodynamic drag and surface foot stickiness.',
    effect: 'Modifies physical environment interactions across all character contact points.'
  },
  'category-ground_states': {
    title: 'Ground & Ragdoll States',
    category: 'Dynamic Motion Synthesis',
    icon: '🐛',
    desc: 'Post-fall ground reactions including writhing, push-up recovery, and passive limp rest.',
    effect: 'Governs autonomous behavior once the character has fallen to the floor.'
  },

  // --- DCC Header Tools ---
  'btn-transform-move': {
    title: 'Translate / Move Mode (W)',
    category: '3D Transform Gizmo',
    icon: '✥',
    desc: 'Enables linear translation handles along X, Y, and Z axes.',
    effect: 'Click and drag arrow axes in viewport to reposition character or selected prop.'
  },
  'btn-transform-rotate': {
    title: 'Rotate Mode (E)',
    category: '3D Transform Gizmo',
    icon: '↻',
    desc: 'Enables rotational rings around Pitch (X), Yaw (Y), and Roll (Z).',
    effect: 'Click and drag gizmo rings in viewport to orient character or selected prop.'
  },
  'btn-transform-scale': {
    title: 'Scale Mode (R)',
    category: '3D Transform Gizmo',
    icon: '⤢',
    desc: 'Enables geometric scaling handles along axes or uniformly.',
    effect: 'Click and drag cube handles in viewport to resize selected prop.'
  },
  'btn-toggle-gizmos': {
    title: 'Biomechanical Gizmos (G)',
    category: 'Viewport HUD',
    icon: '👁️',
    desc: 'Toggles Center of Mass (CoM) yellow sphere, plumb line, and Base of Support polygon.',
    effect: 'Provides real-time visual feedback on whether the character is statically balanced.'
  },
  'btn-resim': {
    title: 'Re-Simulate (Ctrl+Space)',
    category: 'Simulation Engine',
    icon: '🔄',
    desc: 'Bakes physics simulation at 60fps from Frame 0 through total scene duration.',
    effect: 'Evaluates all active behaviors, motor torques, collisions, and contacts into keyframes.'
  },
  'char-pos-x': {
    title: 'Character X Offset (Left/Right)',
    category: 'Character Spawn Origin',
    icon: '↔️',
    desc: 'Shifts character starting position along the lateral X axis.',
    effect: 'Repurposes spawn location for interacting with props or offset starting points.'
  },
  'char-pos-y': {
    title: 'Character Y Elevation (Drop Height)',
    category: 'Character Spawn Origin',
    icon: '↕️',
    desc: 'Elevates character above the floor at frame 0.',
    effect: 'Enables testing drop landings, free-falls, and compliant leg bracing from height.'
  },
  'char-pos-z': {
    title: 'Character Z Offset (Forward/Back)',
    category: 'Character Spawn Origin',
    icon: '🔃',
    desc: 'Shifts character starting position forward or backward along depth.',
    effect: 'Adjusts approach run-up distance to props or obstacles.'
  },
  'btn-center-char': {
    title: 'Reset Character Position',
    category: 'Character Setup',
    icon: '🎯',
    desc: 'Centers character root back to origin (0, 0, 0).',
    effect: 'Aligns character pelvis directly above world coordinate center.'
  },
  'btn-toggle-move-gizmo': {
    title: '3D Move Axis Gizmo',
    category: 'Viewport Transform',
    icon: '✥',
    desc: 'Toggles the 3D translation handles attached to the character root anchor.',
    effect: 'Allows dragging the character directly in 3D viewport space.'
  }
};

// Populate behavior explanations dynamically from catalog
const BEHAVIOR_EFFECTS = {
  balance: 'Continuous inverted-pendulum center-of-mass stabilization via ankle, hip, and counter-arm torques.',
  balanceWithProps: 'Adapts posture and equilibrium against asymmetrical prop loads and external mass offsets.',
  stagger: 'Automatically executes protective stepping reflexes when pushed outside the biomechanical support polygon.',
  crouchPose: 'Compliantly flexes knees and hips to absorb vertical impact momentum upon landing.',
  catchFall: 'Directionally extends arms toward oncoming floor impact to cushion cranial and spinal collision.',
  fallBackTwistCatch: 'Mid-fall 180° axial torso twist to turn face-down and absorb impact with outstretched arms.',
  fallBackTwistCover: 'Twists body mid-air while pulling arms tight to shield the face and chest from strike forces.',
  fallBackPassive: 'Twists torso mid-air with unpowered compliant arms yielding to gravity and momentum.',
  jump: 'Deep counter-movement crouch followed by explosive knee/ankle joint torque launch into the air.',
  jumpAndDive: 'Explosive forward vertical launch transitioning into horizontal aerodynamic torso extension.',
  tackle: 'Horizontal forward dive with driving shoulders and wrapping arms to collide and grapple target.',
  bodyFoetal: 'Curls knees to chest and tucks chin tightly to shield vital organs in a protective spherical ball.',
  armsCrossed: 'Upper-body folded arms guard posture over the thoracic ribcage.',
  armsRaised: 'Elevates arms overhead into surrender or high-reach posture.',
  armsWide: 'Extends arms horizontally into airplane wings to maximize rotational inertia and balance.',
  armsWindmill: 'Cyclic asynchronous shoulder flailing to simulate mid-air panic and generate corrective angular momentum.',
  armsZombie: 'Rigid forward horizontal arm extension towards frontal space.',
  headProtect: 'Brings hands and forearms tightly over facial visor and skull dome to deflect head impacts.',
  reachHold: '3D inverse-kinematic arm reach aiming directly at target prop with dynamic head gaze tracking.',
  lookAt: 'Continuous cervical and head joint motors aligning face toward moving 3D target coordinates.',
  tuckAndRoll: 'Gymnastic knee and spinal tuck rolling smoothly across the floor to dissipate fall energy.',
  legsKick: 'Cyclic defensive bicycle kicking motion to repel ground threats or regain aerial orientation.',
  legsReach: 'Proactively extends legs and points feet downward in anticipation of impending floor contact.',
  legsStraighten: 'Rigidly extends knees and hips to brace stance against compressive loads.',
  damping: 'Applies aerodynamic linear and angular drag forces to damp high-velocity aerial spins.',
  stickiness: 'Modulates ground contact friction and foot adhesion to prevent slippage on slick surfaces.',
  writhing: 'Active rolling, leg kicking, and spinal curling simulating struggle or post-impact agony.',
  writheMidAir: 'Airborne leg pedaling, torso twisting, and flailing to depict falling panic.',
  pushUpRecovery: 'Prone ground arm extension and upper-torso lift to prepare character for standing up.',
  ragdoll: 'Zero muscle torque; skeletal bodies and joints become pure unpowered physical pendulums.'
};

if (typeof ENDORPHIN_BEHAVIOR_CATEGORIES !== 'undefined' && Array.isArray(ENDORPHIN_BEHAVIOR_CATEGORIES)) {
  ENDORPHIN_BEHAVIOR_CATEGORIES.forEach(cat => {
    if (Array.isArray(cat.items)) {
      cat.items.forEach(b => {
        SETTING_EXPLANATIONS[`behavior-${b.key}`] = {
          title: b.name,
          category: `${cat.label} (DMS)`,
          icon: b.icon || '⚡',
          desc: b.shortDesc,
          effect: BEHAVIOR_EFFECTS[b.key] || 'Autonomous biological motor control coordinated by the DMS solver.'
        };
      });
    }
  });
}

function getExplanationForElement(el) {
  if (!el || !(el instanceof Element)) return null;

  // 1. Direct match on element ID
  if (el.id && SETTING_EXPLANATIONS[el.id]) {
    return SETTING_EXPLANATIONS[el.id];
  }

  // 2. Element with data-setting-key
  const withSettingKey = el.closest('[data-setting-key]');
  if (withSettingKey && SETTING_EXPLANATIONS[withSettingKey.dataset.settingKey]) {
    return SETTING_EXPLANATIONS[withSettingKey.dataset.settingKey];
  }

  // 3. Flyout behavior button or topbar behavior option
  const behaviorEl = el.closest('[data-behavior-key]');
  if (behaviorEl && behaviorEl.dataset.behaviorKey) {
    const key = `behavior-${behaviorEl.dataset.behaviorKey}`;
    if (SETTING_EXPLANATIONS[key]) {
      return SETTING_EXPLANATIONS[key];
    }
  }

  // 4. Cascade category row or submenu row
  const catEl = el.closest('[data-cat-id]');
  if (catEl && catEl.dataset.catId) {
    const key = `category-${catEl.dataset.catId}`;
    if (SETTING_EXPLANATIONS[key]) {
      return SETTING_EXPLANATIONS[key];
    }
  }

  // 5. If element is or is inside an inspector-row, check inputs/selects inside the row
  const row = el.closest('.inspector-row');
  if (row) {
    const targetInput = row.querySelector('input[id], select[id], button[id]');
    if (targetInput && SETTING_EXPLANATIONS[targetInput.id]) {
      return SETTING_EXPLANATIONS[targetInput.id];
    }
  }

  // 6. Check closest parent with an ID
  const withId = el.closest('[id]');
  if (withId && SETTING_EXPLANATIONS[withId.id]) {
    return SETTING_EXPLANATIONS[withId.id];
  }

  return null;
}

function updateInspectorGuideCard(info) {
  // Update layer inspector guide card if present
  const catEl = document.getElementById('guide-card-category');
  const titleEl = document.getElementById('guide-card-title');
  const descEl = document.getElementById('guide-card-desc');
  const effectEl = document.getElementById('guide-card-effect');

  if (catEl && titleEl && descEl) {
    catEl.textContent = (info.category || 'SETTING GUIDE').toUpperCase();
    titleEl.innerHTML = `<span>${info.icon || '⚡'}</span> <span>${info.title}</span>`;
    descEl.textContent = info.desc;
    if (effectEl) {
      if (info.effect) {
        effectEl.innerHTML = `<strong style="color: #6ee7b7;">Simulation Effect:</strong> ${info.effect}`;
        effectEl.style.display = 'block';
      } else {
        effectEl.style.display = 'none';
      }
    }
  }

  // Also update prop inspector guide card if present
  const pCatEl = document.getElementById('prop-guide-category');
  const pTitleEl = document.getElementById('prop-guide-title');
  const pDescEl = document.getElementById('prop-guide-desc');
  const pEffectEl = document.getElementById('prop-guide-effect');

  if (pCatEl && pTitleEl && pDescEl) {
    pCatEl.textContent = (info.category || 'PROP PHYSICS GUIDE').toUpperCase();
    pTitleEl.innerHTML = `<span>${info.icon || '📦'}</span> <span>${info.title}</span>`;
    pDescEl.textContent = info.desc;
    if (pEffectEl) {
      if (info.effect) {
        pEffectEl.innerHTML = `<strong style="color: #6ee7b7;">Simulation Effect:</strong> ${info.effect}`;
        pEffectEl.style.display = 'block';
      } else {
        pEffectEl.style.display = 'none';
      }
    }
  }
}

function resetInspectorGuideCard() {
  const catEl = document.getElementById('guide-card-category');
  const titleEl = document.getElementById('guide-card-title');
  const descEl = document.getElementById('guide-card-desc');
  const effectEl = document.getElementById('guide-card-effect');

  if (catEl && titleEl && descEl) {
    const selLayer = timeline ? timeline.getSelectedLayer() : null;
    catEl.textContent = selLayer ? '⚡ TRACK INSPECTOR GUIDE' : '⚡ PARAMETER GUIDE';
    titleEl.innerHTML = `<span>💡</span> <span>${selLayer ? selLayer.name : 'Hover or Focus Setting'}</span>`;
    descEl.textContent = selLayer
      ? `Hover over any parameter above to inspect its exact biomechanical function and effect on the simulation.`
      : `Select a timeline track or hover any setting above for real-time explanations.`;
    if (effectEl) effectEl.style.display = 'none';
  }

  const pCatEl = document.getElementById('prop-guide-category');
  const pTitleEl = document.getElementById('prop-guide-title');
  const pDescEl = document.getElementById('prop-guide-desc');
  const pEffectEl = document.getElementById('prop-guide-effect');

  if (pCatEl && pTitleEl && pDescEl) {
    pCatEl.textContent = '📦 PROP PHYSICS GUIDE';
    pTitleEl.innerHTML = `<span>💡</span> <span>Hover Setting</span>`;
    pDescEl.textContent = `Hover over any prop transform, mass, or simulation property for an explanation of its physical behavior.`;
    if (pEffectEl) pEffectEl.style.display = 'none';
  }
}

function showFloatingTooltip(info, clientX, clientY) {
  const tooltip = document.getElementById('opendms-floating-tooltip');
  if (!tooltip || !info) return;

  tooltip.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(56, 189, 248, 0.2); padding-bottom: 4px;">
      <span style="font-size: 11px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 5px;">
        <span>${info.icon || '⚡'}</span>
        <span>${info.title}</span>
      </span>
      <span style="font-size: 8.5px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.16); padding: 1px 5px; border-radius: 3px; letter-spacing: 0.3px;">
        ${info.category || 'OPENDMS DMS'}
      </span>
    </div>
    <div style="font-size: 10.5px; color: #cbd5e1; line-height: 1.4;">
      ${info.desc}
    </div>
    ${info.effect ? `
      <div style="font-size: 10px; color: #34d399; line-height: 1.35; background: rgba(16, 185, 129, 0.1); border-left: 2px solid #10b981; padding: 4px 6px; border-radius: 0 4px 4px 0; margin-top: 2px;">
        <strong style="color: #6ee7b7;">Simulation Effect:</strong> ${info.effect}
      </div>
    ` : ''}
  `;

  tooltip.classList.add('visible');

  // Viewport-aware clamped positioning
  const padding = 14;
  const width = tooltip.offsetWidth || 280;
  const height = tooltip.offsetHeight || 110;
  let posX = clientX + 16;
  let posY = clientY + 14;

  if (posX + width > window.innerWidth - padding) {
    posX = clientX - width - 12;
  }
  if (posY + height > window.innerHeight - padding) {
    posY = window.innerHeight - height - padding;
  }
  if (posX < padding) posX = padding;
  if (posY < padding) posY = padding;

  tooltip.style.left = `${posX}px`;
  tooltip.style.top = `${posY}px`;
}

function hideFloatingTooltip() {
  const tooltip = document.getElementById('opendms-floating-tooltip');
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

function setupSettingExplanationTooltips() {
  let currentHoveredKey = null;

  document.addEventListener('mousemove', (e) => {
    const target = e.target;
    if (!target) return;

    const info = getExplanationForElement(target);
    if (info) {
      if (currentHoveredKey !== info.title) {
        currentHoveredKey = info.title;
        updateInspectorGuideCard(info);
      }
      showFloatingTooltip(info, e.clientX, e.clientY);
    } else {
      if (currentHoveredKey !== null) {
        currentHoveredKey = null;
        hideFloatingTooltip();
        resetInspectorGuideCard();
      }
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    currentHoveredKey = null;
    hideFloatingTooltip();
    resetInspectorGuideCard();
  });

  document.addEventListener('mousedown', () => {
    hideFloatingTooltip();
  });
}

// --- RIGHT-SIDE DYNAMIC LAYER & FORCE EVENT PROPERTY INSPECTOR ---
function renderLayerInspector() {
  const groupEl = document.getElementById('layer-inspector-group');
  const contentEl = document.getElementById('layer-inspector-content');
  if (!groupEl || !contentEl) return;

  const layer = timeline.getSelectedLayer();
  if (!layer) {
    groupEl.style.display = 'none';
    contentEl.innerHTML = '';
    if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
    return;
  }

  if (typeof switchRightPanelContext === 'function') switchRightPanelContext('track');
  groupEl.style.display = 'flex';
  if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
  const duration = layer.endFrame - layer.startFrame;
  const intensityPct = Math.round((layer.intensity ?? 1.0) * 100);
  const speedVal = (layer.speed ?? 1.0).toFixed(2);

  let specificControlsHTML = '';

  if (layer.type === 'PERTURBATION') {
    const bodyOptions = BODY_PART_NAMES.map(name =>
      `<option value="${name}" ${layer.targetBody === name ? 'selected' : ''}>${name}</option>`
    ).join('');

    specificControlsHTML = `
      <div class="inspector-row">
        <label><span>Target Body Part / Bone</span><span style="color: #fda4af;">Click in 3D</span></label>
        <select class="inspector-select" id="insp-target-body">${bodyOptions}</select>
      </div>
      <div class="inspector-row">
        <label><span>Force Application Mode</span></label>
        <select class="inspector-select" id="insp-force-mode">
          <option value="impulse" ${layer.forceMode !== 'continuous' ? 'selected' : ''}>Instant Impact Impulse</option>
          <option value="continuous" ${layer.forceMode === 'continuous' ? 'selected' : ''}>Continuous Push Over Duration</option>
        </select>
      </div>
      <div class="inspector-row">
        <label><span>Force Magnitude</span><span id="insp-mag-val" style="color: #f43f5e;">${(layer.magnitude ?? 65).toFixed(0)} N&middot;s</span></label>
        <input type="range" id="insp-magnitude" min="5" max="300" step="1" value="${layer.magnitude ?? 65}" style="width: 100%; accent-color: #f43f5e;">
      </div>
      <div class="inspector-row">
        <label><span>Horizontal Direction (Yaw)</span><span id="insp-yaw-val" style="color: #38bdf8;">${Math.round(layer.yawDeg ?? 180)}&deg;</span></label>
        <input type="range" id="insp-yaw" min="-180" max="180" step="5" value="${layer.yawDeg ?? 180}" style="width: 100%; accent-color: #38bdf8;">
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: #64748b;">
          <span>0&deg; Front (+Z)</span><span>&pm;90&deg; Side</span><span>180&deg; Back (-Z)</span>
        </div>
      </div>
      <div class="inspector-row">
        <label><span>Vertical Angle (Pitch)</span><span id="insp-pitch-val" style="color: #fbbf24;">${Math.round(layer.pitchDeg ?? 8)}&deg;</span></label>
        <input type="range" id="insp-pitch" min="-75" max="75" step="5" value="${layer.pitchDeg ?? 8}" style="width: 100%; accent-color: #fbbf24;">
      </div>
    `;
  } else if (layer.type === 'ANIMATION' && layer.animType === 'pose') {
    const kfCount = layer.keyframes?.length || 0;
    const isMotor = layer.isMotorized !== false;
    const stiffVal = Math.round((layer.muscleStiffness ?? 1.0) * 100);

    let kfBadgesHtml = '';
    if (layer.keyframes && layer.keyframes.length > 25) {
      kfBadgesHtml = `
        <div class="inspector-row" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 10px; margin-top: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #6ee7b7; font-size: 11px;">🏃 Continuous Mocap Stream</strong>
            <span style="font-size: 10px; color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.2); padding: 2px 6px; border-radius: 4px;">${kfCount} Frames</span>
          </div>
          <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
            Sampled at 60 FPS across all 15 anatomical body bones.<br>
            Scrub the timeline ruler to inspect poses, or click <strong>"▶ Simulate &amp; Play"</strong> for active motorized physics.
          </div>
        </div>
      `;
    } else if (layer.keyframes && layer.keyframes.length > 0) {
      kfBadgesHtml = `
        <div class="inspector-row">
          <label><span>Recorded Pose Keyframes (${kfCount})</span><span style="color: #fbbf24;">Click to Seek</span></label>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-height: 140px; overflow-y: auto;">
            ${layer.keyframes.map(k => `
              <span class="ai-chip" style="font-size: 10px; border-color: #f59e0b; color: #fde68a; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;" onclick="window.seekToKeyframe(${k.frame})">
                <span>◆ F${k.frame}</span>
                <span style="color:#ef4444; font-weight:700; cursor:pointer;" onclick="event.stopPropagation(); window.deleteKeyframe('${layer.id}', ${k.frame});">&times;</span>
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }

    specificControlsHTML = `
      <div class="inspector-row">
        <label><span>Physical Execution Mode</span><span style="color: #a855f7;">DMS Engine</span></label>
        <select class="inspector-select" id="insp-pose-motorized">
          <option value="motorized" ${isMotor ? 'selected' : ''}>Active Motorized Pose (Joint Torques + Muscles)</option>
          <option value="kinematic" ${!isMotor ? 'selected' : ''}>Hard Kinematic Lock (Authoritative Keyframes)</option>
        </select>
      </div>
      <div class="inspector-row">
        <label><span>Muscle Stance Stiffness</span><span id="insp-pose-stiff-val" style="color: #34d399;">${stiffVal}%</span></label>
        <input type="range" id="insp-pose-stiffness" min="10" max="250" step="5" value="${stiffVal}" style="width: 100%; accent-color: #34d399;">
      </div>
      <button class="btn btn-simulate" id="btn-insp-enter-pose" style="width: 100%; margin-top: 6px; justify-content: center; font-size: 11.5px;">
        🦴 Enter Active Pose Mode
      </button>
      ${kfBadgesHtml}
    `;
  } else if (layer.type === 'ANIMATION') {
    const curGait = layer.gaitStyle || 'walk';
    const curClipId = layer.clipId || '';
    const customClips = timeline.getAllCustomAnimations ? timeline.getAllCustomAnimations() : [];
    const customClipOptionsHTML = customClips.map(c =>
      `<option value="clip:${c.id}" ${curClipId === c.id ? 'selected' : ''}>🎬 [Retargeted] ${c.name} (${c.totalFrames}f &bull; ${c.mappedSegmentsCount}/15 bones)</option>`
    ).join('');

    const activeClipObj = curClipId ? timeline.getCustomAnimation(curClipId) : null;
    const clipInfoBanner = activeClipObj ? `
      <div style="font-size: 9.5px; color: #7dd3fc; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; padding: 5px 7px; line-height: 1.35;">
        🎬 <strong>${activeClipObj.name}</strong> &bull; ${activeClipObj.duration.toFixed(2)}s (${activeClipObj.totalFrames}f @ 60fps)<br>
        Mapped: <strong>${activeClipObj.mappedSegmentsCount}/15 segments</strong> &bull; Root Vel: <strong>${(activeClipObj.avgRootSpeed || 0).toFixed(2)} m/s</strong>
      </div>
    ` : '';

    specificControlsHTML = `
      <div class="inspector-row">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label><span>Animation Clip / Gait Source</span></label>
          <span style="font-size: 9px; color: #38bdf8;">${activeClipObj ? 'Custom Retargeted' : 'Procedural Gait'}</span>
        </div>
        <select class="inspector-select" id="insp-gait-style">
          <optgroup label="Procedural Biomechanical Gaits">
            <option value="walk" ${!curClipId && curGait === 'walk' ? 'selected' : ''}>🚶 Natural Humanoid Walk (1.35 m/s)</option>
            <option value="jog" ${!curClipId && curGait === 'jog' ? 'selected' : ''}>🏃 Athletic Jog / Run (2.85 m/s)</option>
            <option value="stalk" ${!curClipId && curGait === 'stalk' ? 'selected' : ''}>🕵️ Cautious / Sneaking Stalk (0.68 m/s)</option>
            <option value="limp" ${!curClipId && curGait === 'limp' ? 'selected' : ''}>🩹 Injured / Asymmetric Limp (0.95 m/s)</option>
          </optgroup>
          ${customClips.length > 0 ? `<optgroup label="Retargeted Custom Animations (.fbx / .glb / .bvh)">${customClipOptionsHTML}</optgroup>` : ''}
        </select>
      </div>
      ${clipInfoBanner}
      <button class="btn" id="btn-insp-import-anim" style="width: 100%; justify-content: center; border-color: rgba(56, 189, 248, 0.45); color: #7dd3fc; background: rgba(56, 189, 248, 0.1); font-size: 10.5px; padding: 5px 8px;">
        <span>📂</span>
        <span>Import &amp; Retarget Animation (.fbx / .glb / .bvh)...</span>
      </button>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <div class="inspector-row" style="padding: 3px 5px;">
          <label style="font-size: 10px; color: #cbd5e1; display: flex; align-items: center; gap: 5px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="insp-anim-inplace" ${layer.inPlace ? 'checked' : ''}>
            <span>In-Place (Lock X/Z)</span>
          </label>
        </div>
        <div class="inspector-row" style="padding: 3px 5px;">
          <label style="font-size: 10px; color: #cbd5e1; display: flex; align-items: center; gap: 5px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="insp-anim-loop" ${layer.loop !== false ? 'checked' : ''}>
            <span>Loop Clip</span>
          </label>
        </div>
      </div>
      <div class="inspector-row">
        <label><span>Stride / Motion Intensity</span><span id="insp-int-val" style="color: #38bdf8;">${intensityPct}%</span></label>
        <input type="range" id="insp-intensity" min="10" max="200" step="5" value="${intensityPct}" style="width: 100%; accent-color: #38bdf8;">
      </div>
      <div class="inspector-row">
        <label><span>Cadence / Playback Speed</span><span id="insp-spd-val" style="color: #34d399;">${speedVal}x</span></label>
        <input type="range" id="insp-speed" min="0.2" max="2.5" step="0.05" value="${layer.speed ?? 1.0}" style="width: 100%; accent-color: #34d399;">
      </div>
      <div class="inspector-row">
        <label><span>Facing Yaw Offset</span><span id="insp-anim-yaw-val" style="color: #c084fc;">${Math.round(layer.yawOffsetDeg ?? 0)}&deg;</span></label>
        <input type="range" id="insp-anim-yaw" min="-180" max="180" step="5" value="${layer.yawOffsetDeg ?? 0}" style="width: 100%; accent-color: #c084fc;">
      </div>
      <div class="inspector-row">
        <label><span>Arm Spread Offset</span><span id="insp-anim-spread-val" style="color: #fbbf24;">${Math.round(layer.armSpreadDeg ?? 0)}&deg;</span></label>
        <input type="range" id="insp-anim-arm-spread" min="-45" max="45" step="1" value="${layer.armSpreadDeg ?? 0}" style="width: 100%; accent-color: #fbbf24;">
      </div>
    `;
  } else if (layer.type === 'ACTIVE_POSE') {
    const poseOptions = Object.entries(ENDORPHIN_ACTIVE_POSES).map(([key, p]) =>
      `<option value="${key}" ${layer.poseKey === key ? 'selected' : ''}>${p.name}</option>`
    ).join('');
    specificControlsHTML = `
      <div class="inspector-row">
        <label><span>Target Pose Preset</span></label>
        <select class="inspector-select" id="insp-pose-key">${poseOptions}</select>
      </div>
      <div class="inspector-row">
        <label><span>Pose Match Strength</span><span id="insp-pose-str-val" style="color: #ec4899;">${Math.round(layer.strength ?? 50)}%</span></label>
        <input type="range" id="insp-pose-strength" min="1" max="100" step="1" value="${layer.strength ?? 50}" style="width: 100%; accent-color: #ec4899;">
      </div>
    `;
  } else if (layer.type === 'CONSTRAINT') {
    const bodyOptions = BODY_PART_NAMES.map(name =>
      `<option value="${name}" ${layer.targetBody === name ? 'selected' : ''}>${name}</option>`
    ).join('');

    const currentPin = layer.pinTarget || 'world';
    const propOptions = (propsManager?.props || []).map(p =>
      `<option value="${p.id}" ${currentPin === p.id ? 'selected' : ''}>📦 ${p.name || p.id} (${p.shapeType || 'Prop'})</option>`
    ).join('');

    const otherActorId = layer.actorId === 'actor-2' ? 'actor-1' : 'actor-2';
    const otherActorLabel = otherActorId === 'actor-2' ? '🥋 Enemy (Actor 2)' : '🧍 Hero (Actor 1)';
    const actorBoneTargets = ['Pelvis', 'LowerSpine', 'UpperSpine', 'Head', 'LeftHand', 'RightHand', 'LeftForearm', 'RightForearm', 'LeftFoot', 'RightFoot'];
    const actorBoneOptions = actorBoneTargets.map(bone => {
      const val = `actor:${otherActorId}:${bone}`;
      return `<option value="${val}" ${currentPin === val ? 'selected' : ''}>${otherActorLabel} → ${bone}</option>`;
    }).join('');

    specificControlsHTML = `
      <div class="inspector-row">
        <label><span>Constrained Body Part</span><span style="color: #6ee7b7;">Click in 3D</span></label>
        <select class="inspector-select" id="insp-constraint-body">${bodyOptions}</select>
      </div>
      <div class="inspector-row">
        <label><span>Pin Target</span><span style="color: #38bdf8;">Object / Actor Assignment</span></label>
        <select class="inspector-select" id="insp-constraint-pin-target">
          <option value="world" ${currentPin === 'world' ? 'selected' : ''}>🌍 World Space (Static World Pin)</option>
          ${propOptions ? `<optgroup label="Scene Props">${propOptions}</optgroup>` : ''}
          <optgroup label="Character Bone Targets (Actor-to-Actor)">
            ${actorBoneOptions}
          </optgroup>
        </select>
      </div>
      <div class="inspector-row">
        <label><span>Constraint Nature</span></label>
        <select class="inspector-select" id="insp-constraint-type">
          <option value="lock" ${layer.constraintType === 'lock' ? 'selected' : ''}>Lock All (Position &amp; Rotation)</option>
          <option value="lockPosition" ${layer.constraintType === 'lockPosition' ? 'selected' : ''}>Lock Position Only (Free Rotate)</option>
          <option value="lockOrientation" ${layer.constraintType === 'lockOrientation' ? 'selected' : ''}>Lock Orientation (Free Translate)</option>
          <option value="HOLD_PROXIMITY" ${(layer.constraintType === 'HOLD_PROXIMITY' || layer.constraintType === 'proximityHold') ? 'selected' : ''}>Hold Proximity (Auto-Latch on Contact)</option>
          <option value="PIN" ${layer.constraintType === 'PIN' ? 'selected' : ''}>Solid Pin Anchor</option>
          <option value="SPRING" ${layer.constraintType === 'SPRING' ? 'selected' : ''}>Compliant Spring Tether</option>
        </select>
      </div>
      <div class="inspector-row">
        <label><span>Constraint Strength</span><span id="insp-const-str-val" style="color: #10b981;">${(layer.strength ?? 1.0).toFixed(2)}x</span></label>
        <input type="range" id="insp-constraint-strength" min="0.1" max="2.0" step="0.05" value="${layer.strength ?? 1.0}" style="width: 100%; accent-color: #10b981;">
      </div>
      <div class="inspector-row">
        <label><span>Break Force Threshold</span><span id="insp-const-break-val" style="color: #f43f5e;">${layer.breakForce ? layer.breakForce + ' N' : '550 N'}</span></label>
        <input type="range" id="insp-constraint-break-force" min="100" max="2500" step="50" value="${layer.breakForce ?? 550}" style="width: 100%; accent-color: #f43f5e;">
      </div>
      <div class="inspector-row" id="insp-row-trigger-dist" style="${(layer.constraintType === 'HOLD_PROXIMITY' || layer.constraintType === 'proximityHold') ? '' : 'display: none;'}">
        <label><span>Trigger Contact Distance</span><span id="insp-const-trig-val" style="color: #38bdf8;">${(layer.triggerDistance ?? 0.25).toFixed(2)} m</span></label>
        <input type="range" id="insp-constraint-trigger-dist" min="0.05" max="1.0" step="0.05" value="${layer.triggerDistance ?? 0.25}" style="width: 100%; accent-color: #38bdf8;">
      </div>
    `;
  } else {
    // BEHAVIOR LAYER
    const defaultLabel = typeof getBehaviorDefaultMaskLabel === 'function'
      ? getBehaviorDefaultMaskLabel(layer.behavior)
      : 'Auto';

    const currentTarget = layer.targetObject || 'none';
    const behaviorPropOptions = (propsManager?.props || []).map(p =>
      `<option value="${p.id}" ${currentTarget === p.id ? 'selected' : ''}>📦 ${p.name || p.id} (${p.shapeType || 'Prop'})</option>`
    ).join('');

    const reachHandHTML = (layer.behavior === 'reachHold') ? `
      <div class="inspector-row">
        <label><span>Reaching Arm</span><span style="color: #38bdf8;">Limb Selector</span></label>
        <select class="inspector-select" id="insp-behavior-reach-hand">
          <option value="both" ${(!layer.reachHand || layer.reachHand === 'both') ? 'selected' : ''}>Both Arms</option>
          <option value="left" ${layer.reachHand === 'left' ? 'selected' : ''}>Left Arm Only</option>
          <option value="right" ${layer.reachHand === 'right' ? 'selected' : ''}>Right Arm Only</option>
        </select>
      </div>
    ` : '';

    const lookAtToggleHTML = `
      <div class="inspector-row" style="margin-top: 4px;">
        <label style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" id="insp-behavior-lookat" ${layer.lookAt !== false ? 'checked' : ''}>
          <span style="color: #38bdf8; font-weight: 600;">Look At Target</span> (Dynamic Head &amp; Gaze Tracking)
        </label>
      </div>
    `;

    const isTargetCapable = currentTarget !== 'none' || ['reachHold', 'lookAt', 'legsReach', 'tackle', 'balanceWithProps'].includes(layer.behavior);
    const trajectorySectionHTML = isTargetCapable ? `
      <div style="margin-top: 8px; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 8px; background: rgba(15, 23, 42, 0.45);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: #38bdf8;">🎯 Trajectory &amp; Prediction</span>
          <span style="font-size: 9px; color: #64748b; font-weight: 600;">DMS TRACKING</span>
        </div>

        <div class="inspector-row" style="margin-bottom: 4px;">
          <label style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="insp-use-prediction" ${layer.usePrediction !== false ? 'checked' : ''}>
            <span style="color: #f8fafc; font-weight: 600;">Use Prediction</span> (Target Interception)
          </label>
        </div>

        <div class="inspector-row">
          <label><span>Prediction Rate</span><span id="insp-predrate-val" style="color: #38bdf8;">${(layer.predictionRate ?? 0.2).toFixed(2)}s</span></label>
          <input type="range" id="insp-predrate" min="0.0" max="2.0" step="0.05" value="${layer.predictionRate ?? 0.2}" style="width: 100%; accent-color: #38bdf8;">
        </div>

        <div class="inspector-row">
          <label><span>Trajectory Offset</span><span id="insp-trajoff-val" style="color: #fbbf24;">${(layer.trajectoryOffset ?? 0.0).toFixed(2)}</span></label>
          <input type="range" id="insp-trajoff" min="-1.0" max="1.0" step="0.05" value="${layer.trajectoryOffset ?? 0.0}" style="width: 100%; accent-color: #fbbf24;">
        </div>

        <div class="inspector-row">
          <label><span>Interception Offset (m)</span><span style="color: #a78bfa;">[X, Y, Z]</span></label>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-top: 2px;">
            <input type="number" class="inspector-input" id="insp-intercept-x" step="0.05" min="-5" max="5" value="${layer.interceptionOffsetX ?? 0.0}" placeholder="X" title="Interception Offset X">
            <input type="number" class="inspector-input" id="insp-intercept-y" step="0.05" min="-5" max="5" value="${layer.interceptionOffsetY ?? 0.0}" placeholder="Y" title="Interception Offset Y">
            <input type="number" class="inspector-input" id="insp-intercept-z" step="0.05" min="-5" max="5" value="${layer.interceptionOffsetZ ?? 0.0}" placeholder="Z" title="Interception Offset Z">
          </div>
        </div>

        <div class="inspector-row">
          <label><span>Exaggeration (Arc)</span><span id="insp-exagg-val" style="color: #f43f5e;">${Math.round((layer.exaggeration ?? 0.0) * 100)}%</span></label>
          <input type="range" id="insp-exaggeration" min="0.0" max="1.0" step="0.05" value="${layer.exaggeration ?? 0.0}" style="width: 100%; accent-color: #f43f5e;">
        </div>

        <div class="inspector-row">
          <label><span>Delay</span><span id="insp-delay-val" style="color: #10b981;">${(layer.delay ?? 0.0).toFixed(2)}s</span></label>
          <input type="range" id="insp-delay" min="0.0" max="5.0" step="0.05" value="${layer.delay ?? 0.0}" style="width: 100%; accent-color: #10b981;">
        </div>

        <div class="inspector-row">
          <label><span>Char Accel Thresh</span><span id="insp-characcel-val" style="color: #94a3b8;">${(layer.characterAccelThreshold ?? 20.0).toFixed(1)} m/s²</span></label>
          <input type="range" id="insp-characcel" min="0.0" max="50.0" step="1.0" value="${layer.characterAccelThreshold ?? 20.0}" style="width: 100%; accent-color: #94a3b8;">
        </div>

        <div class="inspector-row">
          <label><span>Target Accel Thresh</span><span id="insp-targetaccel-val" style="color: #94a3b8;">${(layer.targetAccelThreshold ?? 0.05).toFixed(2)} m/s²</span></label>
          <input type="range" id="insp-targetaccel" min="0.0" max="5.0" step="0.05" value="${layer.targetAccelThreshold ?? 0.05}" style="width: 100%; accent-color: #94a3b8;">
        </div>
      </div>
    ` : '';

    specificControlsHTML = `
      <div class="inspector-row">
        <label><span>Behavior Strength / Intensity</span><span id="insp-int-val" style="color: #38bdf8;">${intensityPct}%</span></label>
        <input type="range" id="insp-intensity" min="10" max="200" step="5" value="${intensityPct}" style="width: 100%; accent-color: #38bdf8;">
      </div>
      <div class="inspector-row">
        <label><span>Reflex / Cycle Speed</span><span id="insp-spd-val" style="color: #34d399;">${speedVal}x</span></label>
        <input type="range" id="insp-speed" min="0.25" max="2.5" step="0.05" value="${layer.speed ?? 1.0}" style="width: 100%; accent-color: #34d399;">
      </div>
      <div class="inspector-row">
        <label><span>Target Object</span><span style="color: #f59e0b;">Scene Target / Aim</span></label>
        <select class="inspector-select" id="insp-behavior-target">
          <option value="none" ${currentTarget === 'none' ? 'selected' : ''}>None (Forward Space Aim)</option>
          ${behaviorPropOptions}
        </select>
      </div>
      ${reachHandHTML}
      ${lookAtToggleHTML}
      ${trajectorySectionHTML}
      <div class="inspector-row">
        <label><span>Body Part Mask</span><span style="color: #38bdf8;">Layering Filter</span></label>
        <select class="inspector-select" id="insp-body-mask">
          <option value="auto" ${(!layer.bodyPartMask || layer.bodyPartMask === 'auto') ? 'selected' : ''}>Auto (Limb Default: ${defaultLabel})</option>
          <option value="whole_body" ${layer.bodyPartMask === 'whole_body' ? 'selected' : ''}>Whole Body (Full Skeleton)</option>
          <option value="arms" ${layer.bodyPartMask === 'arms' ? 'selected' : ''}>Arms Only (Shoulders, Arms, Hands)</option>
          <option value="legs" ${layer.bodyPartMask === 'legs' ? 'selected' : ''}>Legs Only (Hips, Knees, Feet)</option>
          <option value="torso" ${layer.bodyPartMask === 'torso' ? 'selected' : ''}>Torso &amp; Head Only (Spine, Neck, Head)</option>
        </select>
      </div>
      <div class="inspector-row">
        <label><span>Selection Set</span><span style="color: #a78bfa;">Joint Masking</span></label>
        <select class="inspector-select" id="insp-selection-set">
          <option value="all" ${(!layer.selectionSet || layer.selectionSet === 'all') ? 'selected' : ''}>Whole Body (All Joints)</option>
          <option value="upper" ${layer.selectionSet === 'upper' ? 'selected' : ''}>Upper Body Only</option>
          <option value="lower" ${layer.selectionSet === 'lower' ? 'selected' : ''}>Lower Body Only</option>
          <option value="arms" ${layer.selectionSet === 'arms' ? 'selected' : ''}>Both Arms Only</option>
          <option value="left_arm" ${layer.selectionSet === 'left_arm' ? 'selected' : ''}>Left Arm &amp; Hand Only</option>
          <option value="right_arm" ${layer.selectionSet === 'right_arm' ? 'selected' : ''}>Right Arm &amp; Hand Only</option>
          <option value="legs" ${layer.selectionSet === 'legs' ? 'selected' : ''}>Legs Only</option>
          <option value="head_neck" ${layer.selectionSet === 'head_neck' ? 'selected' : ''}>Head &amp; Neck Gaze Only</option>
        </select>
      </div>
    `;
  }

  contentEl.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #f8fafc;">
        <span style="width: 9px; height: 9px; border-radius: 50%; background: ${layer.color}; display: inline-block;"></span>
        <span>${layer.name}</span>
      </div>
      <label style="font-size: 10px; color: #94a3b8; display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="checkbox" id="insp-enabled" ${layer.enabled ? 'checked' : ''}> Active
      </label>
    </div>

    <!-- TRACK NAME & TARGET ACTOR SELECTION -->
    <div class="inspector-row" style="margin-top: 6px;">
      <label><span>Track Name</span><span style="color: #64748b;">Rename</span></label>
      <input type="text" class="inspector-input" id="insp-track-name" value="${layer.name}" style="width: 100%; font-weight: 600; color: #f8fafc;">
    </div>
    <div class="inspector-row">
      <label><span>Target Character</span><span style="color: ${layer.actorId === 'actor-2' ? '#fb923c' : '#38bdf8'}; font-weight: 700;">${layer.actorId === 'actor-2' ? '🥋 Enemy (Actor 2)' : '🧍 Hero (Actor 1)'}</span></label>
      <select class="inspector-select" id="insp-target-actor">
        <option value="actor-1" ${(!layer.actorId || layer.actorId === 'actor-1') ? 'selected' : ''}>🧍 Hero (Actor 1)</option>
        <option value="actor-2" ${layer.actorId === 'actor-2' ? 'selected' : ''}>🥋 Enemy / Opponent (Actor 2)</option>
      </select>
    </div>

    ${specificControlsHTML}

    <!-- ENDORPHIN 2.7.1 EVENT-DRIVEN REACTIVE TRIGGER & MUTUAL COUPLING -->
    <div style="margin-top: 8px; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 8px; background: rgba(15, 23, 42, 0.45);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 11px; font-weight: 700; color: #fbbf24;">⚡ Reactive Event Trigger</span>
        <span style="font-size: 9px; color: ${layer.isTriggered ? '#34d399' : '#94a3b8'}; font-weight: 700;">
          ${layer.isTriggered ? `✓ Triggered @ F:${layer.triggeredAtFrame}` : (layer.triggerType === 'frame' ? 'Timeline Frame' : 'Waiting for Event')}
        </span>
      </div>

      <div class="inspector-row">
        <label><span>Activation Trigger Condition</span></label>
        <select class="inspector-select" id="insp-trigger-type">
          <option value="frame" ${(!layer.triggerType || layer.triggerType === 'frame') ? 'selected' : ''}>Fixed Frame Timeline</option>
          <option value="impact" ${layer.triggerType === 'impact' ? 'selected' : ''}>On Collision / Impact Shock (> N)</option>
          <option value="proximity" ${layer.triggerType === 'proximity' ? 'selected' : ''}>On Proximity to Target (< m)</option>
          <option value="loss_of_balance" ${layer.triggerType === 'loss_of_balance' ? 'selected' : ''}>On Loss of ZMP Balance / Tilt (> °)</option>
          <option value="ground_contact" ${layer.triggerType === 'ground_contact' ? 'selected' : ''}>On Body Ground Contact</option>
        </select>
      </div>

      <div class="inspector-row" id="insp-row-trigger-thresh" style="${(!layer.triggerType || layer.triggerType === 'frame' || layer.triggerType === 'ground_contact') ? 'display: none;' : ''}">
        <label><span>Trigger Threshold</span><span id="insp-trig-thresh-val" style="color: #fbbf24;">${layer.triggerThreshold ?? 35}</span></label>
        <input type="range" id="insp-trigger-threshold" min="5" max="150" step="1" value="${layer.triggerThreshold ?? 35}" style="width: 100%; accent-color: #fbbf24;">
      </div>

      ${layer.type === 'BEHAVIOR' ? `
        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.08);">
          <div class="inspector-row">
            <label style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="insp-enable-grab" ${layer.grabTarget && layer.grabTarget !== 'none' ? 'checked' : ''}>
              <span style="color: #f97316; font-weight: 700;">🤝 2-Way Contact Grab / Tackle</span>
            </label>
          </div>
          <div id="insp-grab-details" style="${layer.grabTarget && layer.grabTarget !== 'none' ? '' : 'display: none;'}">
            <div class="inspector-row">
              <label><span>Grab Target Body Part</span></label>
              <select class="inspector-select" id="insp-grab-body-part">
                <option value="Pelvis" ${layer.grabBodyPart === 'Pelvis' ? 'selected' : ''}>Pelvis (Hips / Center of Mass)</option>
                <option value="UpperSpine" ${layer.grabBodyPart === 'UpperSpine' ? 'selected' : ''}>UpperSpine (Chest Takedown)</option>
                <option value="LowerSpine" ${layer.grabBodyPart === 'LowerSpine' ? 'selected' : ''}>LowerSpine (Waist Wrap)</option>
              </select>
            </div>
            <div class="inspector-row">
              <label><span>Break Force Limit</span><span id="insp-grab-break-val" style="color: #f43f5e;">${layer.grabBreakForce ?? 450} N</span></label>
              <input type="range" id="insp-grab-break-force" min="100" max="1500" step="25" value="${layer.grabBreakForce ?? 450}" style="width: 100%; accent-color: #f43f5e;">
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding-top: 6px; border-top: 1px solid #1e293b;">
      <div class="inspector-row">
        <label><span>Blend In (F)</span><span id="insp-blendin-val" style="color: #38bdf8;">${layer.blendIn ?? 10} f</span></label>
        <input type="range" id="insp-blendin" min="0" max="45" step="1" value="${layer.blendIn ?? 10}" style="width: 100%; accent-color: #38bdf8;">
      </div>
      <div class="inspector-row">
        <label><span>Blend Out (F)</span><span id="insp-blendout-val" style="color: #a78bfa;">${layer.blendOut ?? 10} f</span></label>
        <input type="range" id="insp-blendout" min="0" max="45" step="1" value="${layer.blendOut ?? 10}" style="width: 100%; accent-color: #a78bfa;">
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding-top: 4px; border-top: 1px solid #1e293b;">
      <div class="inspector-row">
        <label>Start (F)</label>
        <input type="number" class="inspector-input" id="insp-start" min="0" max="${Math.max(1, timeline.totalFrames - 1)}" value="${layer.startFrame}">
      </div>
      <div class="inspector-row">
        <label>End (F)</label>
        <input type="number" class="inspector-input" id="insp-end" min="1" max="${timeline.totalFrames}" value="${layer.endFrame}">
      </div>
      <div class="inspector-row">
        <label>Duration</label>
        <input type="number" class="inspector-input" id="insp-duration" min="1" max="${timeline.totalFrames}" value="${duration}">
      </div>
    </div>

    <div style="display: flex; gap: 4px; padding-top: 6px;">
      <button class="nle-tool-btn nle-btn-split" id="btn-insp-split" style="flex: 1; justify-content: center;" title="Split this clip at the current playhead frame">✂️ Split</button>
      <button class="nle-tool-btn" id="btn-insp-trim-in" style="flex: 1; justify-content: center;" title="Trim clip start to current playhead">⇤ Trim In</button>
      <button class="nle-tool-btn" id="btn-insp-trim-out" style="flex: 1; justify-content: center;" title="Shorten clip end to current playhead">Trim Out ⇥</button>
    </div>

    <!-- DYNAMIC PARAMETER EXPLANATION GUIDE CARD -->
    <div class="inspector-guide-card" id="layer-inspector-guide-card">
      <div class="guide-card-header">
        <span class="guide-card-category" id="guide-card-category">⚡ PARAMETER GUIDE</span>
        <span class="guide-card-badge" id="guide-card-badge">DMS ENGINE</span>
      </div>
      <div class="guide-card-title" id="guide-card-title"><span>💡</span> <span>Hover or Focus Setting</span></div>
      <div class="guide-card-desc" id="guide-card-desc">Hover over any setting above to inspect its exact biomechanical function and physical effect on the simulation.</div>
      <div class="guide-card-effect" id="guide-card-effect" style="display: none;"></div>
    </div>
  `;

  // Bind Inspector Events
  // Reactive Trigger & Mutual Grab Bindings
  const selTriggerType = document.getElementById('insp-trigger-type');
  if (selTriggerType) {
    selTriggerType.addEventListener('change', (e) => {
      layer.triggerType = e.target.value;
      const rowThresh = document.getElementById('insp-row-trigger-thresh');
      if (rowThresh) {
        rowThresh.style.display = (layer.triggerType === 'frame' || layer.triggerType === 'ground_contact') ? 'none' : 'block';
      }
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpTriggerThresh = document.getElementById('insp-trigger-threshold');
  if (inpTriggerThresh) {
    inpTriggerThresh.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 35;
      layer.triggerThreshold = val;
      const valEl = document.getElementById('insp-trig-thresh-val');
      if (valEl) valEl.textContent = val;
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  const chkEnableGrab = document.getElementById('insp-enable-grab');
  if (chkEnableGrab) {
    chkEnableGrab.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      layer.grabTarget = isChecked ? (layer.actorId === 'actor-2' ? 'actor-1' : 'actor-2') : 'none';
      const detailsEl = document.getElementById('insp-grab-details');
      if (detailsEl) detailsEl.style.display = isChecked ? 'block' : 'none';
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const selGrabBodyPart = document.getElementById('insp-grab-body-part');
  if (selGrabBodyPart) {
    selGrabBodyPart.addEventListener('change', (e) => {
      layer.grabBodyPart = e.target.value;
      timeline.invalidateSimulation();
    });
  }

  const inpGrabBreakForce = document.getElementById('insp-grab-break-force');
  if (inpGrabBreakForce) {
    inpGrabBreakForce.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 450;
      layer.grabBreakForce = val;
      const valEl = document.getElementById('insp-grab-break-val');
      if (valEl) valEl.textContent = `${val} N`;
      timeline.invalidateSimulation();
    });
  }

  const inpBlendIn = document.getElementById('insp-blendin');
  if (inpBlendIn) {
    inpBlendIn.addEventListener('input', (e) => {
      const bIn = parseInt(e.target.value) || 0;
      layer.blendIn = bIn;
      document.getElementById('insp-blendin-val').textContent = `${bIn} f`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpBlendOut = document.getElementById('insp-blendout');
  if (inpBlendOut) {
    inpBlendOut.addEventListener('input', (e) => {
      const bOut = parseInt(e.target.value) || 0;
      layer.blendOut = bOut;
      document.getElementById('insp-blendout-val').textContent = `${bOut} f`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const chkEnabled = document.getElementById('insp-enabled');
  if (chkEnabled) {
    chkEnabled.addEventListener('change', (e) => {
      layer.enabled = e.target.checked;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpInt = document.getElementById('insp-intensity');
  if (inpInt) {
    inpInt.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100.0;
      layer.intensity = val;
      document.getElementById('insp-int-val').textContent = `${Math.round(val * 100)}%`;
      timeline.invalidateSimulation();
      if (layer.type === 'ANIMATION') {
        timeline.seek(timeline.currentFrame);
        if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      }
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpSpd = document.getElementById('insp-speed');
  if (inpSpd) {
    inpSpd.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.speed = val;
      document.getElementById('insp-spd-val').textContent = `${val.toFixed(2)}x`;
      timeline.invalidateSimulation();
      if (layer.type === 'ANIMATION') {
        timeline.seek(timeline.currentFrame);
        if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      }
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const selGait = document.getElementById('insp-gait-style');
  if (selGait) {
    selGait.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val.startsWith('clip:')) {
        const cId = val.slice(5);
        const clipObj = timeline.getCustomAnimation(cId);
        layer.clipId = cId;
        layer.animType = 'custom';
        if (clipObj) {
          layer.name = `🎬 ${clipObj.name}`;
        }
      } else {
        layer.clipId = null;
        layer.animType = 'walk';
        layer.gaitStyle = val;
        const gaitTitles = {
          walk: 'Walk Animation (Human Gait)',
          jog: 'Athletic Jog (Kinematic Sprint)',
          stalk: 'Cautious Stalk (Stealth Gait)',
          limp: 'Injured Limp (Asymmetric Gait)'
        };
        layer.name = gaitTitles[val] || 'Locomotion Animation';
      }
      timeline.invalidateSimulation();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
  }

  document.getElementById('btn-insp-import-anim')?.addEventListener('click', () => {
    document.getElementById('input-anim-file')?.click();
  });

  const chkAnimInPlace = document.getElementById('insp-anim-inplace');
  if (chkAnimInPlace) {
    chkAnimInPlace.addEventListener('change', (e) => {
      layer.inPlace = e.target.checked;
      timeline.invalidateSimulation();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const chkAnimLoop = document.getElementById('insp-anim-loop');
  if (chkAnimLoop) {
    chkAnimLoop.addEventListener('change', (e) => {
      layer.loop = e.target.checked;
      timeline.invalidateSimulation();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpAnimYaw = document.getElementById('insp-anim-yaw');
  if (inpAnimYaw) {
    inpAnimYaw.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      layer.yawOffsetDeg = val;
      const el = document.getElementById('insp-anim-yaw-val');
      if (el) el.textContent = `${Math.round(val)}°`;
      timeline.invalidateSimulation();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      updateSimulationStatusUI();
    });
  }

  const inpAnimSpread = document.getElementById('insp-anim-arm-spread');
  if (inpAnimSpread) {
    inpAnimSpread.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      layer.armSpreadDeg = val;
      const el = document.getElementById('insp-anim-spread-val');
      if (el) el.textContent = `${Math.round(val)}°`;
      timeline.invalidateSimulation();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      updateSimulationStatusUI();
    });
  }

  // Behavior Body Part Mask Binding
  const selBodyMask = document.getElementById('insp-body-mask');
  if (selBodyMask) {
    selBodyMask.addEventListener('change', (e) => {
      layer.bodyPartMask = e.target.value;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Behavior Selection Set Binding (Endorphin 2.7.1)
  const selSelectionSet = document.getElementById('insp-selection-set');
  if (selSelectionSet) {
    selSelectionSet.addEventListener('change', (e) => {
      layer.selectionSet = e.target.value;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Behavior Target Object Binding (Endorphin 2.7.1)
  const selBehaviorTarget = document.getElementById('insp-behavior-target');
  if (selBehaviorTarget) {
    selBehaviorTarget.addEventListener('change', (e) => {
      layer.targetObject = e.target.value;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
  }

  // Behavior Reaching Hand / Arm Selector Binding
  const selBehaviorReachHand = document.getElementById('insp-behavior-reach-hand');
  if (selBehaviorReachHand) {
    selBehaviorReachHand.addEventListener('change', (e) => {
      layer.reachHand = e.target.value;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Behavior Look At / Gaze Tracking Toggle Binding
  const chkBehaviorLookAt = document.getElementById('insp-behavior-lookat');
  if (chkBehaviorLookAt) {
    chkBehaviorLookAt.addEventListener('change', (e) => {
      layer.lookAt = e.target.checked;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Endorphin 2.7.1 Trajectory Prediction Controls Bindings
  const chkUsePred = document.getElementById('insp-use-prediction');
  if (chkUsePred) {
    chkUsePred.addEventListener('change', (e) => {
      layer.usePrediction = e.target.checked;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpPredRate = document.getElementById('insp-predrate');
  if (inpPredRate) {
    inpPredRate.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.predictionRate = val;
      const el = document.getElementById('insp-predrate-val');
      if (el) el.textContent = `${val.toFixed(2)}s`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpTrajOff = document.getElementById('insp-trajoff');
  if (inpTrajOff) {
    inpTrajOff.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.trajectoryOffset = val;
      const el = document.getElementById('insp-trajoff-val');
      if (el) el.textContent = val.toFixed(2);
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpInterceptX = document.getElementById('insp-intercept-x');
  if (inpInterceptX) {
    inpInterceptX.addEventListener('input', (e) => {
      layer.interceptionOffsetX = parseFloat(e.target.value) || 0.0;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpInterceptY = document.getElementById('insp-intercept-y');
  if (inpInterceptY) {
    inpInterceptY.addEventListener('input', (e) => {
      layer.interceptionOffsetY = parseFloat(e.target.value) || 0.0;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpInterceptZ = document.getElementById('insp-intercept-z');
  if (inpInterceptZ) {
    inpInterceptZ.addEventListener('input', (e) => {
      layer.interceptionOffsetZ = parseFloat(e.target.value) || 0.0;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpExagg = document.getElementById('insp-exaggeration');
  if (inpExagg) {
    inpExagg.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.exaggeration = val;
      const el = document.getElementById('insp-exagg-val');
      if (el) el.textContent = `${Math.round(val * 100)}%`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpDelay = document.getElementById('insp-delay');
  if (inpDelay) {
    inpDelay.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.delay = val;
      const el = document.getElementById('insp-delay-val');
      if (el) el.textContent = `${val.toFixed(2)}s`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpCharAccel = document.getElementById('insp-characcel');
  if (inpCharAccel) {
    inpCharAccel.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.characterAccelThreshold = val;
      const el = document.getElementById('insp-characcel-val');
      if (el) el.textContent = `${val.toFixed(1)} m/s²`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpTargetAccel = document.getElementById('insp-targetaccel');
  if (inpTargetAccel) {
    inpTargetAccel.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.targetAccelThreshold = val;
      const el = document.getElementById('insp-targetaccel-val');
      if (el) el.textContent = `${val.toFixed(2)} m/s²`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Active Pose Specific Bindings
  const selPoseKey = document.getElementById('insp-pose-key');
  if (selPoseKey) {
    selPoseKey.addEventListener('change', (e) => {
      layer.poseKey = e.target.value;
      const poseName = ENDORPHIN_ACTIVE_POSES[e.target.value]?.name || e.target.value;
      layer.name = `Pose: ${poseName.split(' ')[0]}`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpPoseStr = document.getElementById('insp-pose-strength');
  if (inpPoseStr) {
    inpPoseStr.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.strength = val;
      const valEl = document.getElementById('insp-pose-str-val');
      if (valEl) valEl.textContent = `${Math.round(val)}%`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Constraint Specific Bindings
  const selConstBody = document.getElementById('insp-constraint-body');
  if (selConstBody) {
    selConstBody.addEventListener('change', (e) => {
      layer.targetBody = e.target.value;
      selectedTargetBone = e.target.value;
      if (layer.pinTarget && layer.pinTarget !== 'world') {
        const p = propsManager?.getPropById(layer.pinTarget);
        layer.name = `Pin ${layer.targetBody} to ${p?.name || 'Object'}`;
      } else {
        layer.name = `Pin ${layer.targetBody}`;
      }
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const selConstPinTarget = document.getElementById('insp-constraint-pin-target');
  if (selConstPinTarget) {
    selConstPinTarget.addEventListener('change', (e) => {
      layer.pinTarget = e.target.value;
      if (layer.pinTarget && layer.pinTarget.startsWith('actor:')) {
        const [, tActor, tBone] = layer.pinTarget.split(':');
        layer.name = `Pin ${layer.targetBody} to ${tActor === 'actor-2' ? 'Actor 2' : 'Actor 1'} ${tBone || 'Bone'}`;
      } else if (layer.pinTarget !== 'world') {
        const p = propsManager?.getPropById(layer.pinTarget);
        layer.name = `Pin ${layer.targetBody} to ${p?.name || 'Object'}`;
      } else {
        layer.name = `Pin ${layer.targetBody}`;
      }
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const selConstType = document.getElementById('insp-constraint-type');
  if (selConstType) {
    selConstType.addEventListener('change', (e) => {
      layer.constraintType = e.target.value;
      const trigRow = document.getElementById('insp-row-trigger-dist');
      if (trigRow) {
        trigRow.style.display = (e.target.value === 'HOLD_PROXIMITY' || e.target.value === 'proximityHold') ? '' : 'none';
      }
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpConstStr = document.getElementById('insp-constraint-strength');
  if (inpConstStr) {
    inpConstStr.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.strength = val;
      const valEl = document.getElementById('insp-const-str-val');
      if (valEl) valEl.textContent = `${val.toFixed(2)}x`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpConstBreak = document.getElementById('insp-constraint-break-force');
  if (inpConstBreak) {
    inpConstBreak.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.breakForce = val;
      const valEl = document.getElementById('insp-const-break-val');
      if (valEl) valEl.textContent = `${val} N`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const inpConstTrig = document.getElementById('insp-constraint-trigger-dist');
  if (inpConstTrig) {
    inpConstTrig.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      layer.triggerDistance = val;
      const valEl = document.getElementById('insp-const-trig-val');
      if (valEl) valEl.textContent = `${val.toFixed(2)} m`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  // Force Event specific bindings
  const selBody = document.getElementById('insp-target-body');
  if (selBody) {
    selBody.addEventListener('change', (e) => {
      layer.targetBody = e.target.value;
      selectedTargetBone = e.target.value;
      layer.name = `Force on ${layer.targetBody}`;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      updateSimulationStatusUI();
    });
  }

  const selMode = document.getElementById('insp-force-mode');
  if (selMode) {
    selMode.addEventListener('change', (e) => {
      layer.forceMode = e.target.value;
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  const updateForceParams = () => {
    const mag = parseFloat(document.getElementById('insp-magnitude')?.value ?? layer.magnitude ?? 65);
    const yaw = parseFloat(document.getElementById('insp-yaw')?.value ?? layer.yawDeg ?? 180);
    const pitch = parseFloat(document.getElementById('insp-pitch')?.value ?? layer.pitchDeg ?? 0);
    layer.magnitude = mag;
    layer.yawDeg = yaw;
    layer.pitchDeg = pitch;
    layer.impulse = TimelineEngine.computeForceVector(mag * (layer.intensity ?? 1.0), yaw, pitch);
    const magValEl = document.getElementById('insp-mag-val');
    const yawValEl = document.getElementById('insp-yaw-val');
    const pitchValEl = document.getElementById('insp-pitch-val');
    if (magValEl) magValEl.textContent = `${mag.toFixed(0)} N·s`;
    if (yawValEl) yawValEl.textContent = `${Math.round(yaw)}°`;
    if (pitchValEl) pitchValEl.textContent = `${Math.round(pitch)}°`;
    timeline.invalidateSimulation();
    renderTimelineLayers();
    updateSimulationStatusUI();
  };

  ['insp-magnitude', 'insp-yaw', 'insp-pitch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateForceParams);
  });

  // Active Pose Track controls
  const selPoseMotor = document.getElementById('insp-pose-motorized');
  if (selPoseMotor) {
    selPoseMotor.addEventListener('change', (e) => {
      layer.isMotorized = (e.target.value === 'motorized');
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  const inpPoseStiff = document.getElementById('insp-pose-stiffness');
  if (inpPoseStiff) {
    inpPoseStiff.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100.0;
      layer.muscleStiffness = val;
      const lbl = document.getElementById('insp-pose-stiff-val');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  const btnInspEnterPose = document.getElementById('btn-insp-enter-pose');
  if (btnInspEnterPose) {
    btnInspEnterPose.addEventListener('click', () => {
      togglePoseMode(true);
    });
  }

  // NLE Quick Buttons
  document.getElementById('btn-insp-split')?.addEventListener('click', () => {
    document.getElementById('btn-timeline-split')?.click();
  });
  document.getElementById('btn-insp-trim-in')?.addEventListener('click', () => {
    document.getElementById('btn-timeline-trim-in')?.click();
  });
  document.getElementById('btn-insp-trim-out')?.addEventListener('click', () => {
    document.getElementById('btn-timeline-trim-out')?.click();
  });

  // Start / End / Duration numeric inputs
  const inpStart = document.getElementById('insp-start');
  const inpEnd = document.getElementById('insp-end');
  const inpDur = document.getElementById('insp-duration');

  if (inpStart && inpEnd && inpDur) {
    inpStart.addEventListener('change', (e) => {
      const ns = THREE.MathUtils.clamp(parseInt(e.target.value) || 0, 0, timeline.totalFrames - 1);
      const ne = Math.max(ns + 1, layer.endFrame);
      timeline.updateLayerTiming(layer.id, ns, ne);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
    inpEnd.addEventListener('change', (e) => {
      const ne = THREE.MathUtils.clamp(parseInt(e.target.value) || 1, layer.startFrame + 1, timeline.totalFrames);
      timeline.updateLayerTiming(layer.id, layer.startFrame, ne);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
    inpDur.addEventListener('change', (e) => {
      const dur = THREE.MathUtils.clamp(parseInt(e.target.value) || 1, 1, timeline.totalFrames - layer.startFrame);
      timeline.updateLayerTiming(layer.id, layer.startFrame, layer.startFrame + dur);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
  }

  const inpTrackName = document.getElementById('insp-track-name');
  if (inpTrackName) {
    inpTrackName.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val && val !== layer.name) {
        historyManager.pushState(`Rename track to ${val}`);
        layer.name = val;
        renderTimelineLayers();
      }
    });
  }

  const selTargetActor = document.getElementById('insp-target-actor');
  if (selTargetActor) {
    selTargetActor.addEventListener('change', async (e) => {
      const chosen = e.target.value;
      if (chosen === 'actor-2' && !actor2Active) {
        await addActor2();
      }
      historyManager.pushState(`Reassign track to ${chosen === 'actor-2' ? 'Enemy' : 'Hero'}`);
      layer.actorId = chosen;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`Reassigned track to ${chosen === 'actor-2' ? 'Actor 2 (Enemy)' : 'Actor 1 (Hero)'}`, 'info');
    });
  }
}

// --- PROP SELECTION & DYNAMIC INSPECTOR ---
function selectProp(propId) {
  const prop = propsManager?.props.find(p => p.id === propId);
  if (!prop || !prop.mesh) return;

  selectedPropId = prop.id;
  deselectBone();
  selectedOutlinerNodeId = `prop-${prop.id}`;

  // Deselect timeline layers
  timeline.selectedLayerId = null;
  document.querySelectorAll('.layer-row.selected').forEach(r => r.classList.remove('selected'));

  // Hide bone force arrow gizmo / bone highlight
  if (forceArrowHelper) forceArrowHelper.visible = false;
  if (selectedBoneHighlightMesh) selectedBoneHighlightMesh.visible = false;

  // Attach transform controls to prop mesh
  if (transformControls) {
    transformControls.detach();
    transformControls.attach(prop.mesh);
    transformControls.setMode(currentTransformMode);
    transformControls.enabled = true;
    const helper = typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls;
    if (helper) helper.visible = true;
  }

  // Hide layer inspector, render prop inspector
  const layerGroup = document.getElementById('layer-inspector-group');
  if (layerGroup) layerGroup.style.display = 'none';

  renderPropInspector();
  renderSceneOutliner();
}

function deselectProp() {
  if (!selectedPropId) return;
  selectedPropId = null;
  if (selectedOutlinerNodeId && selectedOutlinerNodeId.startsWith('prop-')) {
    selectedOutlinerNodeId = null;
  }

  if (transformControls) {
    transformControls.detach();
    if (charGizmoAnchor) {
      transformControls.attach(charGizmoAnchor);
      transformControls.setMode(currentTransformMode);
      transformControls.enabled = moveGizmoEnabled;
      const helper = typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls;
      if (helper) helper.visible = moveGizmoEnabled;
    }
  }

  const propGroup = document.getElementById('prop-inspector-group');
  const propContent = document.getElementById('prop-inspector-content');
  if (propGroup) propGroup.style.display = 'none';
  if (propContent) propContent.innerHTML = '';
  renderSceneOutliner();
  if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
}

function updatePropInspectorFields(prop) {
  if (!prop || !prop.mesh) return;
  const pos = prop.mesh.position;
  const sx = document.getElementById('prop-pos-x');
  const sy = document.getElementById('prop-pos-y');
  const sz = document.getElementById('prop-pos-z');
  const vx = document.getElementById('prop-pos-x-val');
  const vy = document.getElementById('prop-pos-y-val');
  const vz = document.getElementById('prop-pos-z-val');
  if (sx) sx.value = pos.x;
  if (sy) sy.value = pos.y;
  if (sz) sz.value = pos.z;
  if (vx) vx.textContent = `${pos.x.toFixed(2)} m`;
  if (vy) vy.textContent = `${pos.y.toFixed(2)} m`;
  if (vz) vz.textContent = `${pos.z.toFixed(2)} m`;

  // Rotation Euler
  const rot = prop.rotationEuler || { x: 0, y: 0, z: 0 };
  const rx = document.getElementById('prop-rot-x');
  const ry = document.getElementById('prop-rot-y');
  const rz = document.getElementById('prop-rot-z');
  const vrx = document.getElementById('prop-rot-x-val');
  const vry = document.getElementById('prop-rot-y-val');
  const vrz = document.getElementById('prop-rot-z-val');
  if (rx) rx.value = rot.x;
  if (ry) ry.value = rot.y;
  if (rz) rz.value = rot.z;
  if (vrx) vrx.textContent = `${rot.x.toFixed(1)}°`;
  if (vry) vry.textContent = `${rot.y.toFixed(1)}°`;
  if (vrz) vrz.textContent = `${rot.z.toFixed(1)}°`;

  // Scale
  const scale = prop.mesh.scale;
  const scUni = document.getElementById('prop-scale-uni');
  const scX = document.getElementById('prop-scale-x');
  const scY = document.getElementById('prop-scale-y');
  const scZ = document.getElementById('prop-scale-z');
  const vscUni = document.getElementById('prop-scale-uni-val');
  const vscX = document.getElementById('prop-scale-x-val');
  const vscY = document.getElementById('prop-scale-y-val');
  const vscZ = document.getElementById('prop-scale-z-val');
  const avgScale = (scale.x + scale.y + scale.z) / 3;
  if (scUni) scUni.value = avgScale;
  if (scX) scX.value = scale.x;
  if (scY) scY.value = scale.y;
  if (scZ) scZ.value = scale.z;
  if (vscUni) vscUni.textContent = `${avgScale.toFixed(2)}x`;
  if (vscX) vscX.textContent = `${scale.x.toFixed(2)}x`;
  if (vscY) vscY.textContent = `${scale.y.toFixed(2)}x`;
  if (vscZ) vscZ.textContent = `${scale.z.toFixed(2)}x`;
}

function renderPropInspector() {
  const groupEl = document.getElementById('prop-inspector-group');
  const contentEl = document.getElementById('prop-inspector-content');
  const titleEl = document.getElementById('prop-inspector-title');
  if (!groupEl || !contentEl) return;

  const prop = propsManager?.props.find(p => p.id === selectedPropId);
  if (!prop) {
    groupEl.style.display = 'none';
    contentEl.innerHTML = '';
    if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
    return;
  }

  if (typeof switchRightPanelContext === 'function') switchRightPanelContext('track');
  groupEl.style.display = 'flex';
  if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
  const shapeIcons = {
    box: '🧊',
    sphere: '⚽',
    cylinder: '🥫',
    capsule: '💊',
    crate: '📦',
    step: '🪜',
    projectile: '💣',
    fluid: '🌊'
  };
  const icon = shapeIcons[prop.shapeType] || shapeIcons[prop.type] || '📦';
  if (titleEl) {
    titleEl.innerHTML = `<span>${icon}</span> <span>${prop.name || 'Scene Prop'}</span>`;
  }

  const isSimulated = prop.isDynamic;
  const pos = prop.mesh ? prop.mesh.position : (prop.initPos || { x: 0, y: 0, z: 0 });
  const rot = prop.rotationEuler || { x: 0, y: 0, z: 0 };
  const scale = prop.mesh ? prop.mesh.scale : { x: 1, y: 1, z: 1 };
  const avgScale = (scale.x + scale.y + scale.z) / 3;

  contentEl.innerHTML = `
    <!-- SIMULATION TOGGLE SWITCH -->
    <div class="inspector-row">
      <label><span>Physics Simulation</span></label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;">
        <button id="prop-mode-sim" class="btn" style="justify-content: center; font-size: 11px; padding: 6px 4px; ${isSimulated ? 'border-color: #38bdf8; color: #38bdf8; background: rgba(56, 189, 248, 0.16); font-weight: 600;' : 'opacity: 0.6;'}">
          <span>⚡ Simulated</span>
        </button>
        <button id="prop-mode-static" class="btn" style="justify-content: center; font-size: 11px; padding: 6px 4px; ${!isSimulated ? 'border-color: #f59e0b; color: #fbbf24; background: rgba(245, 158, 11, 0.16); font-weight: 600;' : 'opacity: 0.6;'}">
          <span>🔒 Static (Fixed)</span>
        </button>
      </div>
      <div id="prop-sim-desc" style="font-size: 10px; margin-top: 5px; line-height: 1.3; color: ${isSimulated ? '#7dd3fc' : '#fde68a'};">
        ${isSimulated
          ? '⚡ <strong>Dynamic:</strong> Affected by gravity, collisions, and character impacts during simulation.'
          : '🔒 <strong>Static:</strong> Fixed at placed location. Stays locked as an immovable collision obstacle.'
        }
      </div>
    </div>

    <!-- TRANSFORM POSITION CONTROLS (W) -->
    <div class="inspector-row">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <label style="margin: 0;"><span>Position (X/Y/Z) [W]</span></label>
        <span style="font-size: 9px; color: #64748b;">Meters</span>
      </div>
      
      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>X Position</span><span id="prop-pos-x-val" style="color: #f87171; font-weight: 600;">${pos.x.toFixed(2)} m</span>
        </div>
        <input type="range" id="prop-pos-x" min="-6" max="6" step="0.05" value="${pos.x}" style="width: 100%; accent-color: #ef4444;">
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Y Elevation</span><span id="prop-pos-y-val" style="color: #4ade80; font-weight: 600;">${pos.y.toFixed(2)} m</span>
        </div>
        <input type="range" id="prop-pos-y" min="0" max="6" step="0.05" value="${pos.y}" style="width: 100%; accent-color: #22c55e;">
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Z Position</span><span id="prop-pos-z-val" style="color: #60a5fa; font-weight: 600;">${pos.z.toFixed(2)} m</span>
        </div>
        <input type="range" id="prop-pos-z" min="-6" max="6" step="0.05" value="${pos.z}" style="width: 100%; accent-color: #3b82f6;">
      </div>
    </div>

    <!-- TRANSFORM ROTATION CONTROLS (E) -->
    <div class="inspector-row">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <label style="margin: 0;"><span>Rotation (Pitch / Yaw / Roll) [E]</span></label>
        <span style="font-size: 9px; color: #64748b;">Degrees</span>
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Pitch (X)</span><span id="prop-rot-x-val" style="color: #f87171; font-weight: 600;">${rot.x.toFixed(1)}°</span>
        </div>
        <input type="range" id="prop-rot-x" min="-180" max="180" step="1" value="${rot.x}" style="width: 100%; accent-color: #ef4444;">
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Yaw (Y)</span><span id="prop-rot-y-val" style="color: #4ade80; font-weight: 600;">${rot.y.toFixed(1)}°</span>
        </div>
        <input type="range" id="prop-rot-y" min="-180" max="180" step="1" value="${rot.y}" style="width: 100%; accent-color: #22c55e;">
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Roll (Z)</span><span id="prop-rot-z-val" style="color: #60a5fa; font-weight: 600;">${rot.z.toFixed(1)}°</span>
        </div>
        <input type="range" id="prop-rot-z" min="-180" max="180" step="1" value="${rot.z}" style="width: 100%; accent-color: #3b82f6;">
      </div>
    </div>

    <!-- TRANSFORM SCALE CONTROLS (R) -->
    <div class="inspector-row">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <label style="margin: 0;"><span>Scale (Geometry &amp; Physics) [R]</span></label>
        <button id="btn-prop-reset-transform" class="btn" style="font-size: 9px; padding: 2px 6px;">Reset</button>
      </div>

      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Uniform Scale</span><span id="prop-scale-uni-val" style="color: #38bdf8; font-weight: 600;">${avgScale.toFixed(2)}x</span>
        </div>
        <input type="range" id="prop-scale-uni" min="0.1" max="4.0" step="0.05" value="${avgScale}" style="width: 100%; accent-color: #38bdf8;">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-top: 6px;">
        <div>
          <div style="font-size: 9.5px; color: #f87171; margin-bottom: 1px;">X: <span id="prop-scale-x-val">${scale.x.toFixed(2)}</span></div>
          <input type="range" id="prop-scale-x" min="0.1" max="4.0" step="0.05" value="${scale.x}" style="width: 100%; accent-color: #ef4444;">
        </div>
        <div>
          <div style="font-size: 9.5px; color: #4ade80; margin-bottom: 1px;">Y: <span id="prop-scale-y-val">${scale.y.toFixed(2)}</span></div>
          <input type="range" id="prop-scale-y" min="0.1" max="4.0" step="0.05" value="${scale.y}" style="width: 100%; accent-color: #22c55e;">
        </div>
        <div>
          <div style="font-size: 9.5px; color: #60a5fa; margin-bottom: 1px;">Z: <span id="prop-scale-z-val">${scale.z.toFixed(2)}</span></div>
          <input type="range" id="prop-scale-z" min="0.1" max="4.0" step="0.05" value="${scale.z}" style="width: 100%; accent-color: #3b82f6;">
        </div>
      </div>
    </div>

    <!-- MASS PROPERTY (DYNAMIC ONLY) -->
    ${isSimulated && prop.type !== 'fluid' ? `
      <div class="inspector-row">
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
          <span>Physical Mass</span><span id="prop-mass-val" style="color: #38bdf8; font-weight: 600;">${(prop.mass || 20).toFixed(1)} kg</span>
        </div>
        <input type="range" id="prop-mass-slider" min="1" max="150" step="1" value="${prop.mass || 20}" style="width: 100%; accent-color: #38bdf8;">
      </div>
    ` : ''}

    <!-- ACTIONS -->
    <div style="display: flex; gap: 6px; margin-top: 8px;">
      <button id="btn-prop-focus" class="btn" style="flex: 1; justify-content: center; font-size: 11px; padding: 5px;">
        <span>🎯 Focus Camera</span>
      </button>
      <button id="btn-prop-delete" class="btn" style="flex: 1; justify-content: center; font-size: 11px; padding: 5px; border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; background: rgba(239, 68, 68, 0.08);">
        <span>🗑️ Delete Prop</span>
      </button>
    </div>

    <!-- DYNAMIC PROP PHYSICS GUIDE CARD -->
    <div class="inspector-guide-card" id="prop-inspector-guide-card">
      <div class="guide-card-header">
        <span class="guide-card-category" id="prop-guide-category">📦 PROP PHYSICS GUIDE</span>
        <span class="guide-card-badge" id="prop-guide-badge">RAPIER 3D</span>
      </div>
      <div class="guide-card-title" id="prop-guide-title"><span>💡</span> <span>Hover Setting</span></div>
      <div class="guide-card-desc" id="prop-guide-desc">Hover over any prop transform, mass, or simulation property for an explanation of its physical behavior.</div>
      <div class="guide-card-effect" id="prop-guide-effect" style="display: none;"></div>
    </div>
  `;

  // Wire Mode Toggle
  const btnModeSim = document.getElementById('prop-mode-sim');
  const btnModeStatic = document.getElementById('prop-mode-static');
  if (btnModeSim) {
    btnModeSim.addEventListener('click', () => {
      prop.setDynamic(true);
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
      renderPropInspector();
    });
  }
  if (btnModeStatic) {
    btnModeStatic.addEventListener('click', () => {
      prop.setDynamic(false);
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
      renderPropInspector();
    });
  }

  // Wire Position sliders
  const syncPropSliders = () => {
    const x = parseFloat(document.getElementById('prop-pos-x')?.value) || 0;
    const y = parseFloat(document.getElementById('prop-pos-y')?.value) || 0;
    const z = parseFloat(document.getElementById('prop-pos-z')?.value) || 0;
    propsManager.setPropPosition(prop.id, x, y, z);
    updatePropInspectorFields(prop);
    if (!timeline.isBakingLive) {
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    }
  };

  ['prop-pos-x', 'prop-pos-y', 'prop-pos-z'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', syncPropSliders);
  });

  // Wire Rotation sliders
  const syncPropRotation = () => {
    const rx = parseFloat(document.getElementById('prop-rot-x')?.value) || 0;
    const ry = parseFloat(document.getElementById('prop-rot-y')?.value) || 0;
    const rz = parseFloat(document.getElementById('prop-rot-z')?.value) || 0;
    propsManager.setPropRotation(prop.id, rx, ry, rz);
    updatePropInspectorFields(prop);
    if (!timeline.isBakingLive) {
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    }
  };

  ['prop-rot-x', 'prop-rot-y', 'prop-rot-z'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', syncPropRotation);
  });

  // Wire Scale sliders
  const syncPropScale = () => {
    const sx = parseFloat(document.getElementById('prop-scale-x')?.value) || 1;
    const sy = parseFloat(document.getElementById('prop-scale-y')?.value) || 1;
    const sz = parseFloat(document.getElementById('prop-scale-z')?.value) || 1;
    propsManager.setPropScale(prop.id, sx, sy, sz);
    updatePropInspectorFields(prop);
    if (!timeline.isBakingLive) {
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    }
  };

  ['prop-scale-x', 'prop-scale-y', 'prop-scale-z'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', syncPropScale);
  });

  document.getElementById('prop-scale-uni')?.addEventListener('input', (e) => {
    const s = parseFloat(e.target.value) || 1;
    propsManager.setPropScale(prop.id, s, s, s);
    updatePropInspectorFields(prop);
    if (!timeline.isBakingLive) {
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    }
  });

  // Reset transforms
  document.getElementById('btn-prop-reset-transform')?.addEventListener('click', () => {
    propsManager.setPropRotation(prop.id, 0, 0, 0);
    propsManager.setPropScale(prop.id, 1, 1, 1);
    updatePropInspectorFields(prop);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  });

  // Wire Mass slider
  const massSlider = document.getElementById('prop-mass-slider');
  if (massSlider) {
    massSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 20;
      prop.mass = val;
      if (prop.collider && prop.isDynamic) {
        prop.collider.setMass(val);
      }
      const valEl = document.getElementById('prop-mass-val');
      if (valEl) valEl.textContent = `${val.toFixed(1)} kg`;
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  // Focus Camera button
  document.getElementById('btn-prop-focus')?.addEventListener('click', () => {
    if (prop.mesh && controls) {
      controls.target.copy(prop.mesh.position);
    }
  });

  // Delete Prop button
  document.getElementById('btn-prop-delete')?.addEventListener('click', () => {
    propsManager.removeProp(prop.id);
    deselectProp();
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  });
}

// ==========================================================================
// SCENE OUTLINER, CHARACTER SKELETON HIERARCHY & DYNAMIC DURATION
// ==========================================================================

function switchLeftPanelTab(tabName) {
  if (tabName === 'library') tabName = 'behaviors';
  activeLeftTab = tabName;

  const tabMap = {
    behaviors: { btn: document.getElementById('tab-btn-behaviors'), panel: document.getElementById('panel-body-behaviors') },
    staging:   { btn: document.getElementById('tab-btn-staging'),   panel: document.getElementById('panel-body-staging') },
    props:     { btn: document.getElementById('tab-btn-props'),     panel: document.getElementById('panel-body-props') },
    outliner:  { btn: document.getElementById('tab-btn-outliner'),  panel: document.getElementById('panel-body-outliner') }
  };

  Object.entries(tabMap).forEach(([key, item]) => {
    if (key === tabName) {
      item.btn?.classList.add('active');
      if (item.panel) item.panel.style.display = 'flex';
    } else {
      item.btn?.classList.remove('active');
      if (item.panel) item.panel.style.display = 'none';
    }
  });

  // Backward compatibility alias for legacy tab-btn-library / panel-body-library if present
  const tabLibrary = document.getElementById('tab-btn-library');
  const panelLibrary = document.getElementById('panel-body-library');
  if (tabLibrary) {
    if (tabName === 'behaviors') tabLibrary.classList.add('active');
    else tabLibrary.classList.remove('active');
  }
  if (panelLibrary && panelLibrary.id === 'panel-body-library') {
    panelLibrary.style.display = tabName === 'behaviors' ? 'flex' : 'none';
  }

  if (tabName === 'outliner') {
    renderSceneOutliner();
  }
}

function updateEmptyTrackInspectorState() {
  const emptyCard = document.getElementById('track-inspector-empty-card');
  if (!emptyCard) return;
  const poseGrp = document.getElementById('pose-inspector-group');
  const layerGrp = document.getElementById('layer-inspector-group');
  const propGrp = document.getElementById('prop-inspector-group');
  const boneGrp = document.getElementById('bone-inspector-group');

  const hasActiveItem = (poseGrp && poseGrp.style.display !== 'none') ||
                        (layerGrp && layerGrp.style.display !== 'none') ||
                        (propGrp && propGrp.style.display !== 'none') ||
                        (boneGrp && boneGrp.style.display !== 'none');

  emptyCard.style.display = hasActiveItem ? 'none' : 'block';
}

function switchRightPanelContext(subTab) {
  const btnTrack = document.getElementById('subtab-btn-track');
  const btnChar = document.getElementById('subtab-btn-character');
  const contentTrack = document.getElementById('subtab-content-track');
  const contentChar = document.getElementById('subtab-content-character');

  if (subTab === 'character') {
    btnTrack?.classList.remove('active');
    btnChar?.classList.add('active');
    if (contentTrack) contentTrack.style.display = 'none';
    if (contentChar) contentChar.style.display = 'flex';
  } else {
    btnTrack?.classList.add('active');
    btnChar?.classList.remove('active');
    if (contentTrack) contentTrack.style.display = 'flex';
    if (contentChar) contentChar.style.display = 'none';
    updateEmptyTrackInspectorState();
  }
}

function selectBone(boneName) {
  const activeChar = getActiveCharacter();
  if (!activeChar || !activeChar.bodies[boneName]) return;
  deselectProp();
  selectedTargetBone = boneName;
  selectedOutlinerNodeId = `bone-${boneName}`;

  // If a PERTURBATION or CONSTRAINT layer is currently selected, update its target body
  const selLayer = timeline.getSelectedLayer();
  if (selLayer && (selLayer.type === 'PERTURBATION' || selLayer.type === 'CONSTRAINT')) {
    selLayer.targetBody = boneName;
    if (selLayer.type === 'PERTURBATION') {
      selLayer.name = `Force on ${boneName}`;
    } else {
      selLayer.name = `Pin ${boneName}`;
    }
    timeline.invalidateSimulation();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  }

  // Update 3D wireframe highlight mesh
  if (selectedBoneHighlightMesh) {
    const bMesh = activeChar.bodies[boneName].mesh;
    if (bMesh) {
      selectedBoneHighlightMesh.position.copy(bMesh.position);
      selectedBoneHighlightMesh.visible = true;
    }
  }

  renderBoneInspector(boneName);
  renderSceneOutliner();
  renderViewportBoneTree();
  updateBoneTrajectory();
}

function deselectBone() {
  selectedTargetBone = null;
  if (selectedOutlinerNodeId && selectedOutlinerNodeId.startsWith('bone-')) {
    selectedOutlinerNodeId = null;
  }
  if (selectedBoneHighlightMesh) {
    selectedBoneHighlightMesh.visible = false;
  }
  clearBoneTrajectory();
  const boneGroup = document.getElementById('bone-inspector-group');
  const boneContent = document.getElementById('bone-inspector-content');
  if (boneGroup) boneGroup.style.display = 'none';
  if (boneContent) boneContent.innerHTML = '';
  renderSceneOutliner();
  renderViewportBoneTree();
  if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
}

function renderBoneInspector(boneName) {
  const groupEl = document.getElementById('bone-inspector-group');
  const contentEl = document.getElementById('bone-inspector-content');
  const titleEl = document.getElementById('bone-inspector-title');
  if (!groupEl || !contentEl) return;

  const activeChar = getActiveCharacter();
  const bodyData = activeChar?.bodies[boneName];
  if (!bodyData || !bodyData.mesh) {
    groupEl.style.display = 'none';
    contentEl.innerHTML = '';
    if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();
    return;
  }

  if (typeof switchRightPanelContext === 'function') switchRightPanelContext('track');
  groupEl.style.display = 'flex';
  if (typeof updateEmptyTrackInspectorState === 'function') updateEmptyTrackInspectorState();

  groupEl.style.display = 'flex';
  const def = SKELETON_TREE[boneName] || {};
  if (titleEl) {
    titleEl.innerHTML = `<span>🦴</span> <span>${boneName}</span>`;
  }

  const pos = bodyData.mesh.position;
  let velMag = 0;
  if (bodyData.rigidBody && typeof bodyData.rigidBody.linvel === 'function') {
    const lv = bodyData.rigidBody.linvel();
    velMag = Math.hypot(lv.x, lv.y, lv.z);
  }

  contentEl.innerHTML = `
    <div style="font-size: 10px; color: #94a3b8; border-bottom: 1px solid #1e293b; padding-bottom: 6px; display: flex; justify-content: space-between;">
      <span>Anatomical Segment:</span>
      <span style="color: #f43f5e; font-weight: 600;">${def.role || 'Articulated Rig'}</span>
    </div>

    <!-- TRANSFORM (POSITION & VELOCITY) -->
    <div class="inspector-row">
      <label><span>Live Position (World X/Y/Z)</span></label>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-family: monospace; font-size: 10px; text-align: center;">
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 4px 2px; color: #fca5a5;">
          X: <span id="bone-live-pos-x">${pos.x.toFixed(2)}</span>
        </div>
        <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 4px; padding: 4px 2px; color: #86efac;">
          Y: <span id="bone-live-pos-y">${pos.y.toFixed(2)}</span>
        </div>
        <div style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 4px; padding: 4px 2px; color: #93c5fd;">
          Z: <span id="bone-live-pos-z">${pos.z.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="inspector-row">
      <label><span>Biomechanical Specs</span></label>
      <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: #cbd5e1; background: #0b1120; padding: 6px 8px; border-radius: 4px; border: 1px solid #1e293b;">
        <span>Segment Mass: <strong style="color: #38bdf8;">${def.mass ?? 4.0} kg</strong></span>
        <span>Linear Speed: <strong id="bone-live-speed" style="color: #fbbf24;">${velMag.toFixed(2)} m/s</strong></span>
      </div>
    </div>

    <!-- QUICK ACTIONS FOR THIS BONE -->
    <div class="inspector-row" style="margin-top: 4px; gap: 6px;">
      <label><span>Actions on ${boneName}</span></label>
      <button class="btn" id="btn-bone-add-force" style="justify-content: center; border-color: rgba(244, 63, 94, 0.5); color: #fda4af; background: rgba(244, 63, 94, 0.1); font-size: 11px;">
        <span>🎯</span><span>Apply Impact Force Here</span>
      </button>
      <button class="btn" id="btn-bone-add-pin" style="justify-content: center; border-color: rgba(245, 158, 11, 0.5); color: #fde047; background: rgba(245, 158, 11, 0.1); font-size: 11px;">
        <span>📌</span><span>Pin / Constrain in Place</span>
      </button>
      <button class="btn" id="btn-bone-focus-cam" style="justify-content: center; font-size: 11px;">
        <span>🔍</span><span>Focus Camera on Bone</span>
      </button>
    </div>

    <!-- DYNAMIC SKELETAL RIG GUIDE CARD -->
    <div class="inspector-guide-card" id="bone-inspector-guide-card">
      <div class="guide-card-header">
        <span class="guide-card-category" id="bone-guide-category">🦴 SKELETAL RIG GUIDE</span>
        <span class="guide-card-badge" id="bone-guide-badge">BIOMECHANICS</span>
      </div>
      <div class="guide-card-title" id="bone-guide-title"><span>💡</span> <span>Segment Analysis</span></div>
      <div class="guide-card-desc" id="bone-guide-desc">Live velocity and Cartesian position of this anatomical segment. Click '+ Force Event' or '+ Bone Constraint' in DMS Library to bind events.</div>
      <div class="guide-card-effect" id="bone-guide-effect" style="display: none;"></div>
    </div>
  `;

  document.getElementById('btn-bone-add-force')?.addEventListener('click', () => {
    const startF = timeline.currentFrame;
    timeline.addLayer({
      name: `Force on ${boneName}`,
      type: 'PERTURBATION',
      startFrame: startF,
      endFrame: Math.min(timeline.totalFrames, startF + 10),
      targetBody: boneName,
      magnitude: 65.0,
      yawDeg: 180.0,
      pitchDeg: 10.0,
      forceMode: 'impulse',
      intensity: 1.0,
      impulse: TimelineEngine.computeForceVector(65.0, 180.0, 10.0),
      color: '#dc2626'
    });
    timeline.invalidateSimulation();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  });

  document.getElementById('btn-bone-add-pin')?.addEventListener('click', () => {
    const startF = timeline.currentFrame;
    const pinTarget = selectedPropId || 'world';
    let pinName = `Pin ${boneName}`;
    if (pinTarget !== 'world') {
      const p = propsManager?.getPropById(pinTarget);
      if (p) pinName = `Pin ${boneName} to ${p.name}`;
    }
    timeline.addLayer({
      name: pinName,
      type: 'CONSTRAINT',
      actorId: timeline.activeActorId || 'actor-1',
      startFrame: startF,
      endFrame: Math.min(timeline.totalFrames, startF + 60),
      targetBody: boneName,
      pinTarget: pinTarget,
      constraintType: 'lock',
      strength: 1.0,
      color: '#d97706'
    });
    timeline.invalidateSimulation();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  });

  document.getElementById('btn-bone-focus-cam')?.addEventListener('click', () => {
    if (controls && bodyData.mesh) {
      const p = bodyData.mesh.position;
      controls.target.set(p.x, p.y, p.z);
    }
  });
}

function updateBoneInspectorLive() {
  const activeChar = getActiveCharacter();
  if (!selectedTargetBone || !activeChar) return;
  const bodyData = activeChar.bodies[selectedTargetBone];
  if (!bodyData || !bodyData.mesh) return;

  const posXEl = document.getElementById('bone-live-pos-x');
  const posYEl = document.getElementById('bone-live-pos-y');
  const posZEl = document.getElementById('bone-live-pos-z');
  const spdEl = document.getElementById('bone-live-speed');

  if (posXEl) posXEl.textContent = bodyData.mesh.position.x.toFixed(2);
  if (posYEl) posYEl.textContent = bodyData.mesh.position.y.toFixed(2);
  if (posZEl) posZEl.textContent = bodyData.mesh.position.z.toFixed(2);

  if (spdEl && bodyData.rigidBody && typeof bodyData.rigidBody.linvel === 'function') {
    const lv = bodyData.rigidBody.linvel();
    const velMag = Math.hypot(lv.x, lv.y, lv.z);
    spdEl.textContent = `${velMag.toFixed(2)} m/s`;
  }

  if (selectedBoneHighlightMesh) {
    selectedBoneHighlightMesh.position.copy(bodyData.mesh.position);
  }
}

function updateZMPBalanceUI() {
  const statusEl = document.getElementById('zmp-status-text');
  const dispEl = document.getElementById('zmp-displacement-text');
  const badgeEl = document.getElementById('zmp-live-badge');
  const headerBtn = document.getElementById('btn-header-balance-jump');
  if (!statusEl || !character) return;

  const char = character;
  if (!char.balanceControlEnabled) {
    statusEl.textContent = 'Disabled (Pure Ragdoll / Passive)';
    statusEl.style.color = '#94a3b8';
    if (badgeEl) {
      badgeEl.textContent = 'ZMP OFF';
      badgeEl.style.background = 'rgba(148, 163, 184, 0.15)';
      badgeEl.style.color = '#94a3b8';
      badgeEl.style.borderColor = 'rgba(148, 163, 184, 0.35)';
    }
    if (headerBtn) {
      headerBtn.textContent = '⚖️ Balance: OFF';
      headerBtn.style.color = '#94a3b8';
      headerBtn.style.borderColor = '#64748b';
      headerBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    }
  } else if (char.isLossOfBalance) {
    statusEl.textContent = '⚠️ Loss of Balance (Falling)';
    statusEl.style.color = '#ef4444';
    if (badgeEl) {
      badgeEl.textContent = 'FALLING';
      badgeEl.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeEl.style.color = '#ef4444';
      badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
    if (headerBtn) {
      headerBtn.textContent = '⚠️ Balance: FALLING';
      headerBtn.style.color = '#ef4444';
      headerBtn.style.borderColor = '#ef4444';
      headerBtn.style.background = 'rgba(239, 68, 68, 0.15)';
    }
  } else if (char.zmpDisplacement > 0.06) {
    statusEl.textContent = `⚡ Stepping Recovery (${char.steppingFoot || 'Left'} Leg)`;
    statusEl.style.color = '#f59e0b';
    if (badgeEl) {
      badgeEl.textContent = 'RECOVERING';
      badgeEl.style.background = 'rgba(245, 158, 11, 0.2)';
      badgeEl.style.color = '#fbbf24';
      badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    }
    if (headerBtn) {
      headerBtn.textContent = '⚡ Balance: RECOVERING';
      headerBtn.style.color = '#fbbf24';
      headerBtn.style.borderColor = '#fbbf24';
      headerBtn.style.background = 'rgba(245, 158, 11, 0.15)';
    }
  } else {
    statusEl.textContent = '✓ Stable Equilibrium';
    statusEl.style.color = '#34d399';
    if (badgeEl) {
      badgeEl.textContent = 'ZMP ACTIVE';
      badgeEl.style.background = 'rgba(52, 211, 153, 0.2)';
      badgeEl.style.color = '#34d399';
      badgeEl.style.borderColor = 'rgba(52, 211, 153, 0.45)';
    }
    if (headerBtn) {
      headerBtn.textContent = '⚖️ Balance: ON';
      headerBtn.style.color = '#34d399';
      headerBtn.style.borderColor = '#34d399';
      headerBtn.style.background = 'rgba(52, 211, 153, 0.12)';
    }
  }

  if (dispEl) {
    dispEl.textContent = `${(char.zmpDisplacement || 0).toFixed(2)} m`;
  }
}

function renderSceneOutliner() {
  const container = document.getElementById('outliner-tree-container');
  if (!container) return;

  const q = outlinerSearchQuery.toLowerCase();
  let totalNodesCount = 0;

  container.innerHTML = '';

  // 1. ROOT NODE: Scene Root (OpenDMS World)
  const rootNode = document.createElement('div');
  rootNode.className = 'tree-node';
  rootNode.id = 'node-scene-root';

  const rootRow = document.createElement('div');
  const isRootCollapsed = q ? false : outlinerCollapsedNodes.has('node-scene-root');
  rootRow.className = `tree-row ${selectedOutlinerNodeId === 'scene-root' ? 'selected' : ''}`;
  rootRow.innerHTML = `
    <span class="tree-chevron ${isRootCollapsed ? 'collapsed' : ''}">▼</span>
    <span class="tree-icon">🌐</span>
    <span class="tree-label"><strong>Scene Root (OpenDMS World)</strong></span>
    <div class="tree-actions">
      <button class="tree-action-btn" title="Reset Viewport Orbit Target" data-action="focus-origin">🎯</button>
    </div>
  `;
  rootRow.addEventListener('click', (e) => {
    if (e.target.closest('.tree-chevron') || e.target.closest('.tree-action-btn')) return;
    selectedOutlinerNodeId = 'scene-root';
    renderSceneOutliner();
  });
  rootRow.querySelector('.tree-chevron')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (outlinerCollapsedNodes.has('node-scene-root')) {
      outlinerCollapsedNodes.delete('node-scene-root');
    } else {
      outlinerCollapsedNodes.add('node-scene-root');
    }
    renderSceneOutliner();
  });
  rootRow.querySelector('[data-action="focus-origin"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (controls) controls.target.set(0, 1.0, 0);
  });
  rootNode.appendChild(rootRow);

  const rootChildren = document.createElement('div');
  rootChildren.className = 'tree-children';
  if (isRootCollapsed) rootChildren.style.display = 'none';

  // 2. HERO CHARACTER SCENE OBJECT (Actor 1)
  const char1ModelName = mixamoBridge?.isVisible ? 'Mixamo X-Bot Rig' : 'Hero (Studio Mannequin)';
  const a1Matches = !q || char1ModelName.toLowerCase().includes(q) || 'hero'.includes(q) || 'actor 1'.includes(q) || 'character'.includes(q);

  if (a1Matches) {
    totalNodesCount++;
    const a1Node = document.createElement('div');
    a1Node.className = 'tree-node';
    a1Node.id = 'node-actor-1';

    const isA1Active = (timeline.activeActorId || 'actor-1') === 'actor-1';
    const a1Row = document.createElement('div');
    a1Row.className = `tree-row ${(selectedOutlinerNodeId === 'actor-1' || isA1Active) ? 'selected' : ''}`;
    a1Row.innerHTML = `
      <span class="tree-chevron hidden"></span>
      <span class="tree-icon">🧍</span>
      <span class="tree-label"><strong>Hero (Actor 1)</strong>: ${char1ModelName}</span>
      <span class="tree-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">Hero</span>
      <div class="tree-actions">
        <button class="tree-action-btn" title="Focus camera on Hero" data-action="focus-a1">🎯</button>
      </div>
    `;

    a1Row.addEventListener('click', (e) => {
      if (e.target.closest('.tree-action-btn')) return;
      selectedOutlinerNodeId = 'actor-1';
      setActiveActorUI('actor-1');
      deselectProp();
      deselectBone();
    });

    a1Row.querySelector('[data-action="focus-a1"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (controls && character && character.bodies && character.bodies['Pelvis']) {
        const p = character.bodies['Pelvis'].mesh.position;
        controls.target.set(p.x, p.y, p.z);
      }
    });

    a1Node.appendChild(a1Row);
    rootChildren.appendChild(a1Node);
  }

  // 3. ENEMY CHARACTER SCENE OBJECT (Actor 2)
  const a2Matches = !q || 'enemy'.includes(q) || 'opponent'.includes(q) || 'actor 2'.includes(q);
  if (a2Matches) {
    totalNodesCount++;
    const a2Node = document.createElement('div');
    a2Node.className = 'tree-node';
    a2Node.id = 'node-actor-2';

    const isA2Active = timeline.activeActorId === 'actor-2' && actor2Active;
    const a2Row = document.createElement('div');
    a2Row.className = `tree-row ${(selectedOutlinerNodeId === 'actor-2' || isA2Active) ? 'selected' : ''}`;
    a2Row.innerHTML = `
      <span class="tree-chevron hidden"></span>
      <span class="tree-icon">🥋</span>
      <span class="tree-label"><strong>${actor2Active ? 'Enemy / Opponent (Actor 2)' : 'Enemy (Click to Add / Spawn)'}</strong></span>
      <span class="tree-badge" style="background: rgba(251, 146, 60, 0.15); color: #fb923c;">${actor2Active ? 'Enemy' : '+ Spawn'}</span>
      ${actor2Active ? `
        <div class="tree-actions">
          <button class="tree-action-btn" title="Focus camera on Enemy" data-action="focus-a2">🎯</button>
        </div>
      ` : ''}
    `;

    a2Row.addEventListener('click', async (e) => {
      if (e.target.closest('.tree-action-btn')) return;
      selectedOutlinerNodeId = 'actor-2';
      if (!actor2Active) {
        await addActor2();
      }
      setActiveActorUI('actor-2');
      deselectProp();
      deselectBone();
    });

    a2Row.querySelector('[data-action="focus-a2"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (controls && actor2Character && actor2Character.bodies && actor2Character.bodies['Pelvis']) {
        const p = actor2Character.bodies['Pelvis'].mesh.position;
        controls.target.set(p.x, p.y, p.z);
      }
    });

    a2Node.appendChild(a2Row);
    rootChildren.appendChild(a2Node);
  }

  // 3. PROPS & SCENE OBJECTS BRANCH
  const propsList = propsManager ? propsManager.props : [];
  const propsNodeId = 'node-props-group';
  const isPropsCollapsed = q ? false : outlinerCollapsedNodes.has(propsNodeId);
  const matchingProps = propsList.filter(p => !q || p.name.toLowerCase().includes(q) || (p.shapeType && p.shapeType.toLowerCase().includes(q)));

  if (!q || matchingProps.length > 0 || 'props'.includes(q) || 'obstacles'.includes(q)) {
    totalNodesCount++;
    const propsGroupNode = document.createElement('div');
    propsGroupNode.className = 'tree-node';
    propsGroupNode.id = propsNodeId;

    const propsGroupRow = document.createElement('div');
    propsGroupRow.className = `tree-row ${selectedOutlinerNodeId === 'props-group' ? 'selected' : ''}`;
    propsGroupRow.innerHTML = `
      <span class="tree-chevron ${propsList.length > 0 ? (isPropsCollapsed ? 'collapsed' : '') : 'hidden'}">${propsList.length > 0 ? '▼' : ''}</span>
      <span class="tree-icon">📦</span>
      <span class="tree-label">Props &amp; Obstacles</span>
      <span class="tree-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">${propsList.length}</span>
    `;

    propsGroupRow.addEventListener('click', (e) => {
      if (e.target.closest('.tree-chevron')) return;
      selectedOutlinerNodeId = 'props-group';
      renderSceneOutliner();
    });

    propsGroupRow.querySelector('.tree-chevron')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (outlinerCollapsedNodes.has(propsNodeId)) {
        outlinerCollapsedNodes.delete(propsNodeId);
      } else {
        outlinerCollapsedNodes.add(propsNodeId);
      }
      renderSceneOutliner();
    });

    propsGroupNode.appendChild(propsGroupRow);

    const propsChildren = document.createElement('div');
    propsChildren.className = 'tree-children';
    if (isPropsCollapsed) propsChildren.style.display = 'none';

    if (propsList.length === 0) {
      const emptyPropsRow = document.createElement('div');
      emptyPropsRow.style.cssText = 'padding: 4px 8px; font-size: 10px; color: #64748b; font-style: italic;';
      emptyPropsRow.textContent = 'No props in scene (use Topbar Environment menu to add)';
      propsChildren.appendChild(emptyPropsRow);
    } else {
      const shapeIcons = {
        box: '🧊',
        sphere: '⚽',
        cylinder: '🥫',
        capsule: '💊',
        crate: '📦',
        step: '🪜',
        projectile: '💣',
        fluid: '🌊'
      };

      matchingProps.forEach(prop => {
        totalNodesCount++;
        const pId = `node-prop-${prop.id}`;
        const isPSelected = selectedOutlinerNodeId === `prop-${prop.id}`;
        const icon = shapeIcons[prop.shapeType] || shapeIcons[prop.type] || '📦';
        const isSim = prop.isDynamic;

        const pRow = document.createElement('div');
        pRow.className = `tree-row ${isPSelected ? 'selected' : ''}`;
        pRow.dataset.nodeType = 'prop';
        pRow.dataset.propId = prop.id;
        pRow.innerHTML = `
          <span class="tree-chevron hidden"></span>
          <span class="tree-icon">${icon}</span>
          <span class="tree-label" title="${prop.name}">${prop.name}</span>
          <span class="tree-badge ${isSim ? 'tree-badge-dynamic' : 'tree-badge-static'}" title="Click to toggle Dynamic / Static" data-action="toggle-sim-prop" data-prop="${prop.id}">
            ${isSim ? '⚡ Dynamic' : '🔒 Static'}
          </span>
          <div class="tree-actions">
            <button class="tree-action-btn" title="Toggle Visibility" data-action="vis-prop" data-prop="${prop.id}">
              ${prop.mesh?.visible !== false ? '👁️' : '🚫'}
            </button>
            <button class="tree-action-btn" title="Focus Camera on Prop" data-action="focus-prop" data-prop="${prop.id}">🎯</button>
            <button class="tree-action-btn btn-del" title="Delete Prop" data-action="delete-prop" data-prop="${prop.id}">&times;</button>
          </div>
        `;

        pRow.addEventListener('click', (e) => {
          if (e.target.closest('.tree-action-btn') || e.target.closest('.tree-badge')) return;
          selectProp(prop.id);
        });

        pRow.querySelector('[data-action="toggle-sim-prop"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          prop.isDynamic = !prop.isDynamic;
          propsManager.setPropDynamic(prop.id, prop.isDynamic);
          timeline.invalidateSimulation();
          renderPropInspector();
          renderSceneOutliner();
          updateSimulationStatusUI();
        });

        pRow.querySelector('[data-action="vis-prop"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (prop.mesh) {
            prop.mesh.visible = !prop.mesh.visible;
          }
          renderSceneOutliner();
        });

        pRow.querySelector('[data-action="focus-prop"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          selectProp(prop.id);
          if (controls && prop.mesh) {
            controls.target.set(prop.mesh.position.x, prop.mesh.position.y, prop.mesh.position.z);
          }
        });

        pRow.querySelector('[data-action="delete-prop"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          propsManager.removeProp(prop.id);
          deselectProp();
          timeline.invalidateSimulation();
          renderSceneOutliner();
          updateSimulationStatusUI();
        });

        propsChildren.appendChild(pRow);
      });
    }

    propsGroupNode.appendChild(propsChildren);
    rootChildren.appendChild(propsGroupNode);
  }

  // 4. ENVIRONMENT & LIGHTS BRANCH
  const envNodeId = 'node-env-group';
  const isEnvCollapsed = q ? false : outlinerCollapsedNodes.has(envNodeId);
  const envMatches = !q || 'environment'.includes(q) || 'light'.includes(q) || 'ground'.includes(q) || 'grid'.includes(q);

  if (envMatches) {
    totalNodesCount++;
    const envGroupNode = document.createElement('div');
    envGroupNode.className = 'tree-node';
    envGroupNode.id = envNodeId;

    const envGroupRow = document.createElement('div');
    envGroupRow.className = `tree-row ${selectedOutlinerNodeId === 'env-group' ? 'selected' : ''}`;
    envGroupRow.innerHTML = `
      <span class="tree-chevron ${isEnvCollapsed ? 'collapsed' : ''}">▼</span>
      <span class="tree-icon">💡</span>
      <span class="tree-label">Environment &amp; Lights</span>
      <span class="tree-badge" style="background: rgba(148, 163, 184, 0.12); color: #94a3b8;">3</span>
    `;

    envGroupRow.addEventListener('click', (e) => {
      if (e.target.closest('.tree-chevron')) return;
      selectedOutlinerNodeId = 'env-group';
      renderSceneOutliner();
    });

    envGroupRow.querySelector('.tree-chevron')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (outlinerCollapsedNodes.has(envNodeId)) {
        outlinerCollapsedNodes.delete(envNodeId);
      } else {
        outlinerCollapsedNodes.add(envNodeId);
      }
      renderSceneOutliner();
    });

    envGroupNode.appendChild(envGroupRow);

    const envChildren = document.createElement('div');
    envChildren.className = 'tree-children';
    if (isEnvCollapsed) envChildren.style.display = 'none';

    // Sunlight
    const sunRow = document.createElement('div');
    sunRow.className = 'tree-row';
    sunRow.innerHTML = `
      <span class="tree-chevron hidden"></span>
      <span class="tree-icon">☀️</span>
      <span class="tree-label">Directional Sun Light</span>
      <div class="tree-actions">
        <button class="tree-action-btn" title="Toggle Sun Light" data-action="toggle-sun">
          ${dirLight?.visible !== false ? '👁️' : '🚫'}
        </button>
      </div>
    `;
    sunRow.querySelector('[data-action="toggle-sun"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dirLight) dirLight.visible = !dirLight.visible;
      renderSceneOutliner();
    });
    envChildren.appendChild(sunRow);

    // Ambient Sky
    const skyRow = document.createElement('div');
    skyRow.className = 'tree-row';
    skyRow.innerHTML = `
      <span class="tree-chevron hidden"></span>
      <span class="tree-icon">🌐</span>
      <span class="tree-label">Hemisphere Sky Light</span>
      <div class="tree-actions">
        <button class="tree-action-btn" title="Toggle Sky Light" data-action="toggle-sky">
          ${hemiLight?.visible !== false ? '👁️' : '🚫'}
        </button>
      </div>
    `;
    skyRow.querySelector('[data-action="toggle-sky"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hemiLight) hemiLight.visible = !hemiLight.visible;
      renderSceneOutliner();
    });
    envChildren.appendChild(skyRow);

    // Floor Grid
    const floorRow = document.createElement('div');
    floorRow.className = 'tree-row';
    floorRow.innerHTML = `
      <span class="tree-chevron hidden"></span>
      <span class="tree-icon">🏁</span>
      <span class="tree-label">Ground Grid &amp; Plane</span>
      <div class="tree-actions">
        <button class="tree-action-btn" title="Toggle Ground Grid" data-action="toggle-grid">
          ${gridHelper?.visible !== false ? '👁️' : '🚫'}
        </button>
      </div>
    `;
    floorRow.querySelector('[data-action="toggle-grid"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gridHelper) gridHelper.visible = !gridHelper.visible;
      if (groundMesh) groundMesh.visible = gridHelper ? gridHelper.visible : true;
      renderSceneOutliner();
    });
    envChildren.appendChild(floorRow);

    envGroupNode.appendChild(envChildren);
    rootChildren.appendChild(envGroupNode);
  }

  rootNode.appendChild(rootChildren);
  container.appendChild(rootNode);

  const countBadge = document.getElementById('outliner-item-count');
  if (countBadge) {
    countBadge.textContent = totalNodesCount;
  }
}

// --- VIEWPORT FLOATING SKELETON TREE HUD OVERLAY ---
function renderViewportBoneTree() {
  const container = document.getElementById('hud-bone-tree-container');
  if (!container) return;

  const q = hudBoneSearchQuery.toLowerCase();
  let totalBonesCount = 0;

  function boneMatchesHudQuery(node) {
    if (!q) return true;
    if (node.name.toLowerCase().includes(q) || (node.role && node.role.toLowerCase().includes(q))) {
      return true;
    }
    if (node.children) {
      return node.children.some(child => boneMatchesHudQuery(child));
    }
    return false;
  }

  function buildHudBoneNode(nodeDef) {
    if (q && !boneMatchesHudQuery(nodeDef)) {
      return null;
    }

    totalBonesCount++;
    const nodeId = `hud-bone-${nodeDef.name}`;
    const hasChildren = nodeDef.children && nodeDef.children.length > 0;
    const isCollapsed = q ? false : hudCollapsedNodes.has(nodeId);
    const isSelected = selectedTargetBone === nodeDef.name;

    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    nodeEl.id = nodeId;

    const rowEl = document.createElement('div');
    rowEl.className = `tree-row ${isSelected ? 'selected' : ''}`;
    rowEl.dataset.nodeType = 'hud-bone';
    rowEl.dataset.boneName = nodeDef.name;

    rowEl.innerHTML = `
      <span class="tree-chevron ${hasChildren ? (isCollapsed ? 'collapsed' : '') : 'hidden'}">${hasChildren ? '▼' : ''}</span>
      <span class="tree-icon" style="font-size: 11px;">🦴</span>
      <span class="tree-label" title="${nodeDef.name} (${nodeDef.role})" style="font-size: 10.5px;">${nodeDef.label || nodeDef.name}</span>
      <span class="tree-badge" style="background: rgba(148, 163, 184, 0.12); color: #94a3b8; font-size: 8px; padding: 1px 4px;" title="${nodeDef.role}">${nodeDef.role}</span>
      <div class="tree-actions">
        <button class="tree-action-btn" title="Focus camera on bone" data-action="hud-focus-bone" data-bone="${nodeDef.name}" style="font-size: 9px;">🎯</button>
      </div>
    `;

    rowEl.addEventListener('click', (e) => {
      if (e.target.closest('.tree-chevron') || e.target.closest('.tree-action-btn')) return;
      selectBone(nodeDef.name);
    });

    const chevronEl = rowEl.querySelector('.tree-chevron');
    if (hasChildren && chevronEl) {
      chevronEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hudCollapsedNodes.has(nodeId)) {
          hudCollapsedNodes.delete(nodeId);
        } else {
          hudCollapsedNodes.add(nodeId);
        }
        renderViewportBoneTree();
      });
    }

    const focusBtn = rowEl.querySelector('[data-action="hud-focus-bone"]');
    if (focusBtn) {
      focusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBone(nodeDef.name);
        if (controls && character?.bodies[nodeDef.name]?.mesh) {
          const p = character.bodies[nodeDef.name].mesh.position;
          controls.target.set(p.x, p.y, p.z);
        }
      });
    }

    nodeEl.appendChild(rowEl);

    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.marginLeft = '8px';
      childrenContainer.style.paddingLeft = '4px';
      if (isCollapsed) {
        childrenContainer.style.display = 'none';
      }
      nodeDef.children.forEach(child => {
        const childEl = buildHudBoneNode(child);
        if (childEl) childrenContainer.appendChild(childEl);
      });
      nodeEl.appendChild(childrenContainer);
    }

    return nodeEl;
  }

  container.innerHTML = '';
  const rootNodeEl = buildHudBoneNode(SKELETON_HIERARCHY);
  if (rootNodeEl) {
    container.appendChild(rootNodeEl);
  } else {
    container.innerHTML = `<div style="padding: 10px; font-size: 10px; color: #64748b; text-align: center; font-style: italic;">No bones match "${hudBoneSearchQuery}"</div>`;
  }

  const countBadge = document.getElementById('hud-bone-count');
  if (countBadge) {
    countBadge.textContent = totalBonesCount;
  }
}

function setSceneDuration(newTotalFrames) {
  const frames = Math.max(30, Math.min(3600, Math.round(newTotalFrames)));
  timeline.totalFrames = frames;
  if (timeline.currentFrame > frames) {
    timeline.currentFrame = frames;
  }

  const elTotalFrames = document.getElementById('tel-total-frames');
  const inpDuration = document.getElementById('input-scene-duration');
  const secDuration = document.getElementById('scene-duration-sec');
  const slider = document.getElementById('timeline-slider');

  if (elTotalFrames) elTotalFrames.textContent = frames;
  if (inpDuration) inpDuration.value = frames;
  if (secDuration) secDuration.textContent = `(${(frames / 60).toFixed(1)}s)`;
  if (slider) slider.max = frames;

  timeline.invalidateSimulation();
  renderTimelineRuler();
  renderTimelineLayers();
  renderLayerInspector();
  updateTimelineUI();
  updateSimulationStatusUI();
}

function renderTimelineRuler() {
  const trackEl = document.getElementById('timeline-ruler-track');
  if (!trackEl) return;
  trackEl.innerHTML = '';

  // Green simulation cache bar at the bottom of the ruler
  const cacheBar = document.createElement('div');
  cacheBar.id = 'timeline-ruler-cache-bar';
  cacheBar.className = 'timeline-ruler-cache-bar';
  trackEl.appendChild(cacheBar);

  const total = timeline.totalFrames;
  let step = 30;
  if (total <= 120) step = 15;
  else if (total <= 300) step = 30;
  else if (total <= 600) step = 60;
  else if (total <= 1200) step = 120;
  else step = 240;

  for (let f = 0; f <= total; f += step) {
    const pct = (f / total) * 100;
    const span = document.createElement('span');
    span.className = 'ruler-tick-label';
    span.style.left = `${pct}%`;
    if (f === 0) {
      span.style.transform = 'translateX(2px)';
    } else if (f >= total - (step * 0.4)) {
      span.style.transform = 'translateX(-100%)';
    }
    span.textContent = `${f}f`;
    trackEl.appendChild(span);
  }

  updateSimulatedShadeUI();
}
const buildRulerTicks = renderTimelineRuler;
window.buildRulerTicks = renderTimelineRuler;

// Render interactive After Effects / Endorphin style draggable layer tracks
function renderTimelineLayers() {
  const container = document.getElementById('layers-container');
  container.innerHTML = '';

  if (timeline.layers.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: rgba(15, 23, 42, 0.4); border-radius: 6px; margin: 8px;">
        <span style="font-size: 18px; display: block; margin-bottom: 4px;">🍂</span>
        <em>Empty Timeline (Endorphin Base State): Character simulates as a pure <strong>Passive Biomechanical Ragdoll</strong>.<br>
        Click <strong>"▶ Simulate &amp; Play"</strong> to drop naturally from T-Pose, or add Behaviours, Animations, or Force Events.</em>
      </div>
    `;
    return;
  }

  // Filter layers based on active timeline character filter
  const indexedLayers = timeline.layers.map((layer, idx) => ({ layer, idx }));
  const visibleLayers = indexedLayers.filter(({ layer }) => {
    if (timelineActorFilter === 'actor-1') return (layer.actorId || 'actor-1') === 'actor-1';
    if (timelineActorFilter === 'actor-2') return layer.actorId === 'actor-2';
    return true;
  });

  if (visibleLayers.length === 0) {
    const isFilteredA2 = timelineActorFilter === 'actor-2';
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 11px; background: rgba(15, 23, 42, 0.3); border-radius: 6px; margin: 8px;">
        <em>No tracks currently assigned to <strong>${isFilteredA2 ? 'Enemy (Actor 2)' : 'Hero (Actor 1)'}</strong>.<br>
        Add behaviours from the Left Panel or switch the Target Character in any layer's Inspector.</em>
      </div>
    `;
    return;
  }

  visibleLayers.forEach(({ layer, idx }) => {
    const isSelected = timeline.selectedLayerId === layer.id;

    const row = document.createElement('div');
    row.className = `layer-row ${isSelected ? 'selected' : ''}`;
    row.dataset.index = idx;
    row.dataset.layerId = layer.id;

    const header = document.createElement('div');
    header.className = 'layer-header';
    const actorId = layer.actorId || 'actor-1';
    const isA2 = actorId === 'actor-2';
    const actorBadgeHtml = `<span class="actor-badge ${isA2 ? 'actor-badge-a2' : 'actor-badge-a1'}" title="Assigned to ${isA2 ? 'Enemy (Actor 2)' : 'Hero (Actor 1)'}. Click to switch character.">${isA2 ? '🥋 Enemy' : '🧍 Hero'}</span>`;
    header.innerHTML = `
      <div class="layer-reorder-btns">
        <button class="btn-arrow btn-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-arrow btn-down" data-idx="${idx}" ${idx === timeline.layers.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <span class="layer-dot" style="background: ${layer.color}"></span>
      <span class="layer-name" title="${layer.name} (Double-click to rename)" style="${!layer.enabled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${layer.name}</span>
      ${actorBadgeHtml}
      ${(layer.triggerType && layer.triggerType !== 'frame') ? `<span class="trigger-badge" title="Event-Driven Reactive Trigger: ${layer.triggerType} (Threshold: ${layer.triggerThreshold})">⚡ ${layer.triggerType.slice(0, 4).toUpperCase()}</span>` : ''}
      ${(layer.grabTarget && layer.grabTarget !== 'none') ? `<span class="grab-badge" title="2-Way Mutual Grab Coupling to ${layer.grabTarget}">🤝 GRAB</span>` : ''}
      <button class="layer-del-btn" data-id="${layer.id}">&times;</button>
    `;

    // Click actor badge to toggle track character assignment
    header.querySelector('.actor-badge')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nextActor = (layer.actorId === 'actor-2') ? 'actor-1' : 'actor-2';
      if (nextActor === 'actor-2' && !actor2Active) {
        await addActor2();
      }
      historyManager.pushState(`Reassign track to ${nextActor === 'actor-2' ? 'Enemy' : 'Hero'}`);
      layer.actorId = nextActor;
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`Track reassigned to ${nextActor === 'actor-2' ? 'Actor 2 (Enemy)' : 'Actor 1 (Hero)'}`, 'info');
    });

    // Double click to rename track directly
    header.querySelector('.layer-name')?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const currentName = layer.name;
      const newName = prompt('Rename timeline track:', currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        historyManager.pushState(`Rename track to ${newName.trim()}`);
        layer.name = newName.trim();
        renderTimelineLayers();
        renderLayerInspector();
      }
    });

    const trackArea = document.createElement('div');
    trackArea.className = 'layer-track-area';

    const bar = document.createElement('div');
    bar.className = 'layer-bar';
    bar.innerHTML = `
      <div class="bar-resize-handle left-handle" title="Drag left edge to adjust Start Frame" data-layer="${layer.id}"></div>
      <span class="bar-label"></span>
      <div class="bar-resize-handle right-handle" title="Drag right edge to adjust End Frame" data-layer="${layer.id}"></div>
    `;
    applyBarVisualStyles(bar, layer);

    // Render interactive Keyframe Diamonds for Active Pose Tracks
    if (layer.animType === 'pose' && layer.keyframes && layer.keyframes.length > 0) {
      const dur = Math.max(1, layer.endFrame - layer.startFrame);
      for (const kf of layer.keyframes) {
        const kfRel = (kf.frame - layer.startFrame) / dur;
        if (kfRel >= 0 && kfRel <= 1) {
          const diamond = document.createElement('div');
          diamond.className = 'keyframe-diamond';
          diamond.style.left = `${(kfRel * 100).toFixed(2)}%`;
          diamond.title = `Pose Keyframe @ Frame ${kf.frame} (Click to Seek)`;
          diamond.addEventListener('mousedown', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            scrubToFrame(kf.frame);
          });
          bar.appendChild(diamond);
        }
      }
    }

    // Clicking header selects the layer
    header.addEventListener('click', () => {
      deselectProp();
      timeline.selectedLayerId = layer.id;
      document.querySelectorAll('.layer-row').forEach(r => r.classList.toggle('selected', r.dataset.layerId === layer.id));
      renderLayerInspector();
    });

    // Clicking empty track area scrubs playhead to that frame & selects track
    trackArea.addEventListener('mousedown', (e) => {
      if (e.target !== trackArea) return;
      deselectProp();
      timeline.selectedLayerId = layer.id;
      document.querySelectorAll('.layer-row').forEach(r => r.classList.toggle('selected', r.dataset.layerId === layer.id));
      renderLayerInspector();

      const scrubFromMouse = (ev) => {
        const rect = trackArea.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = THREE.MathUtils.clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        scrubToFrame(ratio * timeline.totalFrames);
      };
      scrubFromMouse(e);

      const onMove = (ev) => scrubFromMouse(ev);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    setupBarDraggability(bar, layer, trackArea, row);

    trackArea.appendChild(bar);
    row.appendChild(header);
    row.appendChild(trackArea);
    container.appendChild(row);

    header.querySelector('.btn-up').addEventListener('click', (e) => {
      e.stopPropagation();
      timeline.moveLayer(idx, idx - 1);
      renderTimelineLayers();
      updateSimulationStatusUI();
    });

    header.querySelector('.btn-down').addEventListener('click', (e) => {
      e.stopPropagation();
      timeline.moveLayer(idx, idx + 1);
      renderTimelineLayers();
      updateSimulationStatusUI();
    });

    header.querySelector('.layer-del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      timeline.removeLayer(layer.id);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    });
  });
}

// High-precision 60fps in-place horizontal dragging and edge trimming for Timeline Bars
function setupBarDraggability(barEl, layer, trackAreaEl, rowEl) {
  barEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    // Select layer without destroying DOM nodes
    deselectProp();
    timeline.selectedLayerId = layer.id;
    document.querySelectorAll('.layer-row').forEach(r => r.classList.toggle('selected', r === rowEl));
    renderLayerInspector();

    const startX = e.clientX;
    const origStart = layer.startFrame;
    const origEnd = layer.endFrame;
    const isResizingLeft = e.target.classList.contains('left-handle');
    const isResizingRight = e.target.classList.contains('right-handle');
    const isDraggingBar = !isResizingLeft && !isResizingRight;

    const preDragSnap = historyManager.captureState('Move/Resize Track');
    barEl.classList.add('dragging');

    const onMouseMove = (moveEvent) => {
      const rect = trackAreaEl.getBoundingClientRect();
      const trackWidth = Math.max(80, rect.width);
      const dx = moveEvent.clientX - startX;
      const dFrames = Math.round((dx / trackWidth) * timeline.totalFrames);

      if (isDraggingBar) {
        const duration = origEnd - origStart;
        const newStart = THREE.MathUtils.clamp(origStart + dFrames, 0, timeline.totalFrames - duration);
        const newEnd = newStart + duration;
        timeline.updateLayerTiming(layer.id, newStart, newEnd);
      } else if (isResizingRight) {
        const newEnd = THREE.MathUtils.clamp(origEnd + dFrames, origStart + 2, timeline.totalFrames);
        timeline.updateLayerTiming(layer.id, origStart, newEnd);
      } else if (isResizingLeft) {
        const newStart = THREE.MathUtils.clamp(origStart + dFrames, 0, origEnd - 2);
        timeline.updateLayerTiming(layer.id, newStart, origEnd);
      }

      // Update bar position, width & label in-place at 60fps
      applyBarVisualStyles(barEl, layer);

      // Live-update Inspector numeric fields without rebuilding Inspector DOM
      const inpStart = document.getElementById('insp-start');
      const inpEnd = document.getElementById('insp-end');
      const inpDur = document.getElementById('insp-duration');
      if (inpStart) inpStart.value = layer.startFrame;
      if (inpEnd) inpEnd.value = layer.endFrame;
      if (inpDur) inpDur.value = layer.endFrame - layer.startFrame;

      // Preview animation pose if scrubbing/moving an animation track in Authoring Mode
      if (!timeline.isSimulated) {
        timeline.seek(timeline.currentFrame);
        if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      }
      updateSimulationStatusUI();
    };

    const onMouseUp = () => {
      barEl.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (preDragSnap && (layer.startFrame !== origStart || layer.endFrame !== origEnd)) {
        historyManager.undoStack.push(preDragSnap);
        if (historyManager.undoStack.length > historyManager.maxSteps) historyManager.undoStack.shift();
        historyManager.redoStack = [];
        historyManager.updateUI();
      }
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

function updateSimulationStatusUI() {
  const statusEl = document.getElementById('sim-status-badge');
  const btnPlay = document.getElementById('btn-play');
  const btnStopSim = document.getElementById('btn-stop-sim');
  const btnResimHeader = document.getElementById('btn-resim-header');

  const cachedCount = Array.isArray(timeline.simulationCache) ? timeline.simulationCache.length : 0;

  if (timeline.isBakingLive) {
    if (statusEl) {
      statusEl.textContent = `SIMULATING... (${timeline.currentFrame}/${timeline.totalFrames}f)`;
      statusEl.className = 'status-badge status-rendering';
    }
    if (btnPlay) {
      btnPlay.textContent = '❚❚ Pause Sim';
      btnPlay.classList.add('btn-simulate');
    }
    if (btnStopSim) btnStopSim.style.display = 'inline-flex';
    if (btnResimHeader) btnResimHeader.style.display = 'none';
  } else if (cachedCount > 0) {
    const isFull = cachedCount >= timeline.totalFrames;
    if (statusEl) {
      statusEl.textContent = isFull ? 'SIMULATION BAKED (REVIEW MODE)' : `PARTIAL SIMULATION (0 - ${cachedCount}f)`;
      statusEl.className = 'status-badge status-baked';
    }
    if (btnPlay) {
      btnPlay.textContent = timeline.isPlaying ? '❚❚ Pause' : '▶ Play';
      btnPlay.classList.remove('btn-simulate');
    }
    if (btnStopSim) btnStopSim.style.display = 'none';
    if (btnResimHeader) btnResimHeader.style.display = 'inline-flex';
  } else {
    if (statusEl) {
      statusEl.textContent = 'AUTHORING MODE (T-POSE PREVIEW)';
      statusEl.className = 'status-badge status-authoring';
    }
    if (btnPlay) {
      btnPlay.textContent = '▶ Simulate & Play';
      btnPlay.classList.add('btn-simulate');
      btnPlay.disabled = false;
    }
    if (btnStopSim) btnStopSim.style.display = 'none';
    if (btnResimHeader) btnResimHeader.style.display = 'none';
    clearBoneTrajectory();
  }
}

function updateModelUI() {
  if (!mixamoBridge) return;
  const isVisible = mixamoBridge.isVisible && mixamoBridge.isLoaded;
  const isMixamo = isVisible && currentModelType === 'mixamo';
  const isSam = isVisible && currentModelType === 'sam';
  const isMannequin = !isVisible || currentModelType === 'mannequin';

  const btnModelMixamo = document.getElementById('btn-model-mixamo');
  const btnModelSam = document.getElementById('btn-model-sam');
  const btnModelMannequin = document.getElementById('btn-model-mannequin');

  if (btnModelMixamo) {
    btnModelMixamo.style.borderColor = isMixamo ? '#38bdf8' : '#334155';
    btnModelMixamo.style.color = isMixamo ? '#38bdf8' : '#94a3b8';
    btnModelMixamo.style.background = isMixamo ? 'rgba(56, 189, 248, 0.1)' : '#1e293b';
  }
  if (btnModelSam) {
    btnModelSam.style.borderColor = isSam ? '#38bdf8' : '#334155';
    btnModelSam.style.color = isSam ? '#38bdf8' : '#94a3b8';
    btnModelSam.style.background = isSam ? 'rgba(56, 189, 248, 0.1)' : '#1e293b';
  }
  if (btnModelMannequin) {
    btnModelMannequin.style.borderColor = isMannequin ? '#38bdf8' : '#334155';
    btnModelMannequin.style.color = isMannequin ? '#38bdf8' : '#94a3b8';
    btnModelMannequin.style.background = isMannequin ? 'rgba(56, 189, 248, 0.1)' : '#1e293b';
  }

  // Update Rig Diagnostics Badge & Summary
  const badgeEl = document.getElementById('rig-status-badge');
  const summaryEl = document.getElementById('rig-diag-summary');
  const diag = mixamoBridge.rigDiagnostics;

  if (badgeEl) {
    if (mixamoBridge.isLoaded) {
      const isComplete = diag.mappedSegmentsCount >= 13;
      badgeEl.textContent = `${diag.mappedSegmentsCount}/15 Bones`;
      badgeEl.style.color = isComplete ? '#34d399' : '#fbbf24';
      badgeEl.style.borderColor = isComplete ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';
      badgeEl.style.background = isComplete ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)';
    } else {
      badgeEl.textContent = 'Mannequin';
      badgeEl.style.color = '#94a3b8';
      badgeEl.style.borderColor = '#334155';
      badgeEl.style.background = '#0f172a';
    }
  }

  if (summaryEl) {
    if (mixamoBridge.isLoaded) {
      summaryEl.innerHTML = `
        Active Rig: <strong style="color: #e2e8f0;">${diag.modelName}</strong> &bull;
        <span style="color: #38bdf8;">${diag.detectedPose}</span><br>
        <span style="color: #64748b;">${diag.totalBones} bones total &bull; ${diag.skinnedMeshCount} mesh(es)</span>
      `;
    } else {
      summaryEl.innerHTML = `Active Rig: <strong style="color: #e2e8f0;">Studio Biomechanical Mannequin</strong> (15 Segments)`;
    }
  }

  // Sync calibration UI controls to bridge values
  const cal = mixamoBridge.calibration;
  const chkAutoTPose = document.getElementById('cal-auto-tpose');
  const chkAutoGroundClamp = document.getElementById('cal-auto-ground-clamp');
  const inpSpread = document.getElementById('cal-arm-spread');
  const valSpread = document.getElementById('cal-arm-spread-val');
  const inpThighSpread = document.getElementById('cal-thigh-spread');
  const valThighSpread = document.getElementById('cal-thigh-spread-val');
  const inpFootSole = document.getElementById('cal-foot-sole-offset');
  const valFootSole = document.getElementById('cal-foot-sole-val');
  const inpBodyGirth = document.getElementById('cal-body-girth');
  const valBodyGirth = document.getElementById('cal-body-girth-val');
  const inpScale = document.getElementById('cal-scale-mult');
  const valScale = document.getElementById('cal-scale-mult-val');
  const inpGround = document.getElementById('cal-ground-y');
  const valGround = document.getElementById('cal-ground-y-val');
  const inpYaw = document.getElementById('cal-yaw-offset');
  const valYaw = document.getElementById('cal-yaw-offset-val');

  if (chkAutoTPose) chkAutoTPose.checked = Boolean(cal.autoAlignTPose);
  if (chkAutoGroundClamp) chkAutoGroundClamp.checked = cal.autoGroundClamp !== false;
  if (inpSpread) inpSpread.value = cal.armSpreadOffsetDeg || 0;
  if (valSpread) valSpread.textContent = `${Math.round(cal.armSpreadOffsetDeg || 0)}°`;
  if (inpThighSpread) inpThighSpread.value = cal.thighClearanceDeg || 0;
  if (valThighSpread) valThighSpread.textContent = `${Math.round(cal.thighClearanceDeg || 0)}°`;
  if (inpFootSole) inpFootSole.value = cal.footSoleOffset ?? 0.04;
  if (valFootSole) valFootSole.textContent = `${(cal.footSoleOffset ?? 0.04).toFixed(2)} m`;
  if (inpBodyGirth) inpBodyGirth.value = cal.bodyGirthMultiplier || 1.0;
  if (valBodyGirth) valBodyGirth.textContent = `${(cal.bodyGirthMultiplier || 1.0).toFixed(2)}x`;
  if (inpScale) inpScale.value = cal.scaleMultiplier || 1.0;
  if (valScale) valScale.textContent = `${(cal.scaleMultiplier || 1.0).toFixed(2)}x`;
  if (inpGround) inpGround.value = cal.groundOffsetY || 0.0;
  if (valGround) valGround.textContent = `${(cal.groundOffsetY || 0.0).toFixed(2)} m`;
  if (inpYaw) inpYaw.value = cal.yawOffsetDeg || 0;
  if (valYaw) valYaw.textContent = `${Math.round(cal.yawOffsetDeg || 0)}°`;

  renderSceneOutliner();
}

function setupUI() {
  const btnPlay = document.getElementById('btn-play');

  // Helper: Close all topbar menus and flyout portals
  const closeAllMenus = () => {
    document.querySelectorAll('.dcc-menu-item.open').forEach(el => el.classList.remove('open'));
    const portal = document.getElementById('behavior-flyout-portal');
    if (portal) portal.style.display = 'none';
    document.querySelectorAll('.cascade-category-item.active').forEach(el => el.classList.remove('active'));
  };

  // --- 1. VIEWPORT TOOLTIP MINIMIZE & CLOSE BUTTONS ---
  const tooltipEl = document.getElementById('viewport-tooltip');
  const tooltipBody = document.getElementById('viewport-tooltip-body');
  const btnMinTooltip = document.getElementById('btn-min-tooltip');
  const btnCloseTooltip = document.getElementById('btn-close-tooltip');

  if (btnMinTooltip && tooltipBody) {
    let isMinimized = false;
    btnMinTooltip.addEventListener('click', () => {
      isMinimized = !isMinimized;
      tooltipBody.style.display = isMinimized ? 'none' : 'block';
      btnMinTooltip.innerHTML = isMinimized ? '&#43;' : '&minus;';
    });
  }
  if (btnCloseTooltip && tooltipEl) {
    btnCloseTooltip.addEventListener('click', () => {
      tooltipEl.style.display = 'none';
    });
  }

  const btnCloseInspector = document.getElementById('btn-close-inspector');
  if (btnCloseInspector) {
    btnCloseInspector.addEventListener('click', () => {
      timeline.selectedLayerId = null;
      renderTimelineLayers();
      renderLayerInspector();
    });
  }

  // --- LEFT PANEL SUB-TAB CONTROLS ---
  document.getElementById('tab-btn-behaviors')?.addEventListener('click', () => switchLeftPanelTab('behaviors'));
  document.getElementById('tab-btn-staging')?.addEventListener('click', () => switchLeftPanelTab('staging'));
  document.getElementById('tab-btn-props')?.addEventListener('click', () => switchLeftPanelTab('props'));
  document.getElementById('tab-btn-outliner')?.addEventListener('click', () => switchLeftPanelTab('outliner'));
  document.getElementById('tab-btn-library')?.addEventListener('click', () => switchLeftPanelTab('behaviors'));

  // --- RIGHT PANEL INSPECTOR CONTEXT SWITCH CONTROLS ---
  document.getElementById('subtab-btn-track')?.addEventListener('click', () => switchRightPanelContext('track'));
  document.getElementById('subtab-btn-character')?.addEventListener('click', () => switchRightPanelContext('character'));

  // --- ACCORDION CARD COLLAPSIBLE HEADERS ---
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.accordion-card');
      if (card) card.classList.toggle('collapsed');
    });
  });

  // --- REAL-TIME BEHAVIORS SEARCH FILTER ---
  document.getElementById('behavior-search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const container = document.getElementById('panel-body-behaviors');
    if (!container) return;
    container.querySelectorAll('.control-group, .timeline-event-palette .palette-btn').forEach(el => {
      // Don't hide the search bar itself
      if (el.contains(e.target)) return;
      if (!q) {
        el.style.display = '';
      } else {
        const text = el.innerText.toLowerCase();
        el.style.display = text.includes(q) ? '' : 'none';
      }
    });
  });

  // Initialize Right Inspector Empty Card state
  updateEmptyTrackInspectorState();

  // --- SCENE OUTLINER CONTROLS ---
  document.getElementById('outliner-search-input')?.addEventListener('input', (e) => {
    outlinerSearchQuery = e.target.value.trim().toLowerCase();
    renderSceneOutliner();
  });

  document.getElementById('outliner-expand-all')?.addEventListener('click', () => {
    outlinerCollapsedNodes.clear();
    renderSceneOutliner();
  });

  document.getElementById('outliner-collapse-all')?.addEventListener('click', () => {
    outlinerCollapsedNodes.add('node-scene-root');
    outlinerCollapsedNodes.add('node-props-group');
    outlinerCollapsedNodes.add('node-env-group');
    renderSceneOutliner();
  });

  document.getElementById('outliner-focus-selected')?.addEventListener('click', () => {
    if (selectedTargetBone && character?.bodies[selectedTargetBone]?.mesh) {
      const p = character.bodies[selectedTargetBone].mesh.position;
      controls.target.set(p.x, p.y, p.z);
    } else if (selectedPropId) {
      const p = propsManager?.props.find(pr => pr.id === selectedPropId);
      if (p?.mesh) controls.target.set(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
    } else if (charGizmoAnchor) {
      controls.target.set(charGizmoAnchor.position.x, charGizmoAnchor.position.y, charGizmoAnchor.position.z);
    }
  });

  document.getElementById('btn-close-bone-inspector')?.addEventListener('click', () => {
    deselectBone();
  });

  // --- SCENE DURATION CONTROLS ---
  const inputDuration = document.getElementById('input-scene-duration');
  if (inputDuration) {
    inputDuration.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) setSceneDuration(val);
    });
  }

  document.querySelectorAll('[data-duration-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.durationPreset);
      if (!isNaN(val)) setSceneDuration(val);
      closeAllMenus();
    });
  });

  document.getElementById('menu-custom-duration')?.addEventListener('click', () => {
    closeAllMenus();
    const current = timeline.totalFrames;
    const input = prompt(`Enter custom scene duration in frames (30 - 3600 frames at 60fps):`, current);
    if (input !== null) {
      const val = parseInt(input);
      if (!isNaN(val) && val >= 30 && val <= 3600) {
        setSceneDuration(val);
      } else {
        alert('Please enter a valid frame count between 30 and 3600.');
      }
    }
  });

  document.getElementById('menu-view-outliner')?.addEventListener('click', () => {
    switchLeftPanelTab('outliner');
    closeAllMenus();
  });

  document.getElementById('menu-view-library')?.addEventListener('click', () => {
    switchLeftPanelTab('library');
    closeAllMenus();
  });

  // --- VIEWPORT FLOATING SKELETON TREE HUD CONTROLS ---
  const hudOverlay = document.getElementById('viewport-bone-tree');
  const btnHudMin = document.getElementById('btn-hud-bone-min');

  const toggleHudMin = () => {
    isHudBoneTreeMinimized = !isHudBoneTreeMinimized;
    if (hudOverlay) {
      hudOverlay.classList.toggle('minimized', isHudBoneTreeMinimized);
    }
    if (btnHudMin) {
      btnHudMin.innerHTML = isHudBoneTreeMinimized ? '&#43;' : '&minus;';
      btnHudMin.title = isHudBoneTreeMinimized ? 'Expand Skeleton Tree' : 'Minimize Skeleton Tree';
    }
  };

  btnHudMin?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHudMin();
  });

  document.getElementById('bone-tree-header')?.addEventListener('click', (e) => {
    if (e.target.closest('.bone-tree-btn-mini')) return;
    toggleHudMin();
  });

  document.getElementById('btn-hud-bone-focus')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (controls && charGizmoAnchor) {
      controls.target.set(charGizmoAnchor.position.x, charGizmoAnchor.position.y, charGizmoAnchor.position.z);
    }
  });

  document.getElementById('hud-bone-search')?.addEventListener('input', (e) => {
    hudBoneSearchQuery = e.target.value.trim().toLowerCase();
    renderViewportBoneTree();
  });

  document.getElementById('hud-bone-expand-all')?.addEventListener('click', () => {
    hudCollapsedNodes.clear();
    renderViewportBoneTree();
  });

  document.getElementById('hud-bone-collapse-all')?.addEventListener('click', () => {
    const addAllBoneIds = (node) => {
      if (node.children && node.children.length > 0) {
        hudCollapsedNodes.add(`hud-bone-${node.name}`);
        node.children.forEach(addAllBoneIds);
      }
    };
    addAllBoneIds(SKELETON_HIERARCHY);
    renderViewportBoneTree();
  });

  document.getElementById('hud-bone-reset-tpose')?.addEventListener('click', () => {
    document.getElementById('btn-reset-tpose')?.click();
  });

  document.getElementById('menu-toggle-viewport-bone-tree')?.addEventListener('click', () => {
    if (hudOverlay) {
      if (hudOverlay.style.display === 'none') {
        hudOverlay.style.display = 'flex';
      } else if (isHudBoneTreeMinimized) {
        toggleHudMin();
      } else {
        hudOverlay.style.display = 'none';
      }
    }
    closeAllMenus();
  });

  // --- 2. CHARACTER X/Y/Z VIEWPORT AXIS MOVEMENT CONTROLS ---
  const btnToggleMoveGizmo = document.getElementById('btn-toggle-move-gizmo');
  if (btnToggleMoveGizmo) {
    btnToggleMoveGizmo.addEventListener('click', () => {
      moveGizmoEnabled = !moveGizmoEnabled;
      if (transformControls) {
        transformControls.enabled = moveGizmoEnabled;
        const helper = typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls;
        helper.visible = moveGizmoEnabled;
      }
      btnToggleMoveGizmo.innerHTML = `<span>✥</span><span>3D Move Axis Gizmo: ${moveGizmoEnabled ? 'ON' : 'OFF'}</span>`;
      btnToggleMoveGizmo.style.borderColor = moveGizmoEnabled ? '#38bdf8' : '#64748b';
      btnToggleMoveGizmo.style.color = moveGizmoEnabled ? '#38bdf8' : '#94a3b8';
    });
  }

  const btnCenterChar = document.getElementById('btn-center-char');
  if (btnCenterChar) {
    btnCenterChar.addEventListener('click', () => {
      setCharacterSpawnPosition(0, 0, 0, false);
    });
  }

  ['char-pos-x', 'char-pos-y', 'char-pos-z'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const x = parseFloat(document.getElementById('char-pos-x').value) || 0;
        const y = parseFloat(document.getElementById('char-pos-y').value) || 0;
        const z = parseFloat(document.getElementById('char-pos-z').value) || 0;
        setCharacterSpawnPosition(x, y, z, false);
      });
    }
  });

  // --- UNIFIED PLAY & RUN SIMULATION BUTTON ---
  btnPlay.addEventListener('click', () => {
    // 1. If currently simulating, stop/pause simulation early at current frame
    if (timeline.isBakingLive) {
      stopLiveSimulation();
      return;
    }

    // 2. If no simulation cache exists, start fresh live simulation
    const cachedCount = Array.isArray(timeline.simulationCache) ? timeline.simulationCache.length : 0;
    if (cachedCount === 0 || !timeline.isSimulated) {
      startLiveSimulation(0);
    } else {
      // 3. Otherwise toggle review playback of simulated frames
      timeline.isPlaying = !timeline.isPlaying;
      updateSimulationStatusUI();
    }
  });

  // Dedicated Stop Simulation button in timeline header
  document.getElementById('btn-stop-sim')?.addEventListener('click', () => {
    stopLiveSimulation();
  });

  // Re-Simulate buttons (Left panel & timeline header)
  const triggerResim = () => {
    startLiveSimulation(0);
  };
  document.getElementById('btn-resim')?.addEventListener('click', triggerResim);
  document.getElementById('btn-resim-header')?.addEventListener('click', triggerResim);

  // Reset to Pristine T-Pose
  document.getElementById('btn-reset-tpose').addEventListener('click', () => {
    timeline.resetSimulation();
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    updateSimulationStatusUI();
    updateTimelineUI();
  });

  // --- CHARACTER 3D MODEL VISUALIZATION CONTROLS ---
  const btnModelMixamo = document.getElementById('btn-model-mixamo');
  if (btnModelMixamo) {
    btnModelMixamo.addEventListener('click', () => {
      currentModelType = 'mixamo';
      if (mixamoBridge && mixamoBridge.isLoaded) {
        mixamoBridge.setVisible(true);
      } else if (mixamoBridge) {
        mixamoBridge.loadFromUrl('/models/xbot.fbx').then(() => {
          mixamoBridge.setVisible(true);
          updateModelUI();
        });
      }
      updateModelUI();
    });
  }

  const btnModelMannequin = document.getElementById('btn-model-mannequin');
  if (btnModelMannequin) {
    btnModelMannequin.addEventListener('click', () => {
      currentModelType = 'mannequin';
      if (mixamoBridge) {
        mixamoBridge.setVisible(false);
      }
      updateModelUI();
    });
  }

  // --- SMART UNIFIED CHARACTER RIG & ANIMATION RETARGETING IMPORTER ---
  const handleCharacterOrAnimationFile = async (file, isAnimOnly = false) => {
    if (!file || !mixamoBridge) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const isBvh = ext === 'bvh';

    try {
      if (isBvh || isAnimOnly) {
        // Load & Retarget Animation without altering character skin
        const result = await mixamoBridge.loadAnimationFile(file);
        if (!result.retargetedClips || result.retargetedClips.length === 0) {
          alert(`No retargetable animation tracks found in "${file.name}".`);
          return;
        }

        const primaryClip = result.retargetedClips[0];
        result.retargetedClips.forEach(c => timeline.registerCustomAnimation(c));

        // Sequence on timeline: update selected/existing ANIMATION layer or add a new one
        let animLayer = (timeline.selectedLayerId && timeline.getSelectedLayer()?.type === 'ANIMATION')
          ? timeline.getSelectedLayer()
          : timeline.layers.find(l => l.type === 'ANIMATION');

        if (animLayer) {
          animLayer.clipId = primaryClip.id;
          animLayer.animType = 'custom';
          animLayer.name = `🎬 ${primaryClip.name}`;
          animLayer.endFrame = Math.min(timeline.totalFrames, animLayer.startFrame + primaryClip.totalFrames);
          timeline.selectedLayerId = animLayer.id;
        } else {
          animLayer = timeline.addLayer({
            name: `🎬 ${primaryClip.name}`,
            type: 'ANIMATION',
            animType: 'custom',
            clipId: primaryClip.id,
            startFrame: 0,
            endFrame: Math.min(timeline.totalFrames, primaryClip.totalFrames),
            color: '#2563eb'
          });
        }

        timeline.invalidateSimulation();
        timeline.seek(animLayer.startFrame);
        if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
        renderTimelineLayers();
        renderLayerInspector();
        updateSimulationStatusUI();
      } else {
        // Character Rig Import (.fbx / .glb / .gltf)
        const result = await mixamoBridge.loadFromFile(file, { applySkinIfPresent: true, extractAnimations: true });

        if (result.hasSkin) {
          currentModelType = 'custom';
          mixamoBridge.setVisible(true);
          timeline.characterBridge = mixamoBridge;
          if (timeline.actors && timeline.actors['actor-1']) {
            timeline.actors['actor-1'].mixamoBridge = mixamoBridge;
          }
          updateModelUI();

          // If the character FBX also contained animation tracks, register & apply them!
          if (result.retargetedClips && result.retargetedClips.length > 0) {
            const primaryClip = result.retargetedClips[0];
            result.retargetedClips.forEach(c => timeline.registerCustomAnimation(c));

            let animLayer = timeline.layers.find(l => l.type === 'ANIMATION');
            if (animLayer) {
              animLayer.clipId = primaryClip.id;
              animLayer.animType = 'custom';
              animLayer.name = `🎬 ${primaryClip.name}`;
              animLayer.endFrame = Math.min(timeline.totalFrames, animLayer.startFrame + primaryClip.totalFrames);
            } else {
              timeline.addLayer({
                name: `🎬 ${primaryClip.name}`,
                type: 'ANIMATION',
                animType: 'custom',
                clipId: primaryClip.id,
                startFrame: 0,
                endFrame: Math.min(timeline.totalFrames, primaryClip.totalFrames),
                color: '#2563eb'
              });
            }
          }

          timeline.invalidateSimulation();
          timeline.seek(0);
          mixamoBridge.update();
          renderTimelineLayers();
          renderLayerInspector();
          updateSimulationStatusUI();
        } else if (result.retargetedClips && result.retargetedClips.length > 0) {
          // File has no skin (e.g. Mixamo "Without Skin" FBX chosen in Character dialog):
          // Automatically retarget the animation onto the character on screen!
          const primaryClip = result.retargetedClips[0];
          result.retargetedClips.forEach(c => timeline.registerCustomAnimation(c));

          let animLayer = timeline.layers.find(l => l.type === 'ANIMATION');
          if (animLayer) {
            animLayer.clipId = primaryClip.id;
            animLayer.animType = 'custom';
            animLayer.name = `🎬 ${primaryClip.name}`;
            animLayer.endFrame = Math.min(timeline.totalFrames, animLayer.startFrame + primaryClip.totalFrames);
          } else {
            timeline.addLayer({
              name: `🎬 ${primaryClip.name}`,
              type: 'ANIMATION',
              animType: 'custom',
              clipId: primaryClip.id,
              startFrame: 0,
              endFrame: Math.min(timeline.totalFrames, primaryClip.totalFrames),
              color: '#2563eb'
            });
          }
          timeline.invalidateSimulation();
          timeline.seek(0);
          if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
          renderTimelineLayers();
          renderLayerInspector();
          updateSimulationStatusUI();
        } else {
          alert(`No SkinnedMesh or Animation tracks found in "${file.name}".`);
        }
      }
    } catch (err) {
      console.error('File import failed:', err);
      alert(`Error loading file: ${err.message}`);
    }
  };

  const inputMixamoFile = document.getElementById('input-mixamo-file');
  if (inputMixamoFile) {
    inputMixamoFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleCharacterOrAnimationFile(file, false);
        inputMixamoFile.value = '';
      }
    });
  }

  const inputAnimFile = document.getElementById('input-anim-file');
  if (inputAnimFile) {
    inputAnimFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleCharacterOrAnimationFile(file, true);
        inputAnimFile.value = '';
      }
    });
  }

  document.getElementById('btn-import-retarget-anim')?.addEventListener('click', () => {
    document.getElementById('input-anim-file')?.click();
  });

  // Drag and Drop 3D Model or Animation onto Viewport
  const viewportEl = document.getElementById('viewport-container');
  if (viewportEl) {
    viewportEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      viewportEl.style.boxShadow = 'inset 0 0 0 2px #38bdf8';
    });
    viewportEl.addEventListener('dragleave', () => {
      viewportEl.style.boxShadow = 'none';
    });
    viewportEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      viewportEl.style.boxShadow = 'none';
      const file = e.dataTransfer.files[0];
      if (file) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.fbx') || lower.endsWith('.glb') || lower.endsWith('.gltf') || lower.endsWith('.bvh')) {
          await handleCharacterOrAnimationFile(file, lower.endsWith('.bvh'));
        }
      }
    });
  }

  // --- CHARACTER RIG CALIBRATION CONTROLS BINDING ---
  const chkAutoTPose = document.getElementById('cal-auto-tpose');
  if (chkAutoTPose) {
    chkAutoTPose.addEventListener('change', (e) => {
      mixamoBridge.calibration.autoAlignTPose = e.target.checked;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpArmSpread = document.getElementById('cal-arm-spread');
  if (inpArmSpread) {
    inpArmSpread.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      mixamoBridge.calibration.armSpreadOffsetDeg = val;
      const el = document.getElementById('cal-arm-spread-val');
      if (el) el.textContent = `${Math.round(val)}°`;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const chkAutoGroundClamp = document.getElementById('cal-auto-ground-clamp');
  if (chkAutoGroundClamp) {
    chkAutoGroundClamp.addEventListener('change', (e) => {
      mixamoBridge.calibration.autoGroundClamp = e.target.checked;
      character.groundClampingEnabled = e.target.checked;
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpFootSole = document.getElementById('cal-foot-sole-offset');
  if (inpFootSole) {
    inpFootSole.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0.04;
      mixamoBridge.calibration.footSoleOffset = val;
      character.footSoleOffset = val;
      const el = document.getElementById('cal-foot-sole-val');
      if (el) el.textContent = `${val.toFixed(2)} m`;
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpThighSpread = document.getElementById('cal-thigh-spread');
  if (inpThighSpread) {
    inpThighSpread.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      mixamoBridge.calibration.thighClearanceDeg = val;
      const el = document.getElementById('cal-thigh-spread-val');
      if (el) el.textContent = `${Math.round(val)}°`;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpBodyGirth = document.getElementById('cal-body-girth');
  if (inpBodyGirth) {
    inpBodyGirth.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 1.0;
      mixamoBridge.calibration.bodyGirthMultiplier = val;
      if (typeof character.setColliderGirth === 'function') {
        character.setColliderGirth(val);
      }
      const el = document.getElementById('cal-body-girth-val');
      if (el) el.textContent = `${val.toFixed(2)}x`;
      updateModelUI();
    });
  }

  const inpScaleMult = document.getElementById('cal-scale-mult');
  if (inpScaleMult) {
    inpScaleMult.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 1.0;
      mixamoBridge.calibration.scaleMultiplier = val;
      const el = document.getElementById('cal-scale-mult-val');
      if (el) el.textContent = `${val.toFixed(2)}x`;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpGroundY = document.getElementById('cal-ground-y');
  if (inpGroundY) {
    inpGroundY.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0.0;
      mixamoBridge.calibration.groundOffsetY = val;
      const el = document.getElementById('cal-ground-y-val');
      if (el) el.textContent = `${val.toFixed(2)} m`;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const inpYawOffset = document.getElementById('cal-yaw-offset');
  if (inpYawOffset) {
    inpYawOffset.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      mixamoBridge.calibration.yawOffsetDeg = val;
      const el = document.getElementById('cal-yaw-offset-val');
      if (el) el.textContent = `${Math.round(val)}°`;
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  const btnResetRigCal = document.getElementById('btn-reset-rig-cal');
  if (btnResetRigCal) {
    btnResetRigCal.addEventListener('click', () => {
      const diag = mixamoBridge.rigDiagnostics;
      mixamoBridge.calibration.autoAlignTPose = true;
      mixamoBridge.calibration.autoGroundClamp = true;
      mixamoBridge.calibration.armSpreadOffsetDeg = diag.detectedArmSpreadDeg || 0;
      mixamoBridge.calibration.thighClearanceDeg = diag.detectedThighSpreadDeg || 0;
      mixamoBridge.calibration.footSoleOffset = diag.detectedFootSoleOffset || 0.04;
      mixamoBridge.calibration.bodyGirthMultiplier = diag.detectedGirthMultiplier || 1.0;
      mixamoBridge.calibration.scaleMultiplier = 1.0;
      mixamoBridge.calibration.groundOffsetY = 0.0;
      mixamoBridge.calibration.yawOffsetDeg = 0;
      character.groundClampingEnabled = true;
      character.footSoleOffset = mixamoBridge.calibration.footSoleOffset;
      if (typeof character.setColliderGirth === 'function') {
        character.setColliderGirth(mixamoBridge.calibration.bodyGirthMultiplier);
      }
      mixamoBridge.recalibrate();
      updateModelUI();
      timeline.seek(timeline.currentFrame);
      if (mixamoBridge.isVisible) mixamoBridge.update();
    });
  }

  // Timeline Slider Scrub
  const slider = document.getElementById('timeline-slider');
  slider.addEventListener('input', (e) => {
    scrubToFrame(parseInt(e.target.value));
  });

  // Timeline Frame Ruler Click & Drag Scrubbing
  const rulerTrackEl = document.getElementById('timeline-ruler-track');
  if (rulerTrackEl) {
    let isRulerScrubbing = false;
    const scrubFromRulerEvent = (clientX) => {
      const rect = rulerTrackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const frame = Math.round(ratio * timeline.totalFrames);
      scrubToFrame(frame);
    };
    rulerTrackEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isRulerScrubbing = true;
      scrubFromRulerEvent(e.clientX);
    });
    window.addEventListener('mousemove', (e) => {
      if (!isRulerScrubbing) return;
      scrubFromRulerEvent(e.clientX);
    });
    window.addEventListener('mouseup', () => {
      isRulerScrubbing = false;
    });
  }

  // Frame Step Buttons (Start, -1f, +1f)
  document.getElementById('btn-step-start')?.addEventListener('click', () => {
    scrubToFrame(0);
  });
  document.getElementById('btn-step-prev')?.addEventListener('click', () => {
    scrubToFrame(timeline.currentFrame - 1);
  });
  document.getElementById('btn-step-next')?.addEventListener('click', () => {
    scrubToFrame(timeline.currentFrame + 1);
  });

  const getBehaviorStartFrame = (fallbackWithAnim = 60, fallbackNoAnim = 0) => {
    const animLayer = timeline.layers.find(l => l.type === 'ANIMATION');
    return animLayer ? animLayer.endFrame : fallbackNoAnim;
  };

  // Unified helper to add any Behaviour from ENDORPHIN_BEHAVIOR_CATEGORIES to the timeline
  const addBehaviorToTimeline = (bItem) => {
    historyManager.pushState(`Add ${bItem.name || bItem.key}`);
    const targetActor = timeline.activeActorId || 'actor-1';
    const isEnemy = targetActor === 'actor-2';
    const sf = bItem.key === 'ragdoll' ? 120 : getBehaviorStartFrame(60, 0);
    const dur = bItem.defaultDuration || 120;
    timeline.addLayer({
      name: `${bItem.name}${isEnemy ? ' (Enemy)' : ''}`,
      type: 'BEHAVIOR',
      actorId: targetActor,
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + dur),
      behavior: bItem.key,
      bodyPartMask: 'auto',
      intensity: 1.0,
      speed: 1.0,
      color: isEnemy ? '#f97316' : (bItem.color || '#0284c7')
    });
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    closeAllMenus();
  };

  // --- POPULATE CASCADING BEHAVIOUR MENUS (LEFT PANEL & TOPBAR) ---
  const leftCascadeContainer = document.getElementById('left-behavior-cascade');
  const flyoutPortal = document.getElementById('behavior-flyout-portal');
  const topbarBehaviorsDropdown = document.getElementById('topbar-behaviors-dropdown');
  let flyoutHideTimeout = null;
  let hoverIntentTimeout = null;
  let pinnedCategoryId = null;

  if (leftCascadeContainer && flyoutPortal) {
    leftCascadeContainer.innerHTML = '';

    const showFlyoutForCategory = (cat, rowEl, pin = false) => {
      if (flyoutHideTimeout) {
        clearTimeout(flyoutHideTimeout);
        flyoutHideTimeout = null;
      }
      if (hoverIntentTimeout) {
        clearTimeout(hoverIntentTimeout);
        hoverIntentTimeout = null;
      }

      if (pin) {
        pinnedCategoryId = (pinnedCategoryId === cat.id) ? null : cat.id;
      }

      document.querySelectorAll('.cascade-category-item').forEach(el => {
        el.classList.remove('active');
        if (pinnedCategoryId && el.dataset.catId === pinnedCategoryId) {
          el.classList.add('active');
        }
      });
      rowEl.classList.add('active');

      const isPinned = pinnedCategoryId === cat.id;

      flyoutPortal.innerHTML = `
        <div class="flyout-header">
          <span>${cat.icon} ${cat.label}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 9.5px; color: ${isPinned ? '#38bdf8' : '#64748b'}; font-weight: 600;">
              ${isPinned ? '📌 PINNED' : 'Click to Pin'}
            </span>
            <button id="btn-close-flyout" title="Close Flyout" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; line-height: 1;">&times;</button>
          </div>
        </div>
      `;

      document.getElementById('btn-close-flyout')?.addEventListener('click', (e) => {
        e.stopPropagation();
        pinnedCategoryId = null;
        flyoutPortal.style.display = 'none';
        document.querySelectorAll('.cascade-category-item.active').forEach(el => el.classList.remove('active'));
      });

      cat.items.forEach((bItem) => {
        const btn = document.createElement('button');
        btn.className = 'flyout-behavior-btn';
        btn.dataset.behaviorKey = bItem.key;
        btn.innerHTML = `
          <span class="flyout-b-dot" style="background: ${bItem.color}; box-shadow: 0 0 6px ${bItem.color};"></span>
          <div class="flyout-b-info">
            <span class="flyout-b-title"><span>${bItem.icon}</span><span>${bItem.name}</span></span>
            <span class="flyout-b-desc">${bItem.shortDesc}</span>
          </div>
          <span class="flyout-b-frames">+${bItem.defaultDuration}f</span>
        `;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          addBehaviorToTimeline(bItem);
        });
        flyoutPortal.appendChild(btn);
      });

      flyoutPortal.style.display = 'flex';
      const rect = rowEl.getBoundingClientRect();
      const portalHeight = flyoutPortal.offsetHeight || 220;
      const topPos = Math.min(Math.max(44, rect.top - 4), window.innerHeight - portalHeight - 12);
      // Zero gap positioning: directly overlap the right border of the left panel
      flyoutPortal.style.left = `${rect.right - 2}px`;
      flyoutPortal.style.top = `${topPos}px`;
    };

    const scheduleHideFlyout = () => {
      if (pinnedCategoryId) return; // Do not auto-hide when user has pinned the category!
      if (flyoutHideTimeout) clearTimeout(flyoutHideTimeout);
      flyoutHideTimeout = setTimeout(() => {
        if (!pinnedCategoryId) {
          flyoutPortal.style.display = 'none';
          document.querySelectorAll('.cascade-category-item.active').forEach(el => el.classList.remove('active'));
        }
      }, 450); // Generous 450ms DCC grace period
    };

    flyoutPortal.addEventListener('mouseenter', () => {
      if (flyoutHideTimeout) {
        clearTimeout(flyoutHideTimeout);
        flyoutHideTimeout = null;
      }
    });
    flyoutPortal.addEventListener('mouseleave', scheduleHideFlyout);

    ENDORPHIN_BEHAVIOR_CATEGORIES.forEach((cat) => {
      const row = document.createElement('div');
      row.className = 'cascade-category-item';
      row.dataset.catId = cat.id;
      row.innerHTML = `
        <span class="cascade-cat-left">
          <span>${cat.icon}</span>
          <span>${cat.label}</span>
        </span>
        <span class="cascade-cat-right">
          <span class="cascade-count-badge">${cat.items.length}</span>
          <span class="cascade-arrow">▸</span>
        </span>
      `;

      row.addEventListener('mouseenter', () => {
        if (pinnedCategoryId && pinnedCategoryId !== cat.id) return; // Respect pinned category
        if (flyoutHideTimeout) {
          clearTimeout(flyoutHideTimeout);
          flyoutHideTimeout = null;
        }
        if (hoverIntentTimeout) clearTimeout(hoverIntentTimeout);

        // Smooth hover intent delay (140ms) prevents unwanted category swapping during diagonal cursor travel
        const delay = (flyoutPortal.style.display === 'flex') ? 140 : 40;
        hoverIntentTimeout = setTimeout(() => {
          if (!pinnedCategoryId) {
            showFlyoutForCategory(cat, row, false);
          }
        }, delay);
      });

      row.addEventListener('mouseleave', () => {
        if (hoverIntentTimeout) {
          clearTimeout(hoverIntentTimeout);
          hoverIntentTimeout = null;
        }
        if (!pinnedCategoryId) {
          scheduleHideFlyout();
        }
      });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        showFlyoutForCategory(cat, row, true);
      });

      leftCascadeContainer.appendChild(row);
    });

    // Close pinned flyout when clicking outside
    window.addEventListener('click', (e) => {
      if (pinnedCategoryId) {
        if (!flyoutPortal.contains(e.target) && !leftCascadeContainer.contains(e.target)) {
          pinnedCategoryId = null;
          flyoutPortal.style.display = 'none';
          document.querySelectorAll('.cascade-category-item.active').forEach(el => el.classList.remove('active'));
        }
      }
    });
  }

  // Populate Topbar "Behaviours" Dropdown with Category ▸ 2nd-Level Flyouts
  if (topbarBehaviorsDropdown) {
    topbarBehaviorsDropdown.innerHTML = `<div class="dcc-menu-section-label">DMS Behavioral Modules</div>`;
    ENDORPHIN_BEHAVIOR_CATEGORIES.forEach((cat) => {
      const subRow = document.createElement('div');
      subRow.className = 'dcc-submenu-row';
      subRow.dataset.catId = cat.id;

      const flyout2nd = document.createElement('div');
      flyout2nd.className = 'dcc-flyout-2nd';
      flyout2nd.innerHTML = `<div class="dcc-menu-section-label">${cat.icon} ${cat.label}</div>`;

      cat.items.forEach((bItem) => {
        const optBtn = document.createElement('button');
        optBtn.className = 'dcc-menu-option';
        optBtn.dataset.behaviorKey = bItem.key;
        optBtn.innerHTML = `
          <span class="dcc-option-left">
            <span class="dcc-option-icon">${bItem.icon}</span>
            <span>${bItem.name}</span>
          </span>
          <span class="dcc-option-shortcut">+${bItem.defaultDuration}f</span>
        `;
        optBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          addBehaviorToTimeline(bItem);
        });
        flyout2nd.appendChild(optBtn);
      });

      subRow.innerHTML = `
        <span class="dcc-option-left">
          <span class="dcc-option-icon">${cat.icon}</span>
          <span>${cat.label}</span>
        </span>
        <span class="dcc-submenu-arrow">▸</span>
      `;
      subRow.appendChild(flyout2nd);
      topbarBehaviorsDropdown.appendChild(subRow);
    });
  }

  // Close menus when clicking any topbar menu option
  document.querySelectorAll('.dcc-menu-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus();
    });
  });

  // Add Walk Animation Helper
  const addWalkCycleLayer = () => {
    historyManager.pushState('Add Walk Cycle');
    timeline.addLayer({
      name: 'Walk Animation (Human Gait)',
      type: 'ANIMATION',
      startFrame: 0,
      endFrame: 60,
      animType: 'walk',
      intensity: 1.0,
      speed: 1.0,
      color: '#2563eb'
    });
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  };

  document.getElementById('btn-add-walk-anim')?.addEventListener('click', addWalkCycleLayer);
  document.getElementById('menu-add-walk-anim')?.addEventListener('click', addWalkCycleLayer);

  // Physical Props & Primitive Shapes Helpers
  const getPropSpawnPosition = (defaultY = 0.25, defaultOffsetZ = 1.1) => {
    const ox = character?.spawnOffset?.x || 0;
    const oz = character?.spawnOffset?.z || 0;
    return { x: ox, y: defaultY, z: oz + defaultOffsetZ };
  };

  const spawnBoxProp = () => {
    historyManager.pushState('Spawn Box');
    const p = propsManager.spawnBox(getPropSpawnPosition(0.25, 1.1), { x: 0.5, y: 0.5, z: 0.5 }, true);
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const spawnSphereProp = () => {
    historyManager.pushState('Spawn Sphere');
    const p = propsManager.spawnSphere(getPropSpawnPosition(0.25, 1.1), 0.25, true);
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const spawnCylinderProp = () => {
    historyManager.pushState('Spawn Cylinder');
    const p = propsManager.spawnCylinder(getPropSpawnPosition(0.30, 1.1), 0.22, 0.6, true);
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const spawnCapsuleProp = () => {
    historyManager.pushState('Spawn Capsule');
    const p = propsManager.spawnCapsule(getPropSpawnPosition(0.35, 1.1), 0.18, 0.5, true);
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const triggerSpawnCrate = () => {
    historyManager.pushState('Spawn Hurdle Crate');
    const p = propsManager.spawnHurdleCrate(getPropSpawnPosition(0.22, 1.05));
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const triggerSpawnStep = () => {
    historyManager.pushState('Spawn Raised Platform');
    const p = propsManager.spawnRaisedStep(getPropSpawnPosition(0.15, 0.85));
    selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const triggerSpawnFluid = () => {
    historyManager.pushState('Spawn Water Pool');
    const pos = getPropSpawnPosition(0.35, 1.1);
    const p = propsManager.spawnFluidVolume(pos, { x: 3.5, y: 0.7, z: 3.5 });
    if (p) selectProp(p.id);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  const triggerLaunchProjectile = () => {
    historyManager.pushState('Launch Cannonball');
    const pelvisPos = character.bodies['UpperSpine']
      ? character.bodies['UpperSpine'].rigidBody.translation()
      : { x: 0, y: 1.15, z: 0 };
    const p = propsManager.launchProjectile(
      { x: pelvisPos.x, y: 1.25, z: pelvisPos.z + 3.8 },
      { x: pelvisPos.x, y: Math.max(0.6, pelvisPos.y), z: pelvisPos.z },
      16.0
    );
    if (p) selectProp(p.id);
    if (!timeline.isBakingLive) {
      timeline.isSimulated = false;
      timeline.isBakingLive = true;
      timeline.isPlaying = false;
      updateSimulationStatusUI();
    }
  };

  const triggerClearProps = () => {
    historyManager.pushState('Clear All Props');
    deselectProp();
    propsManager.clearAllProps();
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };

  document.getElementById('btn-prop-box')?.addEventListener('click', spawnBoxProp);
  document.getElementById('menu-prop-box')?.addEventListener('click', spawnBoxProp);
  document.getElementById('btn-prop-sphere')?.addEventListener('click', spawnSphereProp);
  document.getElementById('menu-prop-sphere')?.addEventListener('click', spawnSphereProp);
  document.getElementById('btn-prop-cylinder')?.addEventListener('click', spawnCylinderProp);
  document.getElementById('menu-prop-cylinder')?.addEventListener('click', spawnCylinderProp);
  document.getElementById('btn-prop-capsule')?.addEventListener('click', spawnCapsuleProp);
  document.getElementById('menu-prop-capsule')?.addEventListener('click', spawnCapsuleProp);
  document.getElementById('btn-prop-crate')?.addEventListener('click', triggerSpawnCrate);
  document.getElementById('menu-prop-crate')?.addEventListener('click', triggerSpawnCrate);
  document.getElementById('btn-prop-step')?.addEventListener('click', triggerSpawnStep);
  document.getElementById('menu-prop-step')?.addEventListener('click', triggerSpawnStep);
  document.getElementById('btn-prop-projectile')?.addEventListener('click', triggerLaunchProjectile);
  document.getElementById('menu-prop-projectile')?.addEventListener('click', triggerLaunchProjectile);
  document.getElementById('btn-prop-fluid')?.addEventListener('click', triggerSpawnFluid);
  document.getElementById('menu-prop-fluid')?.addEventListener('click', triggerSpawnFluid);
  document.getElementById('btn-clear-props')?.addEventListener('click', triggerClearProps);
  document.getElementById('menu-clear-props')?.addEventListener('click', triggerClearProps);
  document.getElementById('menu-env-clear-props')?.addEventListener('click', triggerClearProps);
  document.getElementById('btn-close-prop-inspector')?.addEventListener('click', deselectProp);

  // Biomechanical Visualisation Gizmos Toggle
  const toggleBiomechanicalGizmos = () => {
    gizmosVisible = !gizmosVisible;
    if (gizmosGroup) gizmosGroup.visible = gizmosVisible;
    const btnToggleGizmos = document.getElementById('btn-toggle-gizmos');
    if (btnToggleGizmos) {
      btnToggleGizmos.textContent = gizmosVisible ? '👁️ Gizmos: ON' : '👁️ Gizmos: OFF';
      btnToggleGizmos.style.borderColor = gizmosVisible ? '#38bdf8' : '#64748b';
      btnToggleGizmos.style.color = gizmosVisible ? '#38bdf8' : '#94a3b8';
    }
  };
  document.getElementById('btn-toggle-gizmos')?.addEventListener('click', toggleBiomechanicalGizmos);
  document.getElementById('menu-toggle-gizmos')?.addEventListener('click', toggleBiomechanicalGizmos);

  // Topbar View -> Toggle Move Gizmo & Help Overlay
  document.getElementById('menu-toggle-move-gizmo')?.addEventListener('click', () => {
    document.getElementById('btn-toggle-move-gizmo')?.click();
  });
  document.getElementById('menu-toggle-help')?.addEventListener('click', () => {
    if (tooltipEl) {
      tooltipEl.style.display = tooltipEl.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Physical Ground Surface Material
  const groundMatSelect = document.getElementById('ground-material-select');
  groundMatSelect?.addEventListener('change', (e) => {
    (currentSetGroundMaterialFn || setGroundMaterial)(e.target.value);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  });
  document.querySelectorAll('[data-ground-mat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mat = btn.getAttribute('data-ground-mat');
      if (groundMatSelect) groundMatSelect.value = mat;
      (currentSetGroundMaterialFn || setGroundMaterial)(mat);
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  });

  // Pusher Ambient Wind Field Slider (Endorphin 2.7)
  const windSlider = document.getElementById('wind-slider');
  const windVal = document.getElementById('wind-val');
  windSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    windVal.textContent = `${val} N`;
    timeline.windForce = { x: 0, y: 0, z: -val * 3.5 };
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  });

  // Twister Rotational Vortex Field Slider (Endorphin 2.7)
  const twisterSlider = document.getElementById('twister-slider');
  const twisterVal = document.getElementById('twister-val');
  if (twisterSlider && twisterVal) {
    twisterSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      twisterVal.textContent = `${val} rad/s`;
      timeline.twisterStrength = val;
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
    });
  }

  // Muscle Rig Calibration Stiffness Slider & Topbar Presets
  const stiffSlider = document.getElementById('stiffness-slider');
  const stiffVal = document.getElementById('stiff-val');
  const applyStiffnessValue = (val) => {
    if (stiffSlider) stiffSlider.value = val;
    if (stiffVal) stiffVal.textContent = `${val} Nm`;
    character.muscleStiffness = val;
    character.muscleDamping = Math.max(10, val * 0.12);
    timeline.invalidateSimulation();
    updateSimulationStatusUI();
  };
  if (stiffSlider && stiffVal) {
    stiffSlider.addEventListener('input', (e) => {
      applyStiffnessValue(parseFloat(e.target.value));
    });
  }
  document.querySelectorAll('[data-stiff-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.getAttribute('data-stiff-preset')) || 300;
      applyStiffnessValue(val);
    });
  });

  // Topbar Character Skin Switchers
  document.getElementById('menu-model-mixamo')?.addEventListener('click', () => {
    document.getElementById('btn-model-mixamo')?.click();
  });
  document.getElementById('menu-model-mannequin')?.addEventListener('click', () => {
    document.getElementById('btn-model-mannequin')?.click();
  });
  document.getElementById('menu-model-sam')?.addEventListener('click', async () => {
    if (!mixamoBridge) return;
    try {
      await mixamoBridge.loadFromUrl('/models/sam_human.fbx');
      mixamoBridge.setVisible(true);
      updateModelUI();
    } catch (e) {
      console.warn('Failed to load sam_human.fbx:', e);
    }
  });

  // Multi-Physics Engine Selector & Real-Time Engine Switching
  async function switchPhysicsEngine(engineType) {
    if (engineType === currentEngineName) return;
    console.log(`Switching physics engine from ${currentEngineName} to ${engineType}...`);
    timeline.isPlaying = false;
    timeline.isBakingLive = false;

    // Preserve Actor 2 status and cleanly dismantle before engine rebuild
    const wasActor2Active = actor2Active;
    if (actor2Active && typeof removeActor2 === 'function') {
      removeActor2();
    }

    // Cleanup old character visual meshes
    if (character && typeof character.destroy === 'function') {
      character.destroy();
    }

    // Cleanup old engine
    if (currentEngineName === 'jolt') cleanupJolt();
    else if (currentEngineName === 'mujoco') cleanupMujoco();
    else if (currentEngineName === 'physx') cleanupPhysx();
    else if (currentEngineName === 'rapier') resetPhysicsWorld();

    currentEngineName = engineType;

    let engineData = null;
    try {
      if (engineType === 'mujoco') {
        const data = await initMujocoPhysics();
        character = new MujocoCharacter(data, scene, { x: 0, y: 0.95, z: 0 });
        currentStepPhysicsFn = stepMujocoPhysics;
        currentSetGroundMaterialFn = setMujocoGroundMaterial;
        engineData = data;
      } else if (engineType === 'jolt') {
        const data = await initJoltPhysics();
        character = new JoltCharacter(data, scene, { x: 0, y: 0.95, z: 0 });
        currentStepPhysicsFn = stepJoltPhysics;
        currentSetGroundMaterialFn = setJoltGroundMaterial;
        engineData = data;
      } else if (engineType === 'physx') {
        const data = await initPhysxPhysics();
        character = new PhysXCharacter(data, scene, { x: 0, y: 0.95, z: 0 });
        currentStepPhysicsFn = stepPhysxPhysics;
        currentSetGroundMaterialFn = setPhysxGroundMaterial;
        engineData = data;
      } else {
        // default rapier
        const physicsData = await initPhysics();
        physicsWorld = physicsData.world;
        character = new BiomechanicalCharacter(physicsWorld, scene, { x: 0, y: 0.95, z: 0 });
        currentStepPhysicsFn = stepPhysics;
        currentSetGroundMaterialFn = setGroundMaterial;
        engineData = physicsData;
      }
    } catch (engineInitErr) {
      console.error(`[PhysicsEngine] Error initializing ${engineType}:`, engineInitErr);
      if (engineType !== 'rapier') {
        console.warn('[PhysicsEngine] Falling back to default Rapier physics...');
        const physicsData = await initPhysics();
        physicsWorld = physicsData.world;
        character = new BiomechanicalCharacter(physicsWorld, scene, { x: 0, y: 0.95, z: 0 });
        currentStepPhysicsFn = stepPhysics;
        currentSetGroundMaterialFn = setGroundMaterial;
        currentEngineName = 'rapier';
        engineData = physicsData;
      }
    }

    currentEngineData = engineData;

    // Re-bind props manager, dms engine, timeline, and mixamo bridge
    if (propsManager) {
      propsManager.world = physicsWorld;
      propsManager.setEngine(currentEngineName, engineData);
    }
    dmsEngine.character = character;
    timeline.character = character;
    timeline.dmsEngine = dmsEngine;
    if (typeof timeline.registerActor === 'function') {
      timeline.registerActor('actor-1', {
        id: 'actor-1',
        name: 'Actor 1 (Hero)',
        character: character,
        dmsEngine: dmsEngine,
        mixamoBridge: mixamoBridge
      });
    } else {
      timeline.actors = {
        'actor-1': {
          id: 'actor-1',
          name: 'Actor 1 (Hero)',
          character: character,
          dmsEngine: dmsEngine,
          mixamoBridge: mixamoBridge
        }
      };
    }

    if (wasActor2Active) {
      try {
        await addActor2();
      } catch (err) {
        console.warn('[MultiCharacter] Could not auto-restore Actor 2:', err);
      }
    }

    window.character = character;
    if (aiDirector) aiDirector.character = character;

    if (mixamoBridge) {
      mixamoBridge.character = character;
      mixamoBridge.characterBodies = character.bodies;
      const isMixamo = mixamoBridge.isVisible && mixamoBridge.isLoaded;
      mixamoBridge.setVisible(isMixamo);
      if (!isMixamo && character && character.visualMeshes) {
        character.visualMeshes.forEach(m => m.visible = true);
      }
    } else if (character && character.visualMeshes) {
      character.visualMeshes.forEach(m => m.visible = true);
    }

    // Re-initialize gizmos & pickers with new character
    if (charGizmoAnchor) {
      charGizmoAnchor.position.set(0, 0.95, 0);
      charGizmoAnchor.updateMatrixWorld();
    }
    if (typeof initCharacterMoveGizmo === 'function') initCharacterMoveGizmo();
    if (typeof initBiomechanicalGizmos === 'function') initBiomechanicalGizmos();

    timeline.resetSimulation();
    timeline.seek(0);
    renderTimelineLayers();
    renderLayerInspector();
    renderSceneOutliner();
    updateModelUI();
    updateSimulationStatusUI();
    console.log(`Successfully switched physics engine to ${engineType}!`);
  }

  const physicsEngineSelect = document.getElementById('physics-engine-select');
  if (physicsEngineSelect) {
    physicsEngineSelect.addEventListener('change', async (e) => {
      await switchPhysicsEngine(e.target.value);
    });
  }

  // Playback Speed Selector
  document.getElementById('playback-speed-select')?.addEventListener('change', (e) => {
    timeline.playbackSpeed = parseFloat(e.target.value);
  });

  // Timeline Actor Filter Buttons (All / Hero / Enemy)
  const updateTimelineFilterButtons = () => {
    const bAll = document.getElementById('filter-actor-all');
    const b1 = document.getElementById('filter-actor-1');
    const b2 = document.getElementById('filter-actor-2');
    if (bAll) bAll.className = 'timeline-filter-btn' + (timelineActorFilter === 'all' ? ' active' : '');
    if (b1) b1.className = 'timeline-filter-btn' + (timelineActorFilter === 'actor-1' ? ' active' : '');
    if (b2) b2.className = 'timeline-filter-btn' + (timelineActorFilter === 'actor-2' ? ' active-a2' : '');
  };

  document.getElementById('filter-actor-all')?.addEventListener('click', () => {
    timelineActorFilter = 'all';
    updateTimelineFilterButtons();
    renderTimelineLayers();
  });
  document.getElementById('filter-actor-1')?.addEventListener('click', () => {
    timelineActorFilter = 'actor-1';
    updateTimelineFilterButtons();
    renderTimelineLayers();
  });
  document.getElementById('filter-actor-2')?.addEventListener('click', async () => {
    if (!actor2Active) {
      await addActor2();
    }
    timelineActorFilter = 'actor-2';
    updateTimelineFilterButtons();
    renderTimelineLayers();
  });

  // Add Directional Force Event on Selected Bone
  const triggerAddForceEvent = () => {
    historyManager.pushState('Add Force Event');
    const targetActor = timeline.activeActorId || 'actor-1';
    const isEnemy = targetActor === 'actor-2';
    const sf = getBehaviorStartFrame(60, 10);
    const target = selectedTargetBone || 'UpperSpine';
    timeline.addLayer({
      name: `Force on ${target}${isEnemy ? ' (Enemy)' : ''}`,
      type: 'PERTURBATION',
      actorId: targetActor,
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + 12),
      targetBody: target,
      magnitude: 65.0,
      yawDeg: 180.0,
      pitchDeg: 8.0,
      forceMode: 'impulse',
      intensity: 1.0,
      color: isEnemy ? '#f97316' : '#dc2626'
    });
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  };
  document.getElementById('btn-add-impulse')?.addEventListener('click', triggerAddForceEvent);
  document.getElementById('menu-add-impulse')?.addEventListener('click', triggerAddForceEvent);

  // Add Active Pose Event (Endorphin 2.7.1 Pose Matching)
  const triggerAddPoseEvent = () => {
    historyManager.pushState('Add Pose Event');
    const sf = getBehaviorStartFrame(60, 0);
    timeline.addLayer({
      name: 'Pose: Crouching',
      type: 'ACTIVE_POSE',
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + 80),
      poseKey: 'crouching',
      strength: 65.0,
      intensity: 1.0,
      color: '#ec4899'
    });
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  };
  document.getElementById('btn-add-pose-event')?.addEventListener('click', triggerAddPoseEvent);
  document.getElementById('menu-add-pose-event')?.addEventListener('click', triggerAddPoseEvent);

  // Add Bone Constraint / World Pin (Endorphin 2.7.1 Constraints)
  const triggerAddConstraintEvent = () => {
    const target = selectedTargetBone || 'LeftHand';
    const pinTarget = selectedPropId || 'world';
    let pinName = `Pin ${target}`;
    if (pinTarget !== 'world') {
      const p = propsManager?.getPropById(pinTarget);
      if (p) pinName = `Pin ${target} to ${p.name}`;
    }
    historyManager.pushState(pinName);
    const sf = getBehaviorStartFrame(60, 20);
    timeline.addLayer({
      name: pinName,
      type: 'CONSTRAINT',
      actorId: timeline.activeActorId || 'actor-1',
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + 90),
      targetBody: target,
      pinTarget: pinTarget,
      constraintType: 'lock',
      strength: 1.0,
      color: '#10b981'
    });
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  };
  document.getElementById('btn-add-constraint-event')?.addEventListener('click', triggerAddConstraintEvent);
  document.getElementById('menu-add-constraint-event')?.addEventListener('click', triggerAddConstraintEvent);

  // Quick Preset: Pure Ragdoll Drop from T-Pose (Empty Timeline)
  const triggerClearTimelineToRagdoll = () => {
    historyManager.pushState('Clear Timeline (Pure Ragdoll)');
    timeline.layers = [];
    timeline.selectedLayerId = null;
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    character.resetToTPose();
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };

  document.getElementById('btn-preset-ragdoll')?.addEventListener('click', triggerClearTimelineToRagdoll);
  document.getElementById('menu-preset-ragdoll')?.addEventListener('click', triggerClearTimelineToRagdoll);
  document.getElementById('btn-clear-layers')?.addEventListener('click', triggerClearTimelineToRagdoll);
  document.getElementById('menu-clear-layers')?.addEventListener('click', triggerClearTimelineToRagdoll);
  document.getElementById('menu-new-scene')?.addEventListener('click', () => {
    propsManager.clearAllProps();
    triggerClearTimelineToRagdoll();
    renderSceneOutliner();
  });

  // Edit Menu Actions
  document.getElementById('menu-revert-tpose')?.addEventListener('click', () => {
    document.getElementById('btn-reset-tpose')?.click();
  });
  document.getElementById('menu-reset-origin')?.addEventListener('click', () => {
    setCharacterSpawnPosition(0, 0, 0, false);
  });
  document.getElementById('menu-delete-selected-layer')?.addEventListener('click', () => {
    if (timeline.selectedLayerId) {
      timeline.removeLayer(timeline.selectedLayerId);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
    }
  });

  // Quick Preset 1: Full Pipeline (Walk -> Trip -> Catch Fall -> Rest)
  const triggerPresetWalkTrip = () => {
    historyManager.pushState('Preset: Walk & Trip');
    timeline.layers = [
      {
        id: 'layer_anim_walk',
        name: 'Walk Animation (Human Gait)',
        type: 'ANIMATION',
        startFrame: 0,
        endFrame: 60,
        animType: 'walk',
        gaitStyle: 'walk',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#2563eb'
      },
      {
        id: 'layer_trip',
        name: 'Snag Trip on LeftCalf',
        type: 'PERTURBATION',
        startFrame: 60,
        endFrame: 68,
        targetBody: 'LeftCalf',
        magnitude: 70.0,
        yawDeg: 180.0,
        pitchDeg: 12.0,
        forceMode: 'impulse',
        intensity: 1.0,
        impulse: TimelineEngine.computeForceVector(70.0, 180.0, 12.0),
        enabled: true,
        color: '#dc2626'
      },
      {
        id: 'layer_catchfall',
        name: 'Catch Fall (Hands Out)',
        type: 'BEHAVIOR',
        startFrame: 60,
        endFrame: 140,
        behavior: 'catchFall',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#059669'
      },
      {
        id: 'layer_ragdoll',
        name: 'Passive Ragdoll Rest',
        type: 'BEHAVIOR',
        startFrame: 120,
        endFrame: timeline.totalFrames,
        behavior: 'ragdoll',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#7c3aed'
      }
    ];
    timeline.selectedLayerId = 'layer_trip';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };

  // Quick Preset 2: Athletic Jog -> Heavy Chest Impact -> Ragdoll Flip
  const triggerPresetJogHit = () => {
    historyManager.pushState('Preset: Jog & Hit');
    timeline.layers = [
      {
        id: 'layer_anim_jog',
        name: 'Athletic Jog (Kinematic Sprint)',
        type: 'ANIMATION',
        startFrame: 0,
        endFrame: 55,
        animType: 'walk',
        gaitStyle: 'jog',
        intensity: 1.15,
        speed: 1.15,
        enabled: true,
        color: '#0284c7'
      },
      {
        id: 'layer_hit',
        name: 'Heavy Chest Impact',
        type: 'PERTURBATION',
        startFrame: 55,
        endFrame: 62,
        targetBody: 'UpperSpine',
        magnitude: 115.0,
        yawDeg: 180.0,
        pitchDeg: 22.0,
        forceMode: 'impulse',
        intensity: 1.0,
        impulse: TimelineEngine.computeForceVector(115.0, 180.0, 22.0),
        enabled: true,
        color: '#dc2626'
      },
      {
        id: 'layer_flail',
        name: 'Mid-Air Flail (Reflex Tumbling)',
        type: 'BEHAVIOR',
        startFrame: 55,
        endFrame: 115,
        behavior: 'flail',
        intensity: 1.25,
        speed: 1.3,
        enabled: true,
        color: '#f59e0b'
      },
      {
        id: 'layer_ragdoll_flip',
        name: 'Tumble Landing & Ragdoll Rest',
        type: 'BEHAVIOR',
        startFrame: 95,
        endFrame: timeline.totalFrames,
        behavior: 'ragdoll',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#7c3aed'
      }
    ];
    timeline.selectedLayerId = 'layer_hit';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };

  // Quick Preset 3: Walk -> Lateral Shove -> Stagger Recovery
  const triggerPresetWalkStumble = () => {
    historyManager.pushState('Preset: Walk & Stumble');
    timeline.layers = [
      {
        id: 'layer_anim_walk_stumble',
        name: 'Natural Walk Cycle',
        type: 'ANIMATION',
        startFrame: 0,
        endFrame: 50,
        animType: 'walk',
        gaitStyle: 'walk',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#2563eb'
      },
      {
        id: 'layer_shove',
        name: 'Lateral Shove on UpperSpine',
        type: 'PERTURBATION',
        startFrame: 50,
        endFrame: 56,
        targetBody: 'UpperSpine',
        magnitude: 55.0,
        yawDeg: 90.0,
        pitchDeg: 5.0,
        forceMode: 'impulse',
        intensity: 1.0,
        impulse: TimelineEngine.computeForceVector(55.0, 90.0, 5.0),
        enabled: true,
        color: '#dc2626'
      },
      {
        id: 'layer_stumble_flail',
        name: 'Balance Stepping & Flail',
        type: 'BEHAVIOR',
        startFrame: 50,
        endFrame: 120,
        behavior: 'flail',
        intensity: 0.85,
        speed: 1.0,
        enabled: true,
        color: '#f59e0b'
      },
      {
        id: 'layer_recovery_pose',
        name: 'Recovery Crouch Stance',
        type: 'ACTIVE_POSE',
        startFrame: 95,
        endFrame: timeline.totalFrames,
        poseKey: 'crouching',
        strength: 65.0,
        enabled: true,
        color: '#ec4899'
      }
    ];
    timeline.selectedLayerId = 'layer_shove';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };

  // Quick Preset 4: Cautious Stalk -> Snag Trip -> Dive Catch Fall
  const triggerPresetStalkTrip = () => {
    historyManager.pushState('Preset: Stalk & Trip');
    timeline.layers = [
      {
        id: 'layer_anim_stalk',
        name: 'Cautious Stalk (Stealth Gait)',
        type: 'ANIMATION',
        startFrame: 0,
        endFrame: 65,
        animType: 'walk',
        gaitStyle: 'stalk',
        intensity: 1.0,
        speed: 0.9,
        enabled: true,
        color: '#0d9488'
      },
      {
        id: 'layer_snag',
        name: 'Snag Trip on RightFoot',
        type: 'PERTURBATION',
        startFrame: 65,
        endFrame: 73,
        targetBody: 'RightFoot',
        magnitude: 65.0,
        yawDeg: 180.0,
        pitchDeg: 15.0,
        forceMode: 'impulse',
        intensity: 1.0,
        impulse: TimelineEngine.computeForceVector(65.0, 180.0, 15.0),
        enabled: true,
        color: '#dc2626'
      },
      {
        id: 'layer_dive',
        name: 'Catch Fall & Dive',
        type: 'BEHAVIOR',
        startFrame: 65,
        endFrame: 135,
        behavior: 'catchFall',
        intensity: 1.1,
        speed: 1.0,
        enabled: true,
        color: '#059669'
      },
      {
        id: 'layer_stalk_ragdoll',
        name: 'Slide & Rest',
        type: 'BEHAVIOR',
        startFrame: 115,
        endFrame: timeline.totalFrames,
        behavior: 'ragdoll',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#7c3aed'
      }
    ];
    timeline.selectedLayerId = 'layer_snag';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };

  // Keyframe Window Handlers for Active Pose Inspector
  window.seekToKeyframe = (f) => {
    timeline.seek(f);
    updateTimelineUI();
    updateSimulationStatusUI();
    if (isPoseMode) renderPoseInspector();
  };

  window.deleteKeyframe = (layerId, f) => {
    timeline.removePoseKeyframe(layerId, f);
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  };

  // Preset: Natural Standing Stance & Active Equilibrium
  const triggerPresetIdleStance = () => {
    historyManager.pushState('Preset: Standing Balance');
    timeline.layers = [
      {
        id: 'layer_idle_stance',
        actorId: 'actor-1',
        name: 'Natural Standing Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: 240,
        blendIn: 0,
        blendOut: 15,
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#0ea5e9'
      }
    ];
    if (actor2Active) {
      timeline.layers.push({
        id: 'layer_idle_stance_a2',
        actorId: 'actor-2',
        name: 'Natural Standing Balance',
        type: 'BEHAVIOR',
        behavior: 'idleStance',
        startFrame: 0,
        endFrame: 240,
        blendIn: 0,
        blendOut: 15,
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#f97316'
      });
    }
    timeline.selectedLayerId = 'layer_idle_stance';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (character && typeof character.resetToNaturalStance === 'function') {
      character.resetToNaturalStance();
    }
    if (actor2Character && typeof actor2Character.resetToNaturalStance === 'function') {
      actor2Character.resetToNaturalStance();
    }
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    if (actor2MixamoBridge && actor2MixamoBridge.isVisible) actor2MixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };
  document.getElementById('btn-preset-idle-stance')?.addEventListener('click', triggerPresetIdleStance);
  document.getElementById('menu-preset-idle-stance')?.addEventListener('click', triggerPresetIdleStance);

  // Preset: Obstacle Jump & Dive -> Tackle Charge
  const triggerPresetDiveTackle = () => {
    historyManager.pushState('Preset: Dive & Tackle');
    timeline.layers = [
      {
        id: 'layer_jump_dive',
        actorId: 'actor-1',
        name: 'Jump & Dive (Obstacle Leap)',
        type: 'BEHAVIOR',
        startFrame: 0,
        endFrame: 110,
        behavior: 'jumpDive',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#d97706'
      },
      {
        id: 'layer_tackle',
        actorId: 'actor-1',
        name: 'Tackle (Diving Body Charge)',
        type: 'BEHAVIOR',
        startFrame: 90,
        endFrame: 190,
        behavior: 'tackle',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#dc2626'
      },
      {
        id: 'layer_catchfall',
        actorId: 'actor-1',
        name: 'Catch Fall Reflex',
        type: 'BEHAVIOR',
        startFrame: 160,
        endFrame: 240,
        behavior: 'catchFall',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#059669'
      }
    ];
    timeline.selectedLayerId = 'layer_jump_dive';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };
  document.getElementById('btn-preset-dive-tackle')?.addEventListener('click', triggerPresetDiveTackle);
  document.getElementById('menu-preset-dive-tackle')?.addEventListener('click', triggerPresetDiveTackle);

  // Preset: Pusher Wind & Water Pool Swimming (Fluid 2.7)
  const triggerPresetStormFluid = () => {
    historyManager.pushState('Preset: Storm & Fluid Pool');
    if (propsManager && propsManager.props.filter(p => p.type === 'fluid').length === 0) {
      const ox = character.spawnOffset?.x ?? 0;
      const oz = character.spawnOffset?.z ?? 0;
      propsManager.spawnFluidVolume({ x: ox, y: 0.35, z: oz + 1.1 }, { x: 3.5, y: 0.7, z: 3.5 });
    }
    timeline.layers = [
      {
        id: 'layer_pusher_wind',
        actorId: 'actor-1',
        name: 'Pusher (Continuous Wind / Blast)',
        type: 'BEHAVIOR',
        startFrame: 0,
        endFrame: 120,
        behavior: 'pusher',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#38bdf8'
      },
      {
        id: 'layer_fluid_swim',
        actorId: 'actor-1',
        name: 'Fluid (Water Swimming)',
        type: 'BEHAVIOR',
        startFrame: 20,
        endFrame: 240,
        behavior: 'fluid',
        intensity: 1.0,
        speed: 1.0,
        enabled: true,
        color: '#0284c7'
      }
    ];
    timeline.selectedLayerId = 'layer_fluid_swim';
    timeline.invalidateSimulation();
    timeline.isBakingLive = false;
    timeline.isPlaying = false;
    timeline.seek(0);
    if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
    updateTimelineUI();
  };
  document.getElementById('btn-preset-storm-fluid')?.addEventListener('click', triggerPresetStormFluid);
  document.getElementById('menu-preset-storm-fluid')?.addEventListener('click', triggerPresetStormFluid);

  document.getElementById('btn-preset-walk-trip')?.addEventListener('click', triggerPresetWalkTrip);
  document.getElementById('menu-preset-walk-trip')?.addEventListener('click', triggerPresetWalkTrip);
  document.getElementById('btn-preset-jog-hit')?.addEventListener('click', triggerPresetJogHit);
  document.getElementById('menu-preset-jog-hit')?.addEventListener('click', triggerPresetJogHit);
  document.getElementById('btn-preset-walk-stumble')?.addEventListener('click', triggerPresetWalkStumble);
  document.getElementById('menu-preset-walk-stumble')?.addEventListener('click', triggerPresetWalkStumble);
  document.getElementById('menu-preset-stalk-trip')?.addEventListener('click', triggerPresetStalkTrip);

  // Character Skin: Sam Human Model
  document.getElementById('btn-model-sam')?.addEventListener('click', async () => {
    if (!mixamoBridge) return;
    try {
      currentModelType = 'sam';
      await mixamoBridge.loadFromUrl('/models/sam_human.fbx');
      mixamoBridge.setVisible(true);
      updateModelUI();
    } catch (e) {
      console.warn('Failed to load sam_human.fbx:', e);
    }
  });

  // Active Pose Track Button
  document.getElementById('btn-add-pose-track')?.addEventListener('click', () => {
    historyManager.pushState('Add Active Pose Track');
    const activeChar = (timeline.activeActorId === 'actor-2' && actor2Character) ? actor2Character : character;
    const curPose = activeChar ? activeChar.getPoseState() : { rootPos: [0, 0.95, 0], localRotations: {} };

    const newLayer = timeline.addLayer({
      actorId: timeline.activeActorId || 'actor-1',
      name: 'Active Pose Track',
      type: 'ANIMATION',
      animType: 'pose',
      startFrame: Math.max(0, timeline.currentFrame),
      endFrame: Math.min(timeline.totalFrames, timeline.currentFrame + 60),
      blendIn: 5,
      blendOut: 5,
      color: '#a855f7',
      isMotorized: true,
      muscleStiffness: 1.0,
      keyframes: [
        {
          frame: timeline.currentFrame,
          rootPos: curPose.rootPos,
          localRotations: curPose.localRotations
        }
      ]
    });
    renderTimelineLayers();
    renderLayerInspector();
    togglePoseMode(true);
    updateSimulationStatusUI();
  });

  // Proximity Hold Constraint Button
  document.getElementById('btn-add-hold-constraint')?.addEventListener('click', () => {
    const target = selectedTargetBone || 'LeftHand';
    const pinTarget = selectedPropId || 'world';
    let pinName = `Hold ${target}`;
    if (pinTarget !== 'world') {
      const p = propsManager?.getPropById(pinTarget);
      if (p) pinName = `Hold ${target} to ${p.name}`;
    }
    historyManager.pushState(pinName);
    const sf = getBehaviorStartFrame(60, 20);
    timeline.addLayer({
      name: pinName,
      type: 'CONSTRAINT',
      actorId: timeline.activeActorId || 'actor-1',
      startFrame: sf,
      endFrame: Math.min(timeline.totalFrames, sf + 100),
      targetBody: target,
      pinTarget: pinTarget,
      constraintType: 'HOLD_PROXIMITY',
      triggerDistance: 0.28,
      breakForce: 600.0,
      stiffness: 900.0,
      damping: 50.0,
      strength: 1.0,
      color: '#ec4899'
    });
    renderTimelineLayers();
    renderLayerInspector();
    updateSimulationStatusUI();
  });

  // Active Pose Mode Header Toggle
  document.getElementById('btn-toggle-pose-mode')?.addEventListener('click', () => {
    togglePoseMode();
  });

  // Keyframe Controls
  document.getElementById('btn-key-pose')?.addEventListener('click', () => {
    recordCurrentPoseKeyframe();
  });

  const btnAutoKey = document.getElementById('btn-auto-key');
  if (btnAutoKey) {
    btnAutoKey.addEventListener('click', () => {
      isAutoKeyEnabled = !isAutoKeyEnabled;
      btnAutoKey.textContent = isAutoKeyEnabled ? '⏺️ Auto-Key: ON' : '⏺️ Auto-Key: OFF';
      btnAutoKey.style.borderColor = isAutoKeyEnabled ? '#ef4444' : '#64748b';
      btnAutoKey.style.color = isAutoKeyEnabled ? '#f87171' : '#94a3b8';
      btnAutoKey.style.background = isAutoKeyEnabled ? 'rgba(239, 68, 68, 0.2)' : 'transparent';
    });
  }

  // Export Buttons
  const triggerExportGLTFScene = async () => {
    if (!timeline.isSimulated || timeline.simulationCache.length === 0) {
      alert('Please click "Simulate & Play" first to render the simulation data before exporting.');
      return;
    }
    try {
      const glbBuffer = await exportSceneToGLB(character, propsManager, timeline.simulationCache, timeline.fps || 60, {
        actor2Character: actor2Active ? actor2Character : null
      });
      downloadBinaryFile(glbBuffer, 'opendms_scene_simulation.glb', 'model/gltf-binary');
    } catch (err) {
      alert(`Export GLB Scene error: ${err.message}`);
    }
  };

  document.getElementById('btn-export-glb-scene')?.addEventListener('click', triggerExportGLTFScene);
  document.getElementById('btn-export-gltf')?.addEventListener('click', triggerExportGLTFScene);
  document.getElementById('menu-export-gltf')?.addEventListener('click', triggerExportGLTFScene);

  document.getElementById('btn-export-bvh')?.addEventListener('click', () => {
    if (!timeline.isSimulated || timeline.simulationCache.length === 0) {
      alert('Please click "Simulate & Play" first to render the simulation data before exporting.');
      return;
    }
    try {
      const activeActor = timeline.activeActorId || 'actor-1';
      const actorLabel = activeActor === 'actor-2' ? 'enemy_actor2' : 'hero_actor1';
      const bvhString = exportToBVH(timeline.simulationCache, timeline.fps || 60, {
        scale: 1.0, // 1:1 real-world meter scale for Blender / UE5 / Godot
        actorId: activeActor
      });
      downloadFile(bvhString, `opendms_${actorLabel}_motion.bvh`, 'text/plain');
      showNotification(`Exported BVH for ${activeActor === 'actor-2' ? 'Actor 2 (Enemy)' : 'Actor 1 (Hero)'} (1:1 Meter scale)`, 'success');
    } catch (err) {
      alert(`Export BVH error: ${err.message}`);
    }
  });

  document.getElementById('btn-export-glb-armature')?.addEventListener('click', async () => {
    if (!timeline.isSimulated || timeline.simulationCache.length === 0) {
      alert('Please click "Simulate & Play" first to render the simulation data before exporting.');
      return;
    }
    try {
      const activeActor = timeline.activeActorId || 'actor-1';
      const actorLabel = activeActor === 'actor-2' ? 'enemy_actor2' : 'hero_actor1';
      const glbBuffer = await exportArmatureToGLB(timeline.simulationCache, timeline.fps || 60, {
        actorId: activeActor
      });
      downloadBinaryFile(glbBuffer, `opendms_${actorLabel}_rigged_armature.glb`, 'model/gltf-binary');
      showNotification(`Exported Rigged Armature GLB for ${activeActor === 'actor-2' ? 'Actor 2 (Enemy)' : 'Actor 1 (Hero)'}`, 'success');
    } catch (err) {
      alert(`Export GLB Armature error: ${err.message}`);
    }
  });

  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    if (!timeline.isSimulated || timeline.simulationCache.length === 0) {
      alert('Please click "Simulate & Play" first to render the session before exporting.');
      return;
    }
    const jsonText = JSON.stringify(timeline.simulationCache, null, 2);
    downloadFile(jsonText, 'simulation_session.json', 'application/json');
  });

  // Ingest Endorphin File (.nmc, .ens, .nma, .nme)
  const fileInput = document.getElementById('file-input');
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    try {
      const xml = EndorphinParser.decompressFile(buffer);
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.ens') || xml.includes('<Scene') || xml.includes('<BehaviourEvent')) {
        const sceneData = EndorphinParser.parseSceneENS(xml);
        let addedCount = 0;
        for (const b of sceneData.behaviors) {
          addBehaviorLayer(b.behavior, b.startFrame, b.endFrame, { intensity: b.intensity });
          addedCount++;
        }
        for (const f of sceneData.forces) {
          timeline.addLayer({
            actorId: timeline.activeActorId || 'actor-1',
            name: `Force (${f.targetBody})`,
            type: 'PERTURBATION',
            targetBody: f.targetBody,
            startFrame: f.startFrame,
            endFrame: f.endFrame,
            magnitude: f.magnitude,
            yawDeg: 0,
            pitchDeg: 0,
            color: '#ef4444'
          });
          addedCount++;
        }
        for (const c of sceneData.constraints) {
          timeline.addLayer({
            actorId: timeline.activeActorId || 'actor-1',
            name: `Pin ${c.targetBody}`,
            type: 'CONSTRAINT',
            targetBody: c.targetBody,
            constraintType: c.constraintType,
            pinTarget: 'world',
            startFrame: c.startFrame,
            endFrame: c.endFrame,
            color: '#10b981'
          });
          addedCount++;
        }
        timeline.fitTimelineToLayers();
        renderTimelineLayers();
        renderLayerInspector();
        updateSimulationStatusUI();
        showNotification(`Loaded Legacy Scene "${file.name}" (${addedCount} timeline events imported)`, 'success');
      } else if (lowerName.endsWith('.nmc') || xml.includes('<Character')) {
        const charData = EndorphinParser.parseCharacterNMC(xml);
        const activeChar = getActiveCharacter();
        if (activeChar && typeof activeChar.applyEffectorCalibration === 'function') {
          activeChar.applyEffectorCalibration('active');
        }
        showNotification(`Loaded Legacy Character "${charData.characterName || file.name}" (${charData.metaBodies.length} bodies, ${charData.skeletalJoints.length} joints)`, 'success');
      } else if (lowerName.endsWith('.nme') || xml.includes('<WorldParams')) {
        const engData = EndorphinParser.parseEngineNME(xml);
        if (engData.gravity && world?.gravity) {
          world.gravity.x = engData.gravity.x;
          world.gravity.y = engData.gravity.y;
          world.gravity.z = engData.gravity.z;
        }
        showNotification(`Applied Engine Config "${file.name}" (Gravity Y: ${engData.gravity?.y?.toFixed(2) ?? -9.81} m/s²)`, 'success');
      } else if (lowerName.endsWith('.nma') || xml.includes('<CharacterPose')) {
        const poseData = EndorphinParser.parsePoseNMA(xml);
        const activeChar = getActiveCharacter();
        if (activeChar && Object.keys(poseData.localRotations).length > 0) {
          timeline.addPoseKeyframe(timeline.activeActorId || 'actor-1', timeline.currentFrame, { x: 0, y: 0.95, z: 0 }, poseData.localRotations);
          renderTimelineLayers();
          renderLayerInspector();
        }
        showNotification(`Imported Pose "${file.name}"`, 'success');
      } else {
        showNotification(`Decompressed XML "${file.name}" (${xml.length} bytes)`, 'success');
      }
    } catch (err) {
      alert(`Error loading file: ${err.message}`);
    }
  });

  // Modal for Animation Target Selection: Apply to Actor 1 (Current) vs Spawn as Actor 2 (Opponent)
  function promptAnimationTarget(clipTitle) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-anim-target-choice');
      const titleEl = document.getElementById('anim-target-clip-title');
      const btnActor1 = document.getElementById('btn-target-actor-1');
      const btnActor2 = document.getElementById('btn-target-actor-2');
      const btnClose = document.getElementById('btn-close-anim-target-modal');
      const btnCancel = document.getElementById('btn-cancel-anim-target');

      if (!modal || !btnActor1 || !btnActor2) {
        resolve(timeline.activeActorId || 'actor-1');
        return;
      }

      if (titleEl) titleEl.textContent = `Clip: ${clipTitle}`;
      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
        btnActor1.removeEventListener('click', onPickActor1);
        btnActor2.removeEventListener('click', onPickActor2);
        if (btnClose) btnClose.removeEventListener('click', onCancel);
        if (btnCancel) btnCancel.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onKeyDown);
      };

      const onPickActor1 = () => { cleanup(); resolve('actor-1'); };
      const onPickActor2 = () => { cleanup(); resolve('actor-2'); };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') onCancel();
        else if (e.key === '1') onPickActor1();
        else if (e.key === '2') onPickActor2();
      };

      btnActor1.addEventListener('click', onPickActor1);
      btnActor2.addEventListener('click', onPickActor2);
      if (btnClose) btnClose.addEventListener('click', onCancel);
      if (btnCancel) btnCancel.addEventListener('click', onCancel);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  // Load and apply mocap preset to active actor
  async function loadAndApplyMocap(url, name, targetActorId = null) {
    try {
      if (!targetActorId) {
        targetActorId = await promptAnimationTarget(name);
        if (!targetActorId) return; // User cancelled
      }

      if (targetActorId === 'actor-2' && !actor2Active) {
        await addActor2();
        if (currentModelType === 'mannequin' && actor2MixamoBridge) {
          actor2MixamoBridge.setVisible(false);
        }
      }
      timeline.activeActorId = targetActorId;

      historyManager.pushState(`Load Mocap: ${name}`);
      showNotification(`Loading mocap preset: ${name}...`, 'info');
      const animLayer = await animationRetargeter.loadFromUrl(url, name);

      if (animLayer.endFrame > timeline.totalFrames) {
        timeline.totalFrames = Math.max(timeline.totalFrames, animLayer.endFrame);
        const totalFramesInput = document.getElementById('timeline-total-frames');
        if (totalFramesInput) totalFramesInput.value = timeline.totalFrames;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.max = timeline.totalFrames;
        buildRulerTicks();
      }

      animLayer.id = animLayer.id || `anim_${Date.now()}`;
      animLayer.enabled = true;
      animLayer.actorId = targetActorId;

      // Remove existing ANIMATION layer for this actor to cleanly replace
      timeline.layers = timeline.layers.filter(l => !(l.type === 'ANIMATION' && (l.actorId || 'actor-1') === animLayer.actorId));
      timeline.layers.unshift(animLayer);
      timeline.selectedLayerId = animLayer.id;

      timeline.invalidateSimulation();
      timeline.isBakingLive = false;
      timeline.isPlaying = false;
      timeline.seek(0);

      const activeChar = (targetActorId === 'actor-2' && actor2Character) ? actor2Character : character;
      if (activeChar) {
        const sample = timeline.samplePoseLayer(animLayer, 0);
        if (sample) {
          if (typeof activeChar.applyPoseState === 'function') {
            activeChar.applyPoseState(sample);
          } else {
            activeChar.applyForwardKinematics(sample.rootPos, sample.localRotations);
          }
        }
      }

      const activeBridge = (targetActorId === 'actor-2' && actor2MixamoBridge) ? actor2MixamoBridge : mixamoBridge;
      if (activeBridge && activeBridge.isVisible) {
        activeBridge.update();
      }

      renderTimelineLayers();
      renderLayerInspector();
      updateTimelineUI();
      updateSimulationStatusUI();
      updateActorStagingUI();

      showNotification(`Loaded mocap: ${name} onto ${targetActorId === 'actor-2' ? 'Actor 2 (Opponent)' : 'Actor 1 (Hero)'} (${animLayer.durationFrames} frames)`, 'success');
    } catch (err) {
      console.error('Error loading mocap:', err);
      alert(`Failed to load mocap: ${err.message}`);
    }
  }

  // Handle custom animation file (BVH, FBX, GLTF)
  async function handleCustomAnimationFile(file, targetActorId = null) {
    try {
      if (!targetActorId) {
        targetActorId = await promptAnimationTarget(file.name);
        if (!targetActorId) return false;
      }

      if (targetActorId === 'actor-2' && !actor2Active) {
        await addActor2();
        if (currentModelType === 'mannequin' && actor2MixamoBridge) {
          actor2MixamoBridge.setVisible(false);
        }
      }
      timeline.activeActorId = targetActorId;

      historyManager.pushState(`Import: ${file.name}`);
      showNotification(`Ingesting animation: ${file.name}...`, 'info');
      const animLayer = await animationRetargeter.loadFromFile(file);

      if (animLayer.endFrame > timeline.totalFrames) {
        timeline.totalFrames = Math.max(timeline.totalFrames, animLayer.endFrame);
        const totalFramesInput = document.getElementById('timeline-total-frames');
        if (totalFramesInput) totalFramesInput.value = timeline.totalFrames;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.max = timeline.totalFrames;
        buildRulerTicks();
      }

      animLayer.id = animLayer.id || `anim_${Date.now()}`;
      animLayer.enabled = true;
      animLayer.actorId = targetActorId;
      timeline.layers = timeline.layers.filter(l => !(l.type === 'ANIMATION' && (l.actorId || 'actor-1') === animLayer.actorId));
      timeline.layers.unshift(animLayer);
      timeline.selectedLayerId = animLayer.id;

      timeline.invalidateSimulation();
      timeline.isBakingLive = false;
      timeline.isPlaying = false;
      timeline.seek(0);

      const activeChar = (targetActorId === 'actor-2' && actor2Character) ? actor2Character : character;
      if (activeChar) {
        const sample = timeline.samplePoseLayer(animLayer, 0);
        if (sample) {
          if (typeof activeChar.applyPoseState === 'function') {
            activeChar.applyPoseState(sample);
          } else {
            activeChar.applyForwardKinematics(sample.rootPos, sample.localRotations);
          }
        }
      }

      const activeBridge = (targetActorId === 'actor-2' && actor2MixamoBridge) ? actor2MixamoBridge : mixamoBridge;
      if (activeBridge && activeBridge.isVisible) {
        activeBridge.update();
      }

      renderTimelineLayers();
      renderLayerInspector();
      updateTimelineUI();
      updateSimulationStatusUI();
      updateActorStagingUI();

      showNotification(`Retargeted ${file.name} onto ${targetActorId === 'actor-2' ? 'Actor 2 (Opponent)' : 'Actor 1 (Hero)'} (${animLayer.durationFrames} frames)`, 'success');
      return true;
    } catch (err) {
      console.error('Error importing animation file:', err);
      throw err;
    }
  }

  // Setup Motion Capture Library Modal
  function setupMocapLibraryModal() {
    const modal = document.getElementById('modal-mocap-library');
    const btnOpen = document.getElementById('btn-open-mocap-drawer');
    const btnClose = document.getElementById('btn-close-mocap-modal');
    const cardsGrid = document.getElementById('mocap-cards-grid');
    const searchInput = document.getElementById('mocap-search-input');
    const catButtons = document.querySelectorAll('.mocap-cat-btn');
    const dropzone = document.getElementById('mocap-dropzone');
    const animFileInput = document.getElementById('anim-file-input');

    if (!modal || !cardsGrid) return;

    let currentCategory = 'all';
    let searchQuery = '';

    const renderCards = () => {
      cardsGrid.innerHTML = '';

      // Gather AI-Generated Clips from aiDirector.motionClient.cachedClips
      const aiClips = (aiDirector && aiDirector.motionClient && Array.isArray(aiDirector.motionClient.cachedClips))
        ? aiDirector.motionClient.cachedClips
        : [];

      const filteredAI = aiClips.filter(clip => {
        const matchesCat = currentCategory === 'all' || currentCategory === 'AI Generated';
        const matchesSearch = !searchQuery ||
          clip.name.toLowerCase().includes(searchQuery) ||
          clip.prompt.toLowerCase().includes(searchQuery) ||
          clip.tagSlug.toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
      });

      const filteredNative = ENDORPHIN_MOCAP_LIBRARY.filter(item => {
        if (currentCategory === 'AI Generated') return false;
        const matchesCat = currentCategory === 'all' || item.category.toLowerCase().includes(currentCategory.toLowerCase());
        const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery) || item.category.toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
      });

      if (filteredAI.length === 0 && filteredNative.length === 0) {
        const emptyHint = currentCategory === 'AI Generated'
          ? 'No AI-generated motion clips saved yet. Click "✨ Generate AI Motion..." above to create one from text!'
          : 'No motion capture presets found matching criteria.';
        cardsGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: #64748b; font-size: 11px;">${emptyHint}</div>`;
        return;
      }

      // Render AI-Generated Motion Cards first
      filteredAI.forEach(clip => {
        const card = document.createElement('div');
        card.style.cssText = 'background: #0f172a; border: 1px solid rgba(236, 72, 153, 0.45); border-radius: 6px; padding: 10px; cursor: pointer; transition: all 0.15s ease; display: flex; flex-direction: column; gap: 6px;';
        card.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 18px;">✨</span>
            <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(236, 72, 153, 0.15); color: #f472b6; font-weight: 700;">@anim:${clip.tagSlug}</span>
          </div>
          <div style="font-size: 11.5px; font-weight: 600; color: #f1f5f9; line-height: 1.2;">${clip.name}</div>
          <div style="font-size: 9.5px; color: #94a3b8;">${clip.durationFrames} frames (${(clip.durationFrames / 60).toFixed(1)}s)</div>
          <div style="display: flex; gap: 4px; margin-top: auto;">
            <button class="btn-apply-ai-clip" style="flex: 1; padding: 4px 6px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #6ee7b7; border-radius: 4px; font-size: 9.5px; font-weight: 600; cursor: pointer;">Apply</button>
            <button class="btn-dl-ai-bvh" title="Download .BVH file" style="padding: 4px 7px; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; font-size: 9.5px; font-weight: 700; cursor: pointer;">💾 .BVH</button>
          </div>
        `;

        card.querySelector('.btn-apply-ai-clip')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          modal.style.display = 'none';
          const targetActorId = await promptAnimationTarget(clip.name);
          if (!targetActorId) return;
          if (targetActorId === 'actor-2' && !actor2Active) {
            await addActor2();
          }
          historyManager.pushState(`Apply AI Motion: ${clip.name}`);
          timeline.activeActorId = targetActorId;
          const newLayer = {
            id: `anim_ai_${Date.now()}`,
            actorId: targetActorId,
            name: clip.name,
            type: 'ANIMATION',
            animType: 'pose',
            enabled: true,
            startFrame: 0,
            endFrame: clip.durationFrames,
            durationFrames: clip.durationFrames,
            clipOffset: 0,
            blendIn: 10,
            blendOut: 12,
            color: '#ec4899',
            isDenseMocap: true,
            keyframes: JSON.parse(JSON.stringify(clip.keyframes))
          };
          timeline.layers = timeline.layers.filter(l => !(l.type === 'ANIMATION' && (l.actorId || 'actor-1') === targetActorId));
          timeline.layers.unshift(newLayer);
          timeline.selectedLayerId = newLayer.id;
          timeline.invalidateSimulation();
          timeline.seek(0);
          renderTimelineLayers();
          renderLayerInspector();
          updateTimelineUI();
          updateSimulationStatusUI();
          showNotification(`Applied AI motion "${clip.name}" to ${targetActorId}`, 'success');
        });

        card.querySelector('.btn-dl-ai-bvh')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (clip.bvhText) {
            downloadFile(clip.bvhText, `${clip.tagSlug}.bvh`, 'text/plain');
            showNotification(`Downloaded ${clip.tagSlug}.bvh`, 'info');
          }
        });

        cardsGrid.appendChild(card);
      });

      filteredNative.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; cursor: pointer; transition: all 0.15s ease; display: flex; flex-direction: column; gap: 6px;';
        card.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 20px;">${item.icon || '🏃'}</span>
            <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;">${item.category}</span>
          </div>
          <div style="font-size: 11.5px; font-weight: 600; color: #f1f5f9; line-height: 1.2;">${item.name}</div>
          <div style="font-size: 9.5px; color: #64748b; font-family: monospace;">${item.file.split('/').pop()}</div>
          <button style="margin-top: 4px; padding: 4px 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #6ee7b7; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer;">Apply to Active Actor</button>
        `;

        card.addEventListener('mouseenter', () => {
          card.style.borderColor = '#38bdf8';
          card.style.transform = 'translateY(-2px)';
          card.style.background = '#1e293b';
        });
        card.addEventListener('mouseleave', () => {
          card.style.borderColor = '#1e293b';
          card.style.transform = 'none';
          card.style.background = '#0f172a';
        });

        card.addEventListener('click', async () => {
          modal.style.display = 'none';
          await loadAndApplyMocap(item.file, item.name);
        });

        cardsGrid.appendChild(card);
      });
    };

    window.refreshMocapLibraryCards = renderCards;
    renderCards();

    document.getElementById('btn-mocap-open-ai-gen')?.addEventListener('click', () => {
      modal.style.display = 'none';
      document.getElementById('tab-btn-ai')?.click();
      document.getElementById('btn-ai-mode-motion')?.click();
      document.getElementById('ai-prompt-input')?.focus();
    });

    const openModal = () => {
      modal.style.display = 'flex';
      renderCards();
      if (searchInput) searchInput.focus();
    };

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    document.getElementById('btn-open-mocap-drawer-left')?.addEventListener('click', openModal);
    document.getElementById('menu-open-mocap-library')?.addEventListener('click', openModal);
    document.getElementById('menu-open-mocap-library-2')?.addEventListener('click', openModal);
    document.getElementById('menu-anim-library')?.addEventListener('click', openModal);

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderCards();
      });
    }

    catButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        catButtons.forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = '#334155';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.borderColor = '#38bdf8';
        btn.style.color = '#38bdf8';
        currentCategory = btn.dataset.cat || 'all';
        renderCards();
      });
    });

    if (dropzone && animFileInput) {
      dropzone.addEventListener('click', () => animFileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#38bdf8';
        dropzone.style.background = 'rgba(56, 189, 248, 0.1)';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '#475569';
        dropzone.style.background = 'rgba(15, 23, 42, 0.4)';
      });
      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#475569';
        dropzone.style.background = 'rgba(15, 23, 42, 0.4)';
        const file = e.dataTransfer.files[0];
        if (file) {
          modal.style.display = 'none';
          try {
            await handleCustomAnimationFile(file);
          } catch (err) {
            alert('Failed to load animation file: ' + err.message);
          }
        }
      });
    }

    if (animFileInput) {
      animFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          modal.style.display = 'none';
          try {
            await handleCustomAnimationFile(file);
          } catch (err) {
            alert('Failed to load animation file: ' + err.message);
          }
          animFileInput.value = '';
        }
      });
    }
  }

  // Setup Endorphin Behavior Flow Graph Modal & Reactive State Links
  function setupBehaviorFlowGraphModal() {
    const modal = document.getElementById('modal-behavior-flow-graph');
    const btnOpen = document.getElementById('btn-open-flow-graph');
    const btnClose = document.getElementById('btn-close-flow-graph');
    const container = document.getElementById('flow-graph-container');

    if (!modal || !btnOpen) return;

    const renderFlow = () => {
      if (!container) return;
      const heroLayers = timeline.layers.filter(l => (l.actorId || 'actor-1') === 'actor-1');
      const enemyLayers = timeline.layers.filter(l => l.actorId === 'actor-2');

      const renderActorFlow = (title, layers, color) => {
        if (layers.length === 0) {
          return `<div style="font-size: 11px; color: #64748b; font-style: italic;">No tracks assigned yet.</div>`;
        }
        return `
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
            ${layers.map((l, i) => {
              const isTrigger = l.triggerType && l.triggerType !== 'frame';
              const isGrab = l.grabTarget && l.grabTarget !== 'none';
              return `
                <div style="display: inline-flex; align-items: center; gap: 8px;">
                  <div style="background: rgba(15, 23, 42, 0.85); border: 1.5px solid ${l.color}; border-radius: 6px; padding: 6px 10px; min-width: 130px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                      <strong style="color: #f8fafc; font-size: 11px;">${l.name}</strong>
                      <span style="font-size: 9px; color: ${l.color}; font-weight: 700;">${l.type}</span>
                    </div>
                    <div style="font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between;">
                      <span>F:${l.startFrame}-${l.endFrame}</span>
                      <span>${Math.round((l.intensity ?? 1.0) * 100)}%</span>
                    </div>
                    ${isTrigger ? `
                      <div style="margin-top: 4px; padding: 2px 4px; border-radius: 3px; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3); font-size: 9px; color: #fbbf24; font-weight: 600;">
                        ⚡ Trigger: ${l.triggerType} (${l.triggerThreshold})
                      </div>
                    ` : ''}
                    ${isGrab ? `
                      <div style="margin-top: 4px; padding: 2px 4px; border-radius: 3px; background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.3); font-size: 9px; color: #f97316; font-weight: 600;">
                        🤝 Grab: ${l.grabTarget} (${l.grabBodyPart})
                      </div>
                    ` : ''}
                  </div>
                  ${i < layers.length - 1 ? `<span style="color: #64748b; font-size: 14px; font-weight: 700;">➔</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      };

      const heroStatus = character?.isLossOfBalance ? '⚠️ Loss of Balance (Falling)' : '✓ Upright (ZMP Dynamic Balance Active)';
      const enemyStatus = actor2Character?.isLossOfBalance ? '⚠️ Loss of Balance' : (actor2Active ? '✓ Upright (ZMP Dynamic Balance Active)' : 'Inactive');

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">🧍 Hero (Actor 1) Reactive State Pipeline</span>
              <span style="font-size: 10px; color: ${character?.isLossOfBalance ? '#f43f5e' : '#34d399'}; font-weight: 700;">${heroStatus}</span>
            </div>
            ${renderActorFlow('Hero', heroLayers, '#38bdf8')}
          </div>

          <div style="border-top: 1px dashed #334155; padding-top: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-size: 12px; font-weight: 700; color: #fb923c;">🥋 Enemy (Actor 2) Reactive State Pipeline</span>
              <span style="font-size: 10px; color: ${actor2Character?.isLossOfBalance ? '#f43f5e' : '#34d399'}; font-weight: 700;">${enemyStatus}</span>
            </div>
            ${renderActorFlow('Enemy', enemyLayers, '#fb923c')}
          </div>
        </div>
      `;
    };

    btnOpen.addEventListener('click', () => {
      renderFlow();
      modal.style.display = 'flex';
    });

    btnClose?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    // Quick AI Stunt Choreography Presets
    document.getElementById('btn-stunt-tackle')?.addEventListener('click', async () => {
      historyManager.pushState('AI Stunt: Tackle & Wrap Takedown');
      await aiDirector.executePrompt('Tackle and wrap takedown between Hero and Enemy');
      modal.style.display = 'none';
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification('Loaded Reactive Tackle & 2-Way Pelvic Takedown', 'success');
    });

    document.getElementById('btn-stunt-shove')?.addEventListener('click', async () => {
      historyManager.pushState('AI Stunt: Chest Shove & Stepping');
      await aiDirector.executePrompt('Chest shove and stepping recovery between Hero and Enemy');
      modal.style.display = 'none';
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification('Loaded Reactive Chest Shove & ZMP Stepping Recovery', 'success');
    });

    document.getElementById('btn-stunt-trip')?.addEventListener('click', async () => {
      historyManager.pushState('AI Stunt: Ankle Trip & Dive Roll');
      await aiDirector.executePrompt('Ankle trip stumble and dive roll');
      modal.style.display = 'none';
      timeline.invalidateSimulation();
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification('Loaded Ankle Trip & Dive Roll Stunt', 'success');
    });
  }

  // Biomechanical Dynamic Balance & Counter-Weighing Inspector Controller
  function setupZMPBalanceInspector() {
    const chkAutoBalance = document.getElementById('chk-auto-balance');
    const chkCounterWeighing = document.getElementById('chk-counter-weighing');
    const rngStrength = document.getElementById('zmp-recovery-strength');
    const rngTilt = document.getElementById('zmp-tilt-threshold');
    const valStrength = document.getElementById('zmp-strength-val');
    const valTilt = document.getElementById('zmp-tilt-val');
    const btnShoveFront = document.getElementById('btn-test-shove-front');
    const btnShoveBack = document.getElementById('btn-test-shove-back');
    const btnJumpHeader = document.getElementById('btn-header-balance-jump');
    const balanceCard = document.getElementById('zmp-balance-group');

    // Header Quick-Jump Button: Opens Inspector tab, switches to Character subtab, uncollapses Balance card, scrolls to it, and flashes emerald outline
    if (btnJumpHeader) {
      btnJumpHeader.addEventListener('click', () => {
        const tabBtnInspector = document.getElementById('tab-btn-inspector');
        if (tabBtnInspector) tabBtnInspector.click();
        if (typeof switchRightPanelContext === 'function') switchRightPanelContext('character');
        if (balanceCard) {
          balanceCard.classList.remove('collapsed');
          balanceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          balanceCard.classList.remove('zmp-highlight');
          void balanceCard.offsetWidth; // re-trigger animation
          balanceCard.classList.add('zmp-highlight');
        }
      });
    }

    if (chkAutoBalance) {
      chkAutoBalance.checked = character?.balanceControlEnabled ?? true;
      chkAutoBalance.addEventListener('change', (e) => {
        const val = e.target.checked;
        if (character) character.balanceControlEnabled = val;
        if (actor2Character) actor2Character.balanceControlEnabled = val;
        showNotification(`Dynamic Balance Control: ${val ? 'ENABLED' : 'DISABLED'}`, 'info');
      });
    }

    if (chkCounterWeighing) {
      chkCounterWeighing.checked = character?.counterWeighingEnabled ?? true;
      chkCounterWeighing.addEventListener('change', (e) => {
        const val = e.target.checked;
        if (character) character.counterWeighingEnabled = val;
        if (actor2Character) actor2Character.counterWeighingEnabled = val;
        showNotification(`Dynamic Arm Counter-Weighing: ${val ? 'ENABLED' : 'DISABLED'}`, 'info');
      });
    }

    if (rngStrength) {
      rngStrength.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valStrength) valStrength.textContent = `${val}%`;
        const factor = val / 100;
        if (character) character.balanceRecoveryStrength = factor;
        if (actor2Character) actor2Character.balanceRecoveryStrength = factor;
      });
    }

    if (rngTilt) {
      rngTilt.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valTilt) valTilt.textContent = `${val}°`;
        if (character) character.lossOfBalanceTiltLimit = val;
        if (actor2Character) actor2Character.lossOfBalanceTiltLimit = val;
      });
    }

    const executeTestShove = (dir, forceMagnitude) => {
      if (!character) return;

      const f = timeline.currentFrame;
      const startF = Math.max(0, f);
      const endF = Math.min(timeline.totalFrames - 1, startF + 14);
      const yaw = dir === 'front' ? 180 : 0;

      // Upsert test perturbation layer
      let pLayer = timeline.layers.find(l => l.name === 'ZMP Push Test');
      if (pLayer) {
        pLayer.startFrame = startF;
        pLayer.endFrame = endF;
        pLayer.magnitude = forceMagnitude;
        pLayer.yawDeg = yaw;
        pLayer.pitchDeg = 6;
        pLayer.targetBody = 'UpperSpine';
        pLayer.forceMode = 'impulse';
        pLayer.impulse = TimelineEngine.computeForceVector(forceMagnitude, yaw, 6);
      } else {
        timeline.addLayer({
          name: 'ZMP Push Test',
          type: 'PERTURBATION',
          startFrame: startF,
          endFrame: endF,
          targetBody: 'UpperSpine',
          magnitude: forceMagnitude,
          yawDeg: yaw,
          pitchDeg: 6,
          forceMode: 'impulse'
        });
      }

      timeline.resetSimulation();
      timeline.isBakingLive = true;
      timeline.isPlaying = false;
      updateSimulationStatusUI();
      renderTimelineLayers();
      showNotification(`⚡ Simulating ${forceMagnitude}N ${dir} impulse @ F${startF}: Testing ZMP recovery stepping!`, 'success');
    };

    if (btnShoveFront) {
      btnShoveFront.addEventListener('click', () => {
        executeTestShove('front', 45);
      });
    }

    if (btnShoveBack) {
      btnShoveBack.addEventListener('click', () => {
        executeTestShove('back', 55);
      });
    }
  }

  // Setup Classic DCC Top Menu Bar
  function setupTopMenuBar() {
    const menubar = document.getElementById('main-menubar');
    if (!menubar) return;

    const menuItems = menubar.querySelectorAll('.menu-item');
    let isMenuActivated = false;

    const closeAllMenus = () => {
      isMenuActivated = false;
      menuItems.forEach(item => item.classList.remove('active'));
    };

    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.menu-dropdown')) return;
        e.stopPropagation();
        const wasActive = item.classList.contains('active');
        closeAllMenus();
        if (!wasActive) {
          item.classList.add('active');
          isMenuActivated = true;
        }
      });

      item.addEventListener('mouseenter', () => {
        if (isMenuActivated) {
          menuItems.forEach(m => m.classList.remove('active'));
          item.classList.add('active');
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#main-menubar')) {
        closeAllMenus();
      }
    });

    menubar.querySelectorAll('.menu-entry:not(.menu-sub-trigger)').forEach(entry => {
      entry.addEventListener('click', () => {
        closeAllMenus();
      });
    });

    // File Menu
    document.getElementById('menu-ingest-file')?.addEventListener('click', () => {
      document.getElementById('file-input')?.click();
    });
    document.getElementById('menu-import-anim')?.addEventListener('click', () => {
      document.getElementById('anim-file-input')?.click();
    });
    document.getElementById('menu-export-gltf')?.addEventListener('click', () => {
      triggerExportGLTFScene();
    });
    document.getElementById('menu-export-bvh')?.addEventListener('click', () => {
      document.getElementById('btn-export-bvh')?.click();
    });
    document.getElementById('menu-export-json')?.addEventListener('click', () => {
      document.getElementById('btn-export-json')?.click();
    });

    // Edit Menu
    document.getElementById('menu-undo')?.addEventListener('click', () => {
      historyManager.undo();
    });
    document.getElementById('menu-redo')?.addEventListener('click', () => {
      historyManager.redo();
    });
    document.getElementById('menu-split-layer')?.addEventListener('click', () => {
      document.getElementById('btn-timeline-split')?.click();
    });
    document.getElementById('menu-trim-in')?.addEventListener('click', () => {
      document.getElementById('btn-timeline-trim-in')?.click();
    });
    document.getElementById('menu-trim-out')?.addEventListener('click', () => {
      document.getElementById('btn-timeline-trim-out')?.click();
    });
    document.getElementById('menu-duplicate-layer')?.addEventListener('click', () => {
      document.getElementById('btn-timeline-duplicate')?.click();
    });
    document.getElementById('menu-fit-timeline')?.addEventListener('click', () => {
      document.getElementById('btn-timeline-fit')?.click();
    });
    document.getElementById('menu-clear-layers')?.addEventListener('click', () => {
      document.getElementById('btn-clear-layers')?.click();
    });
    document.getElementById('menu-clear-props')?.addEventListener('click', () => {
      if (propsManager) {
        historyManager.pushState('Clear All Props');
        propsManager.clearAllProps();
        timeline.invalidateSimulation();
        renderSceneOutliner();
        showNotification('Cleared all physical props', 'info');
      }
    });
    document.getElementById('menu-reset-tpose')?.addEventListener('click', () => {
      character.resetToTPose();
      if (actor2Character && actor2Active) actor2Character.resetToTPose();
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      if (actor2MixamoBridge && actor2MixamoBridge.isVisible) actor2MixamoBridge.update();
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
      showNotification('Reverted character to T-Pose', 'info');
    });
    document.getElementById('menu-reset-stance')?.addEventListener('click', () => {
      if (typeof character.resetToNaturalStance === 'function') character.resetToNaturalStance();
      if (actor2Character && actor2Active && typeof actor2Character.resetToNaturalStance === 'function') {
        actor2Character.resetToNaturalStance();
      }
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      if (actor2MixamoBridge && actor2MixamoBridge.isVisible) actor2MixamoBridge.update();
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
      showNotification('Reset character to Natural Stance', 'info');
    });

    // Pose Preset Sub-menu entries
    document.querySelectorAll('.pose-preset-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const poseId = entry.dataset.pose;
        if (poseId) applyPosePreset(poseId);
      });
    });

    // Animation Menu
    document.getElementById('menu-toggle-pose')?.addEventListener('click', () => {
      togglePoseMode();
    });
    document.getElementById('menu-key-pose')?.addEventListener('click', () => {
      recordCurrentPoseKeyframe();
    });
    document.getElementById('menu-toggle-autokey')?.addEventListener('click', () => {
      const btnAutoKey = document.getElementById('btn-auto-key');
      if (btnAutoKey) btnAutoKey.click();
    });
    document.getElementById('menu-add-walk-anim')?.addEventListener('click', () => {
      document.getElementById('btn-add-walk-anim')?.click();
    });
    document.getElementById('menu-import-anim-2')?.addEventListener('click', () => {
      document.getElementById('anim-file-input')?.click();
    });
    document.getElementById('menu-text-to-anim-ai')?.addEventListener('click', () => {
      document.getElementById('tab-btn-ai')?.click();
      document.getElementById('btn-ai-mode-motion')?.click();
      document.getElementById('ai-prompt-input')?.focus();
      showNotification('Opened Text-to-Animation AI (@Tag Compiler)', 'info');
    });

    // Mocap Sub-menu Presets
    document.querySelectorAll('.mocap-preset-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const file = entry.dataset.file;
        const name = entry.dataset.name;
        if (file) loadAndApplyMocap(file, name);
      });
    });

    // Behaviors Menu
    document.querySelectorAll('.bhv-preset-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const key = entry.dataset.behavior;
        if (key) addBehaviorLayer(key);
      });
    });
    document.getElementById('menu-open-bhv-library')?.addEventListener('click', () => {
      openBehaviorDrawer('all');
      showNotification('Opened DMS Behaviour Library Drawer', 'info');
    });

    // Physics Menu
    document.querySelectorAll('.menu-engine-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const eng = entry.dataset.engine;
        const select = document.getElementById('physics-engine-select');
        if (select) {
          select.value = eng;
          select.dispatchEvent(new Event('change'));
          showNotification(`Switched physics engine: ${eng.toUpperCase()}`, 'info');
        }
      });
    });

    document.querySelectorAll('.menu-ground-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const mat = entry.dataset.mat;
        const select = document.getElementById('ground-material-select');
        if (select) {
          select.value = mat;
          select.dispatchEvent(new Event('change'));
          showNotification(`Ground material set: ${mat.toUpperCase()}`, 'info');
        }
      });
    });

    document.getElementById('menu-physics-resim')?.addEventListener('click', () => {
      document.getElementById('btn-resim')?.click();
    });

    // Staging Menu
    document.getElementById('menu-select-a1')?.addEventListener('click', () => {
      setActiveActorUI('actor-1');
    });
    document.getElementById('menu-select-a2')?.addEventListener('click', () => {
      if (actor2Active) setActiveActorUI('actor-2');
      else showNotification('Actor 2 is not currently spawned', 'error');
    });
    document.getElementById('menu-toggle-a2')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-toggle-actor2');
      if (btn) btn.click();
    });
    document.querySelectorAll('.menu-stage-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const stage = entry.dataset.stage;
        if (stage) applyStagingPreset(stage);
      });
    });

    // View Menu
    document.getElementById('menu-view-gizmos')?.addEventListener('click', () => {
      document.getElementById('btn-toggle-gizmos')?.click();
    });
    document.getElementById('menu-view-move')?.addEventListener('click', () => {
      moveGizmoEnabled = !moveGizmoEnabled;
      if (transformControls) transformControls.enabled = moveGizmoEnabled;
      const gizmo = transformControls ? (typeof transformControls.getHelper === 'function' ? transformControls.getHelper() : transformControls) : null;
      if (gizmo) gizmo.visible = moveGizmoEnabled;
      showNotification(`Move Axis Gizmo: ${moveGizmoEnabled ? 'ON' : 'OFF'}`, 'info');
    });
    document.getElementById('menu-view-reset-cam')?.addEventListener('click', () => {
      camera.position.set(0, 1.4, 3.8);
      controls.target.set(0, 0.9, 0);
      controls.update();
      showNotification('Viewport Camera Reset', 'info');
    });

    // Help Menu
    document.getElementById('menu-help-tooltip')?.addEventListener('click', () => {
      const tooltip = document.getElementById('viewport-tooltip');
      if (tooltip) {
        tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
      }
    });
    document.getElementById('menu-help-about')?.addEventListener('click', () => {
      alert('OpenDMS Studio — Dynamic Motion Synthesis\nVersion 1.0.0 (Clean-Room Engine)\n\nFeatures:\n• 15-bone anatomical humanoid plant\n• Real-time multi-physics: Rapier 3D, MuJoCo WASM, Jolt, NVIDIA PhysX 5\n• 32 Dynamic behavioral synthesis reflexes\n• Active Pose Mode with 60 Hz motorized joint torque tracking\n• Universal Mocap Retargeter with 48 bundled animation clips\n• Blender 4.x/5.x-verified glTF 2.0 / BVH keyframe export\n• Biomechanical ZMP dynamic balance & adaptive stepping');
    });
  }

  // Setup AI Stunt Director UI
  function setupAIStuntDirectorUI() {
    const tabInspector = document.getElementById('tab-btn-inspector');
    const tabAI = document.getElementById('tab-btn-ai');
    const contentInspector = document.getElementById('tab-content-inspector');
    const contentAI = document.getElementById('tab-content-ai');

    if (tabInspector && tabAI && contentInspector && contentAI) {
      tabInspector.addEventListener('click', () => {
        tabInspector.classList.add('active');
        tabAI.classList.remove('active');
        tabInspector.style.borderBottomColor = '#38bdf8';
        tabInspector.style.color = '#38bdf8';
        tabAI.style.borderBottomColor = 'transparent';
        tabAI.style.color = '#94a3b8';
        contentInspector.style.display = 'flex';
        contentAI.style.display = 'none';
      });

      tabAI.addEventListener('click', () => {
        tabAI.classList.add('active');
        tabInspector.classList.remove('active');
        tabAI.style.borderBottomColor = '#38bdf8';
        tabAI.style.color = '#38bdf8';
        tabInspector.style.borderBottomColor = 'transparent';
        tabInspector.style.color = '#94a3b8';
        contentInspector.style.display = 'none';
        contentAI.style.display = 'flex';
        const promptInput = document.getElementById('ai-prompt-input');
        if (promptInput) promptInput.focus();
      });
    }

    // API Key Settings Modal
    const modal = document.getElementById('modal-api-key');
    const btnOpenApi = document.getElementById('btn-open-api-settings');
    const btnCloseApi = document.getElementById('btn-close-api-modal');
    const btnSaveKey = document.getElementById('btn-save-key');
    const btnClearKey = document.getElementById('btn-clear-key');
    const inputKey = document.getElementById('input-gemini-key');
    const statusText = document.getElementById('ai-model-status-text');
    const statusIndicator = document.getElementById('ai-model-status-indicator');

    const updateApiBadge = () => {
      if (aiDirector && aiDirector.mode === 'motion') {
        if (statusText) statusText.textContent = 'Text-to-Motion AI + @Tag Compiler';
        if (statusIndicator) statusIndicator.style.background = '#ec4899';
      } else if (aiDirector && aiDirector.hasApiKey()) {
        if (statusText) statusText.textContent = 'Tier 2: Gemini 2.0 Flash';
        if (statusIndicator) statusIndicator.style.background = '#38bdf8';
      } else {
        if (statusText) statusText.textContent = 'Tier 1: Offline Semantic NLP';
        if (statusIndicator) statusIndicator.style.background = '#10b981';
      }
    };
    updateApiBadge();

    // Mode Toggle: Full Stunt Scene vs Text-to-Animation (@Tag)
    const btnModeStunt = document.getElementById('btn-ai-mode-stunt');
    const btnModeMotion = document.getElementById('btn-ai-mode-motion');
    const chipsStuntGroup = document.getElementById('ai-chips-stunt-group');
    const chipsMotionGroup = document.getElementById('ai-chips-motion-group');
    const promptInput = document.getElementById('ai-prompt-input');

    const setAIMode = (mode) => {
      if (aiDirector) aiDirector.mode = mode;
      if (mode === 'motion') {
        btnModeStunt?.classList.remove('active');
        btnModeMotion?.classList.add('active-motion');
        if (chipsStuntGroup) chipsStuntGroup.style.display = 'none';
        if (chipsMotionGroup) chipsMotionGroup.style.display = 'flex';
        if (promptInput) promptInput.placeholder = 'e.g. @anim:FastWalk then spin kick in air then @bhv:CatchFall...';
      } else {
        btnModeMotion?.classList.remove('active-motion');
        btnModeStunt?.classList.add('active');
        if (chipsMotionGroup) chipsMotionGroup.style.display = 'none';
        if (chipsStuntGroup) chipsStuntGroup.style.display = 'flex';
        if (promptInput) promptInput.placeholder = 'Describe stunt or type @ for native tags (@bhv:, @anim:, @pose:)...';
      }
      updateApiBadge();
    };

    btnModeStunt?.addEventListener('click', () => setAIMode('stunt'));
    btnModeMotion?.addEventListener('click', () => setAIMode('motion'));

    // Live @-Tag Autocomplete Popup
    const autocompleteBox = document.getElementById('ai-tag-autocomplete');
    const btnInsertAtTag = document.getElementById('btn-insert-at-tag');
    let activeMatches = [];
    let selectedMatchIdx = 0;

    const closeAutocomplete = () => {
      if (autocompleteBox) {
        autocompleteBox.classList.remove('open');
        autocompleteBox.innerHTML = '';
      }
      activeMatches = [];
      selectedMatchIdx = 0;
    };

    const applyAutocompleteTag = (tagStr) => {
      if (!promptInput) return;
      const val = promptInput.value;
      const caret = promptInput.selectionStart ?? val.length;
      const beforeCaret = val.slice(0, caret);
      const afterCaret = val.slice(caret);
      const replacedBefore = beforeCaret.replace(/@[a-zA-Z0-9_:-]*$/, `${tagStr} `);
      promptInput.value = replacedBefore + afterCaret;
      promptInput.focus();
      const newPos = replacedBefore.length;
      promptInput.setSelectionRange(newPos, newPos);
      closeAutocomplete();
    };

    const renderAutocompleteList = (query) => {
      if (!autocompleteBox || !aiDirector) return;
      const catalog = aiDirector.getAutocompleteCatalog();
      const q = (query || '').toLowerCase();

      activeMatches = catalog.filter(item => {
        return item.tag.toLowerCase().includes(q) ||
               item.label.toLowerCase().includes(q) ||
               item.category.toLowerCase().includes(q);
      }).slice(0, 14);

      if (activeMatches.length === 0) {
        closeAutocomplete();
        return;
      }

      selectedMatchIdx = Math.min(selectedMatchIdx, activeMatches.length - 1);
      autocompleteBox.innerHTML = '';

      activeMatches.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = `ai-tag-item${idx === selectedMatchIdx ? ' selected' : ''}`;
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
            <span>${item.icon}</span>
            <span class="ai-tag-code" style="color: ${item.color};">${item.tag}</span>
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
          </div>
          <span class="ai-tag-cat-badge">${item.category}</span>
        `;
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          applyAutocompleteTag(item.tag);
        });
        autocompleteBox.appendChild(row);
      });

      autocompleteBox.classList.add('open');
    };

    if (btnInsertAtTag && promptInput) {
      btnInsertAtTag.addEventListener('click', () => {
        const val = promptInput.value;
        const needsSpace = val.length > 0 && !val.endsWith(' ');
        promptInput.value = `${val}${needsSpace ? ' ' : ''}@`;
        promptInput.focus();
        renderAutocompleteList('@');
      });
    }

    if (promptInput) {
      promptInput.addEventListener('input', () => {
        const val = promptInput.value;
        const caret = promptInput.selectionStart ?? val.length;
        const beforeCaret = val.slice(0, caret);
        const match = beforeCaret.match(/(@[a-zA-Z0-9_:-]*)$/);
        if (match) {
          selectedMatchIdx = 0;
          renderAutocompleteList(match[1]);
        } else {
          closeAutocomplete();
        }
      });

      promptInput.addEventListener('blur', () => {
        setTimeout(closeAutocomplete, 160);
      });
    }

    if (btnOpenApi && modal) {
      btnOpenApi.addEventListener('click', () => {
        if (inputKey && aiDirector) inputKey.value = aiDirector.apiKey || '';
        modal.style.display = 'flex';
      });
    }
    if (btnCloseApi && modal) {
      btnCloseApi.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
    if (btnSaveKey && modal && inputKey && aiDirector) {
      btnSaveKey.addEventListener('click', () => {
        aiDirector.setApiKey(inputKey.value);
        updateApiBadge();
        modal.style.display = 'none';
      });
    }
    if (btnClearKey && modal && aiDirector) {
      btnClearKey.addEventListener('click', () => {
        aiDirector.setApiKey('');
        if (inputKey) inputKey.value = '';
        updateApiBadge();
        modal.style.display = 'none';
      });
    }

    // Chat Execution
    const btnSend = document.getElementById('btn-ai-submit');
    const chatThread = document.getElementById('ai-chat-thread');

    const executePrompt = async (prompt) => {
      if (!prompt || !aiDirector) return;
      historyManager.pushState(`AI Stunt: ${prompt.slice(0, 20)}...`);
      if (promptInput) promptInput.value = '';
      closeAutocomplete();

      const userMsg = document.createElement('div');
      userMsg.className = 'ai-msg ai-msg-user';
      userMsg.textContent = prompt;
      chatThread.appendChild(userMsg);

      const thinkingMsg = document.createElement('div');
      thinkingMsg.className = 'ai-msg ai-msg-assistant';
      thinkingMsg.innerHTML = '<span style="color: #38bdf8;">🎬 Compiling @tags &amp; synthesizing 15-bone motion tracks...</span>';
      chatThread.appendChild(thinkingMsg);
      chatThread.scrollTop = chatThread.scrollHeight;

      try {
        const result = await aiDirector.processPrompt(prompt);
        const formattedContent = (result.content || '')
          .replace(/\n\n/g, '<br><br>')
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code style="background: #1e293b; padding: 1px 4px; border-radius: 3px; font-family: monospace; color: #38bdf8;">$1</code>');
        
        thinkingMsg.innerHTML = formattedContent;

        if (result.generatedClips && result.generatedClips.length > 0) {
          const actionsRow = document.createElement('div');
          actionsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #1e293b;';
          result.generatedClips.forEach(clip => {
            const btnDl = document.createElement('button');
            btnDl.style.cssText = 'background: rgba(236, 72, 153, 0.14); border: 1px solid #ec4899; color: #f472b6; border-radius: 4px; padding: 3px 8px; font-size: 10px; font-weight: 700; cursor: pointer;';
            btnDl.textContent = `💾 Save ${clip.tagSlug}.bvh`;
            btnDl.addEventListener('click', () => {
              if (clip.bvhText) {
                downloadFile(clip.bvhText, `${clip.tagSlug}.bvh`, 'text/plain');
                showNotification(`Downloaded ${clip.tagSlug}.bvh`, 'info');
              }
            });
            actionsRow.appendChild(btnDl);
          });
          thinkingMsg.appendChild(actionsRow);
        }
      } catch (err) {
        thinkingMsg.innerHTML = `<span style="color: #f87171;">⚠️ Error: ${err.message}</span>`;
      }

      chatThread.scrollTop = chatThread.scrollHeight;
    };

    if (btnSend && promptInput) {
      btnSend.addEventListener('click', () => executePrompt(promptInput.value.trim()));
      promptInput.addEventListener('keydown', (e) => {
        if (autocompleteBox && autocompleteBox.classList.contains('open') && activeMatches.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedMatchIdx = (selectedMatchIdx + 1) % activeMatches.length;
            autocompleteBox.querySelectorAll('.ai-tag-item').forEach((el, i) => el.classList.toggle('selected', i === selectedMatchIdx));
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedMatchIdx = (selectedMatchIdx - 1 + activeMatches.length) % activeMatches.length;
            autocompleteBox.querySelectorAll('.ai-tag-item').forEach((el, i) => el.classList.toggle('selected', i === selectedMatchIdx));
            return;
          } else if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            applyAutocompleteTag(activeMatches[selectedMatchIdx].tag);
            return;
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeAutocomplete();
            return;
          }
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          executePrompt(promptInput.value.trim());
        }
      });
    }

    // Quick Suggestion Chips
    document.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.dataset.prompt;
        if (p) executePrompt(p);
      });
    });
  }

  // Track property changes inside the Dynamic Inspector for Undo/Redo
  function setupInspectorHistoryTracking() {
    const inspectorPanel = document.getElementById('tab-content-inspector');
    if (inspectorPanel) {
      let preEditSnapshot = null;
      inspectorPanel.addEventListener('focusin', (e) => {
        if (e.target && e.target.matches && e.target.matches('input, select, textarea')) {
          preEditSnapshot = historyManager.captureState('Edit Property');
        }
      });
      inspectorPanel.addEventListener('change', (e) => {
        if (preEditSnapshot) {
          historyManager.undoStack.push(preEditSnapshot);
          if (historyManager.undoStack.length > historyManager.maxSteps) historyManager.undoStack.shift();
          historyManager.redoStack = [];
          historyManager.updateUI();
          preEditSnapshot = null;
        }
      });
    }
  }

  // Setup NLE Timeline Tools
  function setupNLETimelineTools() {
    const syncTotalFramesUI = () => {
      const totalInput = document.getElementById('timeline-total-frames');
      if (totalInput) totalInput.value = timeline.totalFrames;
      const slider = document.getElementById('timeline-slider');
      if (slider) slider.max = timeline.totalFrames;
      buildRulerTicks();
      renderTimelineLayers();
      renderLayerInspector();
      updateTimelineUI();
      updateSimulationStatusUI();
    };

    const stepToFrame = (targetFrame) => {
      timeline.isPlaying = false;
      timeline.isBakingLive = false;
      const f = THREE.MathUtils.clamp(Math.round(targetFrame), 0, timeline.totalFrames);
      timeline.seek(f);
      updateTimelineUI();
      updateSimulationStatusUI();
      if (isPoseMode) renderPoseInspector();
    };

    // Transport Step Buttons
    document.getElementById('btn-step-start')?.addEventListener('click', () => {
      stepToFrame(0);
    });
    document.getElementById('btn-step-prev')?.addEventListener('click', () => {
      stepToFrame(timeline.currentFrame - 1);
    });
    document.getElementById('btn-step-next')?.addEventListener('click', () => {
      stepToFrame(timeline.currentFrame + 1);
    });
    document.getElementById('btn-step-end')?.addEventListener('click', () => {
      stepToFrame(timeline.totalFrames);
    });

    // Editable Total Frames Duration Input
    const totalInput = document.getElementById('timeline-total-frames');
    if (totalInput) {
      totalInput.value = timeline.totalFrames;
      totalInput.addEventListener('change', (e) => {
        const val = THREE.MathUtils.clamp(parseInt(e.target.value) || 240, 30, 5000);
        timeline.totalFrames = val;
        if (timeline.currentFrame > val) {
          timeline.seek(val);
        }
        timeline.invalidateSimulation();
        syncTotalFramesUI();
        showNotification(`Timeline duration set to ${val} frames`, 'info');
      });
    }

    // Undo / Redo Toolbar Buttons
    document.getElementById('btn-timeline-undo')?.addEventListener('click', () => {
      historyManager.undo();
    });
    document.getElementById('btn-timeline-redo')?.addEventListener('click', () => {
      historyManager.redo();
    });

    // Split / Cut Clip at Playhead
    document.getElementById('btn-timeline-split')?.addEventListener('click', () => {
      const f = timeline.currentFrame;
      historyManager.pushState('Split Track');
      const res = timeline.splitLayerAtFrame(f, timeline.selectedLayerId);
      if (!res) {
        historyManager.undoStack.pop(); // Revert snapshot if operation aborted
        historyManager.updateUI();
        showNotification(`Move the playhead (currently F:${f}) inside an active clip to split it`, 'error');
        return;
      }
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`✂️ Split clip at frame ${f} into "${res.leftLayer.name}" & "${res.rightLayer.name}"`, 'success');
    });

    // Trim In (Start to Playhead)
    document.getElementById('btn-timeline-trim-in')?.addEventListener('click', () => {
      const f = timeline.currentFrame;
      historyManager.pushState('Trim Track Start');
      const layer = timeline.trimLayerStartToFrame(f, timeline.selectedLayerId);
      if (!layer) {
        historyManager.undoStack.pop();
        historyManager.updateUI();
        showNotification(`Cannot trim start to frame ${f} (select a clip where ${f} < endFrame)`, 'error');
        return;
      }
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`⇤ Trimmed "${layer.name}" start to frame ${f}`, 'success');
    });

    // Trim Out / Shorten (End to Playhead)
    document.getElementById('btn-timeline-trim-out')?.addEventListener('click', () => {
      const f = timeline.currentFrame;
      historyManager.pushState('Trim Track End');
      const layer = timeline.trimLayerEndToFrame(f, timeline.selectedLayerId);
      if (!layer) {
        historyManager.undoStack.pop();
        historyManager.updateUI();
        showNotification(`Cannot shorten clip end to frame ${f} (select a clip where ${f} > startFrame)`, 'error');
        return;
      }
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`⇥ Shortened "${layer.name}" end to frame ${f}`, 'success');
    });

    // Duplicate Selected Clip
    document.getElementById('btn-timeline-duplicate')?.addEventListener('click', () => {
      const target = timeline.getSelectedLayer() || timeline.findTargetLayerForEdit(null, false);
      if (!target) {
        showNotification('Select a clip on the timeline to duplicate', 'error');
        return;
      }
      historyManager.pushState(`Duplicate ${target.name}`);
      const dup = timeline.duplicateLayer(target.id);
      if (dup) {
        syncTotalFramesUI();
        showNotification(`⧉ Duplicated "${dup.name}" (${dup.startFrame}f–${dup.endFrame}f)`, 'success');
      }
    });

    // Delete Selected Clip
    document.getElementById('btn-timeline-delete')?.addEventListener('click', () => {
      const target = timeline.getSelectedLayer();
      if (!target) {
        showNotification('Select a clip on the timeline to delete', 'error');
        return;
      }
      const name = target.name;
      historyManager.pushState(`Delete Track: ${name}`);
      timeline.removeLayer(target.id);
      renderTimelineLayers();
      renderLayerInspector();
      updateSimulationStatusUI();
      showNotification(`🗑️ Deleted track "${name}"`, 'info');
    });

    // Fit Timeline Range to Active Clips
    document.getElementById('btn-timeline-fit')?.addEventListener('click', () => {
      historyManager.pushState('Fit Timeline Duration');
      const newTotal = timeline.fitTimelineToLayers(60, 0);
      syncTotalFramesUI();
      showNotification(`↔ Fitted timeline range to ${newTotal} frames`, 'success');
    });
  }

  // Setup Panel Resizers (Timeline height, Left panel width, Right panel width)
  function setupPanelResizers() {
    // 1. Timeline Top Edge Resizer (Vertical Height)
    const timelineResizer = document.getElementById('resizer-timeline');
    const footerEl = document.querySelector('footer');
    if (timelineResizer && footerEl) {
      let isResizingTimeline = false;
      let startY = 0;
      let startHeight = 230;

      timelineResizer.addEventListener('pointerdown', (e) => {
        isResizingTimeline = true;
        startY = e.clientY;
        startHeight = footerEl.getBoundingClientRect().height;
        timelineResizer.classList.add('is-dragging');
        try { timelineResizer.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
      });

      window.addEventListener('pointermove', (e) => {
        if (!isResizingTimeline) return;
        const deltaY = startY - e.clientY;
        const maxTimelineHeight = Math.max(260, Math.floor(window.innerHeight * 0.68));
        const newHeight = THREE.MathUtils.clamp(startHeight + deltaY, 130, maxTimelineHeight);
        footerEl.style.height = `${newHeight}px`;
        onWindowResize();
      });

      window.addEventListener('pointerup', () => {
        if (!isResizingTimeline) return;
        isResizingTimeline = false;
        timelineResizer.classList.remove('is-dragging');
        document.body.style.cursor = '';
        onWindowResize();
        buildRulerTicks();
      });
    }

    // 2. Left Panel Right Edge Resizer (Horizontal Width)
    const leftResizer = document.getElementById('resizer-left-panel');
    const leftPanel = document.querySelector('.panel-left');
    const secondaryMenu = document.getElementById('behavior-secondary-menu');
    if (leftResizer && leftPanel) {
      let isResizingLeft = false;
      let startX = 0;
      let startWidth = 280;

      leftResizer.addEventListener('pointerdown', (e) => {
        isResizingLeft = true;
        startX = e.clientX;
        startWidth = leftPanel.getBoundingClientRect().width;
        leftResizer.classList.add('is-dragging');
        try { leftResizer.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
      });

      window.addEventListener('pointermove', (e) => {
        if (!isResizingLeft) return;
        const deltaX = e.clientX - startX;
        const newWidth = THREE.MathUtils.clamp(startWidth + deltaX, 190, 500);
        leftPanel.style.width = `${newWidth}px`;
        if (secondaryMenu) {
          secondaryMenu.style.left = `${newWidth}px`;
        }
        onWindowResize();
      });

      window.addEventListener('pointerup', () => {
        if (!isResizingLeft) return;
        isResizingLeft = false;
        leftResizer.classList.remove('is-dragging');
        document.body.style.cursor = '';
        onWindowResize();
        buildRulerTicks();
      });
    }

    // 3. Right Panel Left Edge Resizer (Horizontal Width)
    const rightResizer = document.getElementById('resizer-right-panel');
    const rightPanel = document.querySelector('.panel-right');
    if (rightResizer && rightPanel) {
      let isResizingRight = false;
      let startX = 0;
      let startWidth = 325;

      rightResizer.addEventListener('pointerdown', (e) => {
        isResizingRight = true;
        startX = e.clientX;
        startWidth = rightPanel.getBoundingClientRect().width;
        rightResizer.classList.add('is-dragging');
        try { rightResizer.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
      });

      window.addEventListener('pointermove', (e) => {
        if (!isResizingRight) return;
        const deltaX = startX - e.clientX;
        const newWidth = THREE.MathUtils.clamp(startWidth + deltaX, 220, 540);
        rightPanel.style.width = `${newWidth}px`;
        onWindowResize();
      });

      window.addEventListener('pointerup', () => {
        if (!isResizingRight) return;
        isResizingRight = false;
        rightResizer.classList.remove('is-dragging');
        document.body.style.cursor = '';
        onWindowResize();
        buildRulerTicks();
      });
    }
  }

  // 3D Transform Mode Switchers (W: Translate, E: Rotate, R: Scale)
  document.getElementById('btn-transform-move')?.addEventListener('click', () => setTransformMode('translate'));
  document.getElementById('btn-transform-rotate')?.addEventListener('click', () => setTransformMode('rotate'));
  document.getElementById('btn-transform-scale')?.addEventListener('click', () => setTransformMode('scale'));

  document.getElementById('menu-transform-move')?.addEventListener('click', () => setTransformMode('translate'));
  document.getElementById('menu-transform-rotate')?.addEventListener('click', () => setTransformMode('rotate'));
  document.getElementById('menu-transform-scale')?.addEventListener('click', () => setTransformMode('scale'));

  // Initialize UI Subsystems
  setupActorStagingUI();
  setupNLETimelineTools();
  setupPanelResizers();
  setupMocapLibraryModal();
  setupBehaviorFlowGraphModal();
  setupTopMenuBar();
  setupAIStuntDirectorUI();
  setupInspectorHistoryTracking();
  setupZMPBalanceInspector();

  // Initialize Global Keyboard Shortcuts
  initKeyboardShortcuts();

  // Initialize Global Setting & Item Explanation Tooltips & Guide HUD Cards
  setupSettingExplanationTooltips();

  updateSimulationStatusUI();
}

// --- CAMERA FOCUS ON CURRENT SELECTION ---
function focusCameraOnSelection() {
  if (!controls) return;
  if (selectedPropId) {
    const prop = propsManager?.props.find(p => p.id === selectedPropId);
    if (prop && prop.mesh) {
      controls.target.copy(prop.mesh.position);
    }
  } else if (selectedTargetBone && character) {
    const b = character.bodies[selectedTargetBone];
    if (b && b.mesh) {
      controls.target.copy(b.mesh.position);
    }
  } else if (character && character.bodies && character.bodies['Pelvis']) {
    const p = character.bodies['Pelvis'].mesh.position;
    controls.target.set(p.x, p.y, p.z);
  } else if (charGizmoAnchor) {
    controls.target.set(charGizmoAnchor.position.x, charGizmoAnchor.position.y, charGizmoAnchor.position.z);
  }
}

// --- GLOBAL KEYBOARD SHORTCUTS (ENDPHIN / DCC INDUSTRY STANDARD) ---
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 1. Guard against active text inputs, search fields, textareas, selects
    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || activeEl?.isContentEditable) {
      if (e.key === 'Escape') {
        activeEl.blur();
      }
      return;
    }

    // Ctrl+Z / Cmd+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      historyManager.undo();
      return;
    }

    // Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z: Redo
    if (((e.ctrlKey || e.metaKey) && e.code === 'KeyY') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ')) {
      e.preventDefault();
      historyManager.redo();
      return;
    }

    // 2. Ctrl+Space / Cmd+Space: Rerun Simulation from Frame 0
    if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const resimBtn = document.getElementById('btn-resim');
      if (resimBtn) resimBtn.click();
      return;
    }

    // Space: Play / Pause Simulation Playback
    if (e.code === 'Space') {
      e.preventDefault();
      const playBtn = document.getElementById('btn-play');
      if (playBtn) playBtn.click();
      return;
    }

    // 3. P: Toggle Active Pose Mode
    if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      togglePoseMode();
      return;
    }

    // 4. I: Insert Keyframe on Active Pose Track at Current Frame
    if (e.code === 'KeyI' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      recordCurrentPoseKeyframe();
      return;
    }

    // 5. W, E, R: 3D Transform Modes (Translate, Rotate, Scale)
    if (e.code === 'KeyW' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (isPoseMode && selectedPoseBone === 'Pelvis') {
        poseGizmoMode = 'translate';
        if (poseTransformControls) poseTransformControls.setMode('translate');
        renderPoseInspector();
      } else {
        setTransformMode('translate');
      }
      return;
    }
    if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (isPoseMode) {
        poseGizmoMode = 'rotate';
        if (poseTransformControls) poseTransformControls.setMode('rotate');
        renderPoseInspector();
      } else {
        setTransformMode('rotate');
      }
      return;
    }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setTransformMode('scale');
      return;
    }

    // 6. S: Split Active Clip at Playhead
    if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      document.getElementById('btn-timeline-split')?.click();
      return;
    }

    // 7. D: Duplicate Active Clip
    if (e.code === 'KeyD' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      document.getElementById('btn-timeline-duplicate')?.click();
      return;
    }

    // 8. [ / ]: NLE Trim In / Trim Out
    if (e.key === '[') {
      e.preventDefault();
      document.getElementById('btn-timeline-trim-in')?.click();
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      document.getElementById('btn-timeline-trim-out')?.click();
      return;
    }

    // 9. F: Focus Camera on Current Selection (Prop, Bone, or Character)
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      focusCameraOnSelection();
      return;
    }

    // 10. T: Reset Character to T-Pose
    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      character.resetToTPose();
      if (mixamoBridge && mixamoBridge.isVisible) mixamoBridge.update();
      timeline.invalidateSimulation();
      updateSimulationStatusUI();
      return;
    }

    // 11. Delete / Backspace: Delete Keyframe, Selected Prop, or Timeline Layer
    if (e.code === 'Delete' || e.code === 'Backspace') {
      const activeLayer = timeline.getSelectedLayer();
      if (activeLayer && activeLayer.animType === 'pose' && activeLayer.keyframes) {
        const hasKf = activeLayer.keyframes.some(k => k.frame === timeline.currentFrame);
        if (hasKf) {
          e.preventDefault();
          historyManager.pushState(`Delete Keyframe @ F:${timeline.currentFrame}`);
          timeline.removePoseKeyframe(activeLayer.id, timeline.currentFrame);
          renderTimelineLayers();
          renderLayerInspector();
          updateSimulationStatusUI();
          return;
        }
      }

      if (selectedPropId) {
        e.preventDefault();
        historyManager.pushState('Delete Selected Prop');
        propsManager.removeProp(selectedPropId);
        deselectProp();
        timeline.invalidateSimulation();
        updateSimulationStatusUI();
        renderSceneOutliner();
        return;
      } else if (timeline.selectedLayerId) {
        e.preventDefault();
        const curLayer = timeline.getSelectedLayer();
        historyManager.pushState(`Delete Track: ${curLayer?.name || 'Selected'}`);
        timeline.removeLayer(timeline.selectedLayerId);
        renderTimelineLayers();
        renderLayerInspector();
        updateSimulationStatusUI();
        return;
      } else if (selectedTargetBone) {
        e.preventDefault();
        deselectBone();
        return;
      }
    }

    // 7. Arrow Left / Right: Frame Stepping (Shift = 10 frames)
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const newFrame = Math.max(0, timeline.currentFrame - step);
      timeline.seek(newFrame);
      updateTimelineUI();
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const newFrame = Math.min(timeline.totalFrames - 1, timeline.currentFrame + step);
      timeline.seek(newFrame);
      updateTimelineUI();
      return;
    }

    // 8. Home / End: Frame 0 / Last Frame
    if (e.code === 'Home') {
      e.preventDefault();
      timeline.seek(0);
      updateTimelineUI();
      return;
    }
    if (e.code === 'End') {
      e.preventDefault();
      timeline.seek(timeline.totalFrames - 1);
      updateTimelineUI();
      return;
    }

    // 9. G: Toggle Biomechanical Gizmos (CoM & Support Base)
    if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const gizmoBtn = document.getElementById('btn-toggle-gizmos');
      if (gizmoBtn) gizmoBtn.click();
      return;
    }

    // 10. Escape: Deselect All
    if (e.code === 'Escape') {
      e.preventDefault();
      deselectProp();
      deselectBone();
      timeline.selectedLayerId = null;
      document.querySelectorAll('.layer-row.selected').forEach(r => r.classList.remove('selected'));
      renderLayerInspector();
      renderSceneOutliner();
      return;
    }
  });
}

function onWindowResize() {
  const container = document.getElementById('viewport-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement('a');
  const blob = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();
