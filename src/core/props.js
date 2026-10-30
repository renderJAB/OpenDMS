import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const PRIMITIVE_PALETTE = {
  box: 0xd97706,      // Industrial amber
  sphere: 0xe11d48,   // Crimson scarlet
  cylinder: 0x059669, // Forest emerald
  capsule: 0x6366f1,  // Deep indigo
  crate: 0xf59e0b,    // Warm amber
  step: 0x334155      // Dark slate concrete
};

export class PropsManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.engineType = 'rapier';
    this.engineData = null;
    this.props = [];
  }

  setEngine(engineType, data = null) {
    this.engineType = engineType;
    this.engineData = data;
    if (engineType === 'rapier') {
      this.world = data?.world || data || this.world;
    }

    // Recreate existing props in the newly active physics engine
    for (const prop of this.props) {
      if (prop.type === 'fluid') continue;
      this.recreatePropBody(prop);
    }
  }

  // --- GENERAL PRIMITIVE PROP GENERATOR ---
  // Supports Box, Sphere, Cylinder, Capsule, Crate, Step across Rapier, Jolt, PhysX, and MuJoCo
  spawnPrimitive(shapeType = 'box', options = {}) {
    const isDynamic = options.isDynamic !== undefined ? Boolean(options.isDynamic) : (shapeType !== 'step');
    const pos = options.pos || { x: 0, y: 0.35, z: 1.1 };
    const mass = options.mass || 20.0;
    const colorHex = options.color !== undefined ? options.color : (PRIMITIVE_PALETTE[shapeType] || 0x38bdf8);

    let size = options.size ? { ...options.size } : null;
    let radius = options.radius || 0.25;
    let height = options.height || 0.6;

    if (shapeType === 'box' || shapeType === 'crate') {
      if (!size) size = (shapeType === 'crate') ? { x: 0.6, y: 0.44, z: 0.5 } : { x: 0.5, y: 0.5, z: 0.5 };
    } else if (shapeType === 'step') {
      if (!size) size = { x: 1.8, y: 0.3, z: 1.8 };
    } else if (!size) {
      size = { x: 0.5, y: 0.5, z: 0.5 };
    }

    // 1. Visual Mesh Geometry & Material
    let geom;
    if (shapeType === 'box' || shapeType === 'crate' || shapeType === 'step') {
      geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    } else if (shapeType === 'sphere') {
      geom = new THREE.SphereGeometry(radius, 24, 24);
    } else if (shapeType === 'cylinder') {
      geom = new THREE.CylinderGeometry(radius, radius, height, 24);
    } else if (shapeType === 'capsule') {
      geom = new THREE.CapsuleGeometry(radius, height, 16, 16);
    } else {
      geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: shapeType === 'step' ? 0.8 : 0.35,
      metalness: shapeType === 'step' ? 0.1 : 0.3
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(pos.x, pos.y, pos.z);

    const propId = `prop_${shapeType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const propName = options.name || `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} #${this.props.length + 1}`;

    const prop = {
      id: propId,
      name: propName,
      shapeType,
      type: shapeType,
      mesh,
      material: mat,
      isDynamic,
      mass,
      size,
      radius,
      height,
      color: colorHex,
      initPos: { ...pos },
      initRot: { x: 0, y: 0, z: 0, w: 1 },
      initScale: { x: 1, y: 1, z: 1 },
      scale: { x: 1, y: 1, z: 1 },
      lastScale: { x: 1, y: 1, z: 1 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      engine: this.engineType,
      rigidBody: null,
      rawRigidBody: null,
      collider: null,
      actor: null,
      bodyID: null
    };

    // 2. Create Engine-Specific Physics Body & Unified Adapter
    this.createPhysicsBodyForProp(prop);

    prop.setDynamic = (dynamic) => {
      prop.isDynamic = Boolean(dynamic);
      if (prop.rigidBody) {
        prop.rigidBody.setBodyType(prop.isDynamic ? 0 : 2);
        if (!prop.isDynamic) {
          prop.rigidBody.setLinvel({ x: 0, y: 0, z: 0 });
          prop.rigidBody.setAngvel({ x: 0, y: 0, z: 0 });
        }
      }
    };

    prop.updateTransformFromMesh = () => {
      if (!prop.mesh || !prop.rigidBody) return;
      prop.initPos = {
        x: prop.mesh.position.x,
        y: prop.mesh.position.y,
        z: prop.mesh.position.z
      };
      prop.initRot = {
        x: prop.mesh.quaternion.x,
        y: prop.mesh.quaternion.y,
        z: prop.mesh.quaternion.z,
        w: prop.mesh.quaternion.w
      };
      const euler = new THREE.Euler().setFromQuaternion(prop.mesh.quaternion, 'XYZ');
      prop.rotationEuler = {
        x: THREE.MathUtils.radToDeg(euler.x),
        y: THREE.MathUtils.radToDeg(euler.y),
        z: THREE.MathUtils.radToDeg(euler.z)
      };
      prop.rigidBody.setTranslation(prop.initPos);
      prop.rigidBody.setRotation(prop.initRot);
      if (!prop.isDynamic) {
        prop.rigidBody.setLinvel({ x: 0, y: 0, z: 0 });
        prop.rigidBody.setAngvel({ x: 0, y: 0, z: 0 });
      }

      const sx = prop.mesh.scale.x;
      const sy = prop.mesh.scale.y;
      const sz = prop.mesh.scale.z;
      if (!prop.lastScale || Math.abs(prop.lastScale.x - sx) > 0.001 || Math.abs(prop.lastScale.y - sy) > 0.001 || Math.abs(prop.lastScale.z - sz) > 0.001) {
        this.rebuildCollider(prop);
      }
    };

    mesh.userData = { isProp: true, propId: prop.id, propRef: prop };
    this.scene.add(mesh);
    this.props.push(prop);
    return prop;
  }

  createPhysicsBodyForProp(prop) {
    const isDynamic = prop.isDynamic;
    const pos = prop.initPos || { x: 0, y: 0.35, z: 1.1 };
    const mass = prop.mass || 20.0;
    const shapeType = prop.shapeType || 'box';
    const size = prop.size || { x: 0.5, y: 0.5, z: 0.5 };
    const radius = prop.radius || 0.25;
    const height = prop.height || 0.6;
    prop.engine = this.engineType;

    // --- RAPIER PHYSICS ---
    if (this.engineType === 'rapier' && this.world) {
      try {
        const rbDesc = isDynamic
          ? RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinearDamping(0.6).setAngularDamping(0.8)
          : RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
        const rb = this.world.createRigidBody(rbDesc);

        let colDesc;
        if (shapeType === 'box' || shapeType === 'crate' || shapeType === 'step') {
          colDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        } else if (shapeType === 'sphere') {
          colDesc = RAPIER.ColliderDesc.ball(radius);
        } else if (shapeType === 'cylinder') {
          colDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
        } else if (shapeType === 'capsule') {
          colDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
        } else {
          colDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        }
        colDesc.setFriction(0.85).setRestitution(0.1).setContactSkin(0.002);
        if (isDynamic) colDesc.setMass(mass);
        colDesc.setCollisionGroups((0x0001 << 16) | 0xFFFF);
        const collider = this.world.createCollider(colDesc, rb);

        prop.rawRigidBody = rb;
        prop.collider = collider;
        prop.rigidBody = {
          translation: () => rb.translation(),
          rotation: () => rb.rotation(),
          linvel: () => rb.linvel(),
          angvel: () => rb.angvel(),
          setTranslation: (p) => rb.setTranslation(p, true),
          setRotation: (r) => rb.setRotation(r, true),
          setLinvel: (v) => rb.setLinvel(v, true),
          setAngvel: (w) => rb.setAngvel(w, true),
          applyImpulse: (v) => rb.applyImpulse(v, true),
          setBodyType: (t) => {
            const bt = (t === 0 || t === 'dynamic') ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed;
            rb.setBodyType(bt, true);
          },
          bodyType: () => rb.bodyType()
        };
        return;
      } catch (e) {
        console.warn('[PropsManager] Rapier prop creation fallback:', e);
      }
    }

    // --- JOLT PHYSICS ---
    if (this.engineType === 'jolt' && this.engineData?.jolt && this.engineData?.bodyInterface) {
      try {
        const Jolt = this.engineData.jolt;
        const bi = this.engineData.bodyInterface;
        let joltShape;
        if (shapeType === 'sphere') {
          joltShape = new Jolt.SphereShape(radius);
        } else if (shapeType === 'capsule') {
          joltShape = new Jolt.CapsuleShape(height * 0.5, radius);
        } else if (shapeType === 'cylinder') {
          joltShape = new Jolt.CylinderShape(height * 0.5, radius);
        } else {
          joltShape = new Jolt.BoxShape(new Jolt.Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5));
        }

        const creationSettings = new Jolt.BodyCreationSettings(
          joltShape,
          new Jolt.RVec3(pos.x, pos.y, pos.z),
          new Jolt.Quat(0, 0, 0, 1),
          isDynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static,
          isDynamic ? 1 : 0
        );
        creationSettings.mFriction = 0.85;
        creationSettings.mRestitution = 0.1;
        if (isDynamic) {
          creationSettings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
          creationSettings.mMassPropertiesOverride.mMass = mass;
        }

        const body = bi.CreateBody(creationSettings);
        bi.AddBody(body.GetID(), isDynamic ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate);
        const bodyID = body.GetID();
        prop.bodyID = bodyID;

        prop.rigidBody = {
          translation: () => {
            const p = bi.GetPosition(bodyID);
            return { x: p.GetX(), y: p.GetY(), z: p.GetZ() };
          },
          rotation: () => {
            const q = bi.GetRotation(bodyID);
            return { x: q.GetX(), y: q.GetY(), z: q.GetZ(), w: q.GetW() };
          },
          linvel: () => {
            const v = bi.GetLinearVelocity(bodyID);
            return { x: v.GetX(), y: v.GetY(), z: v.GetZ() };
          },
          angvel: () => {
            const w = bi.GetAngularVelocity(bodyID);
            return { x: w.GetX(), y: w.GetY(), z: w.GetZ() };
          },
          setTranslation: (p) => {
            bi.SetPosition(bodyID, new Jolt.RVec3(p.x, p.y, p.z), Jolt.EActivation_Activate);
          },
          setRotation: (r) => {
            bi.SetRotation(bodyID, new Jolt.Quat(r.x, r.y, r.z, r.w), Jolt.EActivation_Activate);
          },
          setLinvel: (v) => {
            bi.SetLinearVelocity(bodyID, new Jolt.Vec3(v.x || 0, v.y || 0, v.z || 0));
          },
          setAngvel: (w) => {
            bi.SetAngularVelocity(bodyID, new Jolt.Vec3(w.x || 0, w.y || 0, w.z || 0));
          },
          applyImpulse: (v) => {
            bi.AddImpulse(bodyID, new Jolt.Vec3(v.x || 0, v.y || 0, v.z || 0));
          },
          setBodyType: (t) => {
            const motion = (t === 0 || t === 'dynamic') ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static;
            bi.SetMotionType(bodyID, motion, Jolt.EActivation_Activate);
          },
          bodyType: () => bi.GetMotionType(bodyID) === Jolt.EMotionType_Dynamic ? 0 : 2
        };
        return;
      } catch (e) {
        console.warn('[PropsManager] Jolt prop creation fallback:', e);
      }
    }

    // --- PHYSX 5 ---
    if (this.engineType === 'physx' && this.engineData?.physx && this.engineData?.physics && this.engineData?.scene) {
      try {
        const PhysX = this.engineData.physx;
        const physics = this.engineData.physics;
        const scenePhysx = this.engineData.scene;
        const material = this.engineData.material;

        let physxGeo;
        if (shapeType === 'sphere') {
          physxGeo = new PhysX.PxSphereGeometry(radius);
        } else if (shapeType === 'capsule') {
          physxGeo = new PhysX.PxCapsuleGeometry(radius, Math.max(0.01, height * 0.5));
        } else {
          physxGeo = new PhysX.PxBoxGeometry(size.x * 0.5, size.y * 0.5, size.z * 0.5);
        }

        const shape = physics.createShape(physxGeo, material);
        const pose = new PhysX.PxTransform(
          new PhysX.PxVec3(pos.x, pos.y, pos.z),
          new PhysX.PxQuat(0, 0, 0, 1)
        );
        const actor = isDynamic
          ? physics.createRigidDynamic(pose)
          : physics.createRigidStatic(pose);
        actor.attachShape(shape);

        if (isDynamic) {
          actor.setMass(mass);
          actor.setLinearDamping(0.6);
          actor.setAngularDamping(0.8);
          try {
            if (PhysX.PxRigidBodyExt?.prototype?.setMassAndUpdateInertia) {
              PhysX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(actor, mass);
            }
          } catch (e) {}
        }
        scenePhysx.addActor(actor);
        prop.actor = actor;

        prop.rigidBody = {
          translation: () => {
            const p = actor.getGlobalPose().p;
            return { x: p.x, y: p.y, z: p.z };
          },
          rotation: () => {
            const q = actor.getGlobalPose().q;
            return { x: q.x, y: q.y, z: q.z, w: q.w };
          },
          linvel: () => {
            if (isDynamic && actor.getLinearVelocity) {
              const v = actor.getLinearVelocity();
              return { x: v.x, y: v.y, z: v.z };
            }
            return { x: 0, y: 0, z: 0 };
          },
          angvel: () => {
            if (isDynamic && actor.getAngularVelocity) {
              const w = actor.getAngularVelocity();
              return { x: w.x, y: w.y, z: w.z };
            }
            return { x: 0, y: 0, z: 0 };
          },
          setTranslation: (p) => {
            const q = actor.getGlobalPose().q;
            actor.setGlobalPose(new PhysX.PxTransform(new PhysX.PxVec3(p.x, p.y, p.z), q), true);
          },
          setRotation: (r) => {
            const p = actor.getGlobalPose().p;
            actor.setGlobalPose(new PhysX.PxTransform(p, new PhysX.PxQuat(r.x, r.y, r.z, r.w)), true);
          },
          setLinvel: (v) => {
            if (isDynamic && actor.setLinearVelocity) actor.setLinearVelocity(new PhysX.PxVec3(v.x || 0, v.y || 0, v.z || 0), true);
          },
          setAngvel: (w) => {
            if (isDynamic && actor.setAngularVelocity) actor.setAngularVelocity(new PhysX.PxVec3(w.x || 0, w.y || 0, w.z || 0), true);
          },
          applyImpulse: (v) => {
            if (isDynamic && actor.addForce) actor.addForce(new PhysX.PxVec3(v.x || 0, v.y || 0, v.z || 0), PhysX.PxForceModeEnum.eIMPULSE, true);
          },
          setBodyType: (t) => {
            if (actor.setRigidBodyFlag) {
              const isKine = (t !== 0 && t !== 'dynamic');
              const kineFlag = PhysX.PxRigidBodyFlagEnum?.eKINEMATIC ?? 1;
              actor.setRigidBodyFlag(kineFlag, isKine);
              if (!isKine) actor.wakeUp();
            }
          },
          bodyType: () => isDynamic ? 0 : 2
        };
        return;
      } catch (e) {
        console.warn('[PropsManager] PhysX prop creation fallback:', e);
      }
    }

    // --- KINEMATIC SIMULATED FALLBACK (MuJoCo / Generic) ---
    const sim = {
      pos: { ...pos },
      rot: { x: 0, y: 0, z: 0, w: 1 },
      linvel: { x: 0, y: 0, z: 0 },
      angvel: { x: 0, y: 0, z: 0 }
    };
    prop.rigidBody = {
      translation: () => ({ ...sim.pos }),
      rotation: () => ({ ...sim.rot }),
      linvel: () => ({ ...sim.linvel }),
      angvel: () => ({ ...sim.angvel }),
      setTranslation: (p) => { sim.pos = { ...p }; },
      setRotation: (r) => { sim.rot = { ...r }; },
      setLinvel: (v) => { sim.linvel = { ...v }; },
      setAngvel: (w) => { sim.angvel = { ...w }; },
      applyImpulse: (v) => {
        if (prop.isDynamic) {
          sim.linvel.x += (v.x || 0) / mass;
          sim.linvel.y += (v.y || 0) / mass;
          sim.linvel.z += (v.z || 0) / mass;
        }
      },
      setBodyType: (t) => { prop.isDynamic = (t === 0 || t === 'dynamic'); },
      bodyType: () => prop.isDynamic ? 0 : 2
    };
  }

  recreatePropBody(prop) {
    // Preserve current transform
    let currentPos = prop.initPos;
    let currentRot = prop.initRot;
    if (prop.rigidBody) {
      try {
        currentPos = prop.rigidBody.translation();
        currentRot = prop.rigidBody.rotation();
      } catch (e) {}
    }

    // Cleanup previous physics engine body
    if (prop.engine === 'rapier' && this.world) {
      try {
        if (prop.collider) this.world.removeCollider(prop.collider, false);
        if (prop.rawRigidBody) this.world.removeRigidBody(prop.rawRigidBody);
      } catch (e) {}
    } else if (prop.engine === 'jolt' && this.engineData?.bodyInterface) {
      try {
        if (prop.bodyID !== null && prop.bodyID !== undefined) {
          this.engineData.bodyInterface.RemoveBody(prop.bodyID);
          this.engineData.bodyInterface.DestroyBody(prop.bodyID);
        }
      } catch (e) {}
    } else if (prop.engine === 'physx' && this.engineData?.scene) {
      try {
        if (prop.actor) this.engineData.scene.removeActor(prop.actor);
      } catch (e) {}
    }

    prop.rawRigidBody = null;
    prop.collider = null;
    prop.actor = null;
    prop.bodyID = null;
    prop.initPos = currentPos;
    prop.initRot = currentRot;

    this.createPhysicsBodyForProp(prop);
  }

  // --- SPECIALIZED CONVENIENCE WRAPPERS ---
  spawnBox(pos = { x: 0, y: 0.25, z: 1.1 }, size = { x: 0.5, y: 0.5, z: 0.5 }, isDynamic = true, color = 0xd97706) {
    return this.spawnPrimitive('box', { pos, size, isDynamic, color });
  }

  spawnSphere(pos = { x: 0, y: 0.25, z: 1.1 }, radius = 0.25, isDynamic = true, color = 0xe11d48) {
    return this.spawnPrimitive('sphere', { pos, radius, isDynamic, color });
  }

  spawnCylinder(pos = { x: 0, y: 0.30, z: 1.1 }, radius = 0.22, height = 0.6, isDynamic = true, color = 0x059669) {
    return this.spawnPrimitive('cylinder', { pos, radius, height, isDynamic, color });
  }

  spawnCapsule(pos = { x: 0, y: 0.35, z: 1.1 }, radius = 0.18, height = 0.5, isDynamic = true, color = 0x6366f1) {
    return this.spawnPrimitive('capsule', { pos, radius, height, isDynamic, color });
  }

  spawnHurdleCrate(pos = { x: 0, y: 0.22, z: 1.05 }, size = { x: 0.6, y: 0.44, z: 0.5 }, isDynamic = true) {
    return this.spawnPrimitive('crate', { pos, size, isDynamic, color: 0xd97706, name: 'Hurdle Crate' });
  }

  spawnRaisedStep(pos = { x: 0, y: 0.15, z: 0.85 }, size = { x: 1.8, y: 0.3, z: 1.8 }, isDynamic = false) {
    return this.spawnPrimitive('step', { pos, size, isDynamic, color: 0x334155, name: 'Raised Platform' });
  }

  launchProjectile(fromPos = { x: 0, y: 1.2, z: 4.5 }, targetPos = { x: 0, y: 1.1, z: 0.8 }, speed = 14.0) {
    const radius = 0.16;
    const mass = 15.0;

    const dir = new THREE.Vector3(targetPos.x - fromPos.x, targetPos.y - fromPos.y, targetPos.z - fromPos.z).normalize();
    const velocity = dir.clone().multiplyScalar(speed);

    const prop = this.spawnPrimitive('sphere', {
      pos: fromPos,
      radius,
      mass,
      isDynamic: true,
      color: 0xe11d48,
      name: `Projectile #${this.props.length + 1}`
    });
    prop.type = 'projectile';

    if (prop.rigidBody) {
      prop.rigidBody.setLinvel(velocity);
    }
    return prop;
  }

  spawnFluidVolume(pos = { x: 0, y: 0.35, z: 1.3 }, size = { x: 3.5, y: 0.7, z: 3.5 }, density = 1000.0) {
    const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    this.scene.add(mesh);

    const surfaceGeom = new THREE.PlaneGeometry(size.x, size.z);
    surfaceGeom.rotateX(-Math.PI / 2);
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0.65
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeom, surfaceMat);
    surfaceMesh.position.set(pos.x, pos.y + size.y / 2, pos.z);
    this.scene.add(surfaceMesh);

    const fluidObj = {
      id: `fluid_${Date.now()}`,
      name: `Fluid Volume #${this.props.length + 1}`,
      type: 'fluid',
      shapeType: 'fluid',
      pos,
      size,
      surfaceY: pos.y + size.y / 2,
      density,
      mesh,
      surfaceMesh,
      isDynamic: false,
      setDynamic: () => {},
      updateTransformFromMesh: () => {}
    };
    this.props.push(fluidObj);
    return fluidObj;
  }

  applyFluidForces(character, dt) {
    const fluids = this.props.filter(p => p.type === 'fluid');
    if (fluids.length === 0 || !character || character.isKinematic) return;

    for (const fluid of fluids) {
      const minX = fluid.pos.x - fluid.size.x / 2;
      const maxX = fluid.pos.x + fluid.size.x / 2;
      const minZ = fluid.pos.z - fluid.size.z / 2;
      const maxZ = fluid.pos.z + fluid.size.z / 2;
      const surfaceY = fluid.surfaceY;

      for (const [name, b] of Object.entries(character.bodies)) {
        if (!b.rigidBody) continue;
        const t = b.rigidBody.translation();
        if (t.x >= minX && t.x <= maxX && t.z >= minZ && t.z <= maxZ && t.y < surfaceY) {
          const submergedDepth = Math.max(0, surfaceY - t.y);
          const submRatio = Math.min(submergedDepth / 0.35, 1.0);

          const buoyancyForce = submRatio * (b.mass * 9.81 * 1.45);
          b.rigidBody.applyImpulse({ x: 0, y: buoyancyForce * dt, z: 0 });

          const vel = b.rigidBody.linvel();
          const dragX = -vel.x * b.mass * 3.5 * dt;
          const dragY = -vel.y * b.mass * 4.0 * dt;
          const dragZ = -vel.z * b.mass * 3.5 * dt;
          b.rigidBody.applyImpulse({ x: dragX, y: dragY, z: dragZ });

          const ang = b.rigidBody.angvel();
          b.rigidBody.setAngvel({
            x: ang.x * 0.94,
            y: ang.y * 0.94,
            z: ang.z * 0.94
          });
        }
      }
    }
  }

  getPropById(id) {
    return this.props.find(p => p.id === id) || null;
  }

  getPropByMesh(mesh) {
    if (!mesh) return null;
    return this.props.find(p => p.mesh === mesh || (mesh.parent && p.mesh === mesh.parent)) || null;
  }

  setPropDynamic(id, isDynamic) {
    const prop = this.getPropById(id);
    if (prop && typeof prop.setDynamic === 'function') {
      prop.setDynamic(isDynamic);
    }
  }

  setPropPosition(id, x, y, z) {
    const prop = this.getPropById(id);
    if (!prop || !prop.mesh) return;
    prop.mesh.position.set(x, y, z);
    prop.updateTransformFromMesh();
  }

  setPropRotation(id, pitchDeg, yawDeg, rollDeg) {
    const prop = this.getPropById(id);
    if (!prop || !prop.mesh) return;
    const rx = THREE.MathUtils.degToRad(pitchDeg);
    const ry = THREE.MathUtils.degToRad(yawDeg);
    const rz = THREE.MathUtils.degToRad(rollDeg);
    prop.mesh.rotation.set(rx, ry, rz);
    prop.updateTransformFromMesh();
  }

  setPropScale(id, sx, sy, sz) {
    const prop = this.getPropById(id);
    if (!prop || !prop.mesh) return;
    prop.mesh.scale.set(Math.max(0.01, sx), Math.max(0.01, sy), Math.max(0.01, sz));
    prop.updateTransformFromMesh();
  }

  rebuildCollider(prop) {
    if (!prop) return;
    const sx = Math.max(0.01, prop.mesh.scale.x);
    const sy = Math.max(0.01, prop.mesh.scale.y);
    const sz = Math.max(0.01, prop.mesh.scale.z);
    prop.scale = { x: sx, y: sy, z: sz };
    prop.lastScale = { x: sx, y: sy, z: sz };
    prop.initScale = { x: sx, y: sy, z: sz };

    if (this.engineType === 'rapier' && this.world && prop.collider && prop.rawRigidBody) {
      try {
        this.world.removeCollider(prop.collider, false);
        prop.collider = null;

        const shapeType = prop.shapeType || 'box';
        let colDesc;
        const size = prop.size ? { ...prop.size } : { x: 0.5, y: 0.5, z: 0.5 };
        const radius = prop.radius || 0.25;
        const height = prop.height || 0.6;

        if (shapeType === 'box' || shapeType === 'crate' || shapeType === 'step') {
          colDesc = RAPIER.ColliderDesc.cuboid((size.x * sx) / 2, (size.y * sy) / 2, (size.z * sz) / 2);
        } else if (shapeType === 'sphere') {
          const avgScale = (sx + sy + sz) / 3;
          colDesc = RAPIER.ColliderDesc.ball(radius * avgScale);
        } else if (shapeType === 'cylinder') {
          const radScale = Math.max(sx, sz);
          colDesc = RAPIER.ColliderDesc.cylinder((height * sy) / 2, radius * radScale);
        } else if (shapeType === 'capsule') {
          const radScale = Math.max(sx, sz);
          colDesc = RAPIER.ColliderDesc.capsule((height * sy) / 2, radius * radScale);
        } else {
          colDesc = RAPIER.ColliderDesc.cuboid((size.x * sx) / 2, (size.y * sy) / 2, (size.z * sz) / 2);
        }
        colDesc.setFriction(0.85).setRestitution(0.1).setContactSkin(0.002);
        if (prop.isDynamic) colDesc.setMass(prop.mass || 20.0);
        colDesc.setCollisionGroups((0x0001 << 16) | 0xFFFF);
        prop.collider = this.world.createCollider(colDesc, prop.rawRigidBody);
      } catch (e) {}
    }
  }

  update() {
    for (const p of this.props) {
      if (p.rigidBody && p.mesh) {
        const t = p.rigidBody.translation();
        const r = p.rigidBody.rotation();
        p.mesh.position.set(t.x, t.y, t.z);
        p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }
  }

  reset() {
    for (const p of this.props) {
      if (p.initPos && p.rigidBody) {
        p.rigidBody.setTranslation(p.initPos);
        const rot = p.initRot || { x: 0, y: 0, z: 0, w: 1 };
        p.rigidBody.setRotation(rot);
        p.rigidBody.setLinvel({ x: 0, y: 0, z: 0 });
        p.rigidBody.setAngvel({ x: 0, y: 0, z: 0 });
        if (p.mesh) {
          p.mesh.position.set(p.initPos.x, p.initPos.y, p.initPos.z);
          p.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
          if (p.initScale) {
            p.mesh.scale.set(p.initScale.x, p.initScale.y, p.initScale.z);
          }
        }
      }
    }
  }

  removeProp(propId) {
    const idx = this.props.findIndex(p => p.id === propId);
    if (idx === -1) return false;
    const p = this.props[idx];

    if (p.mesh) {
      this.scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
    }
    if (p.surfaceMesh) {
      this.scene.remove(p.surfaceMesh);
      if (p.surfaceMesh.geometry) p.surfaceMesh.geometry.dispose();
      if (p.surfaceMesh.material) p.surfaceMesh.material.dispose();
    }

    if (p.engine === 'rapier' && this.world) {
      try {
        if (p.collider) this.world.removeCollider(p.collider, false);
        if (p.rawRigidBody) this.world.removeRigidBody(p.rawRigidBody);
      } catch (e) {}
    } else if (p.engine === 'jolt' && this.engineData?.bodyInterface) {
      try {
        if (p.bodyID !== null && p.bodyID !== undefined) {
          this.engineData.bodyInterface.RemoveBody(p.bodyID);
          this.engineData.bodyInterface.DestroyBody(p.bodyID);
        }
      } catch (e) {}
    } else if (p.engine === 'physx' && this.engineData?.scene) {
      try {
        if (p.actor) this.engineData.scene.removeActor(p.actor);
      } catch (e) {}
    }

    this.props.splice(idx, 1);
    return true;
  }

  clearAllProps() {
    const propsCopy = [...this.props];
    for (const p of propsCopy) {
      this.removeProp(p.id);
    }
    this.props = [];
  }
}
