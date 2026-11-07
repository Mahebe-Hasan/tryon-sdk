import { Camera, type CameraState } from '../camera/camera';
import { DebugHud, type HudToggles } from '../debug/hud';
import { drawOverlay } from '../debug/overlay';
import { Emitter } from '../events';
import { createRenderer, type RendererPreference } from '../render/index';
import { Canvas2DRenderer } from '../render/fallback2d';
import { hexToRgb, type BlendMode, type RGB } from '../render/color';
import type { Finish, RenderEffect, Renderer } from '../render/types';
import { FaceTracker } from '../tracking/face';
import { faceMetrics } from '../tracking/metrics';
import { Presence } from '../tracking/presence';
import { computeRegions, type Region, type RegionId } from '../tracking/regions';
import { LandmarkSmoother, type OneEuroParams, type Point3 } from '../tracking/smoothing';

export interface FaceViewOptions {
  container: HTMLElement;
  /** Base URL containing `models/` and `wasm/`. */
  assetsBaseUrl: string;
  /** Show the debug HUD and overlays. */
  debug?: boolean;
  /** Initial debug overlay toggles. */
  debugToggles?: Partial<HudToggles>;
  smoothing?: Partial<OneEuroParams>;
  /** Fade time when the face is lost/found. */
  fadeMs?: number;
  /** Longest side of the detector input in px. */
  detectMaxSize?: number;
  /** 'auto' = WebGL2 with Canvas 2D fallback. */
  renderer?: RendererPreference;
}

/** One colour applied to one or more face regions. */
export interface EffectSpec {
  id: string;
  regions: RegionId[];
  /** '#RRGGBB' */
  color: string;
  blend: BlendMode;
  finish: Finish;
  /** 0–1 */
  opacity: number;
  /** Soft-edge radius as a fraction of face width (e.g. 0.01). */
  feather: number;
}

export interface FaceViewEvents extends Record<string, unknown> {
  'camera-state': CameraState;
  'model-progress': { loaded: number; total: number | null };
  ready: { delegate: string; renderer: string };
  'tracking-lost': undefined;
  'tracking-found': undefined;
  error: unknown;
}

interface ResolvedEffect extends Omit<EffectSpec, 'color'> {
  rgb: RGB;
}

/**
 * Camera preview + face tracking + makeup rendering (+ debug overlays with `debug: true`).
 * The video element stays underneath as a fallback; the renderer canvas covers it.
 */
export class FaceView {
  readonly events = new Emitter<FaceViewEvents>();
  readonly camera: Camera;
  private renderer: Renderer;
  private tracker: FaceTracker | null = null;
  private trackerPromise: Promise<FaceTracker> | null = null;
  private readonly smoother: LandmarkSmoother;
  private readonly presence: Presence;
  private readonly stage: HTMLDivElement;
  private readonly mirror: HTMLDivElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly hud: DebugHud | null = null;
  private toggles: HudToggles;
  private effects: ResolvedEffect[] = [];
  private running = false;
  private frameHandle: number | null = null;
  private lastLandmarks: Point3[] | null = null;
  private wasTracked = false;
  private resumeOnVisible = false;
  private readonly t0 = performance.now();
  // Stats
  private frames = 0;
  private fpsT0 = 0;
  private fps = 0;
  private detectMs = 0;
  private renderMs = 0;
  private lastBlendshapes: Record<string, number> = {};

  private static readonly FILL =
    'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

  constructor(private opts: FaceViewOptions) {
    this.camera = new Camera();
    this.smoother = new LandmarkSmoother(opts.smoothing);
    this.presence = new Presence(opts.fadeMs ?? 150);
    this.toggles = { landmarks: true, regions: false, indices: false, ...opts.debugToggles };

    this.stage = document.createElement('div');
    this.stage.className = 'tryon-stage';
    this.stage.style.cssText =
      'position:relative;width:100%;height:100%;overflow:hidden;background:#000;';
    this.mirror = document.createElement('div');
    this.mirror.style.cssText = 'position:absolute;inset:0;';
    this.camera.video.style.cssText = FaceView.FILL;

    this.renderer = createRenderer(opts.renderer ?? 'auto');
    this.styleRendererCanvas();

    this.overlay = document.createElement('canvas');
    this.overlay.style.cssText = `${FaceView.FILL}pointer-events:none;`;
    const ctx = this.overlay.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.overlayCtx = ctx;
    this.mirror.append(this.camera.video, this.renderer.canvas, this.overlay);
    this.stage.append(this.mirror);

    if (opts.debug) {
      this.hud = new DebugHud(this.toggles, this.smoother.params, {
        onToggle: (t) => (this.toggles = t),
        onSmoothing: (p) => this.smoother.setParams(p),
      });
      this.stage.append(this.hud.el);
    }
    opts.container.append(this.stage);

    this.camera.events.on('state', (s) => this.events.emit('camera-state', s));
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get rendererKind(): string {
    return this.renderer.kind;
  }

  /** Replace the active effects. Throws on an invalid colour. */
  setEffects(specs: EffectSpec[]): void {
    this.effects = specs.map(({ color, ...rest }) => ({ ...rest, rgb: hexToRgb(color) }));
  }

  /** Start camera and tracking. Resolves with the final camera state. */
  async start(facing?: 'user' | 'environment'): Promise<CameraState> {
    // Download the model while the permission prompt is open.
    const trackerReady = this.loadTracker();
    trackerReady.catch(() => undefined);
    const state = await this.camera.start(facing);
    if (state !== 'active') return state;
    this.applyMirror();
    try {
      this.tracker = await trackerReady;
    } catch (err) {
      this.events.emit('error', err);
      return state;
    }
    this.startLoop();
    return state;
  }

  async switchCamera(): Promise<CameraState> {
    const state = await this.camera.switch();
    this.applyMirror();
    this.smoother.reset();
    return state;
  }

  stop(): void {
    this.stopLoop();
    this.camera.stop();
    this.presence.reset();
    this.smoother.reset();
    this.lastLandmarks = null;
    this.renderer.canvas.style.visibility = 'hidden';
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  destroy(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.tracker?.close();
    this.tracker = null;
    this.renderer.destroy();
    this.stage.remove();
    this.events.clear();
  }

  private styleRendererCanvas(): void {
    // Hidden until the first frame is drawn, so the live video shows through meanwhile.
    this.renderer.canvas.style.cssText = `${FaceView.FILL}pointer-events:none;visibility:hidden;`;
  }

  private loadTracker(): Promise<FaceTracker> {
    this.trackerPromise ??= FaceTracker.create({
      assetsBaseUrl: this.opts.assetsBaseUrl,
      detectMaxSize: this.opts.detectMaxSize ?? 640,
      onProgress: (loaded, total) => this.events.emit('model-progress', { loaded, total }),
    }).then((t) => {
      this.events.emit('ready', { delegate: t.delegate, renderer: this.renderer.kind });
      return t;
    });
    this.trackerPromise.catch(() => (this.trackerPromise = null));
    return this.trackerPromise;
  }

  private applyMirror(): void {
    this.mirror.style.transform = this.camera.mirrored ? 'scaleX(-1)' : '';
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      if (this.camera.isActive) {
        this.resumeOnVisible = true;
        this.stopLoop();
        this.camera.stop();
      }
    } else if (this.resumeOnVisible) {
      this.resumeOnVisible = false;
      void this.start(this.camera.facing);
    }
  };

  /** WebGL context lost (GPU reset, too many contexts): continue with Canvas 2D. */
  private checkRenderer(): void {
    const r = this.renderer as Renderer & { lost?: boolean };
    if (!r.lost) return;
    console.warn('[TryOn] WebGL context lost — switching to Canvas 2D');
    const next = new Canvas2DRenderer();
    r.canvas.replaceWith(next.canvas);
    this.renderer = next;
    this.styleRendererCanvas();
  }

  // ---- Frame loop ------------------------------------------------------------------------

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.fpsT0 = performance.now();
    this.frames = 0;
    this.schedule();
  }

  private stopLoop(): void {
    this.running = false;
    if (this.frameHandle === null) return;
    const v = this.camera.video;
    if ('cancelVideoFrameCallback' in v) v.cancelVideoFrameCallback(this.frameHandle);
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private schedule(): void {
    if (!this.running) return;
    const v = this.camera.video;
    this.frameHandle =
      'requestVideoFrameCallback' in v
        ? v.requestVideoFrameCallback(() => this.tick())
        : requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    if (!this.running) return;
    try {
      this.process();
    } catch (err) {
      this.events.emit('error', err);
    }
    this.schedule();
  }

  private process(): void {
    const tracker = this.tracker;
    const video = this.camera.video;
    if (!tracker || !this.camera.isActive || video.readyState < 2) return;
    this.checkRenderer();
    const now = performance.now();

    const t0 = performance.now();
    const result = tracker.detect(video, now);
    const t1 = performance.now();
    this.detectMs = ema(this.detectMs, t1 - t0);

    const tracked = result !== null;
    if (result) {
      this.lastLandmarks = this.smoother.smooth(result.landmarks, now / 1000);
      this.lastBlendshapes = result.blendshapes;
    }
    const opacity = this.presence.update(tracked, now);
    if (!tracked && opacity === 0) {
      this.smoother.reset();
      this.lastLandmarks = null;
    }
    if (tracked !== this.wasTracked) {
      this.wasTracked = tracked;
      this.events.emit(tracked ? 'tracking-found' : 'tracking-lost', undefined);
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    const lm = this.lastLandmarks;
    const needRegions = lm && (this.effects.length > 0 || (this.hud && this.toggles.regions));
    const regions = needRegions ? computeRegions(lm, w, h) : [];
    const metrics = lm ? faceMetrics(lm, w, h) : null;

    const renderEffects = metrics ? this.buildEffects(regions, metrics.width, opacity) : [];
    if (this.renderer.canvas.style.visibility) this.renderer.canvas.style.visibility = '';
    this.renderer.render(video, w, h, renderEffects, {
      time: (now - this.t0) / 1000,
      faceWidth: metrics?.width ?? 0,
      faceTransform: metrics?.transform ?? null,
    });

    if (this.hud) {
      if (this.overlay.width !== w || this.overlay.height !== h) {
        this.overlay.width = w;
        this.overlay.height = h;
      }
      drawOverlay(this.overlayCtx, lm, this.toggles.regions ? regions : [], {
        ...this.toggles,
        opacity,
        mirrored: this.camera.mirrored,
      });
    }
    this.renderMs = ema(this.renderMs, performance.now() - t1);

    this.frames++;
    const elapsed = now - this.fpsT0;
    if (elapsed >= 500) {
      this.fps = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.fpsT0 = now;
      const scale = Math.min(1, tracker.detectMaxSize / Math.max(w, h)) || 1;
      this.hud?.update({
        fps: this.fps,
        detectMs: this.detectMs,
        renderMs: this.renderMs,
        delegate: `${tracker.delegate} / ${this.renderer.kind}`,
        videoSize: `${w}×${h}`,
        detectSize: `${Math.round(w * scale)}×${Math.round(h * scale)}`,
        tracked,
        opacity,
        blendshapes: this.lastBlendshapes,
      });
    }
  }

  private buildEffects(regions: Region[], faceWidth: number, presence: number): RenderEffect[] {
    if (presence <= 0 || this.effects.length === 0) return [];
    const byId = new Map(regions.map((r) => [r.id, r]));
    return this.effects.map((fx) => ({
      id: fx.id,
      shapes: fx.regions.flatMap((id) => {
        const r = byId.get(id);
        return r ? [r.shape] : [];
      }),
      color: fx.rgb,
      blend: fx.blend,
      finish: fx.finish,
      opacity: fx.opacity * presence,
      featherPx: fx.feather * faceWidth,
    }));
  }
}

function ema(prev: number, next: number, k = 0.1): number {
  return prev === 0 ? next : prev + (next - prev) * k;
}
