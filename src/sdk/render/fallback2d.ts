import type { RegionShape } from '../tracking/regions';
import type { Vec2 } from '../tracking/paths';
import { rgbToHex, type BlendMode } from './color';
import type { RenderEffect, Renderer } from './types';

const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft-light': 'soft-light',
  color: 'color',
  // Closest 2D equivalent: product hue/saturation with the region's own light and shadow.
  tint: 'color',
};

/**
 * Canvas 2D fallback for browsers without WebGL2. Polygon fill + globalCompositeOperation.
 * Feathering is faked by drawing the mask at low resolution and scaling it up (no ctx.filter,
 * which is unreliable across browsers). Finishes, lighting adaptation and sparkle are skipped.
 */
export class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCanvas = document.createElement('canvas');
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly fxCanvas = document.createElement('canvas');
  private readonly fxCtx: CanvasRenderingContext2D;

  /** Snapshot of the camera frame the landmarks were detected on. */
  private readonly frameCanvas = document.createElement('canvas');
  private readonly frameCtx: CanvasRenderingContext2D;
  private hasFrame = false;

  constructor() {
    this.frameCtx = get2d(this.frameCanvas);
    this.ctx = get2d(this.canvas);
    this.maskCtx = get2d(this.maskCanvas);
    this.fxCtx = get2d(this.fxCanvas);
  }

  captureFrame(source: TexImageSource, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    for (const c of [this.canvas, this.fxCanvas, this.frameCanvas]) {
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
    }
    this.frameCtx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    this.hasFrame = true;
  }

  // FrameInfo (sparkle/detail inputs) is unused: the 2D fallback skips finishes.
  render(effects: RenderEffect[]): void {
    if (!this.hasFrame) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.frameCanvas, 0, 0);

    for (const fx of effects) {
      if (fx.opacity <= 0.003 || fx.shapes.length === 0) continue;
      // Lower mask resolution ⇒ softer edge after upscaling.
      const scale = Math.min(0.5, Math.max(0.05, 2 / Math.max(1, fx.featherPx)));
      const mw = Math.max(1, Math.round(width * scale));
      const mh = Math.max(1, Math.round(height * scale));
      if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
        this.maskCanvas.width = mw;
        this.maskCanvas.height = mh;
      }
      const m = this.maskCtx;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.clearRect(0, 0, mw, mh);
      m.setTransform(scale, 0, 0, scale, 0, 0);
      m.fillStyle = '#fff';
      m.strokeStyle = '#fff';
      for (const s of fx.shapes) drawShape(m, s);

      const f = this.fxCtx;
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, width, height);
      f.imageSmoothingEnabled = true;
      f.imageSmoothingQuality = 'high';
      f.drawImage(this.maskCanvas, 0, 0, width, height);
      f.globalCompositeOperation = 'source-in';
      f.fillStyle = rgbToHex(fx.color);
      f.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = COMPOSITE[fx.blend];
      ctx.globalAlpha = Math.min(1, Math.max(0, fx.opacity));
      ctx.drawImage(this.fxCanvas, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  destroy(): void {
    this.canvas.remove();
  }
}

function get2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Vec2[], close: boolean): void {
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, s: RegionShape): void {
  ctx.beginPath();
  switch (s.kind) {
    case 'polygon':
      for (const loop of s.loops) trace(ctx, loop, true);
      ctx.fill('evenodd');
      break;
    case 'polyline':
      trace(ctx, s.points, s.closed ?? false);
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      break;
    case 'circle':
      ctx.save();
      if (s.clip) {
        trace(ctx, s.clip, true);
        ctx.clip();
        ctx.beginPath();
      }
      ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
  }
}
