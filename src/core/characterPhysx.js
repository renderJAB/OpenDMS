import * as THREE from 'three';
import { CharacterSensors } from './sensors.js';
import { DynamicBalanceController } from './dynamicBalance.js';
import { SKELETON_TREE, JOINT_ANCHORS, JOINT_CONFIGS, ENDORPHIN_ACTIVE_POSES, clampBoneEulerRotation, NATURAL_STANCE_ROTATIONS } from './character.js';

export class PhysXCharacter {
  constructor(physxData, scene, initialPos = { x: 0, y: 0.95, z: 0 }, actorIndex = 0, options = {}) {
    this.physx = physxData.physx;
    this.physics = physxData.physics;
    this.scenePhysx = physxData.scene;
    this.material = physxData.material;
    this.scene = scene;
    this.initialPos = initialPos;
    this.actorIndex = actorIndex;
    this.actorId = options.actorId || `actor-${actorIndex + 1}`;
    this.actorColor = options.actorColor || (actorIndex === 0 ? 0x38bdf8 : 0xf97316);
    this.spawnOffset = new THREE.Vector3(initialPos.x || 0, Math.max(0, (initialPos.y || 0.95) - 0.95), initialPos.z || 0);
    this.spawnYaw = options.spawnYaw || 0;
    this.bodies = {};
    this.joints = [];
    this.visualMeshes = [];
    this.muscleStiffness = 300.0;
    this.muscleDamping = 35.0;
    this.isKinematic = true;
    this.isPureRagdoll = false;
    this.allowGroundActiveMotor = false;
    this.impactShockTimer = 0.0;
    this.sensors = new CharacterSensors(this);
    this.dynamicBalance = new DynamicBalanceController(this);
    this.balanceControlEnabled = true;
    this.counterWeighingEnabled = true;
    this.balanceRecoveryStrength = 1.0;
    this.lossOfBalanceTiltLimit = 55;
    this.isLossOfBalance = false;
    this.steppingFoot = 'Left';
    this.zmpDisplacement = 0.0;
    this.currentPose = {
      rootPos: new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z),
      localRotations: {}
    };

    this.buildHumanoid();
    this.resetToTPose();
  }

  buildHumanoid() {
    const PhysX = this.physx;

    const segments = [
      { name: 'Pelvis', type: 'capsule', r: 0.10, h: 0.12, mass: 14.0 },
      { name: 'LowerSpine', type: 'capsule', r: 0.105, h: 0.14, mass: 10.0 },
      { name: 'UpperSpine', type: 'capsule', r: 0.125, h: 0.18, mass: 16.0 },
      { name: 'Neck', type: 'capsule', r: 0.05, h: 0.08, mass: 2.0 },
      { name: 'Head', type: 'sphere', r: 0.11, h: 0.0, mass: 4.5 },

      { name: 'LeftShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0 },
      { name: 'LeftUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5 },
      { name: 'LeftForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2 },
      { name: 'LeftHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8 },

      { name: 'RightShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0 },
      { name: 'RightUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5 },
      { name: 'RightForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2 },
      { name: 'RightHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8 },

      { name: 'LeftThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5 },
      { name: 'LeftCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5 },
      { name: 'LeftFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5 },

      { name: 'RightThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5 },
      { name: 'RightCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5 },
      { name: 'RightFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5 }
    ];

    // Compute rest positions
    const globalRestPositions = {};
    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) {
        globalRestPositions[name] = new THREE.Vector3(...def.offset);
      } else {
        const parentPos = globalRestPositions[def.parent];
        globalRestPositions[name] = parentPos.clone().add(new THREE.Vector3(...def.offset));
      }
    }

    // Stylized Mannequin Materials
    const matBody = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.28, metalness: 0.72 });
    const matPlates = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.22, metalness: 0.85 });
    const matVisor = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, emissive: 0x0284c7, emissiveIntensity: 0.8 });
    const matJoint = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.3 });
    const matRing = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.15, metalness: 0.9 });

    for (const seg of segments) {
      const restPos = globalRestPositions[seg.name];

      // 1. Create Three.js visual group
      const group = new THREE.Group();
      group.name = `Visual_${seg.name}`;

      if (seg.name === 'Head') {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 20, 20), matBody);
        skull.castShadow = true;
        group.add(skull);

        const visorGeo = new THREE.BoxGeometry(seg.r * 1.4, seg.r * 0.32, seg.r * 0.4);
        const visor = new THREE.Mesh(visorGeo, matVisor);
        visor.position.set(0, 0.015, seg.r * 0.85);
        group.add(visor);
      } else if (seg.name === 'UpperSpine') {
        const rib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        rib.castShadow = true;
        group.add(rib);

        const chest = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 1.5, seg.h * 0.65, seg.r * 0.35), matPlates);
        chest.position.set(0, seg.h * 0.1, seg.r * 0.50);
        group.add(chest);
      } else if (seg.name === 'LowerSpine') {
        const core = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        core.castShadow = true;
        group.add(core);
      } else if (seg.name === 'Pelvis') {
        const pelv = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        pelv.castShadow = true;
        group.add(pelv);

        const flankL = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 0.4, seg.h * 0.8, seg.r * 1.4), matPlates);
        flankL.position.set(seg.r * 0.9, 0, 0);
        const flankR = flankL.clone();
        flankR.position.set(-seg.r * 0.9, 0, 0);
        group.add(flankL, flankR);
      } else if (seg.name.includes('Thigh')) {
        const fem = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        fem.castShadow = true;
        group.add(fem);

        const quad = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.85, seg.r * 0.65, seg.h * 0.75, 16), matPlates);
        quad.position.set(0, seg.h * 0.05, seg.r * 0.35);
        group.add(quad);
      } else if (seg.name.includes('Calf')) {
        const tib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        tib.castShadow = true;
        group.add(tib);
      } else if (seg.name.includes('Foot')) {
        const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.058, seg.h), matPlates);
        footMesh.position.set(0, 0.006, 0);
        footMesh.castShadow = true;
        group.add(footMesh);

        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.012, seg.h), matBody);
        sole.position.set(0, -0.029, 0);
        group.add(sole);
      } else if (seg.name.includes('UpperArm')) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16).rotateZ(Math.PI / 2), matBody);
        arm.castShadow = true;
        group.add(arm);
      } else if (seg.name.includes('Forearm')) {
        const fore = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16).rotateZ(Math.PI / 2), matBody);
        fore.castShadow = true;
        group.add(fore);
      } else if (seg.name.includes('Hand')) {
        const palm = new THREE.Mesh(new THREE.BoxGeometry(seg.h, 0.04, seg.r * 2), matJoint);
        palm.castShadow = true;
        group.add(palm);
      } else {
        const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 14, 14).rotateZ(Math.PI / 2), matBody);
        mesh.castShadow = true;
        group.add(mesh);
      }

      group.position.copy(restPos);
      group.traverse((child) => {
        child.userData.bodyName = seg.name;
        child.userData.actorId = this.actorId;
        child.userData.isCharacterBone = true;
      });
      this.scene.add(group);
      this.visualMeshes.push(group);

      // 2. Create PhysX Geometry & Actor
      let physxGeo;
      if (seg.type === 'capsule') {
        // PhysX capsule axis is along X, so we size radius and halfHeight
        physxGeo = new PhysX.PxCapsuleGeometry(seg.r, Math.max(0.01, seg.h * 0.5));
      } else if (seg.type === 'capsule_x') {
        physxGeo = new PhysX.PxCapsuleGeometry(seg.r, Math.max(0.01, seg.h * 0.5));
      } else if (seg.type === 'sphere') {
        physxGeo = new PhysX.PxSphereGeometry(seg.r);
      } else if (seg.type === 'box_foot') {
        physxGeo = new PhysX.PxBoxGeometry(0.048, 0.03, seg.h * 0.5);
      } else {
        physxGeo = new PhysX.PxBoxGeometry(seg.h * 0.5, 0.04, seg.r);
      }

      const shape = this.physics.createShape(physxGeo, this.material);
      if (PhysX.PxShapeFlagEnum) {
        shape.setFlag(PhysX.PxShapeFlagEnum.eSIMULATION_SHAPE, true);
        shape.setFlag(PhysX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE, true);
      }
      if (typeof shape.setContactOffset === 'function') shape.setContactOffset(0.02);
      if (typeof shape.setRestOffset === 'function') shape.setRestOffset(0.0);

      // CRITICAL: Filter data must match ground shape (word0 & word1) so DefaultFilterShader enables contacts!
      const charFilterData = new PhysX.PxFilterData(0xFFFF, 0xFFFF, 0, 0);
      shape.setSimulationFilterData(charFilterData);

      if (seg.type === 'capsule') {
        shape.setLocalPose(new PhysX.PxTransform(
          new PhysX.PxVec3(0, 0, 0),
          new PhysX.PxQuat(0, 0, Math.SQRT1_2, Math.SQRT1_2)
        ));
      }

      const pose = new PhysX.PxTransform(
        new PhysX.PxVec3(restPos.x, restPos.y, restPos.z),
        new PhysX.PxQuat(0, 0, 0, 1)
      );

      const actor = this.physics.createRigidDynamic(pose);
      actor.attachShape(shape);
      actor.setMass(seg.mass);
      const setMassFn = PhysX.PxRigidBodyExt?.setMassAndUpdateInertia || PhysX.PxRigidBodyExt?.prototype?.setMassAndUpdateInertia || PhysX.PxTopLevelFunctions?.setMassAndUpdateInertia;
      if (setMassFn) {
        try {
          setMassFn(actor, seg.mass);
        } catch (e) {}
      }
      actor.setLinearDamping(0.04);
      actor.setAngularDamping(0.35);

      if (PhysX.PxRigidBodyFlagEnum?.eENABLE_CCD !== undefined) {
        actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eENABLE_CCD, true);
      }

      // Default to kinematic until simulation / ragdoll activates
      actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eKINEMATIC, true);
      this.scenePhysx.addActor(actor);

      // 3. Unified adapter for timeline/behaviors
      const rbAdapter = {
        translation: () => {
          const p = actor.getGlobalPose().p;
          return { x: p.x, y: p.y, z: p.z };
        },
        rotation: () => {
          const q = actor.getGlobalPose().q;
          return { x: q.x, y: q.y, z: q.z, w: q.w };
        },
        linvel: () => {
          const v = actor.getLinearVelocity();
          return { x: v.x, y: v.y, z: v.z };
        },
        angvel: () => {
          const w = actor.getAngularVelocity();
          return { x: w.x, y: w.y, z: w.z };
        },
        applyImpulse: (vec) => {
          actor.addForce(new PhysX.PxVec3(vec.x || 0, vec.y || 0, vec.z || 0), PhysX.PxForceModeEnum.eIMPULSE, true);
        },
        applyTorqueImpulse: (vec) => {
          actor.addTorque(new PhysX.PxVec3(vec.x || 0, vec.y || 0, vec.z || 0), PhysX.PxForceModeEnum.eIMPULSE, true);
        },
        setTranslation: (pos) => {
          const q = actor.getGlobalPose().q;
          actor.setGlobalPose(new PhysX.PxTransform(new PhysX.PxVec3(pos.x, pos.y, pos.z), q), true);
        },
        setRotation: (rot) => {
          const p = actor.getGlobalPose().p;
          actor.setGlobalPose(new PhysX.PxTransform(p, new PhysX.PxQuat(rot.x, rot.y, rot.z, rot.w)), true);
        },
        setLinvel: (vel) => {
          actor.setLinearVelocity(new PhysX.PxVec3(vel.x || 0, vel.y || 0, vel.z || 0), true);
        },
        setAngvel: (vel) => {
          actor.setAngularVelocity(new PhysX.PxVec3(vel.x || 0, vel.y || 0, vel.z || 0), true);
        },
        setBodyType: (type) => {
          const isKine = (type === 1 || type === 2 || type === 'kinematic');
          actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eKINEMATIC, isKine);
          if (!isKine) actor.wakeUp();
        },
        setLinearDamping: (d) => {
          actor.setLinearDamping(d);
        },
        setAngularDamping: (d) => {
          actor.setAngularDamping(d);
        },
        bodyType: () => {
          return this.isKinematic ? 2 : 0;
        },
        enableCcd: () => {
          actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eENABLE_CCD, true);
        }
      };

      this.bodies[seg.name] = {
        mesh: group,
        rigidBody: rbAdapter,
        actor,
        shape,
        mass: seg.mass,
        radius: seg.r,
        height: seg.h,
        type: seg.type,
        initPos: restPos.clone(),
        initRot: new THREE.Quaternion(),
        prevPos: restPos.clone()
      };
    }

    this.setupJoints();
  }

  setupJoints() {
    const PhysX = this.physx;

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) continue;

      const jointKey = `${def.parent}_to_${name}`;
      const pData = this.bodies[def.parent];
      const cData = this.bodies[name];
      if (!pData || !cData) continue;

      const anchorData = JOINT_ANCHORS[jointKey] || {
        parentAnchor: { x: def.offset[0], y: def.offset[1], z: def.offset[2] },
        childAnchor: { x: 0, y: 0, z: 0 }
      };

      const frame0 = new PhysX.PxTransform(
        new PhysX.PxVec3(anchorData.parentAnchor.x, anchorData.parentAnchor.y, anchorData.parentAnchor.z),
        new PhysX.PxQuat(0, 0, 0, 1)
      );
      const frame1 = new PhysX.PxTransform(
        new PhysX.PxVec3(anchorData.childAnchor.x, anchorData.childAnchor.y, anchorData.childAnchor.z),
        new PhysX.PxQuat(0, 0, 0, 1)
      );

      const d6CreateFn = PhysX.D6JointCreate || PhysX.PxTopLevelFunctions?.D6JointCreate || PhysX.PxTopLevelFunctions?.prototype?.D6JointCreate;
      if (!d6CreateFn) continue;

      let joint = null;
      try {
        joint = d6CreateFn(
          this.physics,
          pData.actor,
          frame0,
          cData.actor,
          frame1
        );

        const axisX = PhysX.PxD6AxisEnum?.eX ?? 0;
        const axisY = PhysX.PxD6AxisEnum?.eY ?? 1;
        const axisZ = PhysX.PxD6AxisEnum?.eZ ?? 2;
        const axisTwist = PhysX.PxD6AxisEnum?.eTWIST ?? 3;
        const axisSwing1 = PhysX.PxD6AxisEnum?.eSWING1 ?? 4;
        const axisSwing2 = PhysX.PxD6AxisEnum?.eSWING2 ?? 5;

        const motionLocked = PhysX.PxD6MotionEnum?.eLOCKED ?? 0;
        const motionFree = PhysX.PxD6MotionEnum?.eFREE ?? 2;

        // Lock linear translations
        joint.setMotion(axisX, motionLocked);
        joint.setMotion(axisY, motionLocked);
        joint.setMotion(axisZ, motionLocked);

        // Allow rotational DOFs for authentic skeletal articulation
        joint.setMotion(axisTwist, motionFree);
        joint.setMotion(axisSwing1, motionFree);
        joint.setMotion(axisSwing2, motionFree);

        // Disable collision between connected limbs
        const colFlag = PhysX.PxConstraintFlagEnum?.eCOLLISION_ENABLED ?? 2;
        joint.setConstraintFlag(colFlag, false);

        const cfg = JOINT_CONFIGS[jointKey] || { type: 'spherical', stiffness: 120, damping: 14 };
        this.joints.push({
          joint,
          name: jointKey,
          parent: def.parent,
          parentName: def.parent,
          child: name,
          childName: name,
          config: cfg,
          targetAngle: new THREE.Euler(0, 0, 0),
          stiffness: cfg.stiffness || 120,
          damping: cfg.damping || 14
        });
      } catch (jointErr) {
        console.warn(`[PhysX] Warning configuring joint ${jointKey}:`, jointErr);
      }
    }
  }

  setDynamicMode(isDynamic) {
    this.isKinematic = !isDynamic;
    const PhysX = this.physx;
    for (const b of Object.values(this.bodies)) {
      b.actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eKINEMATIC, !isDynamic);
      if (isDynamic) {
        b.actor.wakeUp();
      } else {
        b.actor.setLinearVelocity(new PhysX.PxVec3(0, 0, 0), true);
        b.actor.setAngularVelocity(new PhysX.PxVec3(0, 0, 0), true);
      }
    }
  }

  setKinematic(kinematic) {
    this.setDynamicMode(!kinematic);
  }

  setRagdollMode(ragdoll) {
    this.isPureRagdoll = ragdoll;
    if (ragdoll) {
      this.setDynamicMode(true);
    }
  }

  setSpawnOffset(x, y, z) {
    this.spawnOffset.set(x, Math.max(0, y), z);
    if (this.isKinematic) {
      this.resetToTPose();
    }
  }

  resetToTPose() {
    this.setDynamicMode(false);
    this.isPureRagdoll = false;
    this.impactShockTimer = 0.0;
    const PhysX = this.physx;
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const oy = this.spawnOffset ? this.spawnOffset.y : 0;
    const oz = this.spawnOffset ? this.spawnOffset.z : 0;

    for (const [name, b] of Object.entries(this.bodies)) {
      const px = b.initPos.x + ox;
      const py = b.initPos.y + oy;
      const pz = b.initPos.z + oz;
      b.mesh.position.set(px, py, pz);
      b.mesh.quaternion.copy(b.initRot);
      b.actor.setGlobalPose(new PhysX.PxTransform(
        new PhysX.PxVec3(px, py, pz),
        new PhysX.PxQuat(0, 0, 0, 1)
      ), true);
      b.actor.setLinearVelocity(new PhysX.PxVec3(0, 0, 0), true);
      b.actor.setAngularVelocity(new PhysX.PxVec3(0, 0, 0), true);
      b.prevPos.set(px, py, pz);
    }
  }

  applyForwardKinematics(rootPos, localRotationsEuler = {}) {
    const PhysX = this.physx;
    const worldTransforms = {};

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      const eul = localRotationsEuler[name] || [0, 0, 0];
      const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul));

      if (!def.parent) {
        worldTransforms[name] = { pos: rootPos.clone(), rot: localQ };
      } else {
        const parentT = worldTransforms[def.parent];
        const jointKey = `${def.parent}_to_${name}`;
        const anchorData = JOINT_ANCHORS[jointKey];
        const worldRot = parentT.rot.clone().multiply(localQ);

        let worldPos;
        if (anchorData) {
          const pAnchor = new THREE.Vector3(
            anchorData.parentAnchor.x,
            anchorData.parentAnchor.y,
            anchorData.parentAnchor.z
          ).applyQuaternion(parentT.rot);
          const cAnchor = new THREE.Vector3(
            anchorData.childAnchor.x,
            anchorData.childAnchor.y,
            anchorData.childAnchor.z
          ).applyQuaternion(worldRot);
          worldPos = parentT.pos.clone().add(pAnchor).sub(cAnchor);
        } else {
          const offsetVec = new THREE.Vector3(...def.offset);
          worldPos = parentT.pos.clone().add(offsetVec.applyQuaternion(parentT.rot));
        }

        worldTransforms[name] = { pos: worldPos, rot: worldRot };
      }
    }

    // Anti-Ground-Penetration Foot Clamping
    const soleMargin = 0.04;
    const footL = worldTransforms['LeftFoot'];
    const footR = worldTransforms['RightFoot'];
    let lowestSoleY = Infinity;
    if (footL) lowestSoleY = Math.min(lowestSoleY, footL.pos.y - soleMargin);
    if (footR) lowestSoleY = Math.min(lowestSoleY, footR.pos.y - soleMargin);

    if (lowestSoleY < 0.0) {
      const elev = -lowestSoleY;
      for (const name in worldTransforms) {
        worldTransforms[name].pos.y += elev;
      }
    }

    for (const [name, tr] of Object.entries(worldTransforms)) {
      const b = this.bodies[name];
      if (b) {
        b.mesh.position.copy(tr.pos);
        b.mesh.quaternion.copy(tr.rot);
        b.actor.setGlobalPose(new PhysX.PxTransform(
          new PhysX.PxVec3(tr.pos.x, tr.pos.y, tr.pos.z),
          new PhysX.PxQuat(tr.rot.x, tr.rot.y, tr.rot.z, tr.rot.w)
        ), true);
      }
    }
  }

  setColliderGirth(multiplier = 1.0) {
    this.colliderGirth = Math.max(0.4, Math.min(2.5, multiplier));
  }

  applyMotorTorques(dt) {
    if (this.isKinematic || this.isPureRagdoll) return;
    const PhysX = this.physx;
    const pQuat = new THREE.Quaternion();
    const cQuat = new THREE.Quaternion();
    const invP = new THREE.Quaternion();
    const relQuat = new THREE.Quaternion();
    const targetQuat = new THREE.Quaternion();
    const errQuat = new THREE.Quaternion();

    for (const j of this.joints) {
      const pBody = this.bodies[j.parent];
      const cBody = this.bodies[j.child];
      if (!pBody || !cBody || !pBody.actor || !cBody.actor) continue;

      const pQ = pBody.actor.getGlobalPose().q;
      const cQ = cBody.actor.getGlobalPose().q;
      pQuat.set(pQ.x, pQ.y, pQ.z, pQ.w);
      cQuat.set(cQ.x, cQ.y, cQ.z, cQ.w);

      invP.copy(pQuat).invert();
      relQuat.copy(invP).multiply(cQuat);

      if (j.targetAngle) {
        targetQuat.setFromEuler(new THREE.Euler(j.targetAngle.x || 0, j.targetAngle.y || 0, j.targetAngle.z || 0));
      } else {
        targetQuat.set(0, 0, 0, 1);
      }

      errQuat.copy(targetQuat).multiply(relQuat.clone().invert());
      if (errQuat.w < 0) {
        errQuat.x = -errQuat.x;
        errQuat.y = -errQuat.y;
        errQuat.z = -errQuat.z;
        errQuat.w = -errQuat.w;
      }

      // Smoothly restore motor rigidity after impact shock wave (avoids secondary violent snap)
      const shockScale = this.impactShockTimer > 0
        ? 0.22 + 0.78 * Math.pow(1.0 - Math.min(1.0, this.impactShockTimer / 0.26), 2)
        : 1.0;

      const kp = (j.stiffness || 120) * (this.muscleStiffness / 300.0) * 0.45 * shockScale;
      const kd = (j.damping || 14) * (this.muscleDamping / 35.0) * 0.25 * shockScale;
      const localErr = new THREE.Vector3(errQuat.x * 2.0, errQuat.y * 2.0, errQuat.z * 2.0).applyQuaternion(pQuat);

      const pW = pBody.actor.getAngularVelocity();
      const cW = cBody.actor.getAngularVelocity();
      const relWx = cW.x - pW.x;
      const relWy = cW.y - pW.y;
      const relWz = cW.z - pW.z;

      const tx = THREE.MathUtils.clamp(localErr.x * kp - relWx * kd, -180, 180);
      const ty = THREE.MathUtils.clamp(localErr.y * kp - relWy * kd, -180, 180);
      const tz = THREE.MathUtils.clamp(localErr.z * kp - relWz * kd, -180, 180);

      cBody.actor.addTorque(new PhysX.PxVec3(tx, ty, tz), PhysX.PxForceModeEnum.eFORCE, true);
      pBody.actor.addTorque(new PhysX.PxVec3(-tx * 0.5, -ty * 0.5, -tz * 0.5), PhysX.PxForceModeEnum.eFORCE, true);
    }
  }

  // --- BOSTON DYNAMICS ACTIVE DYNAMIC BALANCE & PUSH RECOVERY CONTROLLER ---
  updateZMPBalance(dt = 1 / 120) {
    if (this.isKinematic || this.isPureRagdoll || this.balanceControlEnabled === false) return;
    if (this.dynamicBalance) {
      this.dynamicBalance.update(dt);
    }
  }

  enforceAnatomicalLimits(dt) {
    if (this.isKinematic) return;
    for (const [name, b] of Object.entries(this.bodies)) {
      const w = b.actor.getAngularVelocity();
      const speedSq = w.x * w.x + w.y * w.y + w.z * w.z;
      if (speedSq > 400.0) {
        const factor = 20.0 / Math.sqrt(speedSq);
        b.actor.setAngularVelocity(new this.physx.PxVec3(w.x * factor, w.y * factor, w.z * factor), true);
      }
    }
  }

  applyImpulseToBody(bodyName, impulseVector) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (b && b.actor) {
      b.actor.addForce(new this.physx.PxVec3(impulseVector.x || 0, impulseVector.y || 0, impulseVector.z || 0), this.physx.PxForceModeEnum.eIMPULSE, true);
    }
  }

  // Endorphin / Boston Dynamics Force Effector with Kinetic Chain Coupling & Active Push Recovery
  applyForceEffector(bodyName, forceVector, isContinuous = false) {
    if (this.isKinematic) return;
    const PhysX = this.physx;
    const target = this.bodies[bodyName] ? bodyName : 'UpperSpine';
    const b = this.bodies[target];
    if (!b || !b.actor) return;

    if (!this.balanceControlEnabled) {
      this.impactShockTimer = isContinuous ? Math.max(this.impactShockTimer, 0.08) : 0.26;
    } else {
      this.impactShockTimer = 0; // Maintain full joint motor stiffness for active push recovery
    }

    const powerScale = isContinuous ? 0.32 : 1.0;
    const fx = forceVector.x * powerScale;
    const fy = forceVector.y * powerScale;
    const fz = forceVector.z * powerScale;

    b.actor.addForce(new PhysX.PxVec3(fx, fy, fz), PhysX.PxForceModeEnum.eIMPULSE, true);

    b.actor.addTorque(new PhysX.PxVec3(
      fz * 0.08,
      (fx - fz) * 0.04,
      -fx * 0.08
    ), PhysX.PxForceModeEnum.eIMPULSE, true);

    const def = SKELETON_TREE[target];
    if (def && def.parent && this.bodies[def.parent]) {
      this.bodies[def.parent].actor.addForce(new PhysX.PxVec3(fx * 0.35, fy * 0.35, fz * 0.35), PhysX.PxForceModeEnum.eIMPULSE, true);
    }
  }

  applyActivePose(poseKey, strength = 1.0) {
    const pose = ENDORPHIN_ACTIVE_POSES[poseKey] || ENDORPHIN_ACTIVE_POSES['crouching'];
    if (!pose || !pose.angles) return;
    const factor = Math.min(1.0, Math.max(0.0, strength / 50.0));
    for (const j of this.joints) {
      const pAngles = pose.angles[j.name];
      if (pAngles && j.targetAngle) {
        j.targetAngle.x = THREE.MathUtils.lerp(j.targetAngle.x || 0, pAngles[0], factor);
        j.targetAngle.y = THREE.MathUtils.lerp(j.targetAngle.y || 0, pAngles[1], factor);
        j.targetAngle.z = THREE.MathUtils.lerp(j.targetAngle.z || 0, pAngles[2], factor);
      }
    }
  }

  applyBoneConstraint(bodyName, constraintType = 'lock', anchorPos = null, strength = 1.0, anchorLinvel = null, targetRotation = null, anchorAngvel = null) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (!b || !b.actor) return;
    const PhysX = this.physx;

    const effectiveStrength = THREE.MathUtils.clamp(strength, 0.0, 1.0);
    const linvelToSet = anchorLinvel || { x: 0, y: 0, z: 0 };
    const angvelToSet = anchorAngvel || { x: 0, y: 0, z: 0 };

    if (effectiveStrength >= 0.85) {
      b.actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eKINEMATIC, true);

      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          const curQ = b.actor.getGlobalPose().q;
          b.actor.setGlobalPose(new PhysX.PxTransform(new PhysX.PxVec3(anchorPos.x, anchorPos.y, anchorPos.z), curQ), true);
          if (b.mesh) b.mesh.position.set(anchorPos.x, anchorPos.y, anchorPos.z);
          b.actor.setLinearVelocity(new PhysX.PxVec3(linvelToSet.x, linvelToSet.y, linvelToSet.z), true);
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        if (targetRotation) {
          const curP = b.actor.getGlobalPose().p;
          b.actor.setGlobalPose(new PhysX.PxTransform(curP, new PhysX.PxQuat(targetRotation.x, targetRotation.y, targetRotation.z, targetRotation.w)), true);
          if (b.mesh) b.mesh.quaternion.copy(targetRotation);
        }
        b.actor.setAngularVelocity(new PhysX.PxVec3(angvelToSet.x, angvelToSet.y, angvelToSet.z), true);
      }
    } else {
      b.actor.setRigidBodyFlag(PhysX.PxRigidBodyFlagEnum.eKINEMATIC, false);
      b.actor.wakeUp();

      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          const curP = b.actor.getGlobalPose().p;
          const dx = anchorPos.x - curP.x;
          const dy = anchorPos.y - curP.y;
          const dz = anchorPos.z - curP.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.0005) {
            const pullVel = dist * 120.0 * effectiveStrength;
            b.actor.setLinearVelocity(new PhysX.PxVec3(
              linvelToSet.x + (dx / dist) * pullVel,
              linvelToSet.y + (dy / dist) * pullVel,
              linvelToSet.z + (dz / dist) * pullVel
            ), true);
          } else {
            b.actor.setLinearVelocity(new PhysX.PxVec3(linvelToSet.x, linvelToSet.y, linvelToSet.z), true);
          }
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        b.actor.setAngularVelocity(new PhysX.PxVec3(angvelToSet.x, angvelToSet.y, angvelToSet.z), true);
      }
    }
  }

  releaseBoneConstraint(bodyName) {
    const b = this.bodies[bodyName];
    if (!b || !b.actor) return;
    b.actor.setRigidBodyFlag(this.physx.PxRigidBodyFlagEnum.eKINEMATIC, false);
    b.actor.wakeUp();
  }

  setSpawnTransform(x, y, z, yaw = 0) {
    this.spawnOffset.set(x, Math.max(0, y), z);
    this.spawnYaw = yaw;
    if (this.isKinematic) {
      this.resetToTPose();
    }
  }

  resetToNaturalStance() {
    this.setDynamicMode(false);
    this.isPureRagdoll = false;
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const oy = this.spawnOffset ? this.spawnOffset.y : 0;
    const oz = this.spawnOffset ? this.spawnOffset.z : 0;
    const rootPos = new THREE.Vector3(ox, oy + 0.94, oz);
    this.currentPose = {
      rootPos: rootPos.clone(),
      localRotations: JSON.parse(JSON.stringify(NATURAL_STANCE_ROTATIONS))
    };
    this.applyForwardKinematics(rootPos, NATURAL_STANCE_ROTATIONS);
    this.syncMotorTargetsToPose(NATURAL_STANCE_ROTATIONS);
  }

  getPoseState() {
    return {
      rootPos: [this.currentPose.rootPos.x, this.currentPose.rootPos.y, this.currentPose.rootPos.z],
      localRotations: JSON.parse(JSON.stringify(this.currentPose.localRotations || {}))
    };
  }

  applyPoseState(pose) {
    if (!pose) return;
    if (pose.rootPos) {
      if (Array.isArray(pose.rootPos)) {
        this.currentPose.rootPos.set(pose.rootPos[0], pose.rootPos[1], pose.rootPos[2]);
      } else {
        this.currentPose.rootPos.set(pose.rootPos.x, pose.rootPos.y, pose.rootPos.z);
      }
    }
    this.currentPose.localRotations = {};
    if (pose.localRotations) {
      for (const [bone, rot] of Object.entries(pose.localRotations)) {
        const eul = Array.isArray(rot) ? rot : [rot.x || 0, rot.y || 0, rot.z || 0];
        const clamped = (pose.isDenseMocap)
          ? { x: eul[0], y: eul[1], z: eul[2] }
          : clampBoneEulerRotation(bone, { x: eul[0], y: eul[1], z: eul[2] });
        this.currentPose.localRotations[bone] = [clamped.x, clamped.y, clamped.z];
      }
    }
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const oy = this.spawnOffset ? this.spawnOffset.y : 0;
    const oz = this.spawnOffset ? this.spawnOffset.z : 0;
    const worldRoot = new THREE.Vector3(
      this.currentPose.rootPos.x + ox,
      this.currentPose.rootPos.y + oy,
      this.currentPose.rootPos.z + oz
    );
    this.applyForwardKinematics(worldRoot, this.currentPose.localRotations);
    this.syncMotorTargetsToPose(this.currentPose.localRotations);
  }

  setBoneLocalRotation(boneName, rx, ry, rz) {
    if (!SKELETON_TREE[boneName]) return;
    if (boneName === 'Pelvis') {
      this.currentPose.localRotations['Pelvis'] = [rx, ry, rz];
    } else {
      const clamped = clampBoneEulerRotation(boneName, { x: rx, y: ry, z: rz });
      this.currentPose.localRotations[boneName] = [clamped.x, clamped.y, clamped.z];
    }
    this.applyPoseState(this.currentPose);
  }

  setPoseRootPosition(x, y, z) {
    this.currentPose.rootPos.set(x, y, z);
    this.applyPoseState(this.currentPose);
  }

  syncMotorTargetsToPose(localRotations) {
    for (const j of this.joints) {
      const rot = localRotations[j.child || j.childName];
      if (rot && j.targetAngle) {
        j.targetAngle.set(rot[0], rot[1], rot[2]);
      } else if (j.targetAngle) {
        j.targetAngle.set(0, 0, 0);
      }
    }
  }

  applyPassiveRagdollDynamics(dt) {
    if (this.isKinematic) return;
    // Pure limp ragdoll in PhysX: zero active motor forces, full gravity freedom
    for (const b of Object.values(this.bodies)) {
      if (b.actor) b.actor.wakeUp();
    }
  }

  enforceGroundContactSafety() {
    const PhysX = this.physx;
    // Guard feet from ever sinking through floor plane (y = 0)
    for (const footName of ['LeftFoot', 'RightFoot']) {
      const b = this.bodies[footName];
      if (!b || !b.actor) continue;
      const pose = b.actor.getGlobalPose();
      // Foot box has half-height 0.03, so center must stay >= 0.03 for sole to stay at or above y = 0
      const minFootY = 0.03;
      if (pose.p.y < minFootY) {
        b.actor.setGlobalPose(new PhysX.PxTransform(
          new PhysX.PxVec3(pose.p.x, minFootY, pose.p.z),
          pose.q
        ), true);
        const v = b.actor.getLinearVelocity();
        if (v.y < 0) {
          b.actor.setLinearVelocity(new PhysX.PxVec3(v.x, 0, v.z), true);
        }
      }
    }

    // General safeguard for all other body parts (pelvis, spine, limbs)
    for (const [name, b] of Object.entries(this.bodies)) {
      if (name === 'LeftFoot' || name === 'RightFoot') continue;
      if (!b || !b.actor) continue;
      const pose = b.actor.getGlobalPose();
      const minBodyY = Math.max(0.04, (b.radius || 0.05));
      if (pose.p.y < minBodyY) {
        b.actor.setGlobalPose(new PhysX.PxTransform(
          new PhysX.PxVec3(pose.p.x, minBodyY, pose.p.z),
          pose.q
        ), true);
        const v = b.actor.getLinearVelocity();
        if (v.y < 0) {
          b.actor.setLinearVelocity(new PhysX.PxVec3(v.x, 0, v.z), true);
        }
      }
    }
  }

  update(dt) {
    if (this.impactShockTimer > 0) {
      this.impactShockTimer = Math.max(0, this.impactShockTimer - dt);
    }
    this.sensors.update(dt);
    if (!this.isKinematic) {
      if (this.isPureRagdoll) {
        this.applyPassiveRagdollDynamics(dt);
      } else {
        this.updateZMPBalance(dt);
        this.applyMotorTorques(dt);
      }
      this.enforceAnatomicalLimits(dt);
      this.enforceGroundContactSafety();
    }

    // Sync visual meshes from PhysX actors
    for (const [name, b] of Object.entries(this.bodies)) {
      const pose = b.actor.getGlobalPose();
      b.mesh.position.set(pose.p.x, pose.p.y, pose.p.z);
      b.mesh.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    }
  }

  destroy() {
    for (const mesh of this.visualMeshes) {
      this.scene.remove(mesh);
      mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
      });
    }
    this.visualMeshes = [];

    const PhysX = this.physx;
    for (const j of this.joints) {
      if (j.joint && PhysX && typeof PhysX.destroy === 'function') {
        try {
          PhysX.destroy(j.joint);
        } catch (e) {}
      }
    }
    this.joints = [];

    for (const b of Object.values(this.bodies)) {
      if (b.actor && this.scenePhysx) {
        try {
          this.scenePhysx.removeActor(b.actor);
          if (PhysX && typeof PhysX.destroy === 'function') {
            PhysX.destroy(b.actor);
          }
        } catch (e) {}
      }
    }
    this.bodies = {};
  }
}
