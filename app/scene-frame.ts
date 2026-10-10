/** Elapsed time advances only while the visible viewer has requested work. */
export class VisibleFrameClock {
  private previous: number | null = null;

  tick(time: number): number {
    const elapsed = this.previous === null ? 1 / 60 : Math.max(0, (time - this.previous) / 1000);
    this.previous = time;
    return elapsed;
  }

  reset(): void { this.previous = null; }
}

/** Coalesce new scene state while one WebGL2 frame is still on the GPU.
 * Calls never block the main thread. WebGL1 and failed fences retain the normal
 * renderer path; callers decide when work is needed, so this owns no idle timer.
 */
export class GpuFrameGate {
  private gl: WebGL2RenderingContext | null;
  private fence: WebGLSync | null = null;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = 'fenceSync' in gl && 'clientWaitSync' in gl && 'deleteSync' in gl && 'flush' in gl
      ? gl as WebGL2RenderingContext : null;
  }

  ready(): boolean {
    const gl = this.gl, fence = this.fence;
    if (!gl || !fence) return true;
    try {
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return false;
      this.release();
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) this.gl = null;
    } catch { this.dispose(); }
    return true;
  }

  submitted(): void {
    const gl = this.gl;
    if (!gl || this.fence) return;
    try {
      this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (this.fence) gl.flush();
      else this.gl = null;
    } catch { this.dispose(); }
  }

  private release(): void {
    const fence = this.fence;
    this.fence = null;
    if (fence && this.gl) {
      try { this.gl.deleteSync(fence); } catch { /* A lost context already owns cleanup. */ }
    }
  }

  dispose(): void { this.release(); this.gl = null; }
}
