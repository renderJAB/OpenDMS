import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { BVH_BONE_ORDER } from './exportBVH.js';
import { SKELETON_TREE } from '../core/character.js';

/**
 * Safely clones a Three.js Object3D hierarchy without throwing "Converting circular structure to JSON"
 * errors caused by physics engine instances (e.g. rigidBody / colliderSet) inside mesh.userData.
 *
 * @param {THREE.Object3D} src Object to clone
 * @returns {THREE.Object3D} Cleanly cloned object with sanitized userData
 */
export function safeCloneObject(src) {
  if (!src) return null;

  // 1. Temporarily backup original userData and replace with serializable primitives
  const savedUserData = [];
  src.traverse((child) => {
    savedUserData.push({ node: child, userData: child.userData });
    const clean = {};
    if (child.userData) {
      for (const [k, v] of Object.entries(child.userData)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          clean[k] = v;
        }
      }
    }
    child.userData = clean;
  });

  // 2. Clone safely via Three.js (which internally runs JSON.stringify on userData)
  let cloned;
  try {
    cloned = src.clone(true);
  } catch (err) {
    console.warn('safeCloneObject fallback for:', src.name, err);
    cloned = new THREE.Group();
    cloned.name = src.name;
  }

  // 3. Restore original userData on source nodes
  for (const item of savedUserData) {
    item.node.userData = item.userData;
  }

  return cloned;
}

/**
 * Sanitizes an Object3D hierarchy for GLTF export by stripping any non-primitive
 * or circular properties from userData.
 */
export function sanitizeHierarchyForExport(root) {
  if (!root) return;
  root.traverse((node) => {
    if (node.userData) {
      const clean = {};
      for (const [k, v] of Object.entries(node.userData)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          clean[k] = v;
        }
      }
      node.userData = clean;
    }
  });
}

/**
 * Exports the full simulated scene (all 19 character segments + physical props)
 * into a self-contained binary .glb file with embedded animation tracks.
 *
 * @param {Object} character BiomechanicalCharacter instance
 * @param {Object} propsManager PropsManager instance
 * @param {Array<Object>} recordedFrames simulationCache array
 * @param {number} fps Simulation frame rate (default: 60)
 * @param {Object} options Additional export options
 * @returns {Promise<ArrayBuffer>} The GLB file buffer
 */
export async function exportSceneToGLB(character, propsManager, recordedFrames, fps = 60, options = {}) {
  const validFrames = (recordedFrames || []).filter(f => f && (f.bodies || (f.actors && Object.keys(f.actors).length > 0)));
  if (validFrames.length === 0) {
    throw new Error('No simulation frames to export. Please simulate first.');
  }

  const exportRoot = new THREE.Group();
  exportRoot.name = 'OpenDMS_Simulation_Scene';

  const charGroup = new THREE.Group();
  charGroup.name = 'Character';
  exportRoot.add(charGroup);

  // 1. Gather character body meshes using safeCloneObject
  const bodyMeshes = {};
  if (character && character.bodies) {
    for (const [name, b] of Object.entries(character.bodies)) {
      if (b && b.mesh) {
        const clonedMesh = safeCloneObject(b.mesh);
        clonedMesh.name = name;
        charGroup.add(clonedMesh);
        bodyMeshes[name] = clonedMesh;
      }
    }
  }

  // Optional Actor 2 meshes if present
  const actor2Character = options.actor2Character || null;
  const actor2Meshes = {};
  if (actor2Character && actor2Character.bodies) {
    const char2Group = new THREE.Group();
    char2Group.name = 'Character_2';
    exportRoot.add(char2Group);
    for (const [name, b] of Object.entries(actor2Character.bodies)) {
      if (b && b.mesh) {
        const clonedMesh = safeCloneObject(b.mesh);
        const nodeName = `Actor2_${name}`;
        clonedMesh.name = nodeName;
        char2Group.add(clonedMesh);
        actor2Meshes[name] = { mesh: clonedMesh, nodeName };
      }
    }
  }

  // 2. Gather props meshes using safeCloneObject
  const propsGroup = new THREE.Group();
  propsGroup.name = 'Physical_Props';
  exportRoot.add(propsGroup);

  const propMeshes = {};
  if (propsManager && propsManager.props) {
    for (const p of propsManager.props) {
      if (p && p.mesh) {
        const clonedProp = safeCloneObject(p.mesh);
        clonedProp.name = p.id;
        propsGroup.add(clonedProp);
        propMeshes[p.id] = clonedProp;
      }
    }
  }

  // 3. Construct animation tracks from simulationCache
  const numFrames = validFrames.length;
  const times = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    times[i] = i / fps;
  }

  const tracks = [];

  // Character 1 body tracks
  for (const name of Object.keys(bodyMeshes)) {
    const posValues = new Float32Array(numFrames * 3);
    const rotValues = new Float32Array(numFrames * 4);

    for (let i = 0; i < numFrames; i++) {
      const f = validFrames[i];
      const bData = f.actors?.['actor-1']?.bodies?.[name] || f.bodies?.[name];
      const pos = bData?.position || [0, 0, 0];
      const rot = bData?.rotation || [0, 0, 0, 1];

      posValues[i * 3 + 0] = pos[0];
      posValues[i * 3 + 1] = pos[1];
      posValues[i * 3 + 2] = pos[2];

      rotValues[i * 4 + 0] = rot[0];
      rotValues[i * 4 + 1] = rot[1];
      rotValues[i * 4 + 2] = rot[2];
      rotValues[i * 4 + 3] = rot[3];
    }

    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, posValues));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotValues));
  }

  // Character 2 body tracks (if Actor 2 is active)
  for (const [name, info] of Object.entries(actor2Meshes)) {
    const posValues = new Float32Array(numFrames * 3);
    const rotValues = new Float32Array(numFrames * 4);

    for (let i = 0; i < numFrames; i++) {
      const f = validFrames[i];
      const bData = f.actors?.['actor-2']?.bodies?.[name];
      const pos = bData?.position || [0, 0, 0];
      const rot = bData?.rotation || [0, 0, 0, 1];

      posValues[i * 3 + 0] = pos[0];
      posValues[i * 3 + 1] = pos[1];
      posValues[i * 3 + 2] = pos[2];

      rotValues[i * 4 + 0] = rot[0];
      rotValues[i * 4 + 1] = rot[1];
      rotValues[i * 4 + 2] = rot[2];
      rotValues[i * 4 + 3] = rot[3];
    }

    tracks.push(new THREE.VectorKeyframeTrack(`${info.nodeName}.position`, times, posValues));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${info.nodeName}.quaternion`, times, rotValues));
  }

  // Props tracks
  for (const propId of Object.keys(propMeshes)) {
    const posValues = new Float32Array(numFrames * 3);
    const rotValues = new Float32Array(numFrames * 4);
    let hasMotion = false;

    for (let i = 0; i < numFrames; i++) {
      const pData = validFrames[i].props?.[propId];
      if (pData) {
        hasMotion = true;
        posValues[i * 3 + 0] = pData.position[0];
        posValues[i * 3 + 1] = pData.position[1];
        posValues[i * 3 + 2] = pData.position[2];

        rotValues[i * 4 + 0] = pData.rotation[0];
        rotValues[i * 4 + 1] = pData.rotation[1];
        rotValues[i * 4 + 2] = pData.rotation[2];
        rotValues[i * 4 + 3] = pData.rotation[3];
      } else {
        const m = propMeshes[propId];
        posValues[i * 3 + 0] = m.position.x;
        posValues[i * 3 + 1] = m.position.y;
        posValues[i * 3 + 2] = m.position.z;

        rotValues[i * 4 + 0] = m.quaternion.x;
        rotValues[i * 4 + 1] = m.quaternion.y;
        rotValues[i * 4 + 2] = m.quaternion.z;
        rotValues[i * 4 + 3] = m.quaternion.w;
      }
    }

    if (hasMotion) {
      tracks.push(new THREE.VectorKeyframeTrack(`${propId}.position`, times, posValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${propId}.quaternion`, times, rotValues));
    }
  }

  const duration = (numFrames - 1) / fps;
  const clip = new THREE.AnimationClip('OpenDMS_Simulation', duration, tracks);

  // 4. Sanitize hierarchy before export
  sanitizeHierarchyForExport(exportRoot);

  // 5. Export GLB
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      exportRoot,
      (gltf) => {
        resolve(gltf);
      },
      (error) => {
        reject(error);
      },
      {
        binary: true,
        animations: [clip],
        embedImages: true,
        ...options
      }
    );
  });
}

/**
 * Exports an authentic humanoid Armature with a 19-bone hierarchy and embedded
 * skeletal animation into a binary .glb file. Fully compatible with Blender, Maya, and UE5.
 *
 * @param {Array<Object>} recordedFrames simulationCache array
 * @param {number} fps Simulation frame rate (default: 60)
 * @param {Object} options Additional export options
 * @returns {Promise<ArrayBuffer>} The GLB file buffer
 */
export async function exportArmatureToGLB(recordedFrames, fps = 60, options = {}) {
  const actorId = options.actorId || 'actor-1';
  const getFrameBodies = (f) => {
    if (!f) return null;
    if (f.actors && f.actors[actorId] && f.actors[actorId].bodies) return f.actors[actorId].bodies;
    if (f.bodies) return f.bodies;
    return null;
  };
  const validFrames = (recordedFrames || []).filter(f => getFrameBodies(f));
  if (validFrames.length === 0) {
    throw new Error('No simulation frames to export. Please simulate first.');
  }

  // 1. Build the Bone hierarchy matching SKELETON_TREE
  const bones = {};
  const rootBone = new THREE.Bone();
  rootBone.name = 'Pelvis';
  rootBone.position.set(...(SKELETON_TREE['Pelvis']?.offset || [0, 0.95, 0]));
  bones['Pelvis'] = rootBone;

  for (const item of BVH_BONE_ORDER) {
    if (!item.parent) continue;
    const bone = new THREE.Bone();
    bone.name = item.name;
    const offset = SKELETON_TREE[item.name]?.offset || [0, 0, 0];
    bone.position.set(offset[0], offset[1], offset[2]);
    bones[item.name] = bone;
    bones[item.parent].add(bone);
  }

  // 2. Build bone animation tracks with local relative rotations
  const numFrames = validFrames.length;
  const times = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    times[i] = i / fps;
  }

  const tracks = [];

  // Pelvis root translation & rotation
  const pPosValues = new Float32Array(numFrames * 3);
  const pRotValues = new Float32Array(numFrames * 4);

  for (let i = 0; i < numFrames; i++) {
    const bodies = getFrameBodies(validFrames[i]);
    const pData = bodies['Pelvis'];
    const pPos = pData?.position || [0, 0.95, 0];
    const pRot = pData?.rotation || [0, 0, 0, 1];

    pPosValues[i * 3 + 0] = pPos[0];
    pPosValues[i * 3 + 1] = pPos[1];
    pPosValues[i * 3 + 2] = pPos[2];

    pRotValues[i * 4 + 0] = pRot[0];
    pRotValues[i * 4 + 1] = pRot[1];
    pRotValues[i * 4 + 2] = pRot[2];
    pRotValues[i * 4 + 3] = pRot[3];
  }

  tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, pPosValues));
  tracks.push(new THREE.QuaternionKeyframeTrack('Pelvis.quaternion', times, pRotValues));

  // Child bones local rotations: qLocal = qParent^-1 * qChild
  for (const item of BVH_BONE_ORDER) {
    if (!item.parent) continue;

    const rotValues = new Float32Array(numFrames * 4);

    for (let i = 0; i < numFrames; i++) {
      const bodies = getFrameBodies(validFrames[i]);
      const pRot = bodies[item.parent]?.rotation || [0, 0, 0, 1];
      const cRot = bodies[item.name]?.rotation || [0, 0, 0, 1];

      const qP = new THREE.Quaternion(pRot[0], pRot[1], pRot[2], pRot[3]).normalize();
      const qC = new THREE.Quaternion(cRot[0], cRot[1], cRot[2], cRot[3]).normalize();

      const qLocal = qP.invert().multiply(qC).normalize();

      rotValues[i * 4 + 0] = qLocal.x;
      rotValues[i * 4 + 1] = qLocal.y;
      rotValues[i * 4 + 2] = qLocal.z;
      rotValues[i * 4 + 3] = qLocal.w;
    }

    tracks.push(new THREE.QuaternionKeyframeTrack(`${item.name}.quaternion`, times, rotValues));
  }

  const duration = (numFrames - 1) / fps;
  const clip = new THREE.AnimationClip('OpenDMS_Armature_Motion', duration, tracks);

  // 3. Create Authentic Skinned Armature Mesh for DCC Import (Blender / UE5 / Unity)
  // GLTFExporter requires a SkinnedMesh with an active THREE.Skeleton to serialize a glTF 'skins' entry.
  // Without this, Blender imports empty object nodes rather than an Armature object.
  const boneList = [rootBone];
  for (const item of BVH_BONE_ORDER) {
    if (item.parent && bones[item.name]) {
      boneList.push(bones[item.name]);
    }
  }

  // Pre-calculate bind world positions of all bones
  const worldPosMap = {};
  rootBone.updateMatrixWorld(true);
  for (const b of boneList) {
    const wp = new THREE.Vector3();
    b.getWorldPosition(wp);
    worldPosMap[b.name] = wp;
  }

  const positions = [];
  const normals = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
  let vertexOffset = 0;

  boneList.forEach((bone, bIdx) => {
    const bName = bone.name;
    const wp = worldPosMap[bName] || bone.position;

    const r = (bName.includes('Spine') || bName === 'Pelvis') ? 0.08 :
              (bName === 'Head') ? 0.09 :
              (bName.includes('Thigh') || bName.includes('Calf')) ? 0.05 :
              (bName.includes('Arm') || bName.includes('Forearm')) ? 0.04 : 0.03;
    const h = (bName === 'Pelvis') ? 0.12 :
              (bName.includes('Spine')) ? 0.15 :
              (bName === 'Head') ? 0.15 :
              (bName.includes('Calf') || bName.includes('Thigh')) ? 0.32 :
              (bName.includes('Forearm') || bName.includes('UpperArm')) ? 0.22 : 0.10;

    const segGeo = new THREE.BoxGeometry(r * 2, h, r * 2);
    segGeo.translate(wp.x, wp.y, wp.z);

    const posAttr = segGeo.attributes.position;
    const normAttr = segGeo.attributes.normal;
    const idxAttr = segGeo.index;

    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      skinIndices.push(bIdx, 0, 0, 0);
      skinWeights.push(1.0, 0, 0, 0);
    }

    if (idxAttr) {
      for (let i = 0; i < idxAttr.count; i++) {
        indices.push(idxAttr.getX(i) + vertexOffset);
      }
    }
    vertexOffset += posAttr.count;
    segGeo.dispose();
  });

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mergedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  mergedGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  mergedGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  mergedGeo.setIndex(indices);

  const skeleton = new THREE.Skeleton(boneList);
  const material = new THREE.MeshStandardMaterial({
    color: actorId === 'actor-2' ? 0xfb923c : 0x38bdf8,
    roughness: 0.6,
    metalness: 0.1,
    name: 'Humanoid_Armature_Material'
  });

  const skinnedMesh = new THREE.SkinnedMesh(mergedGeo, material);
  skinnedMesh.name = actorId === 'actor-2' ? 'Enemy_Humanoid_Mesh' : 'Hero_Humanoid_Mesh';
  skinnedMesh.add(rootBone);
  skinnedMesh.bind(skeleton);

  // 4. Create Armature container
  const armatureGroup = new THREE.Group();
  armatureGroup.name = actorId === 'actor-2' ? 'Enemy_Armature' : 'Hero_Armature';
  armatureGroup.add(skinnedMesh);

  // 5. Sanitize hierarchy
  sanitizeHierarchyForExport(armatureGroup);

  // 6. Export GLB
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      armatureGroup,
      (gltf) => {
        resolve(gltf);
      },
      (error) => {
        reject(error);
      },
      {
        binary: true,
        animations: [clip],
        ...options
      }
    );
  });
}

/**
 * Triggers a file download in the browser for an ArrayBuffer or Blob.
 */
export function downloadBinaryFile(buffer, filename, mimeType = 'application/octet-stream') {
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
