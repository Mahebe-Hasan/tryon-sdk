/**
 * Fades effects in/out instead of popping them when tracking is found/lost.
 * `opacity` moves linearly toward 1 (tracked) or 0 (lost) over `fadeMs`.
 */
export class Presence {
  private _opacity = 0;
  private lastT: number | null = null;

  constructor(public fadeMs = 150) {}

  get opacity(): number {
    return this._opacity;
  }

  /** @param tMs timestamp in milliseconds */
  update(tracked: boolean, tMs: number): number {
    const dt = this.lastT === null ? 0 : Math.max(0, tMs - this.lastT);
    this.lastT = tMs;
    const step = this.fadeMs <= 0 ? 1 : dt / this.fadeMs;
    const target = tracked ? 1 : 0;
    if (this._opacity < target) this._opacity = Math.min(target, this._opacity + step);
    else if (this._opacity > target) this._opacity = Math.max(target, this._opacity - step);
    return this._opacity;
  }

  reset(): void {
    this._opacity = 0;
    this.lastT = null;
  }
}
