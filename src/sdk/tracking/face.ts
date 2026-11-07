import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { assetUrl, fetchWithProgress, type ProgressFn } from '../assets';
import type { Point3 } from './smoothing';

export interface FaceTrackerOptions {
  /** Base URL that contains `models/` and `wasm/`. */
  assetsBaseUrl: string;
  /** Longest side (px) of the image fed to the detector. 0 = feed the video as-is. */
  detectMaxSize?: number;
  /** Try the GPU delegate first (falls back to CPU automatically). */
  preferGpu?: boolean;
  onProgress?: ProgressFn;
}

export interface FaceResult {
  /** 478 landmarks, normalised to 0–1 of the source frame (unmirrored). */
  landmarks: Point3[];
  /** Blendshape scores by name, e.g. eyeBlinkLeft, jawOpen. */
  blendshapes: Record<string, number>;
}

export type Delegate = 'GPU' | 'CPU';

/** FaceLandmarker wrapper: self-hosted model/wasm, GPU→CPU fallback, downscaled input. */
export class FaceTracker {
  private lastTs = 0;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchCtx: CanvasRenderingContext2D | null;

  private constructor(
    private landmarker: FaceLandmarker,
    readonly delegate: Delegate,
    public detectMaxSize: number,
  ) {
    this.scratch = document.createElement('canvas');
    this.scratchCtx = this.scratch.getContext('2d', { willReadFrequently: false });
  }

  static async create(opts: FaceTrackerOptions): Promise<FaceTracker> {
    const modelUrl = assetUrl(opts.assetsBaseUrl, 'models/face_landmarker.task');
    const wasmBase = assetUrl(opts.assetsBaseUrl, 'wasm');
    const [model, fileset] = await Promise.all([
      fetchWithProgress(modelUrl, opts.onProgress),
      FilesetResolver.forVisionTasks(wasmBase),
    ]);

    const make = (delegate: Delegate): Promise<FaceLandmarker> =>
      FaceLandmarker.createFromOptions(fileset, {
        // Copy: the buffer may be transferred/consumed by the first attempt.
        baseOptions: { modelAssetBuffer: model.slice(), delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

    let delegate: Delegate = opts.preferGpu === false ? 'CPU' : 'GPU';
    let landmarker: FaceLandmarker;
    try {
      landmarker = await make(delegate);
    } catch (err) {
      if (delegate === 'CPU') throw err;
      console.warn('[TryOn] GPU delegate failed, falling back to CPU', err);
      delegate = 'CPU';
      landmarker = await make(delegate);
    }
    return new FaceTracker(landmarker, delegate, opts.detectMaxSize ?? 640);
  }

  /** Run detection on the current video frame. Returns null when no face is found. */
  detect(video: HTMLVideoElement, nowMs: number): FaceResult | null {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(this.lastTs + 1, Math.round(nowMs));
    this.lastTs = ts;

    const result = this.landmarker.detectForVideo(this.downscale(video, w, h), ts);
    const face = result.faceLandmarks[0];
    if (!face || face.length === 0) return null;

    const blendshapes: Record<string, number> = {};
    for (const c of result.faceBlendshapes[0]?.categories ?? []) {
      blendshapes[c.categoryName] = c.score;
    }
    return {
      landmarks: face.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      blendshapes,
    };
  }

  close(): void {
    this.landmarker.close();
  }

  private downscale(
    video: HTMLVideoElement,
    w: number,
    h: number,
  ): HTMLVideoElement | HTMLCanvasElement {
    const max = this.detectMaxSize;
    const ctx = this.scratchCtx;
    if (!ctx || max <= 0 || Math.max(w, h) <= max) return video;
    // Same aspect ratio as the video, so normalised landmarks map straight back.
    const scale = max / Math.max(w, h);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    if (this.scratch.width !== sw || this.scratch.height !== sh) {
      this.scratch.width = sw;
      this.scratch.height = sh;
    }
    ctx.drawImage(video, 0, 0, sw, sh);
    return this.scratch;
  }
}
