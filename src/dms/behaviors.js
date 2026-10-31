import * as THREE from 'three';

// Complete NaturalMotion Endorphin 2.7.1 Behaviour Taxonomy & Metadata
export const BEHAVIOR_DEFINITIONS = {
  // ⚡ Physical Effect Behaviours (Endorphin 2.7 Headline Features)
  fluid: {
    id: 'fluid',
    name: 'Fluid (Water / Mud Pool)',
    category: 'effects',
    color: '#0284c7',
    icon: '🌊',
    defaultDuration: 180,
    desc: 'Archimedes buoyancy + quadratic hydrodynamic drag on submerged limbs + breaststroke/flutter swimming kinematics.'
  },
  pusher: {
    id: 'pusher',
    name: 'Pusher (Continuous Wind / Blast)',
    category: 'effects',
    color: '#38bdf8',
    icon: '💨',
    defaultDuration: 120,
    desc: 'Continuous aerodynamic directional linear force field applied over duration to model jet blasts or high-speed gale winds.'
  },
  twister: {
    id: 'twister',
    name: 'Twister (Rotational Vortex)',
    category: 'effects',
    color: '#c084fc',
    icon: '🌪️',
    defaultDuration: 120,
    desc: 'Rotational vortex force field generating tangential spin acceleration and radial suction toward the vortex eye.'
  },
  damping: {
    id: 'damping',
    name: 'Air / Motion Damping',
    category: 'effects',
    color: '#64748b',
    icon: '🪂',
    defaultDuration: 180,
    desc: 'Enhanced aerodynamic linear and angular resistance.'
  },
  stickiness: {
    id: 'stickiness',
    name: 'Surface Stickiness / Grip',
    category: 'effects',
    color: '#475569',
    icon: '🧲',
    defaultDuration: 180,
    desc: 'Modulates ground contact friction and foot adhesion.'
  },

  // 🛡️ Protective & Fall Reflexes
  catchFall: {
    id: 'catchFall',
    name: 'Catch Fall Reflex',
    category: 'protective',
    color: '#059669',
    icon: '🛡️',
    defaultDuration: 120,
    desc: 'Directional hand plant upon falling forward, backward, or sideways with knee and hip absorption.'
  },
  fallbackTwistCatchFall: {
    id: 'fallbackTwistCatchFall',
    name: 'Fallback Twist & Catch Fall',
    category: 'protective',
    color: '#10b981',
    icon: '🔄',
    defaultDuration: 130,
    desc: 'Mid-air axial spinal rotation during a backward fall to rotate the body 180° and land front-down on hands.'
  },
  fallBackTwistCatch: {
    id: 'fallBackTwistCatch',
    name: 'Fall Back, Twist & Catch Fall',
    category: 'protective',
    color: '#10b981',
    icon: '🔄',
    defaultDuration: 130,
    desc: 'Mid-fall 180° axial torso twist to face ground & catch with arms.'
  },
  fallbackTwistCoverFace: {
    id: 'fallbackTwistCoverFace',
    name: 'Fallback Twist & Cover Face',
    category: 'protective',
    color: '#14b8a6',
    icon: '🛡️',
    defaultDuration: 130,
    desc: 'Backward fall spinal rotation while wrapping forearms and hands tightly around the face and skull.'
  },
  fallBackTwistCover: {
    id: 'fallBackTwistCover',
    name: 'Fall Back, Twist & Cover Face',
    category: 'protective',
    color: '#14b8a6',
    icon: '💫',
    defaultDuration: 130,
    desc: 'Mid-fall axial body twist with defensive cranial arm shield.'
  },
  fallbackTwistPassive: {
    id: 'fallbackTwistPassive',
    name: 'Fallback Twist (Passive Arms)',
    category: 'protective',
    color: '#0d9488',
    icon: '🌀',
    defaultDuration: 130,
    desc: 'Backward fall spinal rotation with relaxed limp arms.'
  },
  fallBackPassive: {
    id: 'fallBackPassive',
    name: 'Fall Back, Twist with Passive Arms',
    category: 'protective',
    color: '#06b6d4',
    icon: '💫',
    defaultDuration: 130,
    desc: 'Mid-fall axial torso twist with limp, unpowered arms.'
  },
  headProtect: {
    id: 'headProtect',
    name: 'Head Protect / Cover Face',
    category: 'protective',
    color: '#ec4899',
    icon: '🛡️',
    defaultDuration: 140,
    desc: 'Forearms and hands wrapping tightly over cranium against incoming projectile impact.'
  },
  handsProtectGroin: {
    id: 'handsProtectGroin',
    name: 'Hands Protecting Groin',
    category: 'protective',
    color: '#f43f5e',
    icon: '⚽',
    defaultDuration: 150,
    desc: 'Defensive sports wall stance: hands crossed low over pelvis with braced knees and upright posture.'
  },
  bodyFoetal: {
    id: 'bodyFoetal',
    name: 'Body Foetal (Tight Curl)',
    category: 'protective',
    color: '#e11d48',
    icon: '🥋',
    defaultDuration: 160,
    desc: 'Defensive fetal tuck: knees pulled tightly to chest, lumbar spine flexed, arms wrapped around legs.'
  },
  tuckAndRoll: {
    id: 'tuckAndRoll',
    name: 'Body Tuck & Roll (Breakfall)',
    category: 'protective',
    color: '#d946ef',
    icon: '🔄',
    defaultDuration: 110,
    desc: 'Compact gymnastic knee/spine tuck & rotational roll.'
  },
  hitReaction: {
    id: 'hitReaction',
    name: 'Dynamic Hit Reaction',
    category: 'protective',
    color: '#ec4899',
    icon: '⚡',
    defaultDuration: 120,
    desc: 'Biomechanical impact flinch, head snap back, and staggering recoil response from physical hit.'
  },
  flail: {
    id: 'flail',
    name: 'Mid-Air Flail & Stumble',
    category: 'protective',
    color: '#f59e0b',
    icon: '⚡',
    defaultDuration: 120,
    desc: 'Rapid reactionary limb waving and stumble stepping to recover orientation and decelerate fall.'
  },

  // 🏃 Locomotion & Equilibrium
  idleStance: {
    id: 'idleStance',
    name: 'Natural Standing Balance',
    category: 'locomotion',
    color: '#0ea5e9',
    icon: '🧍',
    defaultDuration: 240,
    desc: 'Natural upright resting posture: relaxed arms at sides, compliant knee suspension, micro-sway breathing, and active ground equilibrium.'
  },
  balance: {
    id: 'balance',
    name: 'Active Balance (LIPM)',
    category: 'locomotion',
    color: '#0284c7',
    icon: '⚖️',
    defaultDuration: 160,
    desc: 'Linear Inverted Pendulum Model (LIPM) balance with ankle, hip, and counter-balancing arm reflexes.'
  },
  balanceWithProps: {
    id: 'balanceWithProps',
    name: 'Balance With Props',
    category: 'locomotion',
    color: '#0369a1',
    icon: '📦',
    defaultDuration: 160,
    desc: 'Dynamic center-of-mass compensation and postural lean when carrying or lifting heavy props.'
  },
  stagger: {
    id: 'stagger',
    name: 'Stagger Recovery Steps',
    category: 'locomotion',
    color: '#eab308',
    icon: '🥾',
    defaultDuration: 140,
    desc: 'Unsteady stumbling recovery strides under impulse perturbance.'
  },
  jump: {
    id: 'jump',
    name: 'Jump & Launch',
    category: 'locomotion',
    color: '#f59e0b',
    icon: '🚀',
    defaultDuration: 90,
    desc: 'Anticipation crouch followed by explosive vertical and forward triple extension launch.'
  },
  jumpDive: {
    id: 'jumpDive',
    name: 'Jump & Dive (Obstacle Leap)',
    category: 'locomotion',
    color: '#d97706',
    icon: '🏊',
    defaultDuration: 110,
    desc: 'Explosive forward dive leap over hurdle or crate with streamlined body extension.'
  },
  jumpAndDive: {
    id: 'jumpAndDive',
    name: 'Jump & Dive',
    category: 'locomotion',
    color: '#0284c7',
    icon: '🏊',
    defaultDuration: 100,
    desc: 'Explosive forward launch transitioning into horizontal air dive.'
  },
  landCrouch: {
    id: 'landCrouch',
    name: 'Land & Crouch (Absorption)',
    category: 'locomotion',
    color: '#ea580c',
    icon: '🥋',
    defaultDuration: 120,
    desc: 'Deep impact shock absorption on landing with hip/knee flexion and low floor brace.'
  },
  crouchPose: {
    id: 'crouchPose',
    name: 'Land & Crouch Pose',
    category: 'locomotion',
    color: '#f97316',
    icon: '🥋',
    defaultDuration: 150,
    desc: 'Compliant knee/hip flexion for impact absorption.'
  },
  tackle: {
    id: 'tackle',
    name: 'Tackle (Diving Body Charge)',
    category: 'locomotion',
    color: '#dc2626',
    icon: '🏈',
    defaultDuration: 110,
    desc: 'Aggressive diving horizontal body charge directed towards target with clasping arms.'
  },

  // 💪 Arm & Upper Body Actions
  armsWindmill: {
    id: 'armsWindmill',
    name: 'Arms Windmill / Flail',
    category: 'arms',
    color: '#06b6d4',
    icon: '🌀',
    defaultDuration: 120,
    desc: 'Alternating circumduction arm flailing to generate restoring angular momentum.'
  },
  armsCrossedChest: {
    id: 'armsCrossedChest',
    name: 'Arms Crossed on Chest',
    category: 'arms',
    color: '#6366f1',
    icon: '🙅',
    defaultDuration: 150,
    desc: 'Folded arms defensive brace tightly across the upper chest.'
  },
  armsCrossed: {
    id: 'armsCrossed',
    name: 'Arms Crossed on Chest',
    category: 'arms',
    color: '#6366f1',
    icon: '🙅',
    defaultDuration: 150,
    desc: 'Upper-body folded arms guard posture.'
  },
  armsRaisedHead: {
    id: 'armsRaisedHead',
    name: 'Arms Raised Overhead',
    category: 'arms',
    color: '#8b5cf6',
    icon: '🙌',
    defaultDuration: 150,
    desc: 'Both arms raised vertically overhead (celebration, surrender, or overhead catch).'
  },
  armsRaised: {
    id: 'armsRaised',
    name: 'Arms Raised Above Head',
    category: 'arms',
    color: '#818cf8',
    icon: '🙌',
    defaultDuration: 140,
    desc: 'Upward surrender or high-reach arm extension.'
  },
  armsWideHead: {
    id: 'armsWideHead',
    name: 'Arms Wide Shield',
    category: 'arms',
    color: '#a855f7',
    icon: '👐',
    defaultDuration: 150,
    desc: 'Arms spread laterally to shield sides of head and upper torso.'
  },
  armsWide: {
    id: 'armsWide',
    name: 'Arms Wide of Head',
    category: 'arms',
    color: '#a855f7',
    icon: '👐',
    defaultDuration: 140,
    desc: 'Sideways horizontal airplane outstretched arms for balance.'
  },
  armsZombie: {
    id: 'armsZombie',
    name: 'Arms Zombie (Forward Reach)',
    category: 'arms',
    color: '#7e22ce',
    icon: '🧟',
    defaultDuration: 160,
    desc: 'Both arms held rigidly horizontal forward with drooping wrists.'
  },
  handsBehindBack: {
    id: 'handsBehindBack',
    name: 'Hands Behind Back',
    category: 'arms',
    color: '#4f46e5',
    icon: '💂',
    defaultDuration: 150,
    desc: 'Arms retracted and hands held behind the lower back (parade rest posture).'
  },
  handsReachLookAt: {
    id: 'handsReachLookAt',
    name: 'Hands Reach & Look At',
    category: 'arms',
    color: '#4338ca',
    icon: '👀',
    defaultDuration: 140,
    desc: 'Inverse kinematics arm reach and cervical spine gaze directed toward target.'
  },
  reachHold: {
    id: 'reachHold',
    name: 'Hands Reach & Look At',
    category: 'arms',
    color: '#38bdf8',
    icon: '🎯',
    defaultDuration: 140,
    desc: '3D target-aimed arm reach with dynamic head & gaze tracking.'
  },
  lookAt: {
    id: 'lookAt',
    name: 'Head & Gaze Tracking (Look At)',
    category: 'arms',
    color: '#06b6d4',
    icon: '👀',
    defaultDuration: 150,
    desc: 'Continuous neck, head & eye orientation toward 3D target object or point.'
  },
  hold: {
    id: 'hold',
    name: 'Hold & Grasp',
    category: 'arms',
    color: '#3730a3',
    icon: '✊',
    defaultDuration: 140,
    desc: 'Proximity-triggered grasping constraint to props, rails, or ledges.'
  },
  chestShove: {
    id: 'chestShove',
    name: 'Chest Shove & Push',
    category: 'arms',
    color: '#ef4444',
    icon: '💥',
    defaultDuration: 100,
    desc: 'High-impulse forward two-handed thrust directed at target partner torso/chest.'
  },

  // 🦵 Leg & Torso Actions
  legsKick: {
    id: 'legsKick',
    name: 'Legs Kick',
    category: 'legs',
    color: '#84cc16',
    icon: '🦵',
    defaultDuration: 120,
    desc: 'Rhythmic alternating soccer snap kicks with hip flexion and explosive knee extension.'
  },
  legsReach: {
    id: 'legsReach',
    name: 'Legs Reach Down',
    category: 'legs',
    color: '#65a30d',
    icon: '🩰',
    defaultDuration: 120,
    desc: 'Extending legs and pointing toes downward in mid-air searching for floor contact.'
  },
  legsStraighten: {
    id: 'legsStraighten',
    name: 'Legs Straighten (Brace)',
    category: 'legs',
    color: '#4d7c0f',
    icon: '🪵',
    defaultDuration: 120,
    desc: 'Stiff leg impact bracing: locking knees and hips straight with high muscle stiffness.'
  },
  activeTwist: {
    id: 'activeTwist',
    name: 'Torso Active Twist',
    category: 'legs',
    color: '#15803d',
    icon: '🔃',
    defaultDuration: 130,
    desc: 'Transverse axial rotation of lumbar and thoracic spine.'
  },

  // 🐛 Agony & Draping
  writhing: {
    id: 'writhing',
    name: 'Ground Writhing (Agony)',
    category: 'agony',
    color: '#84cc16',
    icon: '🐛',
    defaultDuration: 180,
    desc: 'Spastic agony on ground: back arching, alternating knee pulls to chest, thrashing head.'
  },
  writheMidAir: {
    id: 'writheMidAir',
    name: 'Mid-Air Writhing (Panicked)',
    category: 'agony',
    color: '#a3e635',
    icon: '⚡',
    defaultDuration: 140,
    desc: 'Panicked airborne flailing and rapid twisting before ground contact.'
  },
  pushUpRecovery: {
    id: 'pushUpRecovery',
    name: 'Prone Push-Up Brace',
    category: 'agony',
    color: '#10b981',
    icon: '🏋️',
    defaultDuration: 160,
    desc: 'Ground arm extension & upper-torso lift recovery.'
  },
  ragdoll: {
    id: 'ragdoll',
    name: 'Pure Ragdoll Ground Rest',
    category: 'agony',
    color: '#7c3aed',
    icon: '🍂',
    defaultDuration: 120,
    desc: 'Complete joint motor relaxation: character drapes limp under pure physics.'
  }
};

// Structured Endorphin 2.7.1 Behaviour Catalog for Multi-Level Cascading Menus
export const ENDORPHIN_BEHAVIOR_CATEGORIES = [
  {
    id: 'whole_body',
    label: 'Whole Body Behaviours',
    icon: '🧍',
    items: [
      {
        key: 'idleStance',
        name: 'Natural Standing Balance',
        shortDesc: 'Relaxed standing posture with breathing sway & active equilibrium',
        icon: '🧍',
        color: '#0ea5e9',
        defaultDuration: 240
      },
      {
        key: 'balance',
        name: 'Active Balance (LIPM 2.6)',
        shortDesc: 'Continuous CoM ankle, hip & counter-arm stabilization',
        icon: '⚖️',
        color: '#0284c7',
        defaultDuration: 160
      },
      {
        key: 'balanceWithProps',
        name: 'Balance With Props',
        shortDesc: 'Prop load compensation & CoM offset adaptation',
        icon: '📦',
        color: '#0369a1',
        defaultDuration: 160
      },
      {
        key: 'stagger',
        name: 'Stagger / Recovery Steps',
        shortDesc: 'Protective stepping reflex when pushed outside support base',
        icon: '🥾',
        color: '#eab308',
        defaultDuration: 140
      },
      {
        key: 'crouchPose',
        name: 'Land & Crouch Pose',
        shortDesc: 'Compliant knee/hip flexion for impact absorption',
        icon: '🥋',
        color: '#f97316',
        defaultDuration: 150
      },
      {
        key: 'catchFall',
        name: 'Catch Fall (Hands Out)',
        shortDesc: 'Directional forward/backward arm extension to cushion fall',
        icon: '🛡️',
        color: '#059669',
        defaultDuration: 120
      },
      {
        key: 'fallBackTwistCatch',
        name: 'Fall Back, Twist & Catch Fall',
        shortDesc: 'Mid-fall 180° axial torso twist to face ground & catch with arms',
        icon: '🔄',
        color: '#10b981',
        defaultDuration: 130
      },
      {
        key: 'fallBackTwistCover',
        name: 'Fall Back, Twist & Cover Face',
        shortDesc: 'Mid-fall axial body twist with defensive cranial arm shield',
        icon: '💫',
        color: '#14b8a6',
        defaultDuration: 130
      },
      {
        key: 'fallBackPassive',
        name: 'Fall Back, Twist with Passive Arms',
        shortDesc: 'Mid-fall axial torso twist with limp, unpowered arms',
        icon: '💫',
        color: '#06b6d4',
        defaultDuration: 130
      },
      {
        key: 'jump',
        name: 'Jump & Launch',
        shortDesc: 'Counter-movement crouch followed by explosive vertical launch',
        icon: '🚀',
        color: '#38bdf8',
        defaultDuration: 90
      },
      {
        key: 'jumpAndDive',
        name: 'Jump & Dive',
        shortDesc: 'Explosive forward launch transitioning into horizontal air dive',
        icon: '🏊',
        color: '#0284c7',
        defaultDuration: 100
      },
      {
        key: 'tackle',
        name: 'Forward Tackle / Dive',
        shortDesc: 'Explosive horizontal lunge with shoulder drive',
        icon: '🏈',
        color: '#f43f5e',
        defaultDuration: 100
      },
      {
        key: 'bodyFoetal',
        name: 'Body Foetal (Protective Ball)',
        shortDesc: 'Tightly curls arms, spine & knees into defensive protective ball',
        icon: '🤼',
        color: '#d946ef',
        defaultDuration: 140
      },
      {
        key: 'hitReaction',
        name: 'Dynamic Hit Reaction',
        shortDesc: 'Biomechanical impact flinch, head snap back & staggering recoil',
        icon: '⚡',
        color: '#ec4899',
        defaultDuration: 120
      }
    ]
  },
  {
    id: 'hand_and_arm',
    label: 'Hand & Arm Behaviours',
    icon: '🖐️',
    items: [
      {
        key: 'armsCrossed',
        name: 'Arms Crossed on Chest',
        shortDesc: 'Upper-body folded arms guard posture',
        icon: '🙅',
        color: '#6366f1',
        defaultDuration: 150
      },
      {
        key: 'armsRaised',
        name: 'Arms Raised Above Head',
        shortDesc: 'Upward surrender or high-reach arm extension',
        icon: '🙌',
        color: '#818cf8',
        defaultDuration: 140
      },
      {
        key: 'armsWide',
        name: 'Arms Wide of Head',
        shortDesc: 'Sideways horizontal airplane outstretched arms for balance',
        icon: '👐',
        color: '#a855f7',
        defaultDuration: 140
      },
      {
        key: 'armsWindmill',
        name: 'Arms Windmill (Flail)',
        shortDesc: 'Cyclic asynchronous shoulder windmilling in mid-air or panic',
        icon: '🌀',
        color: '#06b6d4',
        defaultDuration: 120
      },
      {
        key: 'armsZombie',
        name: 'Arms Zombie (Forward Reach)',
        shortDesc: 'Stiff horizontal frontal arm extension',
        icon: '🧟',
        color: '#22c55e',
        defaultDuration: 150
      },
      {
        key: 'handsBehindBack',
        name: 'Hands Behind Back',
        shortDesc: 'Arms retracted and hands held behind lower back (parade rest)',
        icon: '💂',
        color: '#4f46e5',
        defaultDuration: 150
      },
      {
        key: 'headProtect',
        name: 'Hands Covering Face',
        shortDesc: 'Cranium shield & defensive facial protect',
        icon: '🙆',
        color: '#ec4899',
        defaultDuration: 140
      },
      {
        key: 'handsProtectGroin',
        name: 'Hands Protecting Groin',
        shortDesc: 'Defensive sports wall stance protecting pelvis',
        icon: '⚽',
        color: '#f43f5e',
        defaultDuration: 150
      },
      {
        key: 'reachHold',
        name: 'Hands Reach & Look At',
        shortDesc: '3D target-aimed arm reach with dynamic head & gaze tracking',
        icon: '🎯',
        color: '#38bdf8',
        defaultDuration: 140
      },
      {
        key: 'hold',
        name: 'Hold & Grasp',
        shortDesc: 'Proximity-triggered grasping posture for props or ledges',
        icon: '✊',
        color: '#3730a3',
        defaultDuration: 140
      },
      {
        key: 'chestShove',
        name: 'Chest Shove & Push',
        shortDesc: 'High-impulse forward two-handed thrust directed at target',
        icon: '💥',
        color: '#ef4444',
        defaultDuration: 100
      },
      {
        key: 'lookAt',
        name: 'Head & Gaze Tracking (Look At)',
        shortDesc: 'Continuous neck, head & eye orientation toward 3D target object or point',
        icon: '👀',
        color: '#06b6d4',
        defaultDuration: 150
      },
      {
        key: 'tuckAndRoll',
        name: 'Body Tuck & Roll (Breakfall)',
        shortDesc: 'Compact gymnastic knee/spine tuck & rotational roll',
        icon: '🔄',
        color: '#d946ef',
        defaultDuration: 110
      }
    ]
  },
  {
    id: 'leg_behaviours',
    label: 'Leg & Torso Behaviours',
    icon: '🦵',
    items: [
      {
        key: 'legsKick',
        name: 'Legs Kick (Bicycling / Defense)',
        shortDesc: 'Cyclic defensive kicking / leg cycling motion',
        icon: '🦵',
        color: '#e11d48',
        defaultDuration: 130
      },
      {
        key: 'legsReach',
        name: 'Legs Reach (Landing Anticipation)',
        shortDesc: 'Proactive leg extension towards floor / landing contact',
        icon: '🦿',
        color: '#ea580c',
        defaultDuration: 120
      },
      {
        key: 'legsStraighten',
        name: 'Legs Straighten (Rigid Stance)',
        shortDesc: 'Direct knee and hip extension to brace legs rigid',
        icon: '🚶',
        color: '#ca8a04',
        defaultDuration: 120
      },
      {
        key: 'activeTwist',
        name: 'Torso Active Twist',
        shortDesc: 'Transverse axial rotation of lumbar and thoracic spine',
        icon: '🔃',
        color: '#15803d',
        defaultDuration: 130
      }
    ]
  },
  {
    id: 'physical_effects',
    label: 'Physical Effect Behaviours',
    icon: '💨',
    items: [
      {
        key: 'fluid',
        name: 'Fluid (Water / Mud Pool)',
        shortDesc: 'Archimedes buoyancy, hydrodynamic drag & swimming strokes',
        icon: '🌊',
        color: '#0284c7',
        defaultDuration: 180
      },
      {
        key: 'pusher',
        name: 'Pusher (Continuous Wind / Blast)',
        shortDesc: 'Continuous aerodynamic directional linear force field',
        icon: '💨',
        color: '#38bdf8',
        defaultDuration: 120
      },
      {
        key: 'twister',
        name: 'Twister (Rotational Vortex)',
        shortDesc: 'Rotational vortex force field with tangential spin acceleration',
        icon: '🌪️',
        color: '#c084fc',
        defaultDuration: 120
      },
      {
        key: 'damping',
        name: 'Air / Motion Damping',
        shortDesc: 'Enhanced aerodynamic linear and angular resistance',
        icon: '🪂',
        color: '#64748b',
        defaultDuration: 180
      },
      {
        key: 'stickiness',
        name: 'Surface Stickiness / Grip',
        shortDesc: 'Modulates ground contact friction and foot adhesion',
        icon: '🧲',
        color: '#475569',
        defaultDuration: 180
      }
    ]
  },
  {
    id: 'ground_states',
    label: 'Ground & Ragdoll States',
    icon: '🐛',
    items: [
      {
        key: 'writhing',
        name: 'Ground Writhing (Agony)',
        shortDesc: 'Active ground rolling, leg kicking & spinal curling',
        icon: '🐛',
        color: '#84cc16',
        defaultDuration: 180
      },
      {
        key: 'writheMidAir',
        name: 'Writhe in Mid-Air (Panic)',
        shortDesc: 'Airborne leg pedaling, torso twist & arm flailing',
        icon: '🌪️',
        color: '#0ea5e9',
        defaultDuration: 120
      },
      {
        key: 'pushUpRecovery',
        name: 'Prone Push-Up Brace',
        shortDesc: 'Ground arm extension & upper-torso lift recovery',
        icon: '🏋️',
        color: '#10b981',
        defaultDuration: 160
      },
      {
        key: 'ragdoll',
        name: 'Passive Ragdoll Rest',
        shortDesc: 'Pure unpowered physiological tissue relaxation',
        icon: '🍂',
        color: '#7c3aed',
        defaultDuration: 120
      }
    ]
  }
];

// NaturalMotion Endorphin 2.7.1 Selection Sets for Multi-Layering
export const SELECTION_SETS = {
  all: {
    id: 'all',
    name: 'Whole Body (All Joints)',
    joints: null
  },
  upper: {
    id: 'upper',
    name: 'Upper Body Only',
    joints: new Set([
      'Pelvis_to_LowerSpine', 'LowerSpine_to_UpperSpine',
      'UpperSpine_to_Neck', 'Neck_to_Head',
      'UpperSpine_to_LeftShoulder', 'LeftShoulder_to_LeftUpperArm',
      'LeftUpperArm_to_LeftForearm', 'LeftForearm_to_LeftHand',
      'UpperSpine_to_RightShoulder', 'RightShoulder_to_RightUpperArm',
      'RightUpperArm_to_RightForearm', 'RightForearm_to_RightHand'
    ])
  },
  lower: {
    id: 'lower',
    name: 'Lower Body Only',
    joints: new Set([
      'Pelvis_to_LeftThigh', 'LeftThigh_to_LeftCalf', 'LeftCalf_to_LeftFoot',
      'Pelvis_to_RightThigh', 'RightThigh_to_RightCalf', 'RightCalf_to_RightFoot'
    ])
  },
  arms: {
    id: 'arms',
    name: 'Both Arms Only',
    joints: new Set([
      'UpperSpine_to_LeftShoulder', 'LeftShoulder_to_LeftUpperArm',
      'LeftUpperArm_to_LeftForearm', 'LeftForearm_to_LeftHand',
      'UpperSpine_to_RightShoulder', 'RightShoulder_to_RightUpperArm',
      'RightUpperArm_to_RightForearm', 'RightForearm_to_RightHand'
    ])
  },
  left_arm: {
    id: 'left_arm',
    name: 'Left Arm & Hand Only',
    joints: new Set([
      'UpperSpine_to_LeftShoulder', 'LeftShoulder_to_LeftUpperArm',
      'LeftUpperArm_to_LeftForearm', 'LeftForearm_to_LeftHand'
    ])
  },
  right_arm: {
    id: 'right_arm',
    name: 'Right Arm & Hand Only',
    joints: new Set([
      'UpperSpine_to_RightShoulder', 'RightShoulder_to_RightUpperArm',
      'RightUpperArm_to_RightForearm', 'RightForearm_to_RightHand'
    ])
  },
  legs: {
    id: 'legs',
    name: 'Legs Only',
    joints: new Set([
      'Pelvis_to_LeftThigh', 'LeftThigh_to_LeftCalf', 'LeftCalf_to_LeftFoot',
      'Pelvis_to_RightThigh', 'RightThigh_to_RightCalf', 'RightCalf_to_RightFoot'
    ])
  },
  head_neck: {
    id: 'head_neck',
    name: 'Head & Neck Gaze Only',
    joints: new Set([
      'UpperSpine_to_Neck', 'Neck_to_Head'
    ])
  }
};

export function isInSelectionSet(jointName, selectionSetKey = 'all') {
  if (!selectionSetKey || selectionSetKey === 'all') return true;
  const set = SELECTION_SETS[selectionSetKey];
  if (!set || !set.joints) return true;
  return set.joints.has(jointName);
}

// --- ANATOMICAL LIMB GROUP MAPPINGS ---
export const JOINT_LIMB_GROUPS = {
  // Arms & Shoulders
  'UpperSpine_to_LeftShoulder': 'arms',
  'UpperSpine_to_RightShoulder': 'arms',
  'LeftShoulder_to_LeftUpperArm': 'arms',
  'RightShoulder_to_RightUpperArm': 'arms',
  'LeftUpperArm_to_LeftForearm': 'arms',
  'RightUpperArm_to_RightForearm': 'arms',
  'LeftForearm_to_LeftHand': 'arms',
  'RightForearm_to_RightHand': 'arms',

  // Legs & Hips
  'Pelvis_to_LeftThigh': 'legs',
  'Pelvis_to_RightThigh': 'legs',
  'LeftThigh_to_LeftCalf': 'legs',
  'RightThigh_to_RightCalf': 'legs',
  'LeftCalf_to_LeftFoot': 'legs',
  'RightCalf_to_RightFoot': 'legs',

  // Torso / Spine / Neck / Head
  'Pelvis_to_LowerSpine': 'torso',
  'LowerSpine_to_UpperSpine': 'torso',
  'UpperSpine_to_Neck': 'torso',
  'Neck_to_Head': 'torso'
};

export function getJointLimbGroup(jointName) {
  if (JOINT_LIMB_GROUPS[jointName]) return JOINT_LIMB_GROUPS[jointName];
  if (jointName.includes('Shoulder') || jointName.includes('UpperArm') || jointName.includes('Forearm') || jointName.includes('Hand')) return 'arms';
  if (jointName.includes('Thigh') || jointName.includes('Calf') || jointName.includes('Foot')) return 'legs';
  if (jointName.includes('Spine') || jointName.includes('Neck') || jointName.includes('Head') || jointName.includes('Pelvis')) return 'torso';
  return 'torso';
}

export function getBehaviorLimbGroup(bKey) {
  const ARM_BEHAVIORS = new Set([
    'armsCrossed', 'armsCrossedChest',
    'armsRaised', 'armsRaisedHead',
    'armsWide', 'armsWideHead',
    'armsWindmill', 'armsZombie', 'handsBehindBack',
    'reachHold', 'handsReachLookAt',
    'headProtect', 'handsProtectGroin', 'hold', 'chestShove'
  ]);
  const LEG_BEHAVIORS = new Set([
    'legsKick', 'legsReach', 'legsStraighten'
  ]);
  if (bKey === 'lookAt' || bKey === 'activeTwist') return 'torso';
  if (ARM_BEHAVIORS.has(bKey)) return 'arms';
  if (LEG_BEHAVIORS.has(bKey)) return 'legs';
  return 'whole_body';
}

export function getBehaviorDefaultMaskLabel(bKey) {
  const g = getBehaviorLimbGroup(bKey);
  if (g === 'arms') return 'Arms & Hands';
  if (g === 'legs') return 'Legs & Feet';
  if (g === 'torso') return 'Torso & Head';
  return 'Whole Body';
}

export class DMSBehaviorEngine {
  constructor(character, propsManager = null) {
    this.character = character;
    this.propsManager = propsManager || character?.propsManager || null;
    this.activeBehaviors = {};
    this.behaviorParams = {};
    this.behaviorWeights = {};

    // Register all keys from BEHAVIOR_DEFINITIONS and ENDORPHIN_BEHAVIOR_CATEGORIES
    for (const key of Object.keys(BEHAVIOR_DEFINITIONS)) {
      this.activeBehaviors[key] = false;
      this.behaviorParams[key] = { intensity: 1.0, speed: 1.0, bodyPartMask: 'auto', selectionSet: 'all' };
      this.behaviorWeights[key] = 0.0;
    }
    for (const cat of ENDORPHIN_BEHAVIOR_CATEGORIES) {
      for (const item of cat.items) {
        this.activeBehaviors[item.key] = false;
        this.behaviorParams[item.key] = { intensity: 1.0, speed: 1.0, bodyPartMask: 'auto', selectionSet: 'all' };
        this.behaviorWeights[item.key] = 0.0;
      }
    }

    this.activeBehaviors.balance = true;
    this.behaviorWeights.balance = 1.0;
    this.baseRotations = null;

    this.time = 0;
    this.jumpTriggered = false;
    this.jumpDiveTriggered = false;
    this.diveTriggered = false;
    this.tackleTriggered = false;
    this.shoveTriggered = false;
    this.hitReactTriggered = false;
    this.twistTorqueApplied = false;
    this.triggeredImpulses = new Set();
    this.targetTrajectoryCache = {};
    this.prevTargetVels = {};
    this.prevCharVel = null;
    this.lastPredictionTimes = {};

    // Look-At Cervical Controller
    this.lookAtTarget = null;
    this.lookAtWeight = 0.0;
  }

  setLookAt(targetPos, weight = 1.0) {
    this.lookAtTarget = targetPos ? new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z) : null;
    this.lookAtWeight = THREE.MathUtils.clamp(weight, 0, 1);
  }

  // Endorphin 2.7.1 Target Object Resolver with Trajectory Prediction & Interception
  resolveTargetPos(targetId, params = {}) {
    // Direct 3D targetPos vector support (used by multi-actor interactions & AI Stunt Director)
    if ((!targetId || targetId === 'none') && params?.targetPos) {
      return new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z);
    }
    if (!targetId || targetId === 'none') return null;

    // Check Delay (Endorphin 2.7.1: Holds resting pose until elapsed behavior time >= delay)
    const delay = params?.delay ?? 0.0;
    if (delay > 0) {
      const startFrame = params?.startFrame ?? params?.layerStartFrame ?? 0;
      const elapsed = Math.max(0, this.time - (startFrame / 60.0));
      if (elapsed < delay) {
        return null; // Delay not reached yet: hold resting pose
      }
    }

    const pm = this.propsManager || (typeof window !== 'undefined' && window.scenePropsManager) || this.character?.propsManager;
    if (!pm || typeof pm.getPropById !== 'function') {
      if (params?.targetPos) return new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z);
      return null;
    }

    const prop = pm.getPropById(targetId) || (pm.props && pm.props.find(p => p.id === targetId || p.type === targetId));
    if (!prop) {
      if (params?.targetPos) return new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z);
      return null;
    }

    let targetPos = null;
    let targetVel = new THREE.Vector3(0, 0, 0);
    let targetQuat = new THREE.Quaternion();

    if (prop.rigidBody) {
      const t = prop.rigidBody.translation();
      const r = prop.rigidBody.rotation();
      const lv = prop.rigidBody.linvel();
      targetPos = new THREE.Vector3(t.x, t.y, t.z);
      targetVel = new THREE.Vector3(lv.x, lv.y, lv.z);
      targetQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    } else if (prop.mesh) {
      targetPos = prop.mesh.position.clone();
      targetQuat = prop.mesh.quaternion.clone();
    } else if (prop.pos) {
      targetPos = new THREE.Vector3(prop.pos.x, prop.pos.y, prop.pos.z);
    }

    if (!targetPos) return null;

    // Calculate Accelerations for Threshold Detection
    const dt = 1 / 120;
    const prevTargetVel = this.prevTargetVels[targetId] || targetVel.clone();
    const targetAccel = targetVel.clone().sub(prevTargetVel).length() / Math.max(0.001, dt);
    this.prevTargetVels[targetId] = targetVel.clone();

    const charSpine = this.character?.bodies['UpperSpine'] || this.character?.bodies['Pelvis'];
    let charVel = new THREE.Vector3(0, 0, 0);
    let charPos = new THREE.Vector3(0, 0, 0);
    if (charSpine && charSpine.rigidBody) {
      const ct = charSpine.rigidBody.translation();
      const clv = charSpine.rigidBody.linvel();
      charPos.set(ct.x, ct.y, ct.z);
      charVel.set(clv.x, clv.y, clv.z);
    }
    const prevCharVel = this.prevCharVel || charVel.clone();
    const charAccel = charVel.clone().sub(prevCharVel).length() / Math.max(0.001, dt);
    this.prevCharVel = charVel.clone();

    // Endorphin 2.7.1 Prediction Parameters
    const usePrediction = params?.usePrediction !== false;
    const predictionRate = Math.max(0.01, params?.predictionRate ?? 0.2);
    const trajectoryOffset = THREE.MathUtils.clamp(params?.trajectoryOffset ?? 0.0, -1.0, 1.0);
    const charAccelThresh = params?.characterAccelThreshold ?? 20.0;
    const targetAccelThresh = params?.targetAccelThreshold ?? 0.05;

    const lastPredTime = this.lastPredictionTimes[targetId] ?? -999;
    const timeSinceLastPred = this.time - lastPredTime;
    const shouldRecalculate =
      timeSinceLastPred >= predictionRate ||
      charAccel >= charAccelThresh ||
      targetAccel >= targetAccelThresh ||
      !this.targetTrajectoryCache[targetId];

    let predictedPos;
    if (shouldRecalculate) {
      if (usePrediction && targetVel.lengthSq() > 0.0001) {
        const distToTarget = targetPos.distanceTo(charPos);
        const reachSpeed = 2.5 * (params?.speed ?? 1.0);
        const transitTime = distToTarget / Math.max(0.5, reachSpeed);
        const extrapolationTime = transitTime * Math.max(0.0, 1.0 + trajectoryOffset);
        predictedPos = targetPos.clone().add(targetVel.clone().multiplyScalar(extrapolationTime));
      } else {
        predictedPos = targetPos.clone();
      }
      this.lastPredictionTimes[targetId] = this.time;
      this.targetTrajectoryCache[targetId] = predictedPos.clone();
    } else {
      predictedPos = (this.targetTrajectoryCache[targetId] || targetPos).clone();
    }

    // Endorphin 2.7.1 Interception Offsets (Local to target object orientation)
    const offX = params?.interceptionOffsetX ?? 0.0;
    const offY = params?.interceptionOffsetY ?? 0.0;
    const offZ = params?.interceptionOffsetZ ?? 0.0;
    if (offX !== 0 || offY !== 0 || offZ !== 0) {
      const localOffset = new THREE.Vector3(offX, offY, offZ).applyQuaternion(targetQuat);
      predictedPos.add(localOffset);
    }

    // Endorphin 2.7.1 Exaggeration Arc (Curved reach path)
    const exaggeration = THREE.MathUtils.clamp(params?.exaggeration ?? 0.0, 0.0, 1.0);
    if (exaggeration > 0.001) {
      const startFrame = params?.startFrame ?? params?.layerStartFrame ?? 0;
      const elapsed = Math.max(0, this.time - (startFrame / 60.0) - delay);
      const estDuration = Math.max(0.3, targetPos.distanceTo(charPos) / 2.5);
      const progress = THREE.MathUtils.clamp(elapsed / estDuration, 0.0, 1.0);
      const arcFactor = Math.sin(Math.PI * progress) * (1.0 - progress);
      predictedPos.y += exaggeration * 0.35 * arcFactor;
      predictedPos.x += exaggeration * 0.15 * arcFactor;
    }

    return predictedPos;
  }

  // Endorphin 2.7.1 3D Aim & Gaze Inverse Kinematics Engine
  computeTargetAim(targetWorldPos) {
    if (!targetWorldPos) return null;
    const spine = this.character.bodies['UpperSpine'] || this.character.bodies['Pelvis'];
    if (!spine || !spine.rigidBody) return null;

    const sPos = spine.rigidBody.translation();
    const sRot = spine.rigidBody.rotation();
    const spineWorldPos = new THREE.Vector3(sPos.x, sPos.y, sPos.z);
    const spineQuat = new THREE.Quaternion(sRot.x, sRot.y, sRot.z, sRot.w);
    const invSpineQuat = spineQuat.clone().invert();

    const tWorld = targetWorldPos instanceof THREE.Vector3
      ? targetWorldPos
      : new THREE.Vector3(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z);

    // Vector from character spine to target in local coordinates (+Z forward, +Y up, +X left, -X right)
    const toTargetLocal = tWorld.clone().sub(spineWorldPos).applyQuaternion(invSpineQuat);

    // Left shoulder local vector
    const lArm = this.character.bodies['LeftUpperArm'];
    let toTargetLocalL = toTargetLocal;
    let distL = toTargetLocal.length();
    if (lArm && lArm.rigidBody) {
      const laPos = lArm.rigidBody.translation();
      const laWorldPos = new THREE.Vector3(laPos.x, laPos.y, laPos.z);
      toTargetLocalL = tWorld.clone().sub(laWorldPos).applyQuaternion(invSpineQuat);
      distL = toTargetLocalL.length();
    }

    // Right shoulder local vector
    const rArm = this.character.bodies['RightUpperArm'];
    let toTargetLocalR = toTargetLocal;
    let distR = toTargetLocal.length();
    if (rArm && rArm.rigidBody) {
      const raPos = rArm.rigidBody.translation();
      const raWorldPos = new THREE.Vector3(raPos.x, raPos.y, raPos.z);
      toTargetLocalR = tWorld.clone().sub(raWorldPos).applyQuaternion(invSpineQuat);
      distR = toTargetLocalR.length();
    }

    const pitchHead = Math.atan2(toTargetLocal.y, Math.max(0.01, Math.sqrt(toTargetLocal.x * toTargetLocal.x + toTargetLocal.z * toTargetLocal.z)));
    const yawHead = Math.atan2(toTargetLocal.x, Math.max(0.01, toTargetLocal.z));

    const pitchL = Math.atan2(toTargetLocalL.y, Math.max(0.01, Math.sqrt(toTargetLocalL.x * toTargetLocalL.x + toTargetLocalL.z * toTargetLocalL.z)));
    const yawL = Math.atan2(toTargetLocalL.x, Math.max(0.01, toTargetLocalL.z));

    const pitchR = Math.atan2(toTargetLocalR.y, Math.max(0.01, Math.sqrt(toTargetLocalR.x * toTargetLocalR.x + toTargetLocalR.z * toTargetLocalR.z)));
    const yawR = Math.atan2(toTargetLocalR.x, Math.max(0.01, toTargetLocalR.z));

    return {
      toTargetLocal,
      toTargetLocalL,
      toTargetLocalR,
      distL,
      distR,
      distCenter: toTargetLocal.length(),
      pitchHead,
      yawHead,
      pitchL,
      yawL,
      pitchR,
      yawR
    };
  }

  reset() {
    this.time = 0;
    this.jumpTriggered = false;
    this.jumpDiveTriggered = false;
    this.diveTriggered = false;
    this.tackleTriggered = false;
    this.shoveTriggered = false;
    this.hitReactTriggered = false;
    this.twistTorqueApplied = false;
    this.triggeredImpulses.clear();
    this.targetTrajectoryCache = {};
    this.prevTargetVels = {};
    this.prevCharVel = null;
    this.lastPredictionTimes = {};
    this.lookAtTarget = null;
    this.lookAtWeight = 0.0;
    this.baseRotations = null;

    for (const k in this.activeBehaviors) {
      this.activeBehaviors[k] = false;
      this.behaviorParams[k] = { intensity: 1.0, speed: 1.0, bodyPartMask: 'auto', selectionSet: 'all' };
      this.behaviorWeights[k] = 0.0;
    }
    this.activeBehaviors.balance = true;
    this.behaviorWeights.balance = 1.0;

    if (this.character) {
      this.character.allowGroundActiveMotor = false;
      if (this.character.joints) {
        for (const j of this.character.joints) {
          j.targetAngle.set(0, 0, 0);
        }
      }
    }
  }

  // Evaluates target angle for a single behavior and joint
  computeSingleBehaviorTarget(bKey, j, context, params) {
    const { time, sensors, pelvisY, isFallen, isFallingOrTilted, devX, devZ, fallDirZ } = context;
    const speed = params?.speed ?? 1.0;
    const int = params?.intensity ?? 1.0;
    const isLeft = j.name.includes('Left');

    // 0. NATURAL STANDING IDLE STANCE (Active Equilibrium & Breathing Micro-Sway)
    if (bKey === 'idleStance') {
      if (isFallen || context.isSuspendedByConstraint) return null;
      const breathSway = Math.sin(time * 2.2 * speed) * 0.015 * int;
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(-0.08 * int + devZ * 0.50, 0, devX * 0.40);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(0.14 * int - devZ * 0.25, 0, 0);
      }
      if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        return new THREE.Vector3(-0.04 * int + devZ * 0.95, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0.03 * int + breathSway - devZ * 0.35, 0, -devX * 0.35);
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.06 + breathSway, -0.12 + devZ * 0.65, -1.15 + Math.abs(devX) * 0.5);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.06 + breathSway, 0.12 - devZ * 0.65, 1.15 - Math.abs(devX) * 0.5);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.26, 0, 0);
      }
      return null;
    }

    // 1. ACTIVE BALANCE / BALANCE WITH PROPS
    if (bKey === 'balance' || bKey === 'balanceWithProps') {
      if (isFallen || context.isSuspendedByConstraint) return null;
      if (!sensors.feetGrounded && pelvisY > 0.45) return null;
      const target = new THREE.Vector3(0, 0, 0);
      if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        target.x = devZ * 0.85 * int;
        return target;
      }
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        target.x = (bKey === 'balanceWithProps' ? -0.22 : 0) * int + devZ * 0.45 * int;
        target.z = devX * 0.50 * int;
        return target;
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        target.x = (bKey === 'balanceWithProps' ? 0.35 : 0.05) * int;
        return target;
      }
      if (j.name.includes('Spine')) {
        target.x = (bKey === 'balanceWithProps' ? -0.16 : 0) * int - devZ * 0.35 * int;
        target.z = -devX * 0.35 * int;
        return target;
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        if (bKey === 'balanceWithProps') {
          target.set(0.15 * int, -0.85 * int, -0.35 * int);
        } else {
          target.set(0.0, -0.15 + devZ * 1.1 * int, -1.05 + Math.abs(devX) * 0.4 * int);
        }
        return target;
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        if (bKey === 'balanceWithProps') {
          target.set(0.15 * int, 0.85 * int, 0.35 * int);
        } else {
          target.set(0.0, 0.15 - devZ * 1.1 * int, 1.05 - Math.abs(devX) * 0.4 * int);
        }
        return target;
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        target.set(bKey === 'balanceWithProps' ? 1.15 * int : 0.35, 0, 0);
        return target;
      }
      return null;
    }

    // 2. STAGGER / RECOVERY STEPS
    if (bKey === 'stagger') {
      if (isFallen) return null;
      const staggerPhase = time * 8.5 * speed;
      const stepSwing = Math.sin(staggerPhase);
      const stepSide = stepSwing >= 0 ? 1 : -1;

      if (j.name === 'Pelvis_to_LeftThigh') {
        return new THREE.Vector3(
          (stepSide > 0 ? -0.45 * Math.abs(stepSwing) : 0.20 * Math.abs(stepSwing)) * int,
          0,
          devX * 0.45
        );
      }
      if (j.name === 'Pelvis_to_RightThigh') {
        return new THREE.Vector3(
          (stepSide < 0 ? -0.45 * Math.abs(stepSwing) : 0.20 * Math.abs(stepSwing)) * int,
          0,
          devX * 0.45
        );
      }
      if (j.name === 'LeftThigh_to_LeftCalf') {
        return new THREE.Vector3((stepSide > 0 ? 0.70 * Math.abs(stepSwing) : 0.10) * int, 0, 0);
      }
      if (j.name === 'RightThigh_to_RightCalf') {
        return new THREE.Vector3((stepSide < 0 ? 0.70 * Math.abs(stepSwing) : 0.10) * int, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(-devZ * 0.40 * int, stepSwing * 0.15 * int, -devX * 0.40 * int);
      }
      return null;
    }

    // 3. LAND & CROUCH POSE (Compliant Knee/Hip Flexion)
    if (bKey === 'crouchPose' || bKey === 'landCrouch') {
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(
          -0.85 * int + devZ * 0.35,
          0,
          (isLeft ? 0.08 : -0.08) * int
        );
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(1.20 * int, 0, 0);
      }
      if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        return new THREE.Vector3(-0.55 * int + devZ * 0.45, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0.30 * int - devZ * 0.25, 0, 0);
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.05, -0.55 * int, -0.75);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.05, 0.55 * int, 0.75);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.95 * int, 0, 0);
      }
      return null;
    }

    // 4. CATCH FALL & FALL BACK TWIST CATCH
    if (bKey === 'catchFall' || bKey === 'fallBackTwistCatch' || bKey === 'fallbackTwistCatchFall') {
      const isTwist = bKey === 'fallBackTwistCatch' || bKey === 'fallbackTwistCatchFall';
      const isLanded = sensors.handsGrounded || sensors.bodyGrounded || pelvisY < 0.42;
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(isLanded ? 0.05 : 0.25, isTwist ? 0.85 * int : 0, 0);
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        const reachY = fallDirZ > 0 ? -1.10 : -0.45;
        const yieldY = fallDirZ > 0 ? -0.30 : -0.12;
        return new THREE.Vector3(0.25 * int, isLanded ? yieldY : reachY, isLanded ? -0.20 : -0.45);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        const reachY = fallDirZ > 0 ? 1.10 : 0.45;
        const yieldY = fallDirZ > 0 ? 0.30 : 0.12;
        return new THREE.Vector3(0.25 * int, isLanded ? yieldY : reachY, isLanded ? 0.20 : 0.45);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(isLanded ? 1.35 * int : 0.55 * int, 0, 0);
      }
      if (j.name.includes('Forearm_to_') && j.name.includes('Hand')) {
        return new THREE.Vector3(isLanded ? -0.10 : -0.35, 0, 0);
      }
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(isLanded ? -0.10 : -0.45, isTwist ? 0.45 * int : 0, 0);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(isLanded ? 0.15 : 0.55, 0, 0);
      }
      return null;
    }

    // 5. ARMS WINDMILL / FLAIL (Hand & Arm Layer)
    if (bKey === 'armsWindmill') {
      const windmillPhase = time * 10.0 * speed;
      const rightPhaseOffset = params?.phaseOffset ?? Math.PI;
      let aimBiasPitch = 0;
      let aimBiasYaw = 0;
      if (params?.targetObject && params.targetObject !== 'none' && context.resolveTargetPos && context.computeTargetAim) {
        const tPos = context.resolveTargetPos(params.targetObject, params);
        const aim = tPos ? context.computeTargetAim(tPos) : null;
        if (aim) {
          aimBiasPitch = THREE.MathUtils.clamp(-aim.pitchHead * 0.35, -0.45, 0.45);
          aimBiasYaw = THREE.MathUtils.clamp(aim.yawHead * 0.35, -0.45, 0.45);
        }
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(
          aimBiasPitch + Math.cos(windmillPhase) * 0.75 * int,
          -0.55 + aimBiasYaw + Math.sin(windmillPhase) * 0.75 * int,
          -0.35 + Math.cos(windmillPhase) * 0.65 * int
        );
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(
          aimBiasPitch + Math.cos(windmillPhase + rightPhaseOffset) * 0.75 * int,
          0.55 + aimBiasYaw + Math.sin(windmillPhase + rightPhaseOffset) * 0.75 * int,
          0.35 - Math.cos(windmillPhase + rightPhaseOffset) * 0.65 * int
        );
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3((0.75 + 0.55 * Math.sin(windmillPhase)) * int, 0, 0);
      }
      return null;
    }

    // 6. ARMS ZOMBIE (Classic Forward Stiff Reach)
    if (bKey === 'armsZombie') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.10, -1.55 * int, -0.15);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.10, 1.55 * int, 0.15);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.05, 0, 0);
      }
      return null;
    }

    // 7. ARMS RAISED ABOVE HEAD
    if (bKey === 'armsRaised' || bKey === 'armsRaisedHead') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(-0.10, -1.45 * int, 1.15 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(-0.10, 1.45 * int, -1.15 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.15, 0, 0);
      }
      return null;
    }

    // 8. ARMS WIDE OF HEAD (Airplane Balance / Shield)
    if (bKey === 'armsWide' || bKey === 'armsWideHead') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.0, 0.05, -0.15 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.0, -0.05, 0.15 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.10, 0, 0);
      }
      return null;
    }

    // 9. ARMS CROSSED ON CHEST
    if (bKey === 'armsCrossed' || bKey === 'armsCrossedChest') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.35 * int, -0.95 * int, -0.65 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.35 * int, 0.95 * int, 0.65 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(1.65 * int, 0, 0);
      }
      return null;
    }

    // 9b. HANDS BEHIND BACK (Parade Rest)
    if (bKey === 'handsBehindBack') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.20 * int, 0.75 * int, -0.45 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.20 * int, -0.75 * int, 0.45 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(1.35 * int, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(-0.05 * int, 0, 0);
      }
      return null;
    }

    // 9c. HANDS PROTECTING GROIN (Sports Wall)
    if (bKey === 'handsProtectGroin') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.10 * int, -0.65 * int, -1.35 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.10 * int, 0.65 * int, 1.35 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.55 * int, 0, 0);
      }
      if (j.name === 'LeftForearm_to_LeftHand') {
        return new THREE.Vector3(0, 0, 0.35 * int);
      }
      if (j.name === 'RightForearm_to_RightHand') {
        return new THREE.Vector3(0, 0, -0.35 * int);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0.12 * int, 0, 0);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(0.20 * int, 0, 0);
      }
      return null;
    }

    // 10. HEAD PROTECT / FALL BACK TWIST COVER FACE
    if (bKey === 'headProtect' || bKey === 'fallBackTwistCover' || bKey === 'fallbackTwistCoverFace') {
      const isTwist = bKey === 'fallBackTwistCover' || bKey === 'fallbackTwistCoverFace';
      if (j.name.includes('Neck') || j.name.includes('Head')) {
        return new THREE.Vector3(0.42 * int, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0.35 * int, isTwist ? 0.75 * int : 0, 0);
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(-0.35 * int, -1.15 * int, -0.35 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(-0.35 * int, 1.15 * int, 0.35 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(1.85 * int, 0, 0);
      }
      return null;
    }

    // 11. HANDS REACH & LOOK AT (Target Object & Dynamic Gaze Tracking)
    if (bKey === 'reachHold' || bKey === 'handsReachLookAt') {
      const reachHand = params?.reachHand || 'both';
      const lookAtEnabled = params?.lookAt !== false;
      const hasTargetObject = Boolean(params?.targetObject && params?.targetObject !== 'none');
      const targetPos = context.resolveTargetPos
        ? context.resolveTargetPos(params?.targetObject, params)
        : (params?.targetPos ? new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z) : null);

      if (hasTargetObject && !targetPos) {
        return null; // Delay waiting: hold resting pose
      }

      if (targetPos && typeof context.computeTargetAim === 'function') {
        const aim = context.computeTargetAim(targetPos);
        if (aim) {
          const { distL, distR, pitchL, yawL, pitchR, yawR, pitchHead, yawHead } = aim;

          // Arm selection filtering (single-arm vs both-arms reach)
          if (reachHand === 'left' && (j.name.includes('RightShoulder') || j.name.includes('RightUpperArm') || j.name.includes('RightForearm'))) {
            if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(0.0, 0.15, 1.05);
            if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.35, 0, 0);
            return null;
          }
          if (reachHand === 'right' && (j.name.includes('LeftShoulder') || j.name.includes('LeftUpperArm') || j.name.includes('LeftForearm'))) {
            if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(0.0, -0.15, -1.05);
            if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.35, 0, 0);
            return null;
          }

          if (j.name === 'LeftShoulder_to_LeftUpperArm') {
            const shX = -0.15 + THREE.MathUtils.clamp(-pitchL * 0.90, -1.15, 1.15) * int;
            const shY = -1.25 + THREE.MathUtils.clamp(yawL * 0.85, -0.85, 0.85) * int;
            const shZ = -0.15 + THREE.MathUtils.clamp(-pitchL * 0.25, -0.65, 0.65) * int;
            return new THREE.Vector3(shX, shY, shZ);
          }

          if (j.name === 'RightShoulder_to_RightUpperArm') {
            const shX = -0.15 + THREE.MathUtils.clamp(-pitchR * 0.90, -1.15, 1.15) * int;
            const shY = 1.25 + THREE.MathUtils.clamp(yawR * 0.85, -0.85, 0.85) * int;
            const shZ = 0.15 + THREE.MathUtils.clamp(pitchR * 0.25, -0.65, 0.65) * int;
            return new THREE.Vector3(shX, shY, shZ);
          }

          if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
            const isL = j.name.includes('Left');
            const d = isL ? distL : distR;
            const clampedDist = THREE.MathUtils.clamp(d, 0.18, 0.52);
            const elbowFlex = ((1.0 - (clampedDist / 0.52)) * 1.55 + 0.15) * int;
            return new THREE.Vector3(elbowFlex, 0, 0);
          }

          if (j.name.includes('UpperSpine') || j.name.includes('LowerSpine')) {
            const spPitch = THREE.MathUtils.clamp(-pitchHead * 0.25, -0.35, 0.35) * int;
            const spYaw = THREE.MathUtils.clamp(yawHead * 0.20, -0.30, 0.30) * int;
            return new THREE.Vector3(spPitch, spYaw, 0);
          }

          if (lookAtEnabled) {
            if (j.name.includes('UpperSpine_to_Neck')) {
              const nPitch = THREE.MathUtils.clamp(-pitchHead * 0.35, -0.45, 0.45) * int;
              const nYaw = THREE.MathUtils.clamp(yawHead * 0.35, -0.55, 0.55) * int;
              return new THREE.Vector3(nPitch, nYaw, 0);
            }
            if (j.name.includes('Neck_to_Head')) {
              const hPitch = THREE.MathUtils.clamp(-pitchHead * 0.45, -0.55, 0.55) * int;
              const hYaw = THREE.MathUtils.clamp(yawHead * 0.45, -0.65, 0.65) * int;
              return new THREE.Vector3(hPitch, hYaw, 0);
            }
          }

          return null;
        }
      }

      // Default forward reaching without targeted object
      if (j.name.includes('Spine')) return new THREE.Vector3(0.22 * int, 0, 0);
      if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(-0.15, -1.25 * int, -0.15);
      if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(-0.15, 1.25 * int, 0.15);
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.25, 0, 0);
      return null;
    }

    // 11b. HEAD & GAZE TRACKING (Look At Standalone Behavior)
    if (bKey === 'lookAt') {
      const hasTargetObject = Boolean(params?.targetObject && params?.targetObject !== 'none');
      const targetPos = context.resolveTargetPos
        ? context.resolveTargetPos(params?.targetObject, params)
        : (params?.targetPos ? new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z) : null);
      if (hasTargetObject && !targetPos) {
        return null;
      }
      if (targetPos && typeof context.computeTargetAim === 'function') {
        const aim = context.computeTargetAim(targetPos);
        if (aim) {
          const { pitchHead, yawHead } = aim;
          if (j.name.includes('UpperSpine_to_Neck')) {
            const nPitch = THREE.MathUtils.clamp(-pitchHead * 0.45, -0.60, 0.60) * int;
            const nYaw = THREE.MathUtils.clamp(yawHead * 0.45, -0.75, 0.75) * int;
            return new THREE.Vector3(nPitch, nYaw, 0);
          }
          if (j.name.includes('Neck_to_Head')) {
            const hPitch = THREE.MathUtils.clamp(-pitchHead * 0.55, -0.70, 0.70) * int;
            const hYaw = THREE.MathUtils.clamp(yawHead * 0.55, -0.85, 0.85) * int;
            return new THREE.Vector3(hPitch, hYaw, 0);
          }
          if (j.name.includes('UpperSpine') || j.name.includes('LowerSpine')) {
            const sPitch = THREE.MathUtils.clamp(-pitchHead * 0.20, -0.30, 0.30) * int;
            const sYaw = THREE.MathUtils.clamp(yawHead * 0.25, -0.40, 0.40) * int;
            return new THREE.Vector3(sPitch, sYaw, 0);
          }
          return null;
        }
      }

      if (j.name.includes('UpperSpine_to_Neck')) {
        return new THREE.Vector3(0, Math.sin(time * 1.5 * speed) * 0.15 * int, 0);
      }
      if (j.name.includes('Neck_to_Head')) {
        return new THREE.Vector3(0, Math.sin(time * 1.5 * speed + 0.3) * 0.25 * int, 0);
      }
      return null;
    }

    // 11c. HOLD & GRASP
    if (bKey === 'hold') {
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(0.10 * int, -0.95 * int, -0.25 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(0.10 * int, 0.95 * int, 0.25 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.85 * int, 0, 0);
      }
      if (j.name.includes('Forearm_to_') && j.name.includes('Hand')) {
        return new THREE.Vector3(0.35 * int, 0, 0);
      }
      return null;
    }

    // 11d. CHEST SHOVE & PUSH
    if (bKey === 'chestShove') {
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0.25 * int, 0, 0);
      }
      if (j.name === 'LeftShoulder_to_LeftUpperArm') {
        return new THREE.Vector3(1.40 * int, -0.15 * int, 0.10 * int);
      }
      if (j.name === 'RightShoulder_to_RightUpperArm') {
        return new THREE.Vector3(1.40 * int, 0.15 * int, -0.10 * int);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(0.10 * int, 0, 0);
      }
      return null;
    }

    // 11e. DYNAMIC HIT REACTION
    if (bKey === 'hitReaction') {
      if (j.name.includes('Neck') || j.name.includes('Head')) {
        return new THREE.Vector3(-0.55 * int, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(-0.45 * int, 0, 0);
      }
      if (j.name.includes('Shoulder_to_') && j.name.includes('UpperArm')) {
        return new THREE.Vector3(-0.30 * int, 0, (isLeft ? -0.85 : 0.85) * int);
      }
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(-0.35 * int, 0, 0);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(0.45 * int, 0, 0);
      }
      return null;
    }

    // 11f. DYNAMIC FLAIL (Reactionary Mid-Air & Stumble Flailing Reflex)
    if (bKey === 'flail') {
      const flailPhase = time * 11.0 * speed;
      const w1 = Math.sin(flailPhase) * int;
      const w2 = Math.cos(flailPhase) * int;
      if (j.name.includes('UpperArm')) {
        return new THREE.Vector3(w1 * 0.85, (isLeft ? 0.25 : -0.25) * int, (isLeft ? -0.85 : 0.85) * int + w2 * 0.4);
      }
      if (j.name.includes('Forearm')) {
        return new THREE.Vector3(0.55 * int + Math.abs(w1) * 0.35, 0, 0);
      }
      if (j.name.includes('Thigh')) {
        return new THREE.Vector3((isLeft ? w1 : -w1) * 0.55, 0, 0);
      }
      if (j.name.includes('Calf')) {
        return new THREE.Vector3(Math.max(0.12, (isLeft ? -w2 : w2) * 0.6), 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(w1 * 0.15, 0, w2 * 0.15);
      }
      return null;
    }

    // 12. LEGS KICK (Bicycling / Active Defense)
    if (bKey === 'legsKick') {
      const kickPhase = time * 9.5 * speed;
      const k1 = Math.sin(kickPhase) * int;
      if (j.name === 'Pelvis_to_LeftThigh') {
        return new THREE.Vector3(-0.45 + k1 * 0.65, 0, 0);
      }
      if (j.name === 'Pelvis_to_RightThigh') {
        return new THREE.Vector3(-0.45 - k1 * 0.65, 0, 0);
      }
      if (j.name === 'LeftThigh_to_LeftCalf') {
        return new THREE.Vector3(0.85 + Math.max(0, -k1) * 0.90, 0, 0);
      }
      if (j.name === 'RightThigh_to_RightCalf') {
        return new THREE.Vector3(0.85 + Math.max(0, k1) * 0.90, 0, 0);
      }
      return null;
    }

    // 13. LEGS REACH (Proactive Landing Anticipation / Target Object Stepping)
    if (bKey === 'legsReach') {
      const hasTargetObject = Boolean(params?.targetObject && params?.targetObject !== 'none');
      const targetPos = context.resolveTargetPos ? context.resolveTargetPos(params?.targetObject, params) : null;
      if (hasTargetObject && !targetPos) {
        return null;
      }
      if (targetPos && typeof context.computeTargetAim === 'function') {
        const aim = context.computeTargetAim(targetPos);
        if (aim) {
          const { toTargetLocal } = aim;
          const pitchLeg = Math.atan2(toTargetLocal.y, Math.max(0.01, Math.sqrt(toTargetLocal.x * toTargetLocal.x + toTargetLocal.z * toTargetLocal.z)));
          const yawLeg = Math.atan2(toTargetLocal.x, Math.max(0.01, toTargetLocal.z));

          if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
            const hipPitch = THREE.MathUtils.clamp(-pitchLeg * 0.85 - 0.45, -1.35, 0.25) * int;
            const hipYaw = THREE.MathUtils.clamp(yawLeg * 0.45, -0.40, 0.40) * int;
            return new THREE.Vector3(hipPitch, 0, hipYaw);
          }
          if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
            const kneeFlex = THREE.MathUtils.clamp(pitchLeg * 0.65 + 0.35, 0.05, 1.25) * int;
            return new THREE.Vector3(kneeFlex, 0, 0);
          }
          if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
            return new THREE.Vector3(-0.35 * int, 0, 0);
          }
          return null;
        }
      }

      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(-0.65 * int, 0, 0);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(0.15, 0, 0);
      }
      if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        return new THREE.Vector3(-0.35 * int, 0, 0);
      }
      return null;
    }

    // 14. LEGS STRAIGHTEN (Braced Rigid Limbs)
    if (bKey === 'legsStraighten') {
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) {
        return new THREE.Vector3(0.10 * int, 0, 0);
      }
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) {
        return new THREE.Vector3(0.02, 0, 0);
      }
      if (j.name.includes('Calf_to_') && j.name.includes('Foot')) {
        return new THREE.Vector3(0.35 * int, 0, 0);
      }
      return null;
    }

    // 14b. ACTIVE TORSO TWIST
    if (bKey === 'activeTwist') {
      const twistAngle = Math.sin(time * 6.0 * speed) * 0.55 * int;
      if (j.name.includes('Spine')) {
        return new THREE.Vector3(0, twistAngle, 0);
      }
      return null;
    }

    // 15. BODY FOETAL (Defensive Curled Ball)
    if (bKey === 'bodyFoetal') {
      if (j.name.includes('Spine')) return new THREE.Vector3(0.65 * int, 0, 0);
      if (j.name.includes('Neck') || j.name.includes('Head')) return new THREE.Vector3(0.45 * int, 0, 0);
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-1.35 * int, 0, 0);
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(1.70 * int, 0, 0);
      if (j.name.includes('Shoulder_to_') && j.name.includes('UpperArm')) {
        return new THREE.Vector3(0, (isLeft ? -1.05 : 1.05) * int, 0);
      }
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
        return new THREE.Vector3(1.80 * int, 0, 0);
      }
      return null;
    }

    // 16. BODY TUCK & ROLL (Breakfall)
    if (bKey === 'tuckAndRoll') {
      if (j.name.includes('Neck') || j.name.includes('Head')) return new THREE.Vector3(0.45 * int, 0, 0);
      if (j.name.includes('Spine')) return new THREE.Vector3(0.42 * int, 0, 0);
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-1.25 * int, 0, 0);
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(1.75 * int, 0, 0);
      if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(0, -0.95 * int, -0.55 * int);
      if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(0, 0.95 * int, 0.55 * int);
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(1.55 * int, 0, 0);
      return null;
    }

    // 17. JUMP & JUMP AND DIVE
    if (bKey === 'jump' || bKey === 'jumpAndDive' || bKey === 'jumpDive') {
      const isDive = bKey === 'jumpAndDive' || bKey === 'jumpDive';
      if (context.hasActiveTuckOrCurl) {
        return null;
      }

      const isLaunched = this.jumpTriggered || this.jumpDiveTriggered || this.diveTriggered;
      const isDescending = isLaunched && sensors.comVelocity.y < -0.25;

      if (!context.hasActiveLegLayer) {
        if (!isLaunched) {
          if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-0.85 * int, 0, 0);
          if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(1.15 * int, 0, 0);
          if (j.name.includes('Calf_to_') && j.name.includes('Foot')) return new THREE.Vector3(-0.45 * int, 0, 0);
        } else if (!isDescending) {
          if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(0.15 * int, 0, 0);
          if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(0.08, 0, 0);
          if (j.name.includes('Calf_to_') && j.name.includes('Foot')) return new THREE.Vector3(0.55 * int, 0, 0);
        } else {
          if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-0.35 * int, 0, 0);
          if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(0.45 * int, 0, 0);
          if (j.name.includes('Calf_to_') && j.name.includes('Foot')) return new THREE.Vector3(-0.20 * int, 0, 0);
        }
      }

      if (!isLaunched) {
        if (j.name.includes('Spine')) return new THREE.Vector3(0.25 * int, 0, 0);
      } else if (!isDescending) {
        if (j.name.includes('Spine')) return new THREE.Vector3(isDive ? 0.20 * int : -0.08 * int, 0, 0);
      } else {
        if (j.name.includes('Spine')) return new THREE.Vector3(0.08 * int, 0, 0);
      }

      if (!context.hasActiveArmLayer) {
        if (isLaunched) {
          if (!isDescending) {
            if (isDive) {
              if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(-0.15 * int, -1.35 * int, 0.15 * int);
              if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(-0.15 * int, 1.35 * int, -0.15 * int);
              if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.15, 0, 0);
            } else {
              if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(-0.35 * int, -1.15 * int, 0.35 * int);
              if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(-0.35 * int, 1.15 * int, -0.35 * int);
              if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.25, 0, 0);
            }
          } else {
            if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(-0.10 * int, -0.75 * int, -0.15 * int);
            if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(-0.10 * int, 0.75 * int, 0.15 * int);
            if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.55 * int, 0, 0);
          }
        }
      }

      return null;
    }

    // 18. FORWARD TACKLE / DIVE (Target Object Oriented)
    if (bKey === 'tackle') {
      const targetPos = context.resolveTargetPos
        ? context.resolveTargetPos(params?.targetObject, params)
        : (params?.targetPos ? new THREE.Vector3(params.targetPos.x, params.targetPos.y, params.targetPos.z) : null);
      let aimPitch = 0;
      let aimYaw = 0;
      if (targetPos && typeof context.computeTargetAim === 'function') {
        const aim = context.computeTargetAim(targetPos);
        if (aim) {
          aimPitch = aim.pitchHead;
          aimYaw = aim.yawHead;
        }
      }

      if (j.name.includes('Spine')) {
        return new THREE.Vector3(
          THREE.MathUtils.clamp((0.38 - aimPitch * 0.30) * int, -0.2, 0.7),
          THREE.MathUtils.clamp(aimYaw * 0.40 * int, -0.6, 0.6),
          0
        );
      }
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(0.22 * int, 0, 0);
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(0.15, 0, 0);
      if (!context.hasActiveArmLayer) {
        if (j.name === 'LeftShoulder_to_LeftUpperArm') {
          return new THREE.Vector3(
            -0.10 + THREE.MathUtils.clamp(-aimPitch * 0.6, -0.8, 0.8),
            -1.15 * int + THREE.MathUtils.clamp(aimYaw * 0.4, -0.5, 0.5),
            -0.35
          );
        }
        if (j.name === 'RightShoulder_to_RightUpperArm') {
          return new THREE.Vector3(
            -0.10 + THREE.MathUtils.clamp(-aimPitch * 0.6, -0.8, 0.8),
            1.15 * int + THREE.MathUtils.clamp(aimYaw * 0.4, -0.5, 0.5),
            0.35
          );
        }
        if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.65 * int, 0, 0);
      }
      return null;
    }

    // 19. GROUND WRITHING (Agony)
    if (bKey === 'writhing') {
      const w1 = Math.sin(time * 7.5 * speed) * int;
      const w2 = Math.cos(time * 5.5 * speed) * int;
      if (j.name.includes('Spine')) return new THREE.Vector3(0.25 + w1 * 0.20, w2 * 0.22, w1 * 0.18);
      if (j.name.includes('Neck') || j.name.includes('Head')) return new THREE.Vector3(0.20 + w2 * 0.25, -w1 * 0.35, 0);
      if (j.name === 'Pelvis_to_LeftThigh') return new THREE.Vector3(-0.65 + w1 * 0.55, 0, 0.15);
      if (j.name === 'Pelvis_to_RightThigh') return new THREE.Vector3(-0.65 - w1 * 0.55, 0, -0.15);
      if (j.name === 'LeftThigh_to_LeftCalf') return new THREE.Vector3(0.95 - w1 * 0.65, 0, 0);
      if (j.name === 'RightThigh_to_RightCalf') return new THREE.Vector3(0.95 + w1 * 0.65, 0, 0);
      if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(0, -0.85 + w2 * 0.35, -0.55 + w1 * 0.25);
      if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(0, 0.85 - w2 * 0.35, 0.55 - w1 * 0.25);
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(1.25 + w1 * 0.45, 0, 0);
      return null;
    }

    // 20. WRITHE IN MID-AIR (Panic Flail)
    if (bKey === 'writheMidAir') {
      const midAirPhase = time * 11.5 * speed;
      const p1 = Math.sin(midAirPhase) * int;
      const p2 = Math.cos(midAirPhase) * int;
      if (j.name === 'Pelvis_to_LeftThigh') return new THREE.Vector3(-0.45 + p1 * 0.65, 0, 0);
      if (j.name === 'Pelvis_to_RightThigh') return new THREE.Vector3(-0.45 - p1 * 0.65, 0, 0);
      if (j.name === 'LeftThigh_to_LeftCalf') return new THREE.Vector3(0.75 + Math.max(0, -p1) * 0.85, 0, 0);
      if (j.name === 'RightThigh_to_RightCalf') return new THREE.Vector3(0.75 + Math.max(0, p1) * 0.85, 0, 0);
      if (j.name.includes('Spine')) return new THREE.Vector3(0, p2 * 0.28, p1 * 0.22);
      if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(p2 * 0.45, -0.75 + p1 * 0.70, -0.35 + p2 * 0.65);
      if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(-p2 * 0.45, 0.75 - p1 * 0.70, 0.35 - p2 * 0.65);
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3((0.75 + 0.50 * Math.sin(midAirPhase * 1.2)) * int, 0, 0);
      return null;
    }

    // 21. PRONE PUSH-UP BRACE
    if (bKey === 'pushUpRecovery') {
      if (j.name.includes('Spine')) return new THREE.Vector3(-0.18 * int, 0, 0);
      if (j.name.includes('Neck') || j.name.includes('Head')) return new THREE.Vector3(-0.25 * int, 0, 0);
      if (j.name === 'LeftShoulder_to_LeftUpperArm') return new THREE.Vector3(0, -1.10 * int, -0.30);
      if (j.name === 'RightShoulder_to_RightUpperArm') return new THREE.Vector3(0, 1.10 * int, 0.30);
      if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) return new THREE.Vector3(0.35, 0, 0);
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-0.55 * int, 0, 0);
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(0.90 * int, 0, 0);
      return null;
    }

    // 22. FALL BACK PASSIVE (Limp unpowered arms)
    if (bKey === 'fallBackPassive' || bKey === 'fallbackTwistPassive') {
      if (j.name.includes('Pelvis_to_') && j.name.includes('Thigh')) return new THREE.Vector3(-0.45 * int, 0.35 * int, 0);
      if (j.name.includes('Thigh_to_') && j.name.includes('Calf')) return new THREE.Vector3(0.65 * int, 0, 0);
      if (j.name.includes('Spine')) return new THREE.Vector3(0.15 * int, 0.85 * int, 0);
      return null;
    }

    // 23. FLUID SWIMMING LOCOMOTION
    if (bKey === 'fluid') {
      const swimStyle = params?.swimStyle || 'breaststroke';
      const swimPhase = time * 5.0 * speed;
      const sArm = Math.sin(swimPhase);
      const cArm = Math.cos(swimPhase);
      const sLeg = Math.sin(swimPhase * 1.5);
      if (swimStyle === 'drown') {
        if (j.name.includes('Shoulder_to_') && j.name.includes('UpperArm')) {
          return new THREE.Vector3(-0.35 * int, (isLeft ? -1.25 : 1.25) * int, (isLeft ? 0.55 : -0.55) * sArm * int);
        }
        if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
          return new THREE.Vector3(0.45 * int, 0, 0);
        }
        return null;
      }
      if (swimStyle === 'treadWater') {
        if (j.name === 'LeftShoulder_to_LeftUpperArm') {
          return new THREE.Vector3(0.15 * int, (-0.55 + sArm * 0.45) * int, -0.45 * int);
        }
        if (j.name === 'RightShoulder_to_RightUpperArm') {
          return new THREE.Vector3(0.15 * int, (0.55 + sArm * 0.45) * int, 0.45 * int);
        }
        if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
          return new THREE.Vector3((0.95 + cArm * 0.25) * int, 0, 0);
        }
      } else {
        if (j.name === 'LeftShoulder_to_LeftUpperArm') {
          return new THREE.Vector3(cArm * 0.45 * int, (-0.85 + sArm * 0.65) * int, (-0.55 + cArm * 0.55) * int);
        }
        if (j.name === 'RightShoulder_to_RightUpperArm') {
          return new THREE.Vector3(-cArm * 0.45 * int, (0.85 - sArm * 0.65) * int, (0.55 - cArm * 0.55) * int);
        }
        if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
          return new THREE.Vector3((0.75 + sArm * 0.55) * int, 0, 0);
        }
      }
      if (j.name === 'Pelvis_to_LeftThigh') {
        return new THREE.Vector3((-0.35 + sLeg * 0.45) * int, 0, 0);
      }
      if (j.name === 'Pelvis_to_RightThigh') {
        return new THREE.Vector3((-0.35 - sLeg * 0.45) * int, 0, 0);
      }
      if (j.name === 'LeftThigh_to_LeftCalf') {
        return new THREE.Vector3(Math.max(0.1, 0.45 - sLeg * 0.45) * int, 0, 0);
      }
      if (j.name === 'RightThigh_to_RightCalf') {
        return new THREE.Vector3(Math.max(0.1, 0.45 + sLeg * 0.45) * int, 0, 0);
      }
      if (j.name.includes('Spine')) {
        return new THREE.Vector3((swimStyle === 'scuba' ? 0.25 : -0.08) * int, 0, 0);
      }
      return null;
    }

    return null;
  }

  // Master simulation step update with Endorphin limb-masked multi-layer weighted blending
  update(dt, activeLayers = null, currentFrame = 0, weightCalcFn = null, propsManager = null) {
    this.time += dt;
    if (propsManager) this.propsManager = propsManager;
    if (!this.character) return;
    const sensors = this.character.sensors || {
      tiltAngle: 0,
      centerOfMass: { x: 0, y: 0.95, z: 0 },
      comVelocity: { x: 0, y: 0, z: 0 },
      feetGrounded: true,
      hasGroundContact: true
    };

    // Posture & Height Analysis
    const pelvis = this.character.bodies['Pelvis'];
    const pelvisPos = pelvis ? pelvis.rigidBody.translation() : { x: 0, y: 0.95, z: 0 };
    const pelvisY = pelvisPos.y;
    const isAirborne = pelvisY > 0.52 && !sensors.hasGroundContact;
    const isGroundedOrNearFloor = pelvisY < 0.40 || sensors.hasGroundContact;
    const isFallen = !isAirborne && (pelvisY < 0.32 || (isGroundedOrNearFloor && sensors.tiltAngle > 50.0));
    const isFallingOrTilted = !isAirborne && (pelvisY < 0.70 || sensors.tiltAngle > 20.0);

    // Ground active motor authorization
    this.character.allowGroundActiveMotor = Boolean(
      this.activeBehaviors.writhing ||
      this.activeBehaviors.headProtect ||
      this.activeBehaviors.tuckAndRoll ||
      this.activeBehaviors.pushUpRecovery ||
      this.activeBehaviors.bodyFoetal ||
      this.activeBehaviors.crouchPose ||
      this.activeBehaviors.landCrouch ||
      this.activeBehaviors.catchFall ||
      this.activeBehaviors.armsWindmill ||
      this.activeBehaviors.writheMidAir ||
      this.activeBehaviors.legsKick ||
      this.activeBehaviors.legsReach ||
      this.activeBehaviors.lookAt ||
      this.activeBehaviors.jump ||
      this.activeBehaviors.jumpAndDive ||
      this.activeBehaviors.jumpDive ||
      this.activeBehaviors.tackle
    );

    // LIPM Base of Support
    const footL = this.character.bodies['LeftFoot'];
    const footR = this.character.bodies['RightFoot'];
    const footLPos = footL ? footL.rigidBody.translation() : { x: 0.12, y: 0.04, z: 0.04 };
    const footRPos = footR ? footR.rigidBody.translation() : { x: -0.12, y: 0.04, z: 0.04 };
    const baseCenter = {
      x: (footLPos.x + footRPos.x) / 2,
      z: (footLPos.z + footRPos.z) / 2
    };

    let comOffsetPropX = this.activeBehaviors.balanceWithProps ? 0.06 : 0.0;
    let comOffsetPropZ = this.activeBehaviors.balanceWithProps ? -0.04 : 0.0;
    if (this.activeBehaviors.balanceWithProps && this.propsManager && Array.isArray(this.propsManager.props)) {
      for (const p of this.propsManager.props) {
        if (p.isDynamic && p.rigidBody) {
          const pTr = p.rigidBody.translation();
          const dx = pTr.x - pelvisPos.x;
          const dz = pTr.z - pelvisPos.z;
          const dist = Math.hypot(dx, pTr.y - pelvisPos.y, dz);
          if (dist < 0.85) {
            const pMass = p.mass || 10.0;
            const massRatio = Math.min(0.45, pMass / (75.0 + pMass));
            comOffsetPropX += dx * massRatio;
            comOffsetPropZ += dz * massRatio;
          }
        }
      }
    }

    const comErrX = (sensors.centerOfMass.x - baseCenter.x + comOffsetPropX) + sensors.comVelocity.x * 0.18;
    const comErrZ = (sensors.centerOfMass.z - baseCenter.z + comOffsetPropZ) + sensors.comVelocity.z * 0.18;
    const devX = THREE.MathUtils.clamp(comErrX, -0.35, 0.35);
    const devZ = THREE.MathUtils.clamp(comErrZ, -0.35, 0.35);
    const fallDirZ = (comErrZ >= -0.05) ? 1.0 : -1.0;

    // Physical effects
    if (this.activeBehaviors.damping) {
      const dampWeight = this.behaviorWeights.damping ?? 1.0;
      for (const [bName, b] of Object.entries(this.character.bodies)) {
        if (b.rigidBody?.setLinearDamping) b.rigidBody.setLinearDamping(0.85 * dampWeight);
        if (b.rigidBody?.setAngularDamping) b.rigidBody.setAngularDamping(2.5 * dampWeight);
      }
    }
    if (this.activeBehaviors.stickiness) {
      const stickWeight = this.behaviorWeights.stickiness ?? 1.0;
      if (footL?.rigidBody?.setLinearDamping) footL.rigidBody.setLinearDamping(1.5 * stickWeight);
      if (footR?.rigidBody?.setLinearDamping) footR.rigidBody.setLinearDamping(1.5 * stickWeight);
    }

    // Synthesize layer list if called without explicit timeline layers
    let layersToProcess = activeLayers;
    if (!layersToProcess) {
      layersToProcess = [];
      for (const k in this.activeBehaviors) {
        if (this.activeBehaviors[k] && this.behaviorWeights[k] > 0.001) {
          layersToProcess.push({
            id: `layer_${k}`,
            behavior: k,
            intensity: this.behaviorParams[k]?.intensity ?? 1.0,
            speed: this.behaviorParams[k]?.speed ?? 1.0,
            bodyPartMask: this.behaviorParams[k]?.bodyPartMask ?? 'auto',
            selectionSet: this.behaviorParams[k]?.selectionSet ?? 'all',
            targetObject: this.behaviorParams[k]?.targetObject ?? 'none',
            targetPos: this.behaviorParams[k]?.targetPos ?? null,
            startFrame: 0,
            endFrame: 1000
          });
        }
      }
    }

    // --- TIMELINE LAYER IMPULSE EVENT TRIGGERS (JUMP, DIVE, TACKLE, SHOVE, HIT REACTION, TWIST) ---
    for (const layer of layersToProcess) {
      const bKey = layer.behavior;
      if (!bKey) continue;
      const layerId = layer.id || `${bKey}_${layer.startFrame ?? 0}`;
      const int = layer.intensity ?? 1.0;
      const dur = (layer.endFrame || 120) - (layer.startFrame || 0);
      const triggerFrame = (layer.startFrame || 0) + Math.min(14, Math.max(4, Math.floor(dur * 0.10)));
      const timeReady = currentFrame > 0 ? (currentFrame >= triggerFrame) : (this.time >= 0.06);

      if (!this.triggeredImpulses.has(layerId) && timeReady) {
        if (bKey === 'jump' && pelvisY > 0.45) {
          this.triggeredImpulses.add(layerId);
          this.jumpTriggered = true;
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          let dirX = 0, dirZ = 1.0;
          let horizScale = 1.0;
          if (targetPos) {
            const dx = targetPos.x - pelvisPos.x;
            const dz = targetPos.z - pelvisPos.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.05) {
              dirX = dx / len;
              dirZ = dz / len;
              horizScale = Math.min(2.2, Math.max(0.8, len * 0.85));
            }
          }
          this.character.applyImpulseToBody('Pelvis', { x: dirX * 55.0 * horizScale * int, y: 265.0 * int, z: dirZ * 55.0 * horizScale * int });
          this.character.applyImpulseToBody('UpperSpine', { x: dirX * 45.0 * horizScale * int, y: 175.0 * int, z: dirZ * 45.0 * horizScale * int });
        } else if ((bKey === 'jumpAndDive' || bKey === 'jumpDive') && pelvisY > 0.45) {
          this.triggeredImpulses.add(layerId);
          this.jumpDiveTriggered = true;
          this.diveTriggered = true;
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          let dirX = 0, dirZ = 1.0;
          if (targetPos) {
            const dx = targetPos.x - pelvisPos.x;
            const dz = targetPos.z - pelvisPos.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.05) { dirX = dx / len; dirZ = dz / len; }
          }
          this.character.applyImpulseToBody('Pelvis', { x: dirX * 160.0 * int, y: 210.0 * int, z: dirZ * 160.0 * int });
          this.character.applyImpulseToBody('UpperSpine', { x: dirX * 190.0 * int, y: 140.0 * int, z: dirZ * 190.0 * int });
        } else if (bKey === 'tackle' && pelvisY > 0.45) {
          this.triggeredImpulses.add(layerId);
          this.tackleTriggered = true;
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          if (targetPos) {
            const dir = new THREE.Vector3(targetPos.x - pelvisPos.x, 0.35, targetPos.z - pelvisPos.z).normalize();
            this.character.applyImpulseToBody('Pelvis', {
              x: dir.x * 200.0 * int,
              y: 115.0 * int,
              z: dir.z * 200.0 * int
            });
            this.character.applyImpulseToBody('UpperSpine', {
              x: dir.x * 230.0 * int,
              y: 115.0 * 0.85 * int,
              z: dir.z * 230.0 * int
            });
          } else {
            this.character.applyImpulseToBody('Pelvis', { x: 0, y: 120.0 * int, z: 185.0 * int });
            this.character.applyImpulseToBody('UpperSpine', { x: 0, y: 95.0 * int, z: 210.0 * int });
          }
        } else if (bKey === 'chestShove') {
          this.triggeredImpulses.add(layerId);
          this.shoveTriggered = true;
          let dirX = 0, dirZ = 1.0;
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          if (targetPos) {
            const dx = targetPos.x - pelvisPos.x;
            const dz = targetPos.z - pelvisPos.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.05) { dirX = dx / len; dirZ = dz / len; }
          }
          this.character.applyImpulseToBody('Pelvis', { x: dirX * 35.0 * int, y: 6.0 * int, z: dirZ * 35.0 * int });
          this.character.applyImpulseToBody('LeftHand', { x: dirX * 65.0 * int, y: 12.0 * int, z: dirZ * 65.0 * int });
          this.character.applyImpulseToBody('RightHand', { x: dirX * 65.0 * int, y: 12.0 * int, z: dirZ * 65.0 * int });
        } else if (bKey === 'hitReaction') {
          this.triggeredImpulses.add(layerId);
          this.hitReactTriggered = true;
          let dirX = 0, dirZ = -1.0;
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          if (targetPos) {
            const dx = pelvisPos.x - targetPos.x;
            const dz = pelvisPos.z - targetPos.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.05) { dirX = dx / len; dirZ = dz / len; }
          }
          this.character.applyImpulseToBody('Head', { x: dirX * 24.0 * int, y: 12.0 * int, z: dirZ * 24.0 * int });
          this.character.applyImpulseToBody('UpperSpine', { x: dirX * 55.0 * int, y: 14.0 * int, z: dirZ * 55.0 * int });
        } else if (
          bKey === 'fallBackTwistCatch' || bKey === 'fallbackTwistCatchFall' ||
          bKey === 'fallBackTwistCover' || bKey === 'fallbackTwistCoverFace' ||
          bKey === 'fallBackPassive' || bKey === 'fallbackTwistPassive'
        ) {
          if (fallDirZ < 0 && isFallingOrTilted) {
            this.triggeredImpulses.add(layerId);
            this.twistTorqueApplied = true;
            const spineB = this.character.bodies['UpperSpine'];
            const pelvisB = this.character.bodies['Pelvis'];
            if (spineB?.rigidBody?.applyTorqueImpulse) spineB.rigidBody.applyTorqueImpulse({ x: 0, y: 45.0 * int, z: 0 }, true);
            if (pelvisB?.rigidBody?.applyTorqueImpulse) pelvisB.rigidBody.applyTorqueImpulse({ x: 0, y: 35.0 * int, z: 0 }, true);
          }
        }
      }
    }

    // Helper to evaluate active layer weight at current frame
    const getLayerEffectiveWeight = (l) => {
      const bKey = l.behavior;
      if (!bKey || bKey === 'ragdoll' || bKey === 'damping' || bKey === 'stickiness' || bKey === 'pusher' || bKey === 'twister') return 0;
      let w = 1.0;
      if (typeof weightCalcFn === 'function') {
        w = weightCalcFn(l, currentFrame) * (l.intensity ?? 1.0);
      } else if (this.behaviorWeights[bKey] !== undefined) {
        w = this.behaviorWeights[bKey];
      }
      return w;
    };

    const hasActiveArmLayer = layersToProcess.some(l => {
      const w = getLayerEffectiveWeight(l);
      if (w <= 0.001) return false;
      const bKey = l.behavior;
      if (bKey === 'jump' || bKey === 'jumpAndDive' || bKey === 'jumpDive' || bKey === 'balance') return false;
      const mask = l.bodyPartMask || 'auto';
      const defGroup = getBehaviorLimbGroup(bKey);
      return (
        mask === 'arms' ||
        l.selectionSet === 'arms' ||
        l.selectionSet === 'upper' ||
        (mask === 'auto' && (defGroup === 'arms' || bKey === 'writheMidAir'))
      );
    });

    const hasActiveLegLayer = layersToProcess.some(l => {
      const w = getLayerEffectiveWeight(l);
      if (w <= 0.001) return false;
      const bKey = l.behavior;
      if (bKey === 'jump' || bKey === 'jumpAndDive' || bKey === 'jumpDive' || bKey === 'balance') return false;
      const mask = l.bodyPartMask || 'auto';
      const defGroup = getBehaviorLimbGroup(bKey);
      return (
        mask === 'legs' ||
        l.selectionSet === 'legs' ||
        l.selectionSet === 'lower' ||
        (mask === 'auto' && defGroup === 'legs')
      );
    });

    const hasActiveTuckOrCurl = layersToProcess.some(l => {
      const w = getLayerEffectiveWeight(l);
      if (w <= 0.001) return false;
      const bKey = l.behavior;
      return bKey === 'tuckAndRoll' || bKey === 'bodyFoetal';
    });

    const isSuspendedByConstraint = Boolean(
      this.character?.activeConstrainedBones &&
      [...this.character.activeConstrainedBones].some(b =>
        ['LeftHand', 'RightHand', 'LeftForearm', 'RightForearm', 'LeftUpperArm', 'RightUpperArm', 'LeftShoulder', 'RightShoulder', 'UpperSpine', 'Neck', 'Head', 'Pelvis'].includes(b)
      )
    );

    const context = {
      time: this.time,
      sensors,
      pelvisY,
      isFallen,
      isFallingOrTilted,
      isAirborne,
      devX,
      devZ,
      fallDirZ,
      currentFrame,
      hasActiveArmLayer,
      hasActiveLegLayer,
      hasActiveTuckOrCurl,
      isSuspendedByConstraint,
      resolveTargetPos: (id, params) => this.resolveTargetPos(id, params),
      computeTargetAim: (pos) => this.computeTargetAim(pos)
    };

    const stackedLayers = [...layersToProcess].reverse();

    const isLimbSpecificLayer = (l) => {
      const mask = l.bodyPartMask || 'auto';
      if (mask === 'arms' || mask === 'legs' || mask === 'torso') return true;
      if (l.selectionSet && l.selectionSet !== 'all') return true;
      const bKey = l.behavior;
      const g = getBehaviorLimbGroup(bKey);
      return g === 'arms' || g === 'legs' || g === 'torso';
    };

    const isJointAffectedByLayer = (jointName, l) => {
      if (l.selectionSet && l.selectionSet !== 'all') {
        if (!isInSelectionSet(jointName, l.selectionSet)) return false;
      }
      const mask = l.bodyPartMask || 'auto';
      const jointGroup = getJointLimbGroup(jointName);
      if (mask === 'arms') return jointGroup === 'arms';
      if (mask === 'legs') return jointGroup === 'legs';
      if (mask === 'torso') return jointGroup === 'torso';
      if (mask === 'whole_body') return true;

      const bKey = l.behavior;
      const g = getBehaviorLimbGroup(bKey);
      if (g === 'arms') {
        if (jointGroup === 'arms') return true;
        if ((bKey === 'headProtect' || bKey === 'fallBackTwistCover' || bKey === 'fallbackTwistCoverFace') &&
            (jointName.includes('Neck') || jointName.includes('Head') || jointName.includes('UpperSpine'))) {
          return true;
        }
        if ((bKey === 'reachHold' || bKey === 'handsReachLookAt' || bKey === 'chestShove') &&
            (jointName.includes('UpperSpine') || jointName.includes('Neck') || jointName.includes('Head'))) {
          return true;
        }
        return false;
      }
      if (g === 'legs') return jointGroup === 'legs';
      if (g === 'torso') return jointGroup === 'torso';
      return true;
    };

    const wbLayers = stackedLayers.filter(l => !isLimbSpecificLayer(l));
    const limbLayers = stackedLayers.filter(l => isLimbSpecificLayer(l));

    // --- ENDORPHIN MULTI-LAYER LIMB-MASKED STACK-ORDERED BLENDING ---
    for (const j of this.character.joints) {
      const defaultTarget = new THREE.Vector3(0, 0, 0);
      if (this.baseRotations && this.baseRotations[j.childName]) {
        const rot = this.baseRotations[j.childName];
        defaultTarget.set(rot[0], rot[1], rot[2]);
      } else {
        if (j.name === 'LeftShoulder_to_LeftUpperArm') {
          defaultTarget.set(0.0, -0.15, -1.05);
        } else if (j.name === 'RightShoulder_to_RightUpperArm') {
          defaultTarget.set(0.0, 0.15, 1.05);
        } else if (j.name.includes('UpperArm_to_') && j.name.includes('Forearm')) {
          defaultTarget.set(0.35, 0, 0);
        }
      }

      const finalTarget = defaultTarget.clone();

      // 1. Whole-Body Baseline Pass
      for (const layer of wbLayers) {
        const w = Math.min(1.0, getLayerEffectiveWeight(layer));
        if (w <= 0.0001) continue;
        if (!isJointAffectedByLayer(j.name, layer)) continue;

        const t = this.computeSingleBehaviorTarget(layer.behavior, j, context, layer);
        if (t) {
          finalTarget.lerp(t, w);
        }
      }

      // 2. Limb-Specific Override Pass
      for (const layer of limbLayers) {
        const w = Math.min(1.0, getLayerEffectiveWeight(layer));
        if (w <= 0.0001) continue;
        if (!isJointAffectedByLayer(j.name, layer)) continue;

        const t = this.computeSingleBehaviorTarget(layer.behavior, j, context, layer);
        if (t) {
          finalTarget.lerp(t, w);
        }
      }

      // 3. Cervical Spine "Look At" Gaze Controller (if explicitly set via setLookAt)
      if (this.lookAtTarget && this.lookAtWeight > 0.001) {
        const headBody = this.character.bodies['Head'] || this.character.bodies['UpperSpine'];
        const headPos = headBody ? headBody.rigidBody.translation() : { x: 0, y: 1.6, z: 0 };
        const dx = this.lookAtTarget.x - headPos.x;
        const dy = this.lookAtTarget.y - headPos.y;
        const dz = this.lookAtTarget.z - headPos.z;
        const distHoriz = Math.hypot(dx, dz);

        if (distHoriz > 0.05) {
          const gazeYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.25, 1.25);
          const gazePitch = THREE.MathUtils.clamp(-Math.atan2(dy, distHoriz), -0.65, 0.75);
          const gw = this.lookAtWeight;

          if (j.name === 'Neck_to_Head') {
            finalTarget.y = THREE.MathUtils.lerp(finalTarget.y, gazeYaw * 0.45, gw);
            finalTarget.x = THREE.MathUtils.lerp(finalTarget.x, gazePitch * 0.45, gw);
          } else if (j.name === 'UpperSpine_to_Neck') {
            finalTarget.y = THREE.MathUtils.lerp(finalTarget.y, gazeYaw * 0.35, gw);
            finalTarget.x = THREE.MathUtils.lerp(finalTarget.x, gazePitch * 0.35, gw);
          } else if (j.name.includes('LowerSpine_to_UpperSpine')) {
            finalTarget.y = THREE.MathUtils.lerp(finalTarget.y, gazeYaw * 0.20, gw);
            finalTarget.x = THREE.MathUtils.lerp(finalTarget.x, gazePitch * 0.20, gw);
          }
        }
      }

      // 4. Ground Rest Relaxation
      const hasActiveExpressiveBehavior = Boolean(
        this.activeBehaviors.writhing ||
        this.activeBehaviors.headProtect ||
        this.activeBehaviors.tuckAndRoll ||
        this.activeBehaviors.pushUpRecovery ||
        this.activeBehaviors.bodyFoetal ||
        this.activeBehaviors.armsWindmill ||
        this.activeBehaviors.armsZombie ||
        this.activeBehaviors.armsRaised ||
        this.activeBehaviors.armsRaisedHead ||
        this.activeBehaviors.reachHold ||
        this.activeBehaviors.handsReachLookAt ||
        this.activeBehaviors.writheMidAir ||
        this.activeBehaviors.legsKick ||
        this.activeBehaviors.legsReach ||
        this.activeBehaviors.lookAt ||
        this.activeBehaviors.crouchPose ||
        this.activeBehaviors.landCrouch ||
        this.activeBehaviors.jump ||
        this.activeBehaviors.jumpAndDive ||
        this.activeBehaviors.jumpDive ||
        this.activeBehaviors.tackle ||
        this.activeBehaviors.fluid
      );
      if (isFallen && !hasActiveExpressiveBehavior) {
        finalTarget.multiplyScalar(0.20);
      }

      j.targetAngle.copy(finalTarget);
    }

    // 5. Original Endorphin VirtualMuscle Drive & Reach-Hold Proximity Auto-Latch
    if (typeof this.character.applyVirtualMuscleDrive === 'function') {
      for (const layer of layersToProcess) {
        const w = Math.min(1.0, getLayerEffectiveWeight(layer));
        if (w <= 0.01) continue;
        const bKey = layer.behavior;
        const int = layer.intensity ?? 1.0;

        if (bKey === 'catchFall' || bKey === 'fallBackTwistCatch' || bKey === 'fallbackTwistCatchFall') {
          if (isFallingOrTilted && !sensors.handsGrounded) {
            const predX = pelvisPos.x + sensors.comVelocity.x * 0.22;
            const predZ = pelvisPos.z + sensors.comVelocity.z * 0.25 + fallDirZ * 0.35;
            this.character.applyVirtualMuscleDrive('LeftArmVirtualMuscle', { x: predX + 0.22, y: 0.05, z: predZ }, { weight: 0.45 * w * int, calibration: 'reaching', dt });
            this.character.applyVirtualMuscleDrive('RightArmVirtualMuscle', { x: predX - 0.22, y: 0.05, z: predZ }, { weight: 0.45 * w * int, calibration: 'reaching', dt });
          }
        } else if (bKey === 'reachHold' || bKey === 'handsReachLookAt') {
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          if (targetPos) {
            const reachHand = layer.reachHand || 'both';
            if (reachHand === 'both' || reachHand === 'left') {
              this.character.applyVirtualMuscleDrive('LeftArmVirtualMuscle', targetPos, { weight: 0.55 * w * int, calibration: 'reaching', dt });
              const lHand = this.character.bodies['LeftHand'];
              if (bKey === 'reachHold' && lHand?.rigidBody) {
                const lh = lHand.rigidBody.translation();
                const distL = Math.hypot(targetPos.x - lh.x, targetPos.y - lh.y, targetPos.z - lh.z);
                if (distL <= 0.26) {
                  lHand.rigidBody.applyImpulse({
                    x: (targetPos.x - lh.x) * 420.0 * w * dt,
                    y: (targetPos.y - lh.y) * 420.0 * w * dt,
                    z: (targetPos.z - lh.z) * 420.0 * w * dt
                  }, true);
                }
              }
            }
            if (reachHand === 'both' || reachHand === 'right') {
              this.character.applyVirtualMuscleDrive('RightArmVirtualMuscle', targetPos, { weight: 0.55 * w * int, calibration: 'reaching', dt });
              const rHand = this.character.bodies['RightHand'];
              if (bKey === 'reachHold' && rHand?.rigidBody) {
                const rh = rHand.rigidBody.translation();
                const distR = Math.hypot(targetPos.x - rh.x, targetPos.y - rh.y, targetPos.z - rh.z);
                if (distR <= 0.26) {
                  rHand.rigidBody.applyImpulse({
                    x: (targetPos.x - rh.x) * 420.0 * w * dt,
                    y: (targetPos.y - rh.y) * 420.0 * w * dt,
                    z: (targetPos.z - rh.z) * 420.0 * w * dt
                  }, true);
                }
              }
            }
          }
        } else if (bKey === 'legsReach') {
          const targetPos = this.resolveTargetPos(layer.targetObject, layer);
          if (targetPos) {
            this.character.applyVirtualMuscleDrive('LeftLegVirtualMuscle', { x: targetPos.x + 0.12, y: targetPos.y, z: targetPos.z }, { weight: 0.45 * w * int, calibration: 'reaching', dt });
            this.character.applyVirtualMuscleDrive('RightLegVirtualMuscle', { x: targetPos.x - 0.12, y: targetPos.y, z: targetPos.z }, { weight: 0.45 * w * int, calibration: 'reaching', dt });
          } else if (isAirborne) {
            this.character.applyVirtualMuscleDrive('LeftLegVirtualMuscle', { x: pelvisPos.x + 0.14, y: 0.04, z: pelvisPos.z + 0.15 }, { weight: 0.35 * w * int, calibration: 'reaching', dt });
            this.character.applyVirtualMuscleDrive('RightLegVirtualMuscle', { x: pelvisPos.x - 0.14, y: 0.04, z: pelvisPos.z + 0.15 }, { weight: 0.35 * w * int, calibration: 'reaching', dt });
          }
        } else if (bKey === 'stagger' && !isFallen && (Math.abs(devX) > 0.08 || Math.abs(devZ) > 0.08)) {
          const staggerPhase = this.time * 8.5 * (layer.speed ?? 1.0);
          const stepSide = Math.sin(staggerPhase) >= 0 ? 1 : -1;
          const stepLimb = stepSide > 0 ? 'LeftLegVirtualMuscle' : 'RightLegVirtualMuscle';
          const stepTarget = {
            x: baseCenter.x + (stepSide * 0.14) + comErrX * 1.35,
            y: 0.04,
            z: baseCenter.z + comErrZ * 1.35
          };
          this.character.applyVirtualMuscleDrive(stepLimb, stepTarget, { weight: 0.35 * w * int, calibration: 'balancing', dt });
        }
      }
    }
  }
}
