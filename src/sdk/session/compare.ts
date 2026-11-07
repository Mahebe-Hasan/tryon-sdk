/**
 * Before/after compare slider (screen space, never mirrored).
 *
 * Left of the line = before (no makeup), right of the line = after (makeup).
 * Drag the line fully left → makeup on the whole face; fully right → no makeup.
 * Off by default; the host shows it with FaceView.setCompare(true).
 */
export class CompareSlider {
  readonly el: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private _enabled = false;
  /** Divider position as a fraction of the stage width (0 = left edge). */
  private pos = 0.5;
  private dragging = false;

  constructor(private stage: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'tryon-compare';
    el.hidden = true;
    el.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;';

    const line = document.createElement('div');
    line.style.cssText =
      'position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;' +
      'box-shadow:0 0 4px rgb(0 0 0 / .5);';
    const hit = document.createElement('div');
    // Wide invisible touch target around the line.
    hit.style.cssText =
      'position:absolute;top:0;bottom:0;width:44px;margin-left:-22px;pointer-events:auto;' +
      'touch-action:none;cursor:ew-resize;';
    const knob = document.createElement('div');
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', 'Before / after');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', '100');
    knob.tabIndex = 0;
    knob.textContent = '⇆';
    knob.style.cssText =
      'position:absolute;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;' +
      'background:#fff;color:#333;display:flex;align-items:center;justify-content:center;' +
      'font:18px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgb(0 0 0 / .35);' +
      'pointer-events:auto;touch-action:none;cursor:ew-resize;';
    const label = (text: string, side: 'left' | 'right'): HTMLDivElement => {
      const l = document.createElement('div');
      l.textContent = text;
      l.style.cssText =
        `position:absolute;top:10px;${side}:10px;padding:2px 8px;border-radius:999px;` +
        'background:rgb(0 0 0 / .5);color:#fff;font:12px system-ui,sans-serif;';
      return l;
    };
    el.append(label('Before', 'left'), label('After', 'right'), line, hit, knob);
    stage.append(el);
    this.el = el;
    this.line = line;
    this.knob = knob;
    this.hitEl = hit;

    const onDown = (e: PointerEvent): void => {
      this.dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      this.moveTo(e.clientX);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent): void => {
      if (this.dragging) this.moveTo(e.clientX);
    };
    const onUp = (): void => {
      this.dragging = false;
    };
    for (const t of [hit, knob]) {
      t.addEventListener('pointerdown', onDown);
      t.addEventListener('pointermove', onMove);
      t.addEventListener('pointerup', onUp);
      t.addEventListener('pointercancel', onUp);
    }
    knob.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.setPos(this.pos - 0.05);
      else if (e.key === 'ArrowRight') this.setPos(this.pos + 0.05);
      else return;
      e.preventDefault();
    });
    this.setPos(0.5);
  }

  private readonly hitEl: HTMLDivElement;

  get enabled(): boolean {
    return this._enabled;
  }

  get position(): number {
    return this.pos;
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    this.el.hidden = !on;
  }

  setPos(p: number): void {
    this.pos = Math.min(1, Math.max(0, p));
    const pct = `${this.pos * 100}%`;
    this.line.style.left = pct;
    this.knob.style.left = pct;
    this.hitEl.style.left = pct;
    this.knob.setAttribute('aria-valuenow', String(Math.round(this.pos * 100)));
  }

  private moveTo(clientX: number): void {
    const r = this.stage.getBoundingClientRect();
    if (r.width > 0) this.setPos((clientX - r.left) / r.width);
  }

  /**
   * Map the screen divider to canvas x (0–1) for a video drawn with object-fit: cover and
   * optionally mirrored. Screen-left is "before"; with mirroring that is canvas-right.
   */
  toCanvas(
    stage: HTMLElement,
    videoW: number,
    videoH: number,
    mirrored: boolean,
  ): { split: number; beforeLow: boolean } {
    const sw = stage.clientWidth || 1;
    const sh = stage.clientHeight || 1;
    const scale = Math.max(sw / videoW, sh / videoH);
    const dispW = videoW * scale;
    const offX = (sw - dispW) / 2;
    const x = (this.pos * sw - offX) / dispW; // 0–1 across the displayed (unmirrored) image
    return mirrored ? { split: 1 - x, beforeLow: false } : { split: x, beforeLow: true };
  }
}
