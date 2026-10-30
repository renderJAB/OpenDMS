import initJolt from 'jolt-physics/wasm-compat';

let joltModule = null;
let currentJoltInterface = null;
let currentFloorBodyId = null;

export const JOLT_GROUND_MATERIALS = {
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

export async function initJoltPhysics() {
  if (!joltModule) {
    joltModule = await initJolt();
  }

  cleanupJolt();

  const Jolt = joltModule;
  const NUM_OBJECT_LAYERS = 2;
  const NUM_BROAD_PHASE_LAYERS = 2;
  const BP_LAYER_NON_MOVING = new Jolt.BroadPhaseLayer(0);
  const BP_LAYER_MOVING = new Jolt.BroadPhaseLayer(1);

  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BROAD_PHASE_LAYERS);
  bpInterface.MapObjectToBroadPhaseLayer(0, BP_LAYER_NON_MOVING);
  bpInterface.MapObjectToBroadPhaseLayer(1, BP_LAYER_MOVING);

  const objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
  objectFilter.EnableCollision(0, 1);
  objectFilter.EnableCollision(1, 1);

  const bpFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bpInterface, NUM_BROAD_PHASE_LAYERS, objectFilter, NUM_OBJECT_LAYERS);

  const settings = new Jolt.JoltSettings();
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectLayerPairFilter = objectFilter;
  settings.mObjectVsBroadPhaseLayerFilter = bpFilter;

  currentJoltInterface = new Jolt.JoltInterface(settings);
  const physicsSystem = currentJoltInterface.GetPhysicsSystem();
  physicsSystem.SetGravity(new Jolt.Vec3(0, -9.81, 0));

  const bodyInterface = physicsSystem.GetBodyInterface();

  // Ground Floor Body
  const floorShape = new Jolt.BoxShape(new Jolt.Vec3(50, 0.5, 50));
  const floorSettings = new Jolt.BodyCreationSettings(
    floorShape,
    new Jolt.RVec3(0, -0.5, 0),
    new Jolt.Quat(0, 0, 0, 1),
    Jolt.EMotionType_Static,
    0
  );
  floorSettings.mFriction = 1.4;
  floorSettings.mRestitution = 0.0;
  const floorBody = bodyInterface.CreateBody(floorSettings);
  bodyInterface.AddBody(floorBody.GetID(), Jolt.EActivation_DontActivate);
  currentFloorBodyId = floorBody.GetID();

  return {
    jolt: Jolt,
    joltInterface: currentJoltInterface,
    physicsSystem,
    bodyInterface
  };
}

export function getJolt() {
  return joltModule;
}

export function getJoltInterface() {
  return currentJoltInterface;
}

export function stepJoltPhysics(dt = 1 / 120) {
  if (currentJoltInterface) {
    currentJoltInterface.Step(dt, 2);
  }
}

export function setJoltGroundMaterial(type = 'concrete') {
  if (!currentJoltInterface || !currentFloorBodyId) return;
  const mat = JOLT_GROUND_MATERIALS[type] || JOLT_GROUND_MATERIALS.concrete;
  const bodyInterface = currentJoltInterface.GetPhysicsSystem().GetBodyInterface();
  bodyInterface.SetFriction(currentFloorBodyId, mat.friction);
  bodyInterface.SetRestitution(currentFloorBodyId, mat.restitution);
}

export function cleanupJolt() {
  if (currentJoltInterface) {
    try {
      const Jolt = joltModule;
      if (Jolt && typeof Jolt.destroy === 'function') {
        Jolt.destroy(currentJoltInterface);
      }
    } catch (e) {
      console.warn('Error destroying JoltInterface:', e);
    }
    currentJoltInterface = null;
    currentFloorBodyId = null;
  }
}
