import * as THREE from 'three';
import { CharacterSensors } from './sensors.js';
import { DynamicBalanceController } from './dynamicBalance.js';
import { SKELETON_TREE, JOINT_ANCHORS, ENDORPHIN_ACTIVE_POSES, clampBoneEulerRotation, NATURAL_STANCE_ROTATIONS } from './character.js';

export class MuJoCoCharacter {
  constructor(mujocoData, scene, initialPos = { x: 0, y: 0.95, z: 0 }, actorIndex = 0, options = {}) {
    this.mujoco = mujocoData.mujoco;
    this.model = mujocoData.model;
    this.data = mujocoData.data;
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
    this.sensors = new CharacterSensors(this);
    this.dynamicBalance = new DynamicBalanceController(this);
    this.balanceControlEnabled = false;
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

    // Map body names to MuJoCo body IDs and actuator IDs
    this.bodyIdMap = {};
    this.actuatorMap = {};

    this.buildHumanoid();
    this.resetToTPose();
  }

  buildHumanoid() {
    const segments = [
      { name: 'Pelvis', type: 'capsule', r: 0.10, h: 0.12, mass: 14.0, color: 0x3b82f6 },
      { name: 'LowerSpine', type: 'capsule', r: 0.105, h: 0.14, mass: 10.0, color: 0x2563eb },
      { name: 'UpperSpine', type: 'capsule', r: 0.125, h: 0.18, mass: 16.0, color: 0x1d4ed8 },
      { name: 'Neck', type: 'capsule', r: 0.05, h: 0.08, mass: 2.0, color: 0x60a5fa },
      { name: 'Head', type: 'sphere', r: 0.11, h: 0.0, mass: 4.5, color: 0xf59e0b },

      { name: 'LeftShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0, color: 0x10b981 },
      { name: 'LeftUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5, color: 0x059669 },
      { name: 'LeftForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2, color: 0x047857 },
      { name: 'LeftHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8, color: 0x6ee7b7 },

      { name: 'RightShoulder', type: 'capsule_x', r: 0.048, h: 0.08, mass: 2.0, color: 0x10b981 },
      { name: 'RightUpperArm', type: 'capsule_x', r: 0.048, h: 0.24, mass: 3.5, color: 0x059669 },
      { name: 'RightForearm', type: 'capsule_x', r: 0.044, h: 0.22, mass: 2.2, color: 0x047857 },
      { name: 'RightHand', type: 'box', r: 0.048, h: 0.15, mass: 0.8, color: 0x6ee7b7 },

      { name: 'LeftThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5, color: 0x8b5cf6 },
      { name: 'LeftCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5, color: 0x7c3aed },
      { name: 'LeftFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5, color: 0xa78bfa },

      { name: 'RightThigh', type: 'capsule', r: 0.072, h: 0.34, mass: 8.5, color: 0x8b5cf6 },
      { name: 'RightCalf', type: 'capsule', r: 0.058, h: 0.34, mass: 4.5, color: 0x7c3aed },
      { name: 'RightFoot', type: 'box_foot', r: 0.05, h: 0.18, mass: 1.5, color: 0xa78bfa }
    ];

    // Compute global rest positions
    const globalRestPositions = {};
    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) {
        globalRestPositions[name] = new THREE.Vector3(...def.offset);
      } else {
        const parentPos = globalRestPositions[def.parent];
        globalRestPositions[name] = parentPos.clone().add(new THREE.Vector3(...def.offset));
      }
    }

    // Index all bodies and actuators in MuJoCo model
    for (let i = 0; i < this.model.nbody; i++) {
      const bObj = this.model.body(i);
      if (bObj && bObj.name) {
        this.bodyIdMap[bObj.name] = bObj.id;
      }
    }

    for (let i = 0; i < this.model.nu; i++) {
      const aObj = this.model.actuator(i);
      if (aObj && aObj.name) {
        this.actuatorMap[aObj.name] = aObj.id;
      }
    }

    this.jointQposMap = {};
    if (this.model.name_jntadr && this.model.names) {
      const names = this.model.names;
      for (let i = 0; i < this.model.njnt; i++) {
        const adr = this.model.name_jntadr[i];
        let jName = '';
        for (let c = adr; names[c] !== 0; c++) jName += String.fromCharCode(names[c]);
        this.jointQposMap[jName] = this.model.jnt_qposadr[i];
      }
    }

    const pelvisId = this.bodyIdMap['Pelvis'] ?? 1;

    // Stylized Biomechanical Mannequin Materials
    const matBody = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.28,
      metalness: 0.72
    });
    const matPlates = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.22,
      metalness: 0.85
    });
    const matVisor = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8
    });
    const matJoint = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.3
    });
    const matRing = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.15,
      metalness: 0.9
    });

    for (const seg of segments) {
      const restPos = globalRestPositions[seg.name];
      const bodyId = this.bodyIdMap[seg.name] ?? -1;

      // Visual Mannequin Group
      const group = new THREE.Group();
      group.name = `visual_${seg.name}`;

      if (seg.name === 'Head') {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 20, 20), matBody);
        skull.castShadow = true;
        group.add(skull);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 1.5, 0.045, seg.r * 0.7), matVisor);
        visor.position.set(0, 0.015, seg.r * 0.75);
        group.add(visor);

        const crown = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.95, 0.01, 8, 24).rotateX(Math.PI / 2), matRing);
        crown.position.set(0, 0.03, 0);
        group.add(crown);

      } else if (seg.name === 'UpperSpine') {
        const rib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.9, seg.h, 16, 16), matBody);
        rib.castShadow = true;
        group.add(rib);

        const chest = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 1.7, seg.h * 0.68, seg.r * 0.5), matPlates);
        chest.position.set(0, seg.h * 0.1, seg.r * 0.58);
        chest.castShadow = true;
        group.add(chest);

        const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16).rotateX(Math.PI / 2), matVisor);
        badge.position.set(0, seg.h * 0.12, seg.r * 0.84);
        group.add(badge);

        const sockL = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.5, 0.012, 12, 20).rotateY(Math.PI / 2), matRing);
        sockL.position.set(seg.r * 1.05, seg.h * 0.35, 0);
        const sockR = sockL.clone();
        sockR.position.set(-seg.r * 1.05, seg.h * 0.35, 0);
        group.add(sockL, sockR);

      } else if (seg.name === 'LowerSpine') {
        const core = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.92, seg.h, 16, 16), matBody);
        core.castShadow = true;
        group.add(core);

        const r1 = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.95, 0.01, 8, 24).rotateX(Math.PI / 2), matRing);
        r1.position.set(0, seg.h * 0.2, 0);
        const r2 = r1.clone();
        r2.position.set(0, -seg.h * 0.2, 0);
        group.add(r1, r2);

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
        const fem = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.95, seg.h, 16, 16), matBody);
        fem.castShadow = true;
        group.add(fem);

        const quad = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.85, seg.r * 0.65, seg.h * 0.75, 16), matPlates);
        quad.position.set(0, seg.h * 0.05, seg.r * 0.35);
        quad.castShadow = true;
        group.add(quad);

        const kneecap = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 0.9, 0.07, 0.04), matJoint);
        kneecap.position.set(0, -seg.h * 0.42, seg.r * 0.85);
        kneecap.castShadow = true;
        group.add(kneecap);

      } else if (seg.name.includes('Calf')) {
        const tib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.92, seg.h, 16, 16), matBody);
        tib.castShadow = true;
        group.add(tib);

        const kneePin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, seg.r * 2.5, 16).rotateZ(Math.PI / 2), matRing);
        kneePin.position.set(0, seg.h * 0.45, 0);
        group.add(kneePin);

        const calfMus = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.8, seg.r * 0.4, seg.h * 0.6, 14), matPlates);
        calfMus.position.set(0, seg.h * 0.12, -seg.r * 0.35);
        group.add(calfMus);

      } else if (seg.name.includes('Foot')) {
        const footMesh = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 2, 0.056, seg.h), matPlates);
        footMesh.position.set(0, -0.004, seg.h * 0.12);
        footMesh.castShadow = true;
        group.add(footMesh);

        const sole = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 2.1, 0.016, seg.h * 1.05), matJoint);
        sole.position.set(0, -0.032, seg.h * 0.12);
        group.add(sole);

      } else if (seg.name.includes('Shoulder')) {
        const clav = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16).rotateZ(Math.PI / 2), matJoint);
        clav.castShadow = true;
        group.add(clav);

        const isLeft = seg.name.includes('Left');
        const pauldron = new THREE.Mesh(new THREE.SphereGeometry(seg.r * 1.5, 14, 14, 0, Math.PI), matPlates);
        pauldron.rotation.x = -Math.PI / 2;
        pauldron.position.set(isLeft ? seg.h * 0.2 : -seg.h * 0.2, 0.02, 0);
        group.add(pauldron);

      } else if (seg.name.includes('UpperArm')) {
        const hum = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16).rotateZ(Math.PI / 2), matBody);
        hum.castShadow = true;
        group.add(hum);

        const bicep = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.9, seg.r * 0.75, seg.h * 0.7, 14).rotateZ(Math.PI / 2), matPlates);
        bicep.position.set(0, 0, seg.r * 0.25);
        group.add(bicep);

      } else if (seg.name.includes('Forearm')) {
        const rad = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16).rotateZ(Math.PI / 2), matBody);
        rad.castShadow = true;
        group.add(rad);

        const bracer = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 1.05, seg.r * 0.85, seg.h * 0.65, 14).rotateZ(Math.PI / 2), matPlates);
        group.add(bracer);

      } else if (seg.name.includes('Hand')) {
        const palm = new THREE.Mesh(new THREE.BoxGeometry(seg.h, 0.04, seg.r * 2), matBody);
        palm.castShadow = true;
        group.add(palm);

        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(seg.h * 0.9, 0.02, seg.r * 1.5), matPlates);
        knuckle.position.set(0, 0.02, 0);
        group.add(knuckle);
      } else {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 16, 16), matBody);
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

      // Unified RigidBody Adapter backed by MuJoCo
      const rbAdapter = {
        translation: () => {
          if (bodyId >= 0 && this.data && this.data.xpos) {
            const o = bodyId * 3;
            return { x: this.data.xpos[o], y: this.data.xpos[o + 1], z: this.data.xpos[o + 2] };
          }
          return { x: group.position.x, y: group.position.y, z: group.position.z };
        },
        rotation: () => {
          if (bodyId >= 0 && this.data && this.data.xquat) {
            const o = bodyId * 4;
            // MuJoCo: [w, x, y, z] -> Three.js: [x, y, z, w]
            return {
              x: this.data.xquat[o + 1],
              y: this.data.xquat[o + 2],
              z: this.data.xquat[o + 3],
              w: this.data.xquat[o + 0]
            };
          }
          return { x: group.quaternion.x, y: group.quaternion.y, z: group.quaternion.z, w: group.quaternion.w };
        },
        linvel: () => {
          if (bodyId >= 0 && this.data && this.data.cvel) {
            const o = bodyId * 6;
            return { x: this.data.cvel[o + 3], y: this.data.cvel[o + 4], z: this.data.cvel[o + 5] };
          }
          return { x: 0, y: 0, z: 0 };
        },
        angvel: () => {
          if (bodyId >= 0 && this.data && this.data.cvel) {
            const o = bodyId * 6;
            return { x: this.data.cvel[o + 0], y: this.data.cvel[o + 1], z: this.data.cvel[o + 2] };
          }
          return { x: 0, y: 0, z: 0 };
        },
        applyImpulse: (impulse) => {
          if (bodyId >= 0 && this.data && this.data.xfrc_applied) {
            const dt = this.model?.opt?.timestep || (1 / 120);
            const o = bodyId * 6;
            this.data.xfrc_applied[o + 0] += (impulse.x || 0) / dt;
            this.data.xfrc_applied[o + 1] += (impulse.y || 0) / dt;
            this.data.xfrc_applied[o + 2] += (impulse.z || 0) / dt;
          }
        },
        applyTorqueImpulse: (torque) => {
          if (bodyId >= 0 && this.data && this.data.xfrc_applied) {
            const dt = this.model?.opt?.timestep || (1 / 120);
            const o = bodyId * 6;
            this.data.xfrc_applied[o + 3] += (torque.x || 0) / dt;
            this.data.xfrc_applied[o + 4] += (torque.y || 0) / dt;
            this.data.xfrc_applied[o + 5] += (torque.z || 0) / dt;
          }
        },
        setTranslation: (pos) => {
          if (bodyId === pelvisId && this.data && this.data.qpos) {
            this.data.qpos[0] = pos.x;
            this.data.qpos[1] = pos.y;
            this.data.qpos[2] = pos.z;
          }
        },
        setRotation: (rot) => {
          if (bodyId === pelvisId && this.data && this.data.qpos) {
            this.data.qpos[3] = rot.w;
            this.data.qpos[4] = rot.x;
            this.data.qpos[5] = rot.y;
            this.data.qpos[6] = rot.z;
          }
        },
        setLinvel: (vel) => {
          if (bodyId === pelvisId && this.data && this.data.qvel) {
            this.data.qvel[0] = vel.x;
            this.data.qvel[1] = vel.y;
            this.data.qvel[2] = vel.z;
          }
        },
        setAngvel: (vel) => {
          if (bodyId === pelvisId && this.data && this.data.qvel) {
            this.data.qvel[3] = vel.x;
            this.data.qvel[4] = vel.y;
            this.data.qvel[5] = vel.z;
          }
        },
        setBodyType: (type) => {},
        bodyType: () => {
          return this.isKinematic ? 2 : 0;
        },
        enableCcd: () => {},
        setLinearDamping: () => {},
        setAngularDamping: () => {}
      };

      this.bodies[seg.name] = {
        mesh: group,
        rigidBody: rbAdapter,
        bodyId,
        mass: seg.mass,
        radius: seg.r,
        height: seg.h,
        type: seg.type,
        initPos: restPos.clone(),
        initRot: new THREE.Quaternion(),
        prevPos: restPos.clone()
      };
    }

    // Configure Anatomical Joints matching Endorphin hierarchy & actuators
    this.setupJoints();
  }

  setupJoints() {
    this.joints = [];

    const jointDefinitions = [
      { name: 'Pelvis_to_LowerSpine', childName: 'LowerSpine', parentName: 'Pelvis', type: 'spherical', acts: ['act_LowerSpine_x', 'act_LowerSpine_y', 'act_LowerSpine_z'] },
      { name: 'LowerSpine_to_UpperSpine', childName: 'UpperSpine', parentName: 'LowerSpine', type: 'spherical', acts: ['act_UpperSpine_x', 'act_UpperSpine_y', 'act_UpperSpine_z'] },
      { name: 'UpperSpine_to_Neck', childName: 'Neck', parentName: 'UpperSpine', type: 'spherical', acts: ['act_Neck_x', 'act_Neck_y', 'act_Neck_z'] },
      { name: 'Neck_to_Head', childName: 'Head', parentName: 'Neck', type: 'spherical', acts: ['act_Head_x', 'act_Head_y', 'act_Head_z'] },

      { name: 'UpperSpine_to_LeftShoulder', childName: 'LeftShoulder', parentName: 'UpperSpine', type: 'spherical', acts: ['act_LeftShoulder_x', 'act_LeftShoulder_y', 'act_LeftShoulder_z'] },
      { name: 'LeftShoulder_to_LeftUpperArm', childName: 'LeftUpperArm', parentName: 'LeftShoulder', type: 'spherical', acts: ['act_LeftUpperArm_x', 'act_LeftUpperArm_y', 'act_LeftUpperArm_z'] },
      { name: 'LeftUpperArm_to_LeftForearm', childName: 'LeftForearm', parentName: 'LeftUpperArm', type: 'revolute', acts: ['act_LeftForearm_y', null, null] },
      { name: 'LeftForearm_to_LeftHand', childName: 'LeftHand', parentName: 'LeftForearm', type: 'spherical', acts: ['act_LeftHand_x', 'act_LeftHand_y', 'act_LeftHand_z'] },

      { name: 'UpperSpine_to_RightShoulder', childName: 'RightShoulder', parentName: 'UpperSpine', type: 'spherical', acts: ['act_RightShoulder_x', 'act_RightShoulder_y', 'act_RightShoulder_z'] },
      { name: 'RightShoulder_to_RightUpperArm', childName: 'RightUpperArm', parentName: 'RightShoulder', type: 'spherical', acts: ['act_RightUpperArm_x', 'act_RightUpperArm_y', 'act_RightUpperArm_z'] },
      { name: 'RightUpperArm_to_RightForearm', childName: 'RightForearm', parentName: 'RightUpperArm', type: 'revolute', acts: ['act_RightForearm_y', null, null] },
      { name: 'RightForearm_to_RightHand', childName: 'RightHand', parentName: 'RightForearm', type: 'spherical', acts: ['act_RightHand_x', 'act_RightHand_y', 'act_RightHand_z'] },

      { name: 'Pelvis_to_LeftThigh', childName: 'LeftThigh', parentName: 'Pelvis', type: 'spherical', acts: ['act_LeftThigh_x', 'act_LeftThigh_y', 'act_LeftThigh_z'] },
      { name: 'LeftThigh_to_LeftCalf', childName: 'LeftCalf', parentName: 'LeftThigh', type: 'revolute', acts: ['act_LeftCalf_x', null, null] },
      { name: 'LeftCalf_to_LeftFoot', childName: 'LeftFoot', parentName: 'LeftCalf', type: 'revolute', acts: ['act_LeftFoot_x', null, null] },

      { name: 'Pelvis_to_RightThigh', childName: 'RightThigh', parentName: 'Pelvis', type: 'spherical', acts: ['act_RightThigh_x', 'act_RightThigh_y', 'act_RightThigh_z'] },
      { name: 'RightThigh_to_RightCalf', childName: 'RightCalf', parentName: 'RightThigh', type: 'revolute', acts: ['act_RightCalf_x', null, null] },
      { name: 'RightCalf_to_RightFoot', childName: 'RightFoot', parentName: 'RightCalf', type: 'revolute', acts: ['act_RightFoot_x', null, null] }
    ];

    for (const def of jointDefinitions) {
      const actIds = def.acts.map(name => name ? (this.actuatorMap[name] ?? -1) : -1);

      this.joints.push({
        name: def.name,
        childName: def.childName,
        parentName: def.parentName,
        config: { type: def.type },
        targetAngle: new THREE.Vector3(0, 0, 0),
        actuatorIds: actIds
      });
    }
  }

  // Forward Kinematics for pure animation playback
  applyForwardKinematics(rootPos, localRotationsEuler = {}) {
    const worldTransforms = {};
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.spawnYaw || 0);

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      const eul = localRotationsEuler[name] || [0, 0, 0];
      const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul));

      if (!def.parent) {
        worldTransforms[name] = { pos: rootPos.clone(), rot: yawQuat.clone().multiply(localQ) };
      } else {
        const parentT = worldTransforms[def.parent];
        const jointKey = `${def.parent}_to_${name}`;
        const anchorData = JOINT_ANCHORS[jointKey];
        const worldRot = parentT.rot.clone().multiply(localQ);

        let worldPos;
        if (anchorData) {
          const pAnchor = new THREE.Vector3(anchorData.parentAnchor.x, anchorData.parentAnchor.y, anchorData.parentAnchor.z).applyQuaternion(parentT.rot);
          const cAnchor = new THREE.Vector3(anchorData.childAnchor.x, anchorData.childAnchor.y, anchorData.childAnchor.z).applyQuaternion(worldRot);
          worldPos = parentT.pos.clone().add(pAnchor).sub(cAnchor);
        } else {
          const offsetVec = new THREE.Vector3(...def.offset);
          worldPos = parentT.pos.clone().add(offsetVec.applyQuaternion(parentT.rot));
        }

        worldTransforms[name] = { pos: worldPos, rot: worldRot };
      }

      const b = this.bodies[name];
      if (b) {
        const tr = worldTransforms[name];
        b.mesh.position.copy(tr.pos);
        b.mesh.quaternion.copy(tr.rot);
      }
    }

    // Synchronize MuJoCo generalized coordinates so dynamic handoff occurs seamlessly
    if (this.data && this.data.qpos) {
      this.data.qpos[0] = rootPos.x;
      this.data.qpos[1] = rootPos.y;
      this.data.qpos[2] = rootPos.z;
      const rootQ = worldTransforms['Pelvis'] ? worldTransforms['Pelvis'].rot : new THREE.Quaternion();
      this.data.qpos[3] = rootQ.w;
      this.data.qpos[4] = rootQ.x;
      this.data.qpos[5] = rootQ.y;
      this.data.qpos[6] = rootQ.z;

      if (this.jointQposMap) {
        for (const [boneName, eul] of Object.entries(localRotationsEuler)) {
          if (!eul) continue;
          const jx = this.jointQposMap[`${boneName}_x`];
          const jy = this.jointQposMap[`${boneName}_y`];
          const jz = this.jointQposMap[`${boneName}_z`];
          if (jx !== undefined && eul[0] !== undefined) this.data.qpos[jx] = eul[0];
          if (jy !== undefined && eul[1] !== undefined) this.data.qpos[jy] = eul[1];
          if (jz !== undefined && eul[2] !== undefined) this.data.qpos[jz] = eul[2];
        }
      }

      this.mujoco.mj_forward(this.model, this.data);
    }
  }

  setDynamicMode(isDynamic) {
    this.isKinematic = !isDynamic;
    if (!isDynamic && this.data) {
      if (this.data.qvel) this.data.qvel.fill(0);
      if (this.data.qacc) this.data.qacc.fill(0);
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
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const oy = this.spawnOffset ? this.spawnOffset.y : 0;
    const oz = this.spawnOffset ? this.spawnOffset.z : 0;

    for (const [name, b] of Object.entries(this.bodies)) {
      const px = b.initPos.x + ox;
      const py = b.initPos.y + oy;
      const pz = b.initPos.z + oz;
      b.mesh.position.set(px, py, pz);
      b.mesh.quaternion.copy(b.initRot);
      b.prevPos.set(px, py, pz);
    }

    for (const j of this.joints) {
      j.targetAngle.set(0, 0, 0);
    }

    if (this.data && this.data.qpos) {
      this.data.time = 0.0;
      this.data.qpos.fill(0);
      if (this.data.qvel) this.data.qvel.fill(0);
      if (this.data.qacc) this.data.qacc.fill(0);
      if (this.data.ctrl) this.data.ctrl.fill(0);
      if (this.data.xfrc_applied) this.data.xfrc_applied.fill(0);

      this.data.qpos[0] = ox;
      this.data.qpos[1] = 0.95 + oy;
      this.data.qpos[2] = oz;
      this.data.qpos[3] = 1.0;
      this.data.qpos[4] = 0.0;
      this.data.qpos[5] = 0.0;
      this.data.qpos[6] = 0.0;

      this.mujoco.mj_forward(this.model, this.data);
    }
  }

  setActuatorStiffness(actId, kp) {
    if (!this.model || !this.model.actuator_gainprm || !this.model.actuator_biasprm) return;
    const gOffset = actId * 10;
    const bOffset = actId * 10;
    if (gOffset < this.model.actuator_gainprm.length && bOffset + 1 < this.model.actuator_biasprm.length) {
      this.model.actuator_gainprm[gOffset] = kp;
      this.model.actuator_biasprm[bOffset + 1] = -kp;
    }
  }

  applyMotorTorques(dt = 1 / 120) {
    if (this.isKinematic || !this.data || !this.data.ctrl) return;

    const pelvis = this.bodies['Pelvis'];
    const pelvisY = pelvis ? pelvis.rigidBody.translation().y : 0.95;
    const isGroundRest = pelvisY < 0.22 || this.sensors.tiltAngle > 75;

    if (isGroundRest && !this.allowGroundActiveMotor) {
      this.applyPassiveRagdollDynamics(dt);
      return;
    }

    const baseStiff = this.muscleStiffness > 1.0 ? Math.max(2.0, this.muscleStiffness * 0.70) : 0.0;

    for (const j of this.joints) {
      let weight = 1.0;
      if (j.name.includes('Spine') || j.name.includes('Thigh')) weight = 1.25;
      else if (j.name.includes('Calf') || j.name.includes('Foot')) weight = 1.1;
      else if (j.name.includes('Shoulder') || j.name.includes('UpperArm') || j.name.includes('Forearm')) weight = 0.65;
      else if (j.name.includes('Neck') || j.name.includes('Head')) weight = 0.45;

      const kp = baseStiff * weight;

      if (j.config.type === 'revolute') {
        const actId = j.actuatorIds[0];
        if (actId >= 0 && actId < this.data.ctrl.length) {
          this.setActuatorStiffness(actId, kp);
          this.data.ctrl[actId] = j.targetAngle.x;
        }
      } else {
        const [axId, ayId, azId] = j.actuatorIds;
        if (axId >= 0 && axId < this.data.ctrl.length) {
          this.setActuatorStiffness(axId, kp);
          this.data.ctrl[axId] = j.targetAngle.x;
        }
        if (ayId >= 0 && ayId < this.data.ctrl.length) {
          this.setActuatorStiffness(ayId, kp * 0.75);
          this.data.ctrl[ayId] = j.targetAngle.y;
        }
        if (azId >= 0 && azId < this.data.ctrl.length) {
          this.setActuatorStiffness(azId, kp);
          this.data.ctrl[azId] = j.targetAngle.z;
        }
      }
    }

    this.applyFloorContactStiction(dt);
  }

  applyPassiveRagdollDynamics(dt = 1 / 120) {
    if (this.isKinematic || !this.data || !this.data.ctrl) return;

    // Pure limp ragdoll dynamics: all actuator stiffness set to 0.0
    if (this.isPureRagdoll) {
      for (const j of this.joints) {
        for (const actId of j.actuatorIds) {
          if (actId >= 0) {
            this.setActuatorStiffness(actId, 0.0);
            this.data.ctrl[actId] = 0.0;
          }
        }
      }
      this.applyFloorContactStiction(dt);
      return;
    }

    const p = this.bodies['Pelvis'] ? this.bodies['Pelvis'].rigidBody.translation() : { x: 0, y: 0.95, z: 0 };
    const lf = this.bodies['LeftFoot'] ? this.bodies['LeftFoot'].rigidBody.translation() : { x: 0.12, y: 0.04, z: 0.04 };
    const ox = this.spawnOffset ? this.spawnOffset.x : 0;
    const horizDisp = Math.hypot(p.x - ox, p.z - (lf.z - 0.04));

    const support = (p.y > 0.65) ? Math.max(0.0, Math.min(1.0, 1.0 - (horizDisp / 0.22))) : 0.0;

    for (const j of this.joints) {
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        const actId = j.actuatorIds[0];
        if (actId >= 0) {
          const isRight = j.name.includes('Right');
          const target = support * (isRight ? 0.25 : 0.15);
          this.setActuatorStiffness(actId, support * 180.0 + 1.5);
          this.data.ctrl[actId] = target;
        }
      } else if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        const actId = j.actuatorIds[0];
        if (actId >= 0) {
          this.setActuatorStiffness(actId, support * 45.0 + 1.0);
          this.data.ctrl[actId] = -0.35 * support;
        }
      } else if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        const actId = j.actuatorIds[0];
        if (actId >= 0) {
          this.setActuatorStiffness(actId, 1.5);
          this.data.ctrl[actId] = 0.35;
        }
      } else if (j.config.type === 'spherical') {
        let stiff = support * 8.0 + 1.5;
        let target = new THREE.Vector3(0, 0, 0);

        if (j.name.includes('Spine')) {
          stiff = 65.0 * support + 6.0;
          target.set(0.22, 0, 0.08);
        } else if (j.name.includes('Thigh')) {
          stiff = 140.0 * support + 1.5;
          target.set(0, 0, 0.06 * support);
        } else if (j.name.includes('UpperArm')) {
          stiff = 4.0 * support + 1.0;
          target.set(0.20, 0, j.name.includes('Left') ? -1.15 : 1.15);
        } else if (j.name.includes('Neck') || j.name.includes('Head')) {
          stiff = 10.0 * support + 3.0;
          target.set(0.15, 0, 0);
        }

        const [axId, ayId, azId] = j.actuatorIds;
        if (axId >= 0) {
          this.setActuatorStiffness(axId, stiff);
          this.data.ctrl[axId] = target.x;
        }
        if (ayId >= 0) {
          this.setActuatorStiffness(ayId, stiff * 0.75);
          this.data.ctrl[ayId] = target.y;
        }
        if (azId >= 0) {
          this.setActuatorStiffness(azId, stiff);
          this.data.ctrl[azId] = target.z;
        }
      }
    }

    this.applyFloorContactStiction(dt);
  }

  applyFloorContactStiction(dt = 1 / 120) {
    if (!this.data || !this.data.xfrc_applied) return;

    for (const [name, b] of Object.entries(this.bodies)) {
      if (name === 'LeftFoot' || name === 'RightFoot') continue;
      const trans = b.rigidBody.translation();
      const radius = b.radius || 0.08;
      const halfHeight = (b.type === 'capsule' || b.type === 'capsule_x') ? (b.height || 0.16) * 0.5 : 0.0;
      const rot = b.rigidBody.rotation();
      const qB = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const isHoriz = (b.type === 'capsule_x');
      const localAxis = isHoriz
        ? new THREE.Vector3(1, 0, 0).applyQuaternion(qB)
        : new THREE.Vector3(0, 1, 0).applyQuaternion(qB);
      const verticalExtent = Math.abs(localAxis.y) * halfHeight + radius;
      const bottomY = trans.y - verticalExtent;

      if (bottomY <= 0.03 && b.bodyId >= 0) {
        const lv = b.rigidBody.linvel();
        const av = b.rigidBody.angvel();
        const hSpeed = Math.hypot(lv.x, lv.z);
        const rotSpeed = Math.hypot(av.x, av.y, av.z);

        if (hSpeed > 0.002 && Math.abs(lv.y) < 0.25) {
          const stiction = Math.min(0.45, dt * 14.0);
          const o = b.bodyId * 6;
          this.data.xfrc_applied[o + 0] += (-lv.x * b.mass * stiction) / dt;
          this.data.xfrc_applied[o + 2] += (-lv.z * b.mass * stiction) / dt;
        }

        if (hSpeed < 0.04 && Math.abs(lv.y) < 0.04 && rotSpeed < 0.6) {
          if (b.bodyId === 1 && this.data.qvel) {
            this.data.qvel[0] = 0;
            this.data.qvel[2] = 0;
          }
        }
      }
    }
  }

  update(dt = 1 / 120) {
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
    }

    // Synchronize 3D visual mannequin meshes from MuJoCo Cartesian coordinates
    if (this.data && this.data.xpos && this.data.xquat) {
      for (const [name, b] of Object.entries(this.bodies)) {
        if (b.bodyId >= 0) {
          const po = b.bodyId * 3;
          const qo = b.bodyId * 4;
          b.mesh.position.set(this.data.xpos[po], this.data.xpos[po + 1], this.data.xpos[po + 2]);
          // MuJoCo: [w, x, y, z] -> Three.js: [x, y, z, w]
          b.mesh.quaternion.set(
            this.data.xquat[qo + 1],
            this.data.xquat[qo + 2],
            this.data.xquat[qo + 3],
            this.data.xquat[qo + 0]
          );
        }
      }
    }
  }

  applyImpulseToBody(bodyName, impulseVector) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (b && b.rigidBody) {
      b.rigidBody.applyImpulse(impulseVector);
    }
  }

  // Endorphin / Boston Dynamics Force Effector with Kinetic Chain Coupling & Active Push Recovery
  applyForceEffector(bodyName, forceVector, isContinuous = false) {
    if (this.isKinematic) return;

    const target = this.bodies[bodyName] ? bodyName : 'UpperSpine';
    const b = this.bodies[target];
    if (!b || !b.rigidBody) return;

    if (!this.balanceControlEnabled) {
      this.impactShockTimer = isContinuous ? Math.max(this.impactShockTimer, 0.08) : 0.26;
    } else {
      this.impactShockTimer = 0; // Maintain full joint motor stiffness for active push recovery
    }

    const powerScale = isContinuous ? 0.32 : 1.0;
    const fx = forceVector.x * powerScale;
    const fy = forceVector.y * powerScale;
    const fz = forceVector.z * powerScale;

    b.rigidBody.applyImpulse({ x: fx, y: fy, z: fz });
    b.rigidBody.applyTorqueImpulse({
      x: fz * 0.08,
      y: (fx - fz) * 0.04,
      z: -fx * 0.08
    });

    const def = SKELETON_TREE[target];
    if (def && def.parent && this.bodies[def.parent]) {
      this.bodies[def.parent].rigidBody.applyImpulse({
        x: fx * 0.35,
        y: fy * 0.35,
        z: fz * 0.35
      });
    }
  }

  // --- BOSTON DYNAMICS ACTIVE DYNAMIC BALANCE & PUSH RECOVERY CONTROLLER ---
  updateZMPBalance(dt = 1 / 120) {
    if (this.isKinematic || this.isPureRagdoll || this.balanceControlEnabled === false) return;
    if (this.dynamicBalance) {
      this.dynamicBalance.update(dt);
    }
  }

  applyActivePose(poseKey, strength = 1.0) {
    const pose = ENDORPHIN_ACTIVE_POSES[poseKey] || ENDORPHIN_ACTIVE_POSES['crouching'];
    if (!pose || !pose.angles || !this.data || !this.data.ctrl) return;
    const factor = Math.min(1.0, Math.max(0.0, strength / 50.0));
    for (const j of this.joints) {
      const pAngles = pose.angles[j.name];
      if (pAngles) {
        if (j.targetAngle) {
          j.targetAngle.x = THREE.MathUtils.lerp(j.targetAngle.x || 0, pAngles[0] || 0, factor);
          j.targetAngle.y = THREE.MathUtils.lerp(j.targetAngle.y || 0, pAngles[1] || 0, factor);
          j.targetAngle.z = THREE.MathUtils.lerp(j.targetAngle.z || 0, pAngles[2] || 0, factor);
        }
        const acts = j.actuatorIds || [];
        if (acts[0] !== undefined && acts[0] >= 0 && acts[0] < this.data.ctrl.length) {
          this.data.ctrl[acts[0]] = (pAngles[0] || 0) * factor;
        }
        if (acts[1] !== undefined && acts[1] >= 0 && acts[1] < this.data.ctrl.length) {
          this.data.ctrl[acts[1]] = (pAngles[1] || 0) * factor;
        }
        if (acts[2] !== undefined && acts[2] >= 0 && acts[2] < this.data.ctrl.length) {
          this.data.ctrl[acts[2]] = (pAngles[2] || 0) * factor;
        }
      }
    }
  }

  applyBoneConstraint(bodyName, constraintType = 'lock', anchorPos = null, strength = 1.0, anchorLinvel = null, targetRotation = null, anchorAngvel = null) {
    if (this.isKinematic) return;
    const b = this.bodies[bodyName];
    if (!b || !b.rigidBody) return;

    const effectiveStrength = THREE.MathUtils.clamp(strength, 0.0, 1.0);
    const linvelToSet = anchorLinvel || { x: 0, y: 0, z: 0 };
    const angvelToSet = anchorAngvel || { x: 0, y: 0, z: 0 };

    if (effectiveStrength >= 0.85) {
      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          b.rigidBody.setTranslation({ x: anchorPos.x, y: anchorPos.y, z: anchorPos.z });
          if (b.mesh) b.mesh.position.set(anchorPos.x, anchorPos.y, anchorPos.z);
          b.rigidBody.setLinvel(linvelToSet);
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        if (targetRotation) {
          b.rigidBody.setRotation(targetRotation);
          if (b.mesh) b.mesh.quaternion.copy(targetRotation);
        }
        b.rigidBody.setAngvel(angvelToSet);
      }
    } else {
      if (constraintType === 'lock' || constraintType === 'lockPosition') {
        if (anchorPos) {
          const cur = b.rigidBody.translation();
          const dx = anchorPos.x - cur.x;
          const dy = anchorPos.y - cur.y;
          const dz = anchorPos.z - cur.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.0005) {
            const pullVel = dist * 120.0 * effectiveStrength;
            b.rigidBody.setLinvel({
              x: linvelToSet.x + (dx / dist) * pullVel,
              y: linvelToSet.y + (dy / dist) * pullVel,
              z: linvelToSet.z + (dz / dist) * pullVel
            });
          } else {
            b.rigidBody.setLinvel(linvelToSet);
          }
        }
      }

      if (constraintType === 'lock' || constraintType === 'lockOrientation') {
        b.rigidBody.setAngvel(angvelToSet);
      }
    }
  }

  releaseBoneConstraint(bodyName) {
    // MuJoCo does not need explicit joint relaxation for bone release
  }

  setColliderGirth(multiplier = 1.0) {
    this.colliderGirth = Math.max(0.4, Math.min(2.5, multiplier));
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
      const rot = localRotations[j.childName];
      if (rot && j.targetAngle) {
        j.targetAngle.set(rot[0], rot[1], rot[2]);
      } else if (j.targetAngle) {
        j.targetAngle.set(0, 0, 0);
      }
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
    this.bodies = {};
    this.joints = [];
  }
}

export { MuJoCoCharacter as MujocoCharacter };
