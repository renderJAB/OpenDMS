import * as THREE from 'three';
import { CharacterSensors } from './sensors.js';
import { DynamicBalanceController } from './dynamicBalance.js';
import { SKELETON_TREE, JOINT_ANCHORS, ENDORPHIN_ACTIVE_POSES, ENDORPHIN_EFFECTOR_CALIBRATIONS, VIRTUAL_MUSCLE_CONFIGS, clampBoneEulerRotation, NATURAL_STANCE_ROTATIONS } from './character.js';

export class JoltCharacter {
  constructor(joltData, scene, initialPos = { x: 0, y: 0.95, z: 0 }, actorIndex = 0, options = {}) {
    this.jolt = joltData.jolt;
    this.joltInterface = joltData.joltInterface;
    this.physicsSystem = joltData.physicsSystem;
    this.bodyInterface = joltData.bodyInterface;
    this.scene = scene;
    this.initialPos = initialPos;
    this.actorIndex = actorIndex;
    this.actorId = options.actorId || `actor-${actorIndex + 1}`;
    this.actorColor = options.actorColor || (actorIndex === 0 ? 0x38bdf8 : 0xf97316);
    this.spawnOffset = new THREE.Vector3(initialPos.x || 0, Math.max(0, (initialPos.y || 0.95) - 0.95), initialPos.z || 0);
    this.spawnYaw = options.spawnYaw || 0;
    this.bodies = {};
    this.joints = [];
    this.constraints = [];
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

    this.buildHumanoid();
    this.resetToTPose();
  }

  buildHumanoid() {
    const Jolt = this.jolt;
    const LAYER_MOVING = 1;

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

    // 0. GroupFilterTable to eliminate parent-child joint collision self-fighting
    this.filterTable = new Jolt.GroupFilterTable(25);
    const SEGMENT_IDS = {
      Pelvis: 1, LowerSpine: 2, UpperSpine: 3, Neck: 4, Head: 5,
      LeftShoulder: 6, LeftUpperArm: 7, LeftForearm: 8, LeftHand: 9,
      RightShoulder: 10, RightUpperArm: 11, RightForearm: 12, RightHand: 13,
      LeftThigh: 14, LeftCalf: 15, LeftFoot: 16,
      RightThigh: 17, RightCalf: 18, RightFoot: 19
    };
    const disabledPairs = [
      ['Pelvis', 'LowerSpine'], ['LowerSpine', 'UpperSpine'], ['UpperSpine', 'Neck'], ['Neck', 'Head'],
      ['UpperSpine', 'LeftShoulder'], ['LeftShoulder', 'LeftUpperArm'], ['LeftUpperArm', 'LeftForearm'], ['LeftForearm', 'LeftHand'],
      ['UpperSpine', 'RightShoulder'], ['RightShoulder', 'RightUpperArm'], ['RightUpperArm', 'RightForearm'], ['RightForearm', 'RightHand'],
      ['Pelvis', 'LeftThigh'], ['LeftThigh', 'LeftCalf'], ['LeftCalf', 'LeftFoot'],
      ['Pelvis', 'RightThigh'], ['RightThigh', 'RightCalf'], ['RightCalf', 'RightFoot'],
      ['LeftShoulder', 'Neck'], ['RightShoulder', 'Neck'], ['LeftShoulder', 'RightShoulder'],
      ['LeftShoulder', 'UpperSpine'], ['RightShoulder', 'UpperSpine'],
      ['Pelvis', 'LeftCalf'], ['Pelvis', 'RightCalf']
    ];
    for (const [s1, s2] of disabledPairs) {
      if (SEGMENT_IDS[s1] && SEGMENT_IDS[s2]) {
        this.filterTable.DisableCollision(SEGMENT_IDS[s1], SEGMENT_IDS[s2]);
      }
    }

    for (const seg of segments) {
      const restPos = globalRestPositions[seg.name];

      // 1. Create Three.js Visual Mesh
      const group = new THREE.Group();
      group.name = `visual_${seg.name}`;

      if (seg.name === 'Head') {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 20, 20), matBody);
        skull.castShadow = true;
        group.add(skull);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 1.5, 0.045, seg.r * 0.7), matVisor);
        visor.position.set(0, 0.015, seg.r * 0.75);
        group.add(visor);
      } else if (seg.name === 'UpperSpine') {
        const rib = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.9, seg.h, 16, 16), matBody);
        rib.castShadow = true;
        group.add(rib);
        const chest = new THREE.Mesh(new THREE.BoxGeometry(seg.r * 1.7, seg.h * 0.68, seg.r * 0.5), matPlates);
        chest.position.set(0, seg.h * 0.1, seg.r * 0.58);
        chest.castShadow = true;
        group.add(chest);
      } else if (seg.name === 'LowerSpine') {
        const core = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.92, seg.h, 16, 16), matBody);
        core.castShadow = true;
        group.add(core);
      } else if (seg.name === 'Pelvis') {
        const pelv = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 16, 16), matBody);
        pelv.castShadow = true;
        group.add(pelv);
      } else if (seg.name.includes('Thigh')) {
        const fem = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r * 0.95, seg.h, 16, 16), matBody);
        fem.castShadow = true;
        group.add(fem);
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
      } else if (seg.name.includes('UpperArm')) {
        const hum = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16).rotateZ(Math.PI / 2), matBody);
        hum.castShadow = true;
        group.add(hum);
      } else if (seg.name.includes('Forearm')) {
        const rad = new THREE.Mesh(new THREE.CapsuleGeometry(seg.r, seg.h, 12, 16).rotateZ(Math.PI / 2), matBody);
        rad.castShadow = true;
        group.add(rad);
      } else if (seg.name.includes('Hand')) {
        const palm = new THREE.Mesh(new THREE.BoxGeometry(seg.h, 0.04, seg.r * 2), matBody);
        palm.castShadow = true;
        group.add(palm);
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

      // 2. Create Jolt Shape
      let shape;
      if (seg.type === 'capsule') {
        shape = new Jolt.CapsuleShape(seg.h * 0.5, seg.r);
      } else if (seg.type === 'capsule_x') {
        const cap = new Jolt.CapsuleShapeSettings(seg.h * 0.5, seg.r);
        const qZ90 = new Jolt.Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2);
        const rotShape = new Jolt.RotatedTranslatedShapeSettings(new Jolt.Vec3(0, 0, 0), qZ90, cap);
        shape = rotShape.Create().Get();
      } else if (seg.type === 'sphere') {
        shape = new Jolt.SphereShape(seg.r);
      } else if (seg.type === 'box_foot') {
        shape = new Jolt.BoxShape(new Jolt.Vec3(seg.r, 0.04, seg.h * 0.5));
      } else {
        shape = new Jolt.BoxShape(new Jolt.Vec3(seg.h * 0.5, seg.r * 0.85, seg.r));
      }

      // 3. Create Jolt Body
      const creationSettings = new Jolt.BodyCreationSettings(
        shape,
        new Jolt.RVec3(restPos.x, restPos.y, restPos.z),
        new Jolt.Quat(0, 0, 0, 1),
        Jolt.EMotionType_Kinematic,
        LAYER_MOVING
      );
      creationSettings.mMotionQuality = Jolt.EMotionQuality_LinearCast;
      creationSettings.mFriction = 1.2;
      creationSettings.mRestitution = 0.0;
      creationSettings.mLinearDamping = 0.04;
      creationSettings.mAngularDamping = 0.35;
      creationSettings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
      creationSettings.mMassPropertiesOverride.mMass = seg.mass;

      // Assign collision group filter to prevent connected bone collision fight
      if (creationSettings.mCollisionGroup && this.filterTable) {
        creationSettings.mCollisionGroup.SetGroupFilter(this.filterTable);
        creationSettings.mCollisionGroup.SetGroupID((this.actorIndex || 0) + 1);
        creationSettings.mCollisionGroup.SetSubGroupID(SEGMENT_IDS[seg.name] || 0);
      }

      const body = this.bodyInterface.CreateBody(creationSettings);
      this.bodyInterface.AddBody(body.GetID(), Jolt.EActivation_DontActivate);
      const bodyID = body.GetID();

      // 4. Unified RigidBody Adapter for Jolt
      const bi = this.bodyInterface;
      const rbAdapter = {
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
        applyImpulse: (vec) => {
          bi.AddImpulse(bodyID, new Jolt.Vec3(vec.x || 0, vec.y || 0, vec.z || 0));
        },
        setTranslation: (pos) => {
          bi.SetPosition(bodyID, new Jolt.RVec3(pos.x, pos.y, pos.z), Jolt.EActivation_Activate);
        },
        setRotation: (rot) => {
          bi.SetRotation(bodyID, new Jolt.Quat(rot.x, rot.y, rot.z, rot.w), Jolt.EActivation_Activate);
        },
        setLinvel: (vel) => {
          bi.SetLinearVelocity(bodyID, new Jolt.Vec3(vel.x || 0, vel.y || 0, vel.z || 0));
        },
        setAngvel: (vel) => {
          bi.SetAngularVelocity(bodyID, new Jolt.Vec3(vel.x || 0, vel.y || 0, vel.z || 0));
        },
        applyTorqueImpulse: (vec) => {
          bi.AddTorque(bodyID, new Jolt.Vec3(vec.x || 0, vec.y || 0, vec.z || 0));
        },
        setBodyType: (type) => {
          const isKine = (type === 1 || type === 2 || type === 'kinematic');
          const motionType = isKine ? Jolt.EMotionType_Kinematic : Jolt.EMotionType_Dynamic;
          bi.SetMotionType(bodyID, motionType, Jolt.EActivation_Activate);
        },
        bodyType: () => {
          return this.isKinematic ? 2 : 0;
        },
        enableCcd: () => {},
        setLinearDamping: (d) => {
          const mp = body.GetMotionProperties();
          if (mp) mp.SetLinearDamping(d);
        },
        setAngularDamping: (d) => {
          const mp = body.GetMotionProperties();
          if (mp) mp.SetAngularDamping(d);
        }
      };

      this.bodies[seg.name] = {
        mesh: group,
        rigidBody: rbAdapter,
        body,
        bodyID,
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
    const Jolt = this.jolt;

    const jointConfigs = {
      'Pelvis_to_LowerSpine': { type: 'spherical', xLimits: [-0.32, 0.48], yLimits: [-0.50, 0.50], zLimits: [-0.32, 0.32] },
      'LowerSpine_to_UpperSpine': { type: 'spherical', xLimits: [-0.28, 0.40], yLimits: [-0.38, 0.38], zLimits: [-0.28, 0.28] },
      'UpperSpine_to_Neck': { type: 'spherical', xLimits: [-0.25, 0.30], yLimits: [-0.35, 0.35], zLimits: [-0.25, 0.25] },
      'Neck_to_Head': { type: 'spherical', xLimits: [-0.35, 0.45], yLimits: [-0.52, 0.52], zLimits: [-0.35, 0.35] },

      'LeftThigh_to_LeftCalf': { type: 'revolute', axis: 'X', limits: [0.0, 2.15] },
      'RightThigh_to_RightCalf': { type: 'revolute', axis: 'X', limits: [0.0, 2.15] },
      'LeftCalf_to_LeftFoot': { type: 'revolute', axis: 'X', limits: [-0.65, 0.85] },
      'RightCalf_to_RightFoot': { type: 'revolute', axis: 'X', limits: [-0.65, 0.85] },

      'LeftUpperArm_to_LeftForearm': { type: 'revolute', axis: 'Y_NEG', limits: [0.0, 2.25] },
      'RightUpperArm_to_RightForearm': { type: 'revolute', axis: 'Y_POS', limits: [0.0, 2.25] },

      'Pelvis_to_LeftThigh': { type: 'spherical', xLimits: [-1.45, 0.28], yLimits: [-0.42, 0.42], zLimits: [-0.18, 0.65] },
      'Pelvis_to_RightThigh': { type: 'spherical', xLimits: [-1.45, 0.28], yLimits: [-0.42, 0.42], zLimits: [-0.65, 0.18] },

      'UpperSpine_to_LeftShoulder': { type: 'spherical', xLimits: [-0.22, 0.22], yLimits: [-0.25, 0.25], zLimits: [-0.28, 0.25] },
      'UpperSpine_to_RightShoulder': { type: 'spherical', xLimits: [-0.22, 0.22], yLimits: [-0.25, 0.25], zLimits: [-0.25, 0.28] },
      'LeftShoulder_to_LeftUpperArm': { type: 'spherical', xLimits: [-0.75, 0.75], yLimits: [-1.25, 0.55], zLimits: [-1.30, 0.75] },
      'RightShoulder_to_RightUpperArm': { type: 'spherical', xLimits: [-0.75, 0.75], yLimits: [-0.55, 1.25], zLimits: [-0.75, 1.30] },
      'LeftForearm_to_LeftHand': { type: 'spherical', xLimits: [-0.45, 0.45], yLimits: [-0.55, 0.55], zLimits: [-0.65, 0.65] },
      'RightForearm_to_RightHand': { type: 'spherical', xLimits: [-0.45, 0.45], yLimits: [-0.55, 0.55], zLimits: [-0.65, 0.65] }
    };

    for (const [name, def] of Object.entries(SKELETON_TREE)) {
      if (!def.parent) continue;

      const jointKey = `${def.parent}_to_${name}`;
      const cfg = jointConfigs[jointKey] || { type: 'spherical', xLimits: [-0.4, 0.4], yLimits: [-0.4, 0.4], zLimits: [-0.4, 0.4] };
      const pBody = this.bodies[def.parent].body;
      const cBody = this.bodies[name].body;

      const anchorData = JOINT_ANCHORS[jointKey] || {
        parentAnchor: { x: def.offset[0], y: def.offset[1], z: def.offset[2] },
        childAnchor: { x: 0, y: 0, z: 0 }
      };

      let constraint;
      if (cfg.type === 'revolute') {
        const hSettings = new Jolt.HingeConstraintSettings();
        hSettings.mSpace = Jolt.EConstraintSpace_LocalToBodyCOM;
        hSettings.mPoint1 = new Jolt.Vec3(anchorData.parentAnchor.x, anchorData.parentAnchor.y, anchorData.parentAnchor.z);
        hSettings.mPoint2 = new Jolt.Vec3(anchorData.childAnchor.x, anchorData.childAnchor.y, anchorData.childAnchor.z);

        if (cfg.axis === 'X') {
          hSettings.mHingeAxis1 = new Jolt.Vec3(1, 0, 0);
          hSettings.mHingeAxis2 = new Jolt.Vec3(1, 0, 0);
          hSettings.mNormalAxis1 = new Jolt.Vec3(0, 1, 0);
          hSettings.mNormalAxis2 = new Jolt.Vec3(0, 1, 0);
        } else if (cfg.axis === 'Y_NEG') {
          hSettings.mHingeAxis1 = new Jolt.Vec3(0, -1, 0);
          hSettings.mHingeAxis2 = new Jolt.Vec3(0, -1, 0);
          hSettings.mNormalAxis1 = new Jolt.Vec3(0, 0, 1);
          hSettings.mNormalAxis2 = new Jolt.Vec3(0, 0, 1);
        } else {
          hSettings.mHingeAxis1 = new Jolt.Vec3(0, 1, 0);
          hSettings.mHingeAxis2 = new Jolt.Vec3(0, 1, 0);
          hSettings.mNormalAxis1 = new Jolt.Vec3(0, 0, 1);
          hSettings.mNormalAxis2 = new Jolt.Vec3(0, 0, 1);
        }

        hSettings.mLimitsMin = cfg.limits[0];
        hSettings.mLimitsMax = cfg.limits[1];

        // Configure initial spring settings on motor
        const hMotor = hSettings.mMotorSettings;
        const hSpring = hMotor.get_mSpringSettings();
        hSpring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);
        hSpring.set_mStiffness(260.0);
        hSpring.set_mDamping(32.0);
        hMotor.set_mMinTorqueLimit(-500);
        hMotor.set_mMaxTorqueLimit(500);

        constraint = hSettings.Create(pBody, cBody);
      } else {
        const cSettings = new Jolt.SixDOFConstraintSettings();
        cSettings.mSpace = Jolt.EConstraintSpace_LocalToBodyCOM;
        cSettings.mPosition1 = new Jolt.Vec3(anchorData.parentAnchor.x, anchorData.parentAnchor.y, anchorData.parentAnchor.z);
        cSettings.mPosition2 = new Jolt.Vec3(anchorData.childAnchor.x, anchorData.childAnchor.y, anchorData.childAnchor.z);
        cSettings.MakeFixedAxis(Jolt.SixDOFConstraintSettings_EAxis_TranslationX);
        cSettings.MakeFixedAxis(Jolt.SixDOFConstraintSettings_EAxis_TranslationY);
        cSettings.MakeFixedAxis(Jolt.SixDOFConstraintSettings_EAxis_TranslationZ);

        cSettings.SetLimitedAxis(Jolt.SixDOFConstraintSettings_EAxis_RotationX, cfg.xLimits[0], cfg.xLimits[1]);
        cSettings.SetLimitedAxis(Jolt.SixDOFConstraintSettings_EAxis_RotationY, cfg.yLimits[0], cfg.yLimits[1]);
        cSettings.SetLimitedAxis(Jolt.SixDOFConstraintSettings_EAxis_RotationZ, cfg.zLimits[0], cfg.zLimits[1]);

        // Configure rotational motor spring settings
        for (const axis of [
          Jolt.SixDOFConstraintSettings_EAxis_RotationX,
          Jolt.SixDOFConstraintSettings_EAxis_RotationY,
          Jolt.SixDOFConstraintSettings_EAxis_RotationZ
        ]) {
          const sMotor = cSettings.get_mMotorSettings(axis);
          const sSpring = sMotor.get_mSpringSettings();
          sSpring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);
          sSpring.set_mStiffness(300.0);
          sSpring.set_mDamping(35.0);
          sMotor.set_mMinTorqueLimit(-500);
          sMotor.set_mMaxTorqueLimit(500);
        }

        constraint = cSettings.Create(pBody, cBody);
      }

      this.physicsSystem.AddConstraint(constraint);
      this.constraints.push(constraint);

      this.joints.push({
        constraint,
        name: jointKey,
        parentName: def.parent,
        childName: name,
        config: cfg,
        targetAngle: new THREE.Vector3(0, 0, 0)
      });
    }
  }

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
    }

    // Anti-Ground-Penetration Foot Clamping
    const soleMargin = this.footSoleOffset ?? 0.04;
    const footL = worldTransforms['LeftFoot'];
    const footR = worldTransforms['RightFoot'];
    let lowestSoleY = Infinity;
    if (footL) lowestSoleY = Math.min(lowestSoleY, footL.pos.y - soleMargin);
    if (footR) lowestSoleY = Math.min(lowestSoleY, footR.pos.y - soleMargin);
    if (lowestSoleY < 0.0 && this.groundClampingEnabled !== false) {
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
        b.rigidBody.setTranslation({ x: tr.pos.x, y: tr.pos.y, z: tr.pos.z });
        b.rigidBody.setRotation({ x: tr.rot.x, y: tr.rot.y, z: tr.rot.z, w: tr.rot.w });
      }
    }
  }

  setDynamicMode(isDynamic) {
    this.isKinematic = !isDynamic;
    const Jolt = this.jolt;
    const motionType = isDynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Kinematic;
    const activation = isDynamic ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate;

    for (const [name, b] of Object.entries(this.bodies)) {
      this.bodyInterface.SetMotionType(b.bodyID, motionType, activation);
      if (isDynamic) {
        this.bodyInterface.ActivateBody(b.bodyID);
      } else {
        this.bodyInterface.SetLinearVelocity(b.bodyID, new Jolt.Vec3(0, 0, 0));
        this.bodyInterface.SetAngularVelocity(b.bodyID, new Jolt.Vec3(0, 0, 0));
      }
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
      b.rigidBody.setTranslation({ x: px, y: py, z: pz });
      b.rigidBody.setRotation({ x: 0, y: 0, z: 0, w: 1 });
      b.prevPos.set(px, py, pz);
    }

    for (const j of this.joints) {
      j.targetAngle.set(0, 0, 0);
    }
  }

  applyMotorTorques(dt = 1 / 120) {
    if (this.isKinematic || this.isPureRagdoll) return;
    const Jolt = this.jolt;

    const pelvis = this.bodies['Pelvis'];
    const pelvisY = pelvis ? pelvis.rigidBody.translation().y : 0.95;
    const isGroundRest = pelvisY < 0.22 || this.sensors.tiltAngle > 75;

    if (isGroundRest && !this.allowGroundActiveMotor) {
      this.applyPassiveRagdollDynamics(dt);
      return;
    }

    const baseStiff = this.muscleStiffness > 1.0 ? Math.max(2.0, this.muscleStiffness * 0.70) : 0.0;
    const baseDamp = this.muscleDamping > 0.5 ? Math.max(1.0, this.muscleDamping * 0.60) : 0.5;

    for (const j of this.joints) {
      let weight = 1.0;
      if (j.name.includes('Spine') || j.name.includes('Thigh')) weight = 1.25;
      else if (j.name.includes('Calf') || j.name.includes('Foot')) weight = 1.1;
      else if (j.name.includes('Shoulder') || j.name.includes('UpperArm') || j.name.includes('Forearm')) weight = 0.65;
      else if (j.name.includes('Neck') || j.name.includes('Head')) weight = 0.45;

      const s = baseStiff * weight;
      const d = baseDamp * weight;

      if (j.config.type === 'revolute') {
        const hinge = Jolt.castObject(j.constraint, Jolt.HingeConstraint);
        if (hinge) {
          const motor = hinge.GetMotorSettings();
          const spring = motor.get_mSpringSettings();
          spring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);
          spring.set_mStiffness(s);
          spring.set_mDamping(d);
          motor.set_mMinTorqueLimit(-500);
          motor.set_mMaxTorqueLimit(500);
          hinge.SetMotorState(Jolt.EMotorState_Position);
          hinge.SetTargetAngle(j.targetAngle.x);
        }
      } else {
        const sixdof = Jolt.castObject(j.constraint, Jolt.SixDOFConstraint);
        if (sixdof) {
          for (const axis of [
            Jolt.SixDOFConstraintSettings_EAxis_RotationX,
            Jolt.SixDOFConstraintSettings_EAxis_RotationY,
            Jolt.SixDOFConstraintSettings_EAxis_RotationZ
          ]) {
            const motor = sixdof.GetMotorSettings(axis);
            const spring = motor.get_mSpringSettings();
            spring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);
            spring.set_mStiffness(axis === Jolt.SixDOFConstraintSettings_EAxis_RotationY ? s * 0.75 : s);
            spring.set_mDamping(axis === Jolt.SixDOFConstraintSettings_EAxis_RotationY ? d * 0.75 : d);
            motor.set_mMinTorqueLimit(-500);
            motor.set_mMaxTorqueLimit(500);
            sixdof.SetMotorState(axis, Jolt.EMotorState_Position);
          }

          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(j.targetAngle.x, j.targetAngle.y, j.targetAngle.z)
          );
          sixdof.SetTargetOrientationCS(new Jolt.Quat(q.x, q.y, q.z, q.w));
        }
      }
    }

    this.applyFloorContactStiction(dt);
  }

  applyPassiveRagdollDynamics(dt = 1 / 120) {
    if (this.isKinematic) return;
    const Jolt = this.jolt;

    // Pure limp ragdoll dynamics: turn off all joint motors completely
    if (this.isPureRagdoll) {
      for (const j of this.joints) {
        if (j.config.type === 'revolute') {
          const hinge = Jolt.castObject(j.constraint, Jolt.HingeConstraint);
          if (hinge) {
            hinge.SetMotorState(Jolt.EMotorState_Off);
          }
        } else {
          const sixdof = Jolt.castObject(j.constraint, Jolt.SixDOFConstraint);
          if (sixdof) {
            sixdof.SetMotorState(Jolt.SixDOFConstraintSettings_EAxis_RotationX, Jolt.EMotorState_Off);
            sixdof.SetMotorState(Jolt.SixDOFConstraintSettings_EAxis_RotationY, Jolt.EMotorState_Off);
            sixdof.SetMotorState(Jolt.SixDOFConstraintSettings_EAxis_RotationZ, Jolt.EMotorState_Off);
          }
        }
      }
      for (const b of Object.values(this.bodies)) {
        this.bodyInterface.ActivateBody(b.bodyID);
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
      if (j.config.type === 'revolute') {
        const hinge = Jolt.castObject(j.constraint, Jolt.HingeConstraint);
        if (hinge) {
          const motor = hinge.GetMotorSettings();
          const spring = motor.get_mSpringSettings();
          spring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);

          if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
            const isRight = j.name.includes('Right');
            const target = support * (isRight ? 0.25 : 0.15);
            spring.set_mStiffness(support * 180.0 + 1.0);
            spring.set_mDamping(support * 14.0 + 0.6);
            hinge.SetMotorState(Jolt.EMotorState_Position);
            hinge.SetTargetAngle(target);
          } else if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
            spring.set_mStiffness(45.0 * support + 1.0);
            spring.set_mDamping(support * 5.0 + 0.3);
            hinge.SetMotorState(Jolt.EMotorState_Position);
            hinge.SetTargetAngle(-0.35 * support);
          } else if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
            spring.set_mStiffness(1.5);
            spring.set_mDamping(0.4);
            hinge.SetMotorState(Jolt.EMotorState_Position);
            hinge.SetTargetAngle(0.35);
          }
        }
      } else {
        const sixdof = Jolt.castObject(j.constraint, Jolt.SixDOFConstraint);
        if (sixdof) {
          let stiff = support * 8.0 + 1.5;
          let damp = support * 4.0 + 0.6;
          let target = new THREE.Vector3(0, 0, 0);

          if (j.name.includes('Spine')) {
            stiff = 65.0 * support + 6.0;
            damp = 10.0 * support + 1.5;
            target.set(0.22, 0, 0.08);
          } else if (j.name.includes('Thigh')) {
            stiff = 140.0 * support + 1.5;
            damp = 12.0 * support + 0.6;
            target.set(0, 0, 0.06 * support);
          } else if (j.name.includes('UpperArm')) {
            stiff = 4.0 * support + 1.0;
            damp = 1.2 * support + 0.3;
            target.set(0.20, 0, j.name.includes('Left') ? -1.15 : 1.15);
          } else if (j.name.includes('Neck') || j.name.includes('Head')) {
            stiff = 10.0 * support + 3.0;
            damp = 2.5 * support + 0.8;
            target.set(0.15, 0, 0);
          }

          for (const axis of [
            Jolt.SixDOFConstraintSettings_EAxis_RotationX,
            Jolt.SixDOFConstraintSettings_EAxis_RotationY,
            Jolt.SixDOFConstraintSettings_EAxis_RotationZ
          ]) {
            const motor = sixdof.GetMotorSettings(axis);
            const spring = motor.get_mSpringSettings();
            spring.set_mMode(Jolt.ESpringMode_StiffnessAndDamping);
            spring.set_mStiffness(stiff);
            spring.set_mDamping(damp);
            motor.set_mMinTorqueLimit(-400);
            motor.set_mMaxTorqueLimit(400);
            sixdof.SetMotorState(axis, Jolt.EMotorState_Position);
          }

          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(target.x, target.y, target.z));
          sixdof.SetTargetOrientationCS(new Jolt.Quat(q.x, q.y, q.z, q.w));
        }
      }
    }

    this.applyFloorContactStiction(dt);
  }

  applyFloorContactStiction(dt = 1 / 120) {
    for (const [name, b] of Object.entries(this.bodies)) {
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

      const onFloor = bottomY <= 0.03;

      if (onFloor && name !== 'LeftFoot' && name !== 'RightFoot') {
        b.rigidBody.setLinearDamping(3.5);
        b.rigidBody.setAngularDamping(12.0);

        const lv = b.rigidBody.linvel();
        const av = b.rigidBody.angvel();
        const hSpeed = Math.hypot(lv.x, lv.z);
        const rotSpeed = Math.hypot(av.x, av.y, av.z);

        if (hSpeed > 0.002 && Math.abs(lv.y) < 0.25) {
          const stiction = Math.min(0.45, dt * 14.0);
          b.rigidBody.applyImpulse({
            x: -lv.x * b.mass * stiction,
            y: 0,
            z: -lv.z * b.mass * stiction
          });
        }

        if (hSpeed < 0.04 && Math.abs(lv.y) < 0.04 && rotSpeed < 0.6) {
          b.rigidBody.setLinvel({ x: 0, y: Math.min(0, lv.y), z: 0 });
          b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 });
        }
      } else {
        b.rigidBody.setLinearDamping(0.04);
        b.rigidBody.setAngularDamping(0.35);
      }
    }
  }

  // --- BOSTON DYNAMICS ACTIVE DYNAMIC BALANCE & PUSH RECOVERY CONTROLLER ---
  updateZMPBalance(dt = 1 / 120) {
    if (this.isKinematic || this.isPureRagdoll || this.balanceControlEnabled === false) return;
    if (this.dynamicBalance) {
      this.dynamicBalance.update(dt);
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

    // Sync visual meshes with Jolt body positions
    for (const [name, b] of Object.entries(this.bodies)) {
      const t = b.rigidBody.translation();
      const r = b.rigidBody.rotation();
      b.mesh.position.set(t.x, t.y, t.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
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

  applyActivePose(poseKey, strength = 1.0) {
    const pose = ENDORPHIN_ACTIVE_POSES[poseKey] || ENDORPHIN_ACTIVE_POSES['crouching'];
    if (!pose || !pose.angles) return;
    const factor = Math.min(1.0, Math.max(0.0, strength / 50.0));
    for (const j of this.joints) {
      const pAngles = pose.angles[j.name];
      if (pAngles) {
        j.targetAngle.x = THREE.MathUtils.lerp(j.targetAngle.x, pAngles[0], factor);
        j.targetAngle.y = THREE.MathUtils.lerp(j.targetAngle.y, pAngles[1], factor);
        j.targetAngle.z = THREE.MathUtils.lerp(j.targetAngle.z, pAngles[2], factor);
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
      if (b.rigidBody.bodyType() !== 2) {
        b.rigidBody.setBodyType(2);
      }

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
      if (b.rigidBody.bodyType() !== 0) {
        b.rigidBody.setBodyType(0);
      }

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
    const b = this.bodies[bodyName];
    if (!b || !b.rigidBody) return;
    if (b.rigidBody.bodyType() !== 0) {
      b.rigidBody.setBodyType(0);
    }
  }

  applyEffectorCalibration(calibrationName = 'Default', selectionSet = null) {
    const cal = ENDORPHIN_EFFECTOR_CALIBRATIONS[calibrationName] || ENDORPHIN_EFFECTOR_CALIBRATIONS.Default;
    this.activeCalibration = calibrationName;
    this.muscleStiffness = 300.0 * cal.stiffnessScale;
    this.muscleDamping = 35.0 * cal.dampingScale;
    for (const j of this.joints) {
      if (selectionSet && Array.isArray(selectionSet) && !selectionSet.includes(j.childName)) continue;
      j.calibrationStiffnessScale = cal.stiffnessScale;
      j.calibrationDampingScale = cal.dampingScale;
    }
  }

  applyVirtualMuscleDrive(limbKey, targetWorldPos, options = {}) {
    if (this.isKinematic || !targetWorldPos) return;
    const vm = VIRTUAL_MUSCLE_CONFIGS[limbKey];
    if (!vm) return;

    const rootB = this.bodies[vm.rootBody];
    const midB = this.bodies[vm.midBody];
    const endB = this.bodies[vm.endBody];
    if (!rootB?.rigidBody || !endB?.rigidBody) return;

    const dt = options.dt ?? (1 / 120);
    const stiffness = (options.stiffness ?? vm.stiffness) * (options.strength ?? 1.0);
    const damping = options.damping ?? vm.damping;
    const vmExtension = THREE.MathUtils.clamp(options.vmExtension ?? 0.95, 0.15, 1.0);
    const maxReach = vm.maxRadius * vmExtension;

    const rTr = rootB.rigidBody.translation();
    const eTr = endB.rigidBody.translation();
    const rootPos = new THREE.Vector3(rTr.x, rTr.y, rTr.z);
    const endPos = new THREE.Vector3(eTr.x, eTr.y, eTr.z);
    const desiredPos = new THREE.Vector3(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z);

    const rootToTarget = desiredPos.clone().sub(rootPos);
    const distFromRoot = rootToTarget.length();
    if (distFromRoot > maxReach && distFromRoot > 0.0001) {
      rootToTarget.multiplyScalar(maxReach / distFromRoot);
      desiredPos.copy(rootPos).add(rootToTarget);
    }

    const disp = desiredPos.clone().sub(endPos);
    const rLv = rootB.rigidBody.linvel();
    const eLv = endB.rigidBody.linvel();
    const relVel = new THREE.Vector3(eLv.x - rLv.x, eLv.y - rLv.y, eLv.z - rLv.z);

    const fx = THREE.MathUtils.clamp(disp.x * stiffness - relVel.x * damping, -420, 420);
    const fy = THREE.MathUtils.clamp(disp.y * stiffness - relVel.y * damping, -420, 420);
    const fz = THREE.MathUtils.clamp(disp.z * stiffness - relVel.z * damping, -420, 420);

    endB.rigidBody.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt });
    rootB.rigidBody.applyImpulse({ x: -fx * dt * 0.45, y: -fy * dt * 0.45, z: -fz * dt * 0.45 });
    if (midB?.rigidBody) {
      midB.rigidBody.applyImpulse({ x: fx * dt * 0.25, y: fy * dt * 0.25, z: fz * dt * 0.25 });
    }

    const extRatio = THREE.MathUtils.clamp(distFromRoot / Math.max(0.2, vm.maxRadius), 0.1, 1.0);
    const bendAngle = Math.acos(THREE.MathUtils.clamp(extRatio, 0.15, 0.99)) * 1.35;
    const midJoint = this.joints.find(j => j.childName === vm.midBody);
    if (midJoint && midJoint.targetAngle) {
      midJoint.targetAngle.x = THREE.MathUtils.lerp(midJoint.targetAngle.x, bendAngle, 0.35);
    }
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

    // Remove constraints
    for (const c of this.constraints) {
      this.physicsSystem.RemoveConstraint(c);
    }
    this.constraints = [];

    // Remove bodies
    for (const [name, b] of Object.entries(this.bodies)) {
      this.bodyInterface.RemoveBody(b.bodyID);
      this.bodyInterface.DestroyBody(b.bodyID);
    }
    this.bodies = {};
    this.joints = [];
  }
}
