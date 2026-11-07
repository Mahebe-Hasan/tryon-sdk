import { Camera, type CameraState } from '../camera/camera';
import { DebugHud, type HudToggles } from '../debug/hud';
import { drawOverlay } from '../debug/overlay';
import { Emitter } from '../events';
import { FaceTracker } from '../tracking/face';
import { Presence } from '../tracking/presence';
import { computeRegions } from '../tracking/regions';
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
}

export interface FaceViewEvents extends Record<string, unknown> {
  'camera-state': CameraState;
  'model-progress': { loaded: number; total: number | null };
  ready: { delegate: string };
  'tracking-lost': undefined;
  'tracking-found': undefined;
  error: unknown;
}

/**
 * Phase 1 building block: camera preview + face tracking + debug overlays.
 * Later phases render makeup through the same loop.
 */
export class FaceView {
  readonly events = new Emitter<FaceViewEvents>();
  readonly camera: Camera;
  private tracker: FaceTracker | null = null;
  private trackerPromise: Promise<FaceTracker> | null = null;
  private readonly smoother: LandmarkSmoother;
  private readonly presence: Presence;
  private readonly stage: HTMLDivElement;
  private readonly mirror: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hud: DebugHud | null = null;
  private toggles: HudToggles;
  private running = false;
  private frameHandle: number | null = null;
  private lastLandmarks: Point3[] | null = null;
  private wasTracked = false;
  private resumeOnVisible = false;
  // Stats
  private frames = 0;
  private fpsT0 = 0;
  private fps = 0;
  private detectMs = 0;
  private renderMs = 0;
  private lastBlendshapes: Record<string, number> = {};

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
    const fill = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    this.camera.video.style.cssText = fill;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `${fill}pointer-events:none;`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.mirror.append(this.camera.video, this.canvas);
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.tracker?.close();
    this.tracker = null;
    this.stage.remove();
    this.events.clear();
  }

  private loadTracker(): Promise<FaceTracker> {
    this.trackerPromise ??= FaceTracker.create({
      assetsBaseUrl: this.opts.assetsBaseUrl,
      detectMaxSize: this.opts.detectMaxSize ?? 640,
      onProgress: (loaded, total) => this.events.emit('model-progress', { loaded, total }),
    }).then((t) => {
      this.events.emit('ready', { delegate: t.delegate });
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
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.hud) {
      const regions =
        this.toggles.regions && this.lastLandmarks ? computeRegions(this.lastLandmarks, w, h) : [];
      drawOverlay(this.ctx, this.lastLandmarks, regions, {
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
        delegate: tracker.delegate,
        videoSize: `${w}×${h}`,
        detectSize: `${Math.round(w * scale)}×${Math.round(h * scale)}`,
        tracked,
        opacity,
        blendshapes: this.lastBlendshapes,
      });
    }
  }
}

function ema(prev: number, next: number, k = 0.1): number {
  return prev === 0 ? next : prev + (next - prev) * k;
}
