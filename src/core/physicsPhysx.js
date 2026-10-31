import PhysXModule from 'physx-js-webidl';
import physxWasmUrl from 'physx-js-webidl/physx-js-webidl.wasm?url';

let physxModule = null;
let currentPhysics = null;
let currentFoundation = null;
let currentScene = null;
let currentCpuDispatcher = null;
let currentFloorActor = null;
let currentDefaultMaterial = null;

export const PHYSX_GROUND_MATERIALS = {
  default:  { name: 'Endorphin Default', friction: 1.4, restitution: 0.2 },
  concrete: { name: 'Default Concrete', friction: 1.4, restitution: 0.0 },
  skin:     { name: 'Human Skin (CMF)', friction: 1.2, restitution: 0.1 },
  ice:      { name: 'Slick Ice Surface', friction: 0.05, restitution: 0.5 },
  rubber:   { name: 'Bouncy Rubber Floor', friction: 2.5, restitution: 0.85 },
  sponge:   { name: 'Sponge Cushion', friction: 1.8, restitution: 0.05 },
  steel:    { name: 'Polished Steel', friction: 0.8, restitution: 0.6 },
  tarmac:   { name: 'High-Grip Tarmac', friction: 2.0, restitution: 0.1 },
  velcro:   { name: 'Infinite-Grip Velcro', friction: 10.0, restitution: 0.0 }
};

export async function initPhysxPhysics() {
  if (!physxModule) {
    physxModule = await PhysXModule({
      locateFile(path) {
        if (path.endsWith('.wasm')) return physxWasmUrl;
        return path;
      }
    });
  }

  const PhysX = physxModule;

  // 1. Initialize Global PhysX Foundation & Physics singleton once per app lifecycle
  if (!currentFoundation || !currentPhysics) {
    let version = 0x05010100;
    try {
      if (typeof PhysX.PHYSICS_VERSION === 'number') {
        version = PhysX.PHYSICS_VERSION;
      } else if (typeof PhysX.PxTopLevelFunctions?.PHYSICS_VERSION === 'number') {
        version = PhysX.PxTopLevelFunctions.PHYSICS_VERSION;
      } else if (typeof PhysX.PxTopLevelFunctions?.prototype?.PHYSICS_VERSION === 'number') {
        version = PhysX.PxTopLevelFunctions.prototype.PHYSICS_VERSION;
      }
    } catch (e) {
      version = 0x05010100;
    }

    const allocator = new PhysX.PxDefaultAllocator();
    const errorCallback = new PhysX.PxDefaultErrorCallback();

    const createFoundationFn = PhysX.CreateFoundation || PhysX.PxTopLevelFunctions?.CreateFoundation || PhysX.PxTopLevelFunctions?.prototype?.CreateFoundation;
    currentFoundation = createFoundationFn(version, allocator, errorCallback);

    const tolerancesScale = new PhysX.PxTolerancesScale();
    const createPhysicsFn = PhysX.CreatePhysics || PhysX.PxTopLevelFunctions?.CreatePhysics || PhysX.PxTopLevelFunctions?.prototype?.CreatePhysics;
    currentPhysics = createPhysicsFn(version, currentFoundation, tolerancesScale);

    const initExtFn = PhysX.InitExtensions || PhysX.PxTopLevelFunctions?.InitExtensions || PhysX.PxTopLevelFunctions?.prototype?.InitExtensions;
    if (initExtFn) initExtFn(currentPhysics);

    currentDefaultMaterial = currentPhysics.createMaterial(1.4, 1.4, 0.0);
  }

  // 2. Clear any existing scene to avoid duplicate actors/worlds
  cleanupPhysx();

  const tolerancesScale = new PhysX.PxTolerancesScale();
  const sceneDesc = new PhysX.PxSceneDesc(tolerancesScale);
  sceneDesc.gravity = new PhysX.PxVec3(0, -9.81, 0);

  const cpuDispFn = PhysX.DefaultCpuDispatcherCreate || PhysX.PxTopLevelFunctions?.DefaultCpuDispatcherCreate || PhysX.PxTopLevelFunctions?.prototype?.DefaultCpuDispatcherCreate;
  currentCpuDispatcher = cpuDispFn(0);
  sceneDesc.cpuDispatcher = currentCpuDispatcher;

  const filterShaderFn = PhysX.DefaultFilterShader || PhysX.PxTopLevelFunctions?.DefaultFilterShader || PhysX.PxTopLevelFunctions?.prototype?.DefaultFilterShader;
  sceneDesc.filterShader = filterShaderFn();

  try {
    if (sceneDesc.flags?.raise && PhysX.PxSceneFlagEnum) {
      if (PhysX.PxSceneFlagEnum.eENABLE_PCM !== undefined) {
        sceneDesc.flags.raise(PhysX.PxSceneFlagEnum.eENABLE_PCM);
      }
      if (PhysX.PxSceneFlagEnum.eENABLE_STABILIZATION !== undefined) {
        sceneDesc.flags.raise(PhysX.PxSceneFlagEnum.eENABLE_STABILIZATION);
      }
      if (PhysX.PxSceneFlagEnum.eENABLE_CCD !== undefined) {
        sceneDesc.flags.raise(PhysX.PxSceneFlagEnum.eENABLE_CCD);
      }
    }
  } catch (flagErr) {
    console.warn('[PhysX 5] Scene flags setup note:', flagErr);
  }

  currentScene = currentPhysics.createScene(sceneDesc);

  // Ground plane: 100m x 2.0m x 100m centered at y = -1.0 (top surface strictly at y = 0.0)
  const groundGeo = new PhysX.PxBoxGeometry(50.0, 1.0, 50.0);
  const groundShape = currentPhysics.createShape(groundGeo, currentDefaultMaterial);
  
  if (PhysX.PxShapeFlagEnum) {
    groundShape.setFlag(PhysX.PxShapeFlagEnum.eSIMULATION_SHAPE, true);
    groundShape.setFlag(PhysX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE, true);
  }
  if (typeof groundShape.setContactOffset === 'function') groundShape.setContactOffset(0.02);
  if (typeof groundShape.setRestOffset === 'function') groundShape.setRestOffset(0.0);

  // CRITICAL: PhysX DefaultFilterShader evaluates: (filterData0.w0 & filterData1.w1) && (filterData1.w0 & filterData0.w1)
  // Without non-zero filterData on both ground & character shapes, collisions are suppressed!
  const groundFilterData = new PhysX.PxFilterData(0xFFFF, 0xFFFF, 0, 0);
  groundShape.setSimulationFilterData(groundFilterData);

  const groundPose = new PhysX.PxTransform(new PhysX.PxVec3(0, -1.0, 0), new PhysX.PxQuat(0, 0, 0, 1));
  currentFloorActor = currentPhysics.createRigidStatic(groundPose);
  currentFloorActor.attachShape(groundShape);
  currentScene.addActor(currentFloorActor);

  console.log('[PhysX 5] Engine successfully initialized!');

  return {
    physx: PhysX,
    physics: currentPhysics,
    scene: currentScene,
    material: currentDefaultMaterial
  };
}

export function getPhysx() {
  return physxModule;
}

export function getPhysxScene() {
  return currentScene;
}

export function getPhysxPhysics() {
  return currentPhysics;
}

export function getPhysxMaterial() {
  return currentDefaultMaterial;
}

export function stepPhysxPhysics(dt = 1 / 120) {
  if (currentScene) {
    currentScene.simulate(dt);
    currentScene.fetchResults(true);
  }
}

export function setPhysxGroundMaterial(type = 'concrete') {
  if (!currentPhysics || !currentFloorActor) return;
  const mat = PHYSX_GROUND_MATERIALS[type] || PHYSX_GROUND_MATERIALS.concrete;
  if (currentDefaultMaterial) {
    currentDefaultMaterial.setStaticFriction(mat.friction);
    currentDefaultMaterial.setDynamicFriction(mat.friction);
    currentDefaultMaterial.setRestitution(mat.restitution);
  }
}

export function cleanupPhysx() {
  if (currentScene) {
    try {
      if (currentFloorActor) {
        currentScene.removeActor(currentFloorActor);
        currentFloorActor = null;
      }
      const PhysX = physxModule;
      if (PhysX && typeof PhysX.destroy === 'function') {
        PhysX.destroy(currentScene);
      }
    } catch (e) {
      console.warn('Error releasing PhysX scene:', e);
    }
    currentScene = null;
  }
  if (currentCpuDispatcher) {
    try {
      const PhysX = physxModule;
      if (PhysX && typeof PhysX.destroy === 'function') {
        PhysX.destroy(currentCpuDispatcher);
      }
    } catch (e) {}
    currentCpuDispatcher = null;
  }
}
