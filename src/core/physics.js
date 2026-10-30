import RAPIER from '@dimforge/rapier3d-compat';

let world = null;
let rapierLoaded = false;
let groundCollider = null;

export const GROUND_MATERIALS = {
  default:  { name: 'Endorphin Default', friction: 1.4, restitution: 0.2, softness: 0.0001, slip: 0.01 },
  concrete: { name: 'Default Concrete', friction: 1.4, restitution: 0.0, softness: 0.0001, slip: 0.01 },
  skin:     { name: 'Human Skin (CMF)', friction: 1.2, restitution: 0.1, softness: 0.001, slip: 0.02 },
  ice:      { name: 'Slick Ice Surface', friction: 0.05, restitution: 0.5, softness: 0.00001, slip: 0.5 },
  rubber:   { name: 'Bouncy Rubber Floor', friction: 2.5, restitution: 0.85, softness: 0.001, slip: 0.001 },
  sponge:   { name: 'Sponge Cushion', friction: 1.6, restitution: 0.05, softness: 0.05, slip: 0.01 },
  steel:    { name: 'Polished Steel', friction: 0.8, restitution: 0.6, softness: 0.00001, slip: 0.05 },
  tarmac:   { name: 'High-Grip Tarmac', friction: 2.0, restitution: 0.1, softness: 0.00005, slip: 0.005 },
  velcro:   { name: 'Infinite-Grip Velcro', friction: 10.0, restitution: 0.0, softness: 0.0001, slip: 0.0, infiniteFriction: true }
};

export async function initPhysics() {
  if (!rapierLoaded) {
    await RAPIER.init();
    rapierLoaded = true;
  }
  
  // Standard gravity (-9.81 m/s^2 matching endorphin default)
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  world = new RAPIER.World(gravity);

  // High-precision constraint resolution matching Endorphin Kea LCP solver
  // 16 solver iterations eliminates joint stretch and rubbery softness in articulated chains
  world.integrationParameters.numSolverIterations = 16;
  world.integrationParameters.numAdditionalFrictionIterations = 8;
  world.integrationParameters.maxCcdSubsteps = 4;

  // Default ground plane with high friction and zero restitution (anti-slide stiction)
  // Group 0x0001 (Ground), collides with all character parts (mask 0x003F)
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(50.0, 0.5, 50.0)
    .setTranslation(0.0, -0.5, 0.0)
    .setFriction(1.4)
    .setRestitution(0.0)
    .setContactSkin(0.002)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setCollisionGroups((0x0001 << 16) | 0xFFFF);
  groundCollider = world.createCollider(groundColliderDesc);

  return { world, RAPIER };
}

export function setGroundMaterial(type = 'concrete') {
  const mat = GROUND_MATERIALS[type] || GROUND_MATERIALS.concrete;
  if (groundCollider) {
    groundCollider.setFriction(mat.friction);
    groundCollider.setRestitution(mat.restitution);
    groundCollider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
    groundCollider.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
  }
}

export function getWorld() {
  return world;
}

export function stepPhysics(dt = 1 / 120) {
  if (world) {
    world.timestep = dt;
    world.step();
  }
}

export function resetPhysicsWorld() {
  if (world) {
    world.free();
    world = null;
    groundCollider = null;
  }
  return initPhysics();
}
