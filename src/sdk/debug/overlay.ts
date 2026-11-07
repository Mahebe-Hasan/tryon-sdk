import type { Region, RegionGroup } from '../tracking/regions';
import type { Point3 } from '../tracking/smoothing';
import type { Vec2 } from '../tracking/paths';

export interface OverlayOptions {
  landmarks: boolean;
  regions: boolean;
  indices: boolean;
  /** 0–1, multiplies everything (tracking-lost fade). */
  opacity: number;
  /** Draw text un-mirrored when the canvas is CSS-mirrored. */
  mirrored: boolean;
}

const GROUP_COLORS: Record<RegionGroup, string> = {
  lips: '#ff2d6f',
  skin: '#ffd166',
  cheeks: '#ff8fab',
  contour: '#a0522d',
  highlight: '#ffffff',
  eyes: '#3ddcff',
  brows: '#9b5de5',
};

/** Distinct colours per region inside a group so neighbours are easy to tell apart. */
const REGION_COLORS: Partial<Record<string, string>> = {
  faceSkin: '#ffd166',
  'underEye.R': '#06d6a0',
  'underEye.L': '#06d6a0',
  'eyelid.R': '#4cc9f0',
  'eyelid.L': '#4cc9f0',
  'lashLine.R': '#111111',
  'lashLine.L': '#111111',
  'linerWing.R': '#f72585',
  'linerWing.L': '#f72585',
  'waterline.R': '#7209b7',
  'waterline.L': '#7209b7',
  'iris.R': '#00f5d4',
  'iris.L': '#00f5d4',
  lipLine: '#ffbe0b',
};

/** Draws landmarks / regions on a 2D canvas sized to the video frame. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point3[] | null,
  regions: readonly Region[],
  opts: OverlayOptions,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks || opts.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  const unit = Math.max(1, Math.min(width, height) / 400);

  if (opts.regions) {
    for (const r of regions) drawRegion(ctx, r, REGION_COLORS[r.id] ?? GROUP_COLORS[r.group], unit);
  }

  if (opts.landmarks) {
    ctx.fillStyle = '#00ff88';
    for (const p of landmarks) {
      ctx.fillRect(p.x * width - unit * 0.75, p.y * height - unit * 0.75, unit * 1.5, unit * 1.5);
    }
  }

  if (opts.indices) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = unit;
    ctx.font = `${Math.round(unit * 4)}px system-ui, sans-serif`;
    landmarks.forEach((p, i) => {
      const x = p.x * width;
      const y = p.y * height;
      ctx.save();
      ctx.translate(x, y);
      if (opts.mirrored) ctx.scale(-1, 1);
      ctx.strokeText(String(i), 2, -2);
      ctx.fillText(String(i), 2, -2);
      ctx.restore();
    });
  }
  ctx.restore();
}

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Vec2[], close: boolean): void {
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function drawRegion(ctx: CanvasRenderingContext2D, r: Region, color: string, unit: number): void {
  const s = r.shape;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (s.kind) {
    case 'polygon': {
      for (const loop of s.loops) tracePath(ctx, loop, true);
      ctx.save();
      ctx.globalAlpha *= r.id === 'faceSkin' ? 0.12 : 0.3;
      ctx.fill('evenodd');
      ctx.restore();
      ctx.lineWidth = unit;
      ctx.stroke();
      break;
    }
    case 'polyline': {
      tracePath(ctx, s.points, s.closed ?? false);
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = s.width;
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = unit * 0.75;
      ctx.stroke();
      break;
    }
    case 'circle': {
      ctx.save();
      if (s.clip) {
        ctx.beginPath();
        tracePath(ctx, s.clip, true);
        ctx.clip();
        ctx.beginPath();
      }
      ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.4;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI * 2);
      ctx.lineWidth = unit * 0.75;
      ctx.setLineDash([unit * 3, unit * 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
  }
}
