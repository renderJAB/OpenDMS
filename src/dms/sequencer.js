export class SimulationSequencer {
  constructor(character, dmsEngine) {
    this.character = character;
    this.dmsEngine = dmsEngine;
    this.isPlaying = true;
    this.currentFrame = 0;
    this.totalFrames = 300;
    this.fps = 60;
    this.recordedFrames = []; // Simulation cache for scrubbing
    this.isRecording = true;

    // Timeline event tracks (analogous to endorphin MultiTrackView)
    this.tracks = [
      {
        id: 'balance_track',
        name: 'Active Balance',
        events: [{ start: 0, end: 180, type: 'balance', weight: 1.0 }]
      },
      {
        id: 'pose_track',
        name: 'Pose Track',
        events: [{ start: 0, end: 300, type: 'pose', pose: 'standing' }]
      },
      {
        id: 'catch_fall_track',
        name: 'Catch Fall Reflex',
        events: [{ start: 0, end: 300, type: 'catchFall', autoTrigger: true }]
      }
    ];
  }

  recordCurrentFrame() {
    if (!this.character) return;
    const frameData = {
      frame: this.currentFrame,
      time: this.currentFrame / this.fps,
      bodies: {}
    };

    for (const [name, b] of Object.entries(this.character.bodies)) {
      const pos = b.rigidBody.translation();
      const rot = b.rigidBody.rotation();
      frameData.bodies[name] = {
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z, rot.w]
      };
    }
    this.recordedFrames[this.currentFrame] = frameData;
  }

  applyCachedFrame(frameIdx) {
    const data = this.recordedFrames[frameIdx];
    if (!data || !this.character) return;

    for (const [name, trans] of Object.entries(data.bodies)) {
      const b = this.character.bodies[name];
      if (b) {
        b.mesh.position.set(...trans.position);
        b.mesh.quaternion.set(...trans.rotation);
      }
    }
  }

  step(dt) {
    if (!this.isPlaying) return;

    this.currentFrame++;
    if (this.currentFrame >= this.totalFrames) {
      this.currentFrame = 0; // Loop or pause
    }

    if (this.isRecording) {
      this.recordCurrentFrame();
    }
  }

  seek(frame) {
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames - 1));
    if (this.recordedFrames[this.currentFrame]) {
      this.applyCachedFrame(this.currentFrame);
    }
  }

  exportSimulationJSON() {
    return JSON.stringify({
      generator: 'OpenDMS (Endorphin Parallel)',
      version: '1.0.0',
      fps: this.fps,
      frameCount: this.recordedFrames.length,
      frames: this.recordedFrames
    }, null, 2);
  }
}
