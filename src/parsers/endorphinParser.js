import pako from 'pako';

export class EndorphinParser {
  // Converts 8-character IEEE-754 hex string (e.g. "3f800000") to float
  static hexToFloat(hexStr) {
    if (!hexStr || hexStr.length !== 8) return 0.0;
    const intVal = parseInt(hexStr, 16);
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, intVal, false); // Big endian
    return view.getFloat32(0, false);
  }

  // Decompresses binary endorphin file array buffer (.nmc, .ens, .nma, .nme, .nmw, .nmb, .cmf)
  static decompressFile(arrayBuffer) {
    const uint8 = new Uint8Array(arrayBuffer);
    if (uint8.length === 0) return '';

    // Check for Endorphin 2.5.2 / 2.7.1 20-byte trailer:
    // [4-byte LE uncompressed size] + 16-byte magic: 72 a0 05 a1 c1 9e 8d e3 cc 94 70 05 d5 de 53 63
    const ENDORPHIN_TRAILER_MAGIC = [
      0x72, 0xa0, 0x05, 0xa1, 0xc1, 0x9e, 0x8d, 0xe3,
      0xcc, 0x94, 0x70, 0x05, 0xd5, 0xde, 0x53, 0x63
    ];
    let payloadEnd = uint8.length;
    if (uint8.length > 22) {
      let hasTrailer = true;
      const magicStart = uint8.length - 16;
      for (let i = 0; i < 16; i++) {
        if (uint8[magicStart + i] !== ENDORPHIN_TRAILER_MAGIC[i]) {
          hasTrailer = false;
          break;
        }
      }
      if (hasTrailer) {
        payloadEnd = uint8.length - 20;
      }
    }

    // Check for zlib header at offset 0 (0x78 0x01 / 0x78 0x9c / 0x78 0xda) or offset 4 (4-byte length prefix)
    let payloadStart = -1;
    if (uint8[0] === 0x78 && (uint8[1] === 0x01 || uint8[1] === 0x9c || uint8[1] === 0xda || uint8[1] === 0x5e)) {
      payloadStart = 0;
    } else if (uint8.length > 6 && uint8[4] === 0x78 && (uint8[5] === 0x01 || uint8[5] === 0x9c || uint8[5] === 0xda || uint8[5] === 0x5e)) {
      payloadStart = 4;
    }

    if (payloadStart >= 0) {
      const slice = uint8.subarray(payloadStart, payloadEnd);
      try {
        const decompressed = pako.inflate(slice);
        return new TextDecoder('utf-8').decode(decompressed);
      } catch (e) {
        try {
          const decompressed = pako.inflate(uint8.subarray(payloadStart));
          return new TextDecoder('utf-8').decode(decompressed);
        } catch (e2) {
          console.warn('Zlib inflate failed directly, attempting raw deflate', e2);
          const rawSlice = slice.subarray(2, Math.max(2, slice.length - 4));
          const decompressed = pako.inflateRaw(rawSlice);
          return new TextDecoder('utf-8').decode(decompressed);
        }
      }
    }
    return new TextDecoder('utf-8').decode(uint8);
  }

  // Parses .nmc (Character) XML
  static parseCharacterNMC(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    
    const characterNode = doc.querySelector('Character');
    if (!characterNode) throw new Error('Invalid NMC: Missing <Character> root node');

    const metaBodies = [];
    const metaBodyNodes = doc.querySelectorAll('MetaBody');

    metaBodyNodes.forEach(node => {
      const name = node.getAttribute('name');
      const collisions = [];
      const colNodes = node.querySelectorAll('CollisionSurface');

      colNodes.forEach(col => {
        const colName = col.getAttribute('name');
        const material = col.getAttribute('material');
        const geomNode = col.querySelector('Geometry');
        const geomType = geomNode ? geomNode.getAttribute('type') : 'Sphere';
        const p0Hex = geomNode ? geomNode.getAttribute('bparam0') : '00000000';
        const p1Hex = geomNode ? geomNode.getAttribute('bparam1') : '00000000';

        collisions.push({
          name: colName,
          material,
          type: geomType,
          param0: this.hexToFloat(p0Hex),
          param1: this.hexToFloat(p1Hex)
        });
      });

      metaBodies.push({
        name,
        collisions
      });
    });

    const skeletalJoints = [];
    const jointNodes = doc.querySelectorAll('SkeletalJoint, Hinge');
    jointNodes.forEach(j => {
      const name = j.getAttribute('name');
      const metaBody = j.getAttribute('metaBody');
      const softLimits = j.querySelector('SoftLimits');
      const hardLimits = j.querySelector('HardLimits');

      skeletalJoints.push({
        name,
        metaBody,
        softLimits: softLimits ? {
          twistSize: this.hexToFloat(softLimits.getAttribute('btwistSize')),
          swing1Size: this.hexToFloat(softLimits.getAttribute('bswing1Size')),
          swing2Size: this.hexToFloat(softLimits.getAttribute('bswing2Size')),
          twistStiffness: this.hexToFloat(softLimits.getAttribute('btwistStiffness')),
          swingStiffness: this.hexToFloat(softLimits.getAttribute('bswingStiffness')),
          twistDamping: this.hexToFloat(softLimits.getAttribute('btwistDamping')),
          swingDamping: this.hexToFloat(softLimits.getAttribute('bswingDamping'))
        } : null,
        hardLimits: hardLimits ? {
          twistSize: this.hexToFloat(hardLimits.getAttribute('btwistSize')),
          swing1Size: this.hexToFloat(hardLimits.getAttribute('bswing1Size')),
          swing2Size: this.hexToFloat(hardLimits.getAttribute('bswing2Size'))
        } : null
      });
    });

    return {
      characterName: characterNode.getAttribute('name'),
      buildVersion: characterNode.getAttribute('buildVersion'),
      metaBodies,
      skeletalJoints
    };
  }

  // Parses .nme (Engine settings) XML
  static parseEngineNME(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const worldParams = doc.querySelector('WorldParams');
    const gravity = doc.querySelector('Gravity');
    
    return {
      timeStepSize: worldParams ? parseFloat(worldParams.getAttribute('timeStepSize')) : 0.008333333,
      gravity: gravity ? {
        x: this.hexToFloat(gravity.getAttribute('bx')),
        y: this.hexToFloat(gravity.getAttribute('by')),
        z: this.hexToFloat(gravity.getAttribute('bz'))
      } : { x: 0, y: -9.81, z: 0 }
    };
  }

  // Parses .ens (Endorphin Scene) XML into OpenDMS timeline tracks & environment props
  static parseSceneENS(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const fps = 60;

    const behaviors = [];
    const behaviorMap = {
      'Hands and Knees Catch Fall': 'catchFall',
      'Catch Fall': 'catchFall',
      'Balance': 'balance',
      'Balance With Props': 'balanceWithProps',
      'Stagger': 'stagger',
      'Arms Windmill': 'armsWindmill',
      'Hands Reach and Look At': 'reachHold',
      'Hands Reach': 'reachHold',
      'Look At': 'lookAt',
      'Legs Kick': 'legsKick',
      'Legs Reach': 'legsReach',
      'Legs Straighten': 'legsStraighten',
      'Body Foetal': 'bodyFoetal',
      'Body Tuck and Roll': 'tuckAndRoll',
      'Jump': 'jump',
      'Jump and Dive': 'jumpDive',
      'Tackle': 'tackle',
      'Fluid': 'fluid',
      'Pusher': 'pusher',
      'Twister': 'twister',
      'Writhe': 'writhing',
      'Writhe in Mid-Air': 'writheMidAir',
      'Hands Covering Face': 'headProtect'
    };

    doc.querySelectorAll('BehaviourEvent, BehaviorEvent, Behaviour').forEach((node, idx) => {
      const rawName = node.getAttribute('behaviourName') || node.getAttribute('name') || node.getAttribute('type') || 'Catch Fall';
      const startSec = parseFloat(node.getAttribute('startTime') || node.getAttribute('start') || '0');
      const endSec = parseFloat(node.getAttribute('endTime') || node.getAttribute('end') || (startSec + 2.0));
      const weight = parseFloat(node.getAttribute('weight') || node.getAttribute('blendWeight') || '1.0');
      const startFrame = startSec > 10 ? Math.round(startSec) : Math.round(startSec * fps);
      const endFrame = endSec > 10 ? Math.round(endSec) : Math.max(startFrame + 15, Math.round(endSec * fps));
      const mappedKey = behaviorMap[rawName] || (rawName.toLowerCase().includes('catch') ? 'catchFall' :
        rawName.toLowerCase().includes('balance') ? 'balance' :
        rawName.toLowerCase().includes('stagger') ? 'stagger' :
        rawName.toLowerCase().includes('reach') ? 'reachHold' :
        rawName.toLowerCase().includes('jump') ? 'jump' :
        rawName.toLowerCase().includes('foetal') ? 'bodyFoetal' :
        rawName.toLowerCase().includes('windmill') ? 'armsWindmill' : 'catchFall');
      behaviors.push({
        name: rawName,
        behavior: mappedKey,
        startFrame,
        endFrame,
        intensity: isNaN(weight) ? 1.0 : weight
      });
    });

    const forces = [];
    doc.querySelectorAll('ForceEvent, Force, ImpulseEvent').forEach((node) => {
      const targetBody = node.getAttribute('bodyPart') || node.getAttribute('targetBody') || 'UpperSpine';
      const startSec = parseFloat(node.getAttribute('startTime') || node.getAttribute('start') || '0.25');
      const endSec = parseFloat(node.getAttribute('endTime') || node.getAttribute('end') || (startSec + 0.15));
      const mag = parseFloat(node.getAttribute('magnitude') || node.getAttribute('strength') || '45');
      const startFrame = startSec > 10 ? Math.round(startSec) : Math.round(startSec * fps);
      const endFrame = endSec > 10 ? Math.round(endSec) : Math.max(startFrame + 6, Math.round(endSec * fps));
      forces.push({
        targetBody,
        startFrame,
        endFrame,
        magnitude: isNaN(mag) ? 45 : mag
      });
    });

    const constraints = [];
    doc.querySelectorAll('ConstraintEvent, Constraint').forEach((node) => {
      const targetBody = node.getAttribute('bodyPart') || node.getAttribute('targetBody') || 'LeftHand';
      const startSec = parseFloat(node.getAttribute('startTime') || node.getAttribute('start') || '0');
      const endSec = parseFloat(node.getAttribute('endTime') || node.getAttribute('end') || (startSec + 2.0));
      const startFrame = startSec > 10 ? Math.round(startSec) : Math.round(startSec * fps);
      const endFrame = endSec > 10 ? Math.round(endSec) : Math.max(startFrame + 15, Math.round(endSec * fps));
      constraints.push({
        targetBody,
        startFrame,
        endFrame,
        constraintType: node.getAttribute('type') === 'Hold' ? 'HOLD_PROXIMITY' : 'lock'
      });
    });

    return {
      behaviors,
      forces,
      constraints
    };
  }

  // Parses .nma (Endorphin Pose / Animation) XML
  static parsePoseNMA(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const localRotations = {};
    doc.querySelectorAll('Joint, Bone, Transform').forEach((node) => {
      const name = node.getAttribute('name') || node.getAttribute('jointName');
      if (!name) return;
      const rx = node.getAttribute('brx') ? this.hexToFloat(node.getAttribute('brx')) : parseFloat(node.getAttribute('rx') || '0');
      const ry = node.getAttribute('bry') ? this.hexToFloat(node.getAttribute('bry')) : parseFloat(node.getAttribute('ry') || '0');
      const rz = node.getAttribute('brz') ? this.hexToFloat(node.getAttribute('brz')) : parseFloat(node.getAttribute('rz') || '0');
      if (!isNaN(rx) && !isNaN(ry) && !isNaN(rz)) {
        localRotations[name] = [rx, ry, rz];
      }
    });
    return { localRotations };
  }
}
