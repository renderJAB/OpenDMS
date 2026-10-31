import * as THREE from 'three';

/**
 * Resample simulation keyframes to any arbitrary output frame rate (e.g. 24, 25, 30, 60, 120 fps).
 * Uses 3D linear position interpolation and spherical quaternion interpolation (SLERP) for highest motion fidelity.
 * 
 * @param {Array<Object>} recordedFrames - Raw timeline simulationCache array.
 * @param {number} sourceFps - Original simulation frame rate (default: 60).
 * @param {number} targetFps - Desired export/output frame rate (e.g. 24, 30, 60, 120).
 * @returns {Array<Object>} Temporally resampled frame array matching real-world duration.
 */
export function resampleSimulationFrames(recordedFrames, sourceFps = 60, targetFps = 60) {
  if (!recordedFrames || recordedFrames.length === 0) return [];
  const sFps = Math.max(1, Number(sourceFps) || 60);
  const tFps = Math.max(1, Number(targetFps) || sFps);

  const validFrames = recordedFrames.filter(f => f && (f.bodies || (f.actors && Object.keys(f.actors).length > 0)));
  if (validFrames.length === 0) return [];
  if (sFps === tFps || validFrames.length === 1) return validFrames;

  const totalDuration = (validFrames.length - 1) / sFps;
  const numTargetFrames = Math.max(2, Math.round(totalDuration * tFps) + 1);
  const resampled = [];

  const interpolateBodyMap = (b0Map, b1Map, alpha) => {
    const out = {};
    const keys = new Set([...Object.keys(b0Map || {}), ...Object.keys(b1Map || {})]);
    for (const k of keys) {
      const b0 = b0Map?.[k];
      const b1 = b1Map?.[k];
      if (b0 && b1 && b0.position && b1.position && b0.rotation && b1.rotation) {
        const p0 = b0.position;
        const p1 = b1.position;
        const px = p0[0] + (p1[0] - p0[0]) * alpha;
        const py = p0[1] + (p1[1] - p0[1]) * alpha;
        const pz = p0[2] + (p1[2] - p0[2]) * alpha;

        const q0 = new THREE.Quaternion(b0.rotation[0], b0.rotation[1], b0.rotation[2], b0.rotation[3]);
        const q1 = new THREE.Quaternion(b1.rotation[0], b1.rotation[1], b1.rotation[2], b1.rotation[3]);
        q0.slerp(q1, alpha);

        out[k] = {
          position: [px, py, pz],
          rotation: [q0.x, q0.y, q0.z, q0.w]
        };
      } else if (b0) {
        out[k] = {
          position: b0.position ? [...b0.position] : [0, 0, 0],
          rotation: b0.rotation ? [...b0.rotation] : [0, 0, 0, 1]
        };
      } else if (b1) {
        out[k] = {
          position: b1.position ? [...b1.position] : [0, 0, 0],
          rotation: b1.rotation ? [...b1.rotation] : [0, 0, 0, 1]
        };
      }
    }
    return out;
  };

  for (let k = 0; k < numTargetFrames; k++) {
    const t = Math.min(totalDuration, k / tFps);
    const srcIndex = t * sFps;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(validFrames.length - 1, i0 + 1);
    const alpha = srcIndex - i0;

    const f0 = validFrames[i0];
    const f1 = validFrames[i1];

    if (alpha <= 0.0001) {
      resampled.push({
        ...f0,
        frame: k,
        time: t
      });
      continue;
    }

    if (alpha >= 0.9999) {
      resampled.push({
        ...f1,
        frame: k,
        time: t
      });
      continue;
    }

    const frameData = {
      frame: k,
      time: t,
      bodies: {},
      actors: {},
      props: {},
      constraints: f0.constraints || {},
      layerTriggers: f0.layerTriggers || {}
    };

    if (f0.bodies || f1.bodies) {
      frameData.bodies = interpolateBodyMap(f0.bodies, f1.bodies, alpha);
    }

    if (f0.actors || f1.actors) {
      const actorIds = new Set([...Object.keys(f0.actors || {}), ...Object.keys(f1.actors || {})]);
      for (const aId of actorIds) {
        frameData.actors[aId] = {
          bodies: interpolateBodyMap(f0.actors?.[aId]?.bodies, f1.actors?.[aId]?.bodies, alpha)
        };
      }
    }

    if (f0.props || f1.props) {
      frameData.props = interpolateBodyMap(f0.props, f1.props, alpha);
    }

    resampled.push(frameData);
  }

  return resampled;
}
