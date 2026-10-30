/**
 * OpenDMS Dynamic Motion Synthesis - History / Undo-Redo Manager
 * 
 * Provides professional DCC multi-step undo and redo capabilities (Ctrl+Z / Ctrl+Y).
 * Captures lightweight serializable scene snapshots covering:
 *  - Timeline layers & keyframe tracks
 *  - Scene physical props (positions, rotations, types, sizes)
 *  - Actor 1 & Actor 2 staging and presence
 *  - Timeline duration & playhead framing
 *  - Environmental parameters (stiffness, wind, vortex, material)
 */

export class HistoryManager {
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || 50;
    this.undoStack = [];
    this.redoStack = [];
    this.isRestoring = false;
    this.context = null;
  }

  init(context) {
    this.context = context;
    this.updateUI();
  }

  // Create snapshot of current scene state
  captureState(actionLabel = 'Action') {
    if (this.isRestoring || !this.context) return null;

    const { timeline, propsManager, character, getActor2, getEnvironment } = this.context;
    if (!timeline) return null;

    try {
      const snapshot = {
        label: actionLabel,
        timestamp: Date.now(),

        // 1. Timeline layers & duration
        totalFrames: timeline.totalFrames || 240,
        selectedLayerId: timeline.selectedLayerId,
        layers: JSON.parse(JSON.stringify(timeline.layers || [])),

        // 2. Physical props
        props: (propsManager?.props || []).map(p => ({
          id: p.id,
          name: p.name,
          shapeType: p.shapeType || p.type || 'box',
          type: p.type || 'box',
          isDynamic: Boolean(p.isDynamic),
          mass: p.mass || 20,
          color: p.color !== undefined ? p.color : 0xd97706,
          size: p.size ? { ...p.size } : null,
          radius: p.radius || 0.25,
          height: p.height || 0.6,
          pos: p.mesh ? { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z } : { ...(p.initPos || { x: 0, y: 0.35, z: 1.1 }) },
          rot: p.mesh ? { x: p.mesh.quaternion.x, y: p.mesh.quaternion.y, z: p.mesh.quaternion.z, w: p.mesh.quaternion.w } : { ...(p.initRot || { x: 0, y: 0, z: 0, w: 1 }) },
          scale: p.mesh ? { x: p.mesh.scale.x, y: p.mesh.scale.y, z: p.mesh.scale.z } : { ...(p.scale || { x: 1, y: 1, z: 1 }) }
        })),

        // 3. Staging and Actors
        actor1: {
          spawnOffset: character?.spawnOffset ? { ...character.spawnOffset } : { x: 0, y: 0, z: 0 },
          spawnYaw: character?.spawnYaw || 0
        },
        actor2: (() => {
          const a2 = getActor2 ? getActor2() : null;
          return {
            isActive: Boolean(a2),
            spawnOffset: a2?.spawnOffset ? { ...a2.spawnOffset } : { x: 0.8, y: 0, z: -1.6 },
            spawnYaw: a2?.spawnYaw || 0
          };
        })(),

        // 4. Environment
        environment: getEnvironment ? getEnvironment() : {}
      };

      return snapshot;
    } catch (err) {
      console.warn('[HistoryManager] Failed to capture state snapshot:', err);
      return null;
    }
  }

  // Record an action by saving the pre-action snapshot
  pushState(actionLabel = 'Action') {
    if (this.isRestoring) return;
    const snap = this.captureState(actionLabel);
    if (!snap) return;

    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    // Any new user action invalidates redo branch
    this.redoStack = [];
    this.updateUI();
  }

  undo() {
    if (this.undoStack.length === 0) {
      if (typeof window !== 'undefined' && window.showNotification) {
        window.showNotification('Nothing to undo', 'info');
      }
      return false;
    }

    // Capture current state into redo stack before restoring
    const currentState = this.captureState('Current State');
    const previousState = this.undoStack.pop();

    if (currentState) {
      this.redoStack.push(currentState);
      if (this.redoStack.length > this.maxSteps) {
        this.redoStack.shift();
      }
    }

    this.restoreState(previousState);
    if (typeof window !== 'undefined' && window.showNotification) {
      const remaining = this.undoStack.length;
      window.showNotification(`↩️ Undid: ${previousState.label} (${remaining} step${remaining === 1 ? '' : 's'} available)`, 'info');
    }
    this.updateUI();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) {
      if (typeof window !== 'undefined' && window.showNotification) {
        window.showNotification('Nothing to redo', 'info');
      }
      return false;
    }

    // Capture current state into undo stack before restoring
    const currentState = this.captureState('Current State');
    const nextState = this.redoStack.pop();

    if (currentState) {
      this.undoStack.push(currentState);
      if (this.undoStack.length > this.maxSteps) {
        this.undoStack.shift();
      }
    }

    this.restoreState(nextState);
    if (typeof window !== 'undefined' && window.showNotification) {
      window.showNotification(`↪️ Redid: ${nextState.label}`, 'info');
    }
    this.updateUI();
    return true;
  }

  restoreState(snapshot) {
    if (!snapshot || !this.context) return;
    this.isRestoring = true;

    try {
      const {
        timeline,
        propsManager,
        character,
        setSceneDuration,
        setActor2State,
        setEnvironment,
        onStateRestored
      } = this.context;

      // 1. Restore Timeline duration & layers
      if (timeline) {
        if (typeof snapshot.totalFrames === 'number' && snapshot.totalFrames > 0) {
          if (typeof setSceneDuration === 'function') {
            setSceneDuration(snapshot.totalFrames);
          } else {
            timeline.totalFrames = snapshot.totalFrames;
          }
        }
        timeline.layers = JSON.parse(JSON.stringify(snapshot.layers || []));
        timeline.selectedLayerId = snapshot.selectedLayerId || (timeline.layers[0]?.id || null);
      }

      // 2. Restore Props
      if (propsManager) {
        propsManager.clearAllProps();
        if (Array.isArray(snapshot.props)) {
          for (const pData of snapshot.props) {
            let p;
            if (pData.type === 'fluid') {
              p = propsManager.spawnFluidVolume(pData.pos, pData.size || { x: 3.5, y: 0.7, z: 3.5 });
            } else {
              p = propsManager.spawnPrimitive(pData.shapeType || 'box', {
                name: pData.name,
                isDynamic: pData.isDynamic,
                pos: pData.pos,
                mass: pData.mass,
                color: pData.color,
                size: pData.size,
                radius: pData.radius,
                height: pData.height
              });
            }

            if (p && p.mesh && pData.rot) {
              p.mesh.quaternion.set(pData.rot.x, pData.rot.y, pData.rot.z, pData.rot.w);
              if (pData.scale) {
                p.mesh.scale.set(pData.scale.x, pData.scale.y, pData.scale.z);
              }
              if (typeof p.updateTransformFromMesh === 'function') {
                p.updateTransformFromMesh();
              }
            }
          }
        }
      }

      // 3. Restore Actors & Staging
      if (character && snapshot.actor1) {
        const off = snapshot.actor1.spawnOffset || { x: 0, y: 0, z: 0 };
        character.setSpawnOffset(off.x, off.y, off.z);
        character.spawnYaw = snapshot.actor1.spawnYaw || 0;
        character.resetToTPose();
      }

      if (setActor2State && snapshot.actor2) {
        setActor2State(snapshot.actor2);
      }

      // 4. Restore Environment
      if (setEnvironment && snapshot.environment) {
        setEnvironment(snapshot.environment);
      }

      // 5. Invalidate simulation and notify UI
      if (timeline) {
        timeline.invalidateSimulation();
        timeline.seek(0);
      }

      if (onStateRestored) {
        onStateRestored();
      }
    } catch (err) {
      console.error('[HistoryManager] Error during state restoration:', err);
    } finally {
      this.isRestoring = false;
    }
  }

  updateUI() {
    const undoBtn = document.getElementById('menu-undo');
    const redoBtn = document.getElementById('menu-redo');
    const undoText = document.getElementById('menu-undo-text');
    const redoText = document.getElementById('menu-redo-text');

    const timelineUndoBtn = document.getElementById('btn-timeline-undo');
    const timelineRedoBtn = document.getElementById('btn-timeline-redo');

    const canUndo = this.undoStack.length > 0;
    const canRedo = this.redoStack.length > 0;

    if (undoBtn) {
      undoBtn.style.opacity = canUndo ? '1' : '0.4';
      undoBtn.style.pointerEvents = canUndo ? 'auto' : 'none';
      if (undoText) {
        const nextUndo = this.undoStack[this.undoStack.length - 1];
        undoText.textContent = nextUndo ? `Undo ${nextUndo.label}` : 'Undo';
      }
    }

    if (redoBtn) {
      redoBtn.style.opacity = canRedo ? '1' : '0.4';
      redoBtn.style.pointerEvents = canRedo ? 'auto' : 'none';
      if (redoText) {
        const nextRedo = this.redoStack[this.redoStack.length - 1];
        redoText.textContent = nextRedo ? `Redo ${nextRedo.label}` : 'Redo';
      }
    }

    if (timelineUndoBtn) {
      timelineUndoBtn.style.opacity = canUndo ? '1' : '0.4';
      timelineUndoBtn.style.pointerEvents = canUndo ? 'auto' : 'none';
      const nextUndo = this.undoStack[this.undoStack.length - 1];
      timelineUndoBtn.title = nextUndo ? `Undo ${nextUndo.label} (Ctrl+Z)` : 'Undo Last Action (Ctrl+Z)';
    }

    if (timelineRedoBtn) {
      timelineRedoBtn.style.opacity = canRedo ? '1' : '0.4';
      timelineRedoBtn.style.pointerEvents = canRedo ? 'auto' : 'none';
      const nextRedo = this.redoStack[this.redoStack.length - 1];
      timelineRedoBtn.title = nextRedo ? `Redo ${nextRedo.label} (Ctrl+Y)` : 'Redo Next Action (Ctrl+Y)';
    }
  }
}
