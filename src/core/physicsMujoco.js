import loadMujoco from '@mujoco/mujoco';

let mujocoInstance = null;
let currentModel = null;
let currentData = null;

export const MUJOCO_GROUND_MATERIALS = {
  default:  { name: 'Endorphin Default', friction: [1.4, 0.1, 0.1] },
  concrete: { name: 'Default Concrete', friction: [1.4, 0.1, 0.1] },
  skin:     { name: 'Human Skin (CMF)', friction: [1.2, 0.1, 0.1] },
  ice:      { name: 'Slick Ice Surface', friction: [0.05, 0.05, 0.05] },
  rubber:   { name: 'Bouncy Rubber Floor', friction: [2.5, 0.2, 0.2] },
  sponge:   { name: 'Sponge Cushion', friction: [1.8, 0.1, 0.1] },
  steel:    { name: 'Polished Steel', friction: [0.8, 0.05, 0.05] },
  tarmac:   { name: 'High-Grip Tarmac', friction: [2.0, 0.15, 0.15] },
  velcro:   { name: 'Infinite-Grip Velcro', friction: [10.0, 0.5, 0.5] }
};

export function buildHumanoidMJCF(spawnOffset = { x: 0, y: 0, z: 0 }) {
  const sx = (spawnOffset.x || 0).toFixed(4);
  const sy = (spawnOffset.y || 0).toFixed(4);
  const sz = (spawnOffset.z || 0).toFixed(4);
  const rootY = (0.95 + (spawnOffset.y || 0)).toFixed(4);

  return `
  <mujoco model="OpenDMS_MuJoCo_Humanoid">
    <compiler angle="radian" coordinate="local"/>
    <option gravity="0 -9.81 0" timestep="0.008333" iterations="24" solver="Newton" cone="elliptic"/>

    <default>
      <geom friction="1.4 0.1 0.1" solref="0.012 1.0" solimp="0.93 0.97 0.001" condim="3" margin="0.004" gap="0.001"/>
      <joint armature="0.03"/>
      <position kp="160"/>
    </default>

    <worldbody>
      <!-- Floor plane with upward normal along +Y -->
      <geom name="floor" type="plane" size="50 50 0.1" quat="0.7071068 -0.7071068 0 0" condim="3" friction="1.5 0.1 0.1"/>

      <!-- Pelvis (Root Body) -->
      <body name="Pelvis" pos="${sx} ${rootY} ${sz}">
        <freejoint name="root"/>
        <geom name="Pelvis_geom" type="capsule" size="0.10 0.06" quat="0.7071068 -0.7071068 0 0" mass="14.0"/>

        <!-- Spine -->
        <body name="LowerSpine" pos="0 0.16 0">
          <joint name="LowerSpine_x" type="hinge" pos="0 -0.08 0" axis="1 0 0" range="-0.32 0.48" limited="true" damping="2.0"/>
          <joint name="LowerSpine_y" type="hinge" pos="0 -0.08 0" axis="0 1 0" range="-0.50 0.50" limited="true" damping="2.0"/>
          <joint name="LowerSpine_z" type="hinge" pos="0 -0.08 0" axis="0 0 1" range="-0.32 0.32" limited="true" damping="2.0"/>
          <geom name="LowerSpine_geom" type="capsule" size="0.105 0.07" quat="0.7071068 -0.7071068 0 0" mass="10.0"/>

          <body name="UpperSpine" pos="0 0.18 0">
            <joint name="UpperSpine_x" type="hinge" pos="0 -0.09 0" axis="1 0 0" range="-0.28 0.40" limited="true" damping="1.8"/>
            <joint name="UpperSpine_y" type="hinge" pos="0 -0.09 0" axis="0 1 0" range="-0.38 0.38" limited="true" damping="1.8"/>
            <joint name="UpperSpine_z" type="hinge" pos="0 -0.09 0" axis="0 0 1" range="-0.28 0.28" limited="true" damping="1.8"/>
            <geom name="UpperSpine_geom" type="capsule" size="0.125 0.09" quat="0.7071068 -0.7071068 0 0" mass="16.0"/>

            <body name="Neck" pos="0 0.16 0">
              <joint name="Neck_x" type="hinge" pos="0 -0.08 0" axis="1 0 0" range="-0.25 0.30" limited="true" damping="0.8"/>
              <joint name="Neck_y" type="hinge" pos="0 -0.08 0" axis="0 1 0" range="-0.35 0.35" limited="true" damping="0.8"/>
              <joint name="Neck_z" type="hinge" pos="0 -0.08 0" axis="0 0 1" range="-0.25 0.25" limited="true" damping="0.8"/>
              <geom name="Neck_geom" type="capsule" size="0.05 0.04" quat="0.7071068 -0.7071068 0 0" mass="2.0"/>

              <body name="Head" pos="0 0.16 0">
                <joint name="Head_x" type="hinge" pos="0 -0.08 0" axis="1 0 0" range="-0.35 0.45" limited="true" damping="0.6"/>
                <joint name="Head_y" type="hinge" pos="0 -0.08 0" axis="0 1 0" range="-0.52 0.52" limited="true" damping="0.6"/>
                <joint name="Head_z" type="hinge" pos="0 -0.08 0" axis="0 0 1" range="-0.35 0.35" limited="true" damping="0.6"/>
                <geom name="Head_geom" type="sphere" size="0.11" mass="4.5"/>
              </body>
            </body>

            <!-- Left Arm (Clavicle, Humerus, Forearm, Hand) -->
            <body name="LeftShoulder" pos="0.18 0.04 0">
              <joint name="LeftShoulder_x" type="hinge" pos="-0.08 0 0" axis="1 0 0" range="-0.22 0.22" limited="true" damping="0.8"/>
              <joint name="LeftShoulder_y" type="hinge" pos="-0.08 0 0" axis="0 1 0" range="-0.25 0.25" limited="true" damping="0.8"/>
              <joint name="LeftShoulder_z" type="hinge" pos="-0.08 0 0" axis="0 0 1" range="-0.28 0.25" limited="true" damping="0.8"/>
              <geom name="LeftShoulder_geom" type="capsule" size="0.048 0.04" quat="0.7071068 0 0.7071068 0" mass="2.0"/>

              <body name="LeftUpperArm" pos="0.17 0 0">
                <joint name="LeftUpperArm_x" type="hinge" pos="-0.085 0 0" axis="1 0 0" range="-0.75 0.75" limited="true" damping="1.2"/>
                <joint name="LeftUpperArm_y" type="hinge" pos="-0.085 0 0" axis="0 1 0" range="-1.25 0.55" limited="true" damping="1.2"/>
                <joint name="LeftUpperArm_z" type="hinge" pos="-0.085 0 0" axis="0 0 1" range="-1.30 0.75" limited="true" damping="1.2"/>
                <geom name="LeftUpperArm_geom" type="capsule" size="0.048 0.12" quat="0.7071068 0 0.7071068 0" mass="3.5"/>

                <body name="LeftForearm" pos="0.26 0 0">
                  <joint name="LeftForearm_y" type="hinge" pos="-0.13 0 0" axis="0 -1 0" range="0.0 2.40" limited="true" damping="1.0"/>
                  <geom name="LeftForearm_geom" type="capsule" size="0.044 0.11" quat="0.7071068 0 0.7071068 0" mass="2.2"/>

                  <body name="LeftHand" pos="0.205 0 0">
                    <joint name="LeftHand_x" type="hinge" pos="-0.075 0 0" axis="1 0 0" range="-0.45 0.45" limited="true" damping="0.5"/>
                    <joint name="LeftHand_y" type="hinge" pos="-0.075 0 0" axis="0 1 0" range="-0.55 0.55" limited="true" damping="0.5"/>
                    <joint name="LeftHand_z" type="hinge" pos="-0.075 0 0" axis="0 0 1" range="-0.65 0.65" limited="true" damping="0.5"/>
                    <geom name="LeftHand_geom" type="box" size="0.075 0.041 0.048" mass="0.8"/>
                  </body>
                </body>
              </body>
            </body>

            <!-- Right Arm (Clavicle, Humerus, Forearm, Hand) -->
            <body name="RightShoulder" pos="-0.18 0.04 0">
              <joint name="RightShoulder_x" type="hinge" pos="0.08 0 0" axis="1 0 0" range="-0.22 0.22" limited="true" damping="0.8"/>
              <joint name="RightShoulder_y" type="hinge" pos="0.08 0 0" axis="0 1 0" range="-0.25 0.25" limited="true" damping="0.8"/>
              <joint name="RightShoulder_z" type="hinge" pos="0.08 0 0" axis="0 0 1" range="-0.25 0.28" limited="true" damping="0.8"/>
              <geom name="RightShoulder_geom" type="capsule" size="0.048 0.04" quat="0.7071068 0 0.7071068 0" mass="2.0"/>

              <body name="RightUpperArm" pos="-0.17 0 0">
                <joint name="RightUpperArm_x" type="hinge" pos="0.085 0 0" axis="1 0 0" range="-0.75 0.75" limited="true" damping="1.2"/>
                <joint name="RightUpperArm_y" type="hinge" pos="0.085 0 0" axis="0 1 0" range="-0.55 1.25" limited="true" damping="1.2"/>
                <joint name="RightUpperArm_z" type="hinge" pos="0.085 0 0" axis="0 0 1" range="-0.75 1.30" limited="true" damping="1.2"/>
                <geom name="RightUpperArm_geom" type="capsule" size="0.048 0.12" quat="0.7071068 0 0.7071068 0" mass="3.5"/>

                <body name="RightForearm" pos="-0.26 0 0">
                  <joint name="RightForearm_y" type="hinge" pos="0.13 0 0" axis="0 1 0" range="0.0 2.40" limited="true" damping="1.0"/>
                  <geom name="RightForearm_geom" type="capsule" size="0.044 0.11" quat="0.7071068 0 0.7071068 0" mass="2.2"/>

                  <body name="RightHand" pos="-0.205 0 0">
                    <joint name="RightHand_x" type="hinge" pos="0.075 0 0" axis="1 0 0" range="-0.45 0.45" limited="true" damping="0.5"/>
                    <joint name="RightHand_y" type="hinge" pos="0.075 0 0" axis="0 1 0" range="-0.55 0.55" limited="true" damping="0.5"/>
                    <joint name="RightHand_z" type="hinge" pos="0.075 0 0" axis="0 0 1" range="-0.65 0.65" limited="true" damping="0.5"/>
                    <geom name="RightHand_geom" type="box" size="0.075 0.041 0.048" mass="0.8"/>
                  </body>
                </body>
              </body>
            </body>
          </body>
        </body>

        <!-- Left Leg -->
        <body name="LeftThigh" pos="0.12 -0.24 0">
          <joint name="LeftThigh_x" type="hinge" pos="0 0.18 0" axis="1 0 0" range="-1.45 0.28" limited="true" damping="2.2"/>
          <joint name="LeftThigh_y" type="hinge" pos="0 0.18 0" axis="0 1 0" range="-0.42 0.42" limited="true" damping="2.2"/>
          <joint name="LeftThigh_z" type="hinge" pos="0 0.18 0" axis="0 0 1" range="-0.18 0.65" limited="true" damping="2.2"/>
          <geom name="LeftThigh_geom" type="capsule" size="0.072 0.17" quat="0.7071068 -0.7071068 0 0" mass="8.5"/>

          <body name="LeftCalf" pos="0 -0.38 0">
            <joint name="LeftCalf_x" type="hinge" pos="0 0.19 0" axis="1 0 0" range="0.0 2.50" limited="true" damping="1.8"/>
            <geom name="LeftCalf_geom" type="capsule" size="0.058 0.17" quat="0.7071068 -0.7071068 0 0" mass="4.5"/>

            <body name="LeftFoot" pos="0 -0.29 0.04">
              <joint name="LeftFoot_x" type="hinge" pos="0 0.10 -0.04" axis="1 0 0" range="-0.65 0.45" limited="true" damping="1.2"/>
              <geom name="LeftFoot_geom" type="box" size="0.05 0.04 0.09" mass="1.5"/>
            </body>
          </body>
        </body>

        <!-- Right Leg -->
        <body name="RightThigh" pos="-0.12 -0.24 0">
          <joint name="RightThigh_x" type="hinge" pos="0 0.18 0" axis="1 0 0" range="-1.45 0.28" limited="true" damping="2.2"/>
          <joint name="RightThigh_y" type="hinge" pos="0 0.18 0" axis="0 1 0" range="-0.42 0.42" limited="true" damping="2.2"/>
          <joint name="RightThigh_z" type="hinge" pos="0 0.18 0" axis="0 0 1" range="-0.65 0.18" limited="true" damping="2.2"/>
          <geom name="RightThigh_geom" type="capsule" size="0.072 0.17" quat="0.7071068 -0.7071068 0 0" mass="8.5"/>

          <body name="RightCalf" pos="0 -0.38 0">
            <joint name="RightCalf_x" type="hinge" pos="0 0.19 0" axis="1 0 0" range="0.0 2.50" limited="true" damping="1.8"/>
            <geom name="RightCalf_geom" type="capsule" size="0.058 0.17" quat="0.7071068 -0.7071068 0 0" mass="4.5"/>

            <body name="RightFoot" pos="0 -0.29 0.04">
              <joint name="RightFoot_x" type="hinge" pos="0 0.10 -0.04" axis="1 0 0" range="-0.65 0.45" limited="true" damping="1.2"/>
              <geom name="RightFoot_geom" type="box" size="0.05 0.04 0.09" mass="1.5"/>
            </body>
          </body>
        </body>

      </body>
    </worldbody>

    <contact>
      <!-- Exclude adjacent/joint-pinned segments from self-collision -->
      <exclude body1="Pelvis" body2="LowerSpine"/>
      <exclude body1="LowerSpine" body2="UpperSpine"/>
      <exclude body1="UpperSpine" body2="Neck"/>
      <exclude body1="Neck" body2="Head"/>
      <exclude body1="UpperSpine" body2="LeftShoulder"/>
      <exclude body1="UpperSpine" body2="RightShoulder"/>
      <exclude body1="LeftShoulder" body2="LeftUpperArm"/>
      <exclude body1="RightShoulder" body2="RightUpperArm"/>
      <exclude body1="LeftUpperArm" body2="LeftForearm"/>
      <exclude body1="RightUpperArm" body2="RightForearm"/>
      <exclude body1="LeftForearm" body2="LeftHand"/>
      <exclude body1="RightForearm" body2="RightHand"/>
      <exclude body1="Pelvis" body2="LeftThigh"/>
      <exclude body1="Pelvis" body2="RightThigh"/>
      <exclude body1="LeftThigh" body2="LeftCalf"/>
      <exclude body1="RightThigh" body2="RightCalf"/>
      <exclude body1="LeftCalf" body2="LeftFoot"/>
      <exclude body1="RightCalf" body2="RightFoot"/>
      <exclude body1="LeftShoulder" body2="Neck"/>
      <exclude body1="RightShoulder" body2="Neck"/>
      <exclude body1="LeftShoulder" body2="RightShoulder"/>
    </contact>

    <actuator>
      <!-- Spine & Head Actuators -->
      <position name="act_LowerSpine_x" joint="LowerSpine_x" kp="180"/>
      <position name="act_LowerSpine_y" joint="LowerSpine_y" kp="140"/>
      <position name="act_LowerSpine_z" joint="LowerSpine_z" kp="180"/>

      <position name="act_UpperSpine_x" joint="UpperSpine_x" kp="180"/>
      <position name="act_UpperSpine_y" joint="UpperSpine_y" kp="140"/>
      <position name="act_UpperSpine_z" joint="UpperSpine_z" kp="180"/>

      <position name="act_Neck_x" joint="Neck_x" kp="70"/>
      <position name="act_Neck_y" joint="Neck_y" kp="50"/>
      <position name="act_Neck_z" joint="Neck_z" kp="70"/>

      <position name="act_Head_x" joint="Head_x" kp="70"/>
      <position name="act_Head_y" joint="Head_y" kp="50"/>
      <position name="act_Head_z" joint="Head_z" kp="70"/>

      <!-- Left Arm Actuators -->
      <position name="act_LeftShoulder_x" joint="LeftShoulder_x" kp="90"/>
      <position name="act_LeftShoulder_y" joint="LeftShoulder_y" kp="90"/>
      <position name="act_LeftShoulder_z" joint="LeftShoulder_z" kp="90"/>

      <position name="act_LeftUpperArm_x" joint="LeftUpperArm_x" kp="120"/>
      <position name="act_LeftUpperArm_y" joint="LeftUpperArm_y" kp="100"/>
      <position name="act_LeftUpperArm_z" joint="LeftUpperArm_z" kp="120"/>

      <position name="act_LeftForearm_y" joint="LeftForearm_y" kp="100"/>

      <position name="act_LeftHand_x" joint="LeftHand_x" kp="50"/>
      <position name="act_LeftHand_y" joint="LeftHand_y" kp="50"/>
      <position name="act_LeftHand_z" joint="LeftHand_z" kp="50"/>

      <!-- Right Arm Actuators -->
      <position name="act_RightShoulder_x" joint="RightShoulder_x" kp="90"/>
      <position name="act_RightShoulder_y" joint="RightShoulder_y" kp="90"/>
      <position name="act_RightShoulder_z" joint="RightShoulder_z" kp="90"/>

      <position name="act_RightUpperArm_x" joint="RightUpperArm_x" kp="120"/>
      <position name="act_RightUpperArm_y" joint="RightUpperArm_y" kp="100"/>
      <position name="act_RightUpperArm_z" joint="RightUpperArm_z" kp="120"/>

      <position name="act_RightForearm_y" joint="RightForearm_y" kp="100"/>

      <position name="act_RightHand_x" joint="RightHand_x" kp="50"/>
      <position name="act_RightHand_y" joint="RightHand_y" kp="50"/>
      <position name="act_RightHand_z" joint="RightHand_z" kp="50"/>

      <!-- Left Leg Actuators -->
      <position name="act_LeftThigh_x" joint="LeftThigh_x" kp="220"/>
      <position name="act_LeftThigh_y" joint="LeftThigh_y" kp="180"/>
      <position name="act_LeftThigh_z" joint="LeftThigh_z" kp="200"/>

      <position name="act_LeftCalf_x" joint="LeftCalf_x" kp="200"/>
      <position name="act_LeftFoot_x" joint="LeftFoot_x" kp="120"/>

      <!-- Right Leg Actuators -->
      <position name="act_RightThigh_x" joint="RightThigh_x" kp="220"/>
      <position name="act_RightThigh_y" joint="RightThigh_y" kp="180"/>
      <position name="act_RightThigh_z" joint="RightThigh_z" kp="200"/>

      <position name="act_RightCalf_x" joint="RightCalf_x" kp="200"/>
      <position name="act_RightFoot_x" joint="RightFoot_x" kp="120"/>
    </actuator>
  </mujoco>
  `;
}

export async function initMujocoPhysics(spawnOffset = { x: 0, y: 0, z: 0 }) {
  if (!mujocoInstance) {
    mujocoInstance = await loadMujoco();
  }

  // Clean up any previously allocated C++ model or data
  cleanupMujoco();

  const xml = buildHumanoidMJCF(spawnOffset);
  currentModel = mujocoInstance.MjModel.from_xml_string(xml);
  currentData = new mujocoInstance.MjData(currentModel);

  // Initial forward kinematics pass
  mujocoInstance.mj_forward(currentModel, currentData);

  return {
    mujoco: mujocoInstance,
    model: currentModel,
    data: currentData
  };
}

export function getMujoco() {
  return mujocoInstance;
}

export function getMujocoModel() {
  return currentModel;
}

export function getMujocoData() {
  return currentData;
}

export function stepMujocoPhysics(dt = 1 / 120) {
  if (mujocoInstance && currentModel && currentData) {
    currentModel.opt.timestep = dt;
    mujocoInstance.mj_step(currentModel, currentData);
    // Clear instantaneous applied forces after step completes so impulses act exactly once
    if (currentData.xfrc_applied) {
      currentData.xfrc_applied.fill(0);
    }
  }
}

export function setMujocoGroundMaterial(type = 'concrete') {
  if (!currentModel) return;
  const mat = MUJOCO_GROUND_MATERIALS[type] || MUJOCO_GROUND_MATERIALS.concrete;
  if (currentModel.geom_friction && currentModel.geom_friction.length >= 3) {
    currentModel.geom_friction[0] = mat.friction[0];
    currentModel.geom_friction[1] = mat.friction[1];
    currentModel.geom_friction[2] = mat.friction[2];
  }
}

export function resetMujocoPhysics() {
  if (mujocoInstance && currentModel && currentData) {
    // Reset simulation time and generalized coordinates
    currentData.time = 0.0;
    if (currentData.qpos) currentData.qpos.fill(0);
    if (currentData.qvel) currentData.qvel.fill(0);
    if (currentData.qacc) currentData.qacc.fill(0);
    if (currentData.ctrl) currentData.ctrl.fill(0);
    if (currentData.xfrc_applied) currentData.xfrc_applied.fill(0);

    // Initial root pose
    if (currentData.qpos.length >= 7) {
      currentData.qpos[0] = 0.0; // x
      currentData.qpos[1] = 0.95; // y
      currentData.qpos[2] = 0.0; // z
      currentData.qpos[3] = 1.0; // qw
      currentData.qpos[4] = 0.0; // qx
      currentData.qpos[5] = 0.0; // qy
      currentData.qpos[6] = 0.0; // qz
    }

    mujocoInstance.mj_forward(currentModel, currentData);
  }
}

export function cleanupMujoco() {
  if (currentData) {
    try {
      currentData.delete();
    } catch (e) {
      console.warn('Error deleting MjData:', e);
    }
    currentData = null;
  }
  if (currentModel) {
    try {
      currentModel.delete();
    } catch (e) {
      console.warn('Error deleting MjModel:', e);
    }
    currentModel = null;
  }
}
