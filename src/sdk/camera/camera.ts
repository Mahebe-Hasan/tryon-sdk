import { Emitter } from '../events';

export type CameraState =
  | 'idle'
  | 'asking'
  | 'active'
  /** User or browser blocked camera permission. */
  | 'denied'
  /** No camera found on the device. */
  | 'no-camera'
  /** Camera exists but another app/tab is using it. */
  | 'in-use'
  /** Page is not HTTPS / localhost, so the browser hides the camera API. */
  | 'insecure'
  /** Browser has no getUserMedia at all. */
  | 'unsupported'
  | 'error';

export type Facing = 'user' | 'environment';

export interface CameraOptions {
  /** Ideal capture size. The browser picks the closest it supports. */
  idealWidth?: number;
  idealHeight?: number;
}

export interface CameraEvents extends Record<string, unknown> {
  state: CameraState;
}

/** Map a getUserMedia error to a user-facing state. Exported for tests. */
export function classifyCameraError(err: unknown): CameraState {
  const name = err instanceof Error || isDomExceptionLike(err) ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-camera';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'error';
  }
}

function isDomExceptionLike(e: unknown): e is { name: string } {
  return typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string';
}

/**
 * Wraps getUserMedia + a <video> element.
 * Landmark maths stays in unmirrored video space; use `mirrored` only for drawing.
 */
export class Camera {
  readonly video: HTMLVideoElement;
  readonly events = new Emitter<CameraEvents>();
  private stream: MediaStream | null = null;
  private _state: CameraState = 'idle';
  private _facing: Facing = 'user';
  private _mirrored = true;
  private lastError: unknown = null;
  private readonly opts: Required<CameraOptions>;

  constructor(opts: CameraOptions = {}) {
    this.opts = { idealWidth: 1280, idealHeight: 720, ...opts };
    const v = document.createElement('video');
    // iOS Safari needs all three or it opens a fullscreen player / refuses autoplay.
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.setAttribute('autoplay', '');
    v.playsInline = true;
    v.muted = true;
    v.autoplay = true;
    this.video = v;
  }

  get state(): CameraState {
    return this._state;
  }
  get facing(): Facing {
    return this._facing;
  }
  /** True when the preview should be drawn mirrored (front / desktop cameras). */
  get mirrored(): boolean {
    return this._mirrored;
  }
  get error(): unknown {
    return this.lastError;
  }
  get isActive(): boolean {
    return this._state === 'active';
  }

  async start(facing: Facing = this._facing): Promise<CameraState> {
    if (!window.isSecureContext) return this.setState('insecure');
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      return this.setState('unsupported');
    }
    this.stopTracks();
    this.setState('asking');
    try {
      this.stream = await this.request(facing);
    } catch (err) {
      this.lastError = err;
      return this.setState(classifyCameraError(err));
    }
    const settings = this.stream.getVideoTracks()[0]?.getSettings();
    // Desktop webcams usually report no facingMode; treat them as front cameras.
    this._facing = settings?.facingMode === 'environment' ? 'environment' : facing;
    this._mirrored = this._facing === 'user';
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch (err) {
      // Autoplay can still be blocked in rare cases; the video starts on the next user tap.
      console.warn('[TryOn] video.play() was blocked', err);
    }
    await waitForDimensions(this.video);
    return this.setState('active');
  }

  /** Toggle front/back camera. Resolves to the new state. */
  async switch(): Promise<CameraState> {
    return this.start(this._facing === 'user' ? 'environment' : 'user');
  }

  stop(): void {
    this.stopTracks();
    if (this._state !== 'idle') this.setState('idle');
  }

  /** Number of video inputs. Labels/ids may be hidden until permission is granted. */
  static async countCameras(): Promise<number> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput').length;
    } catch {
      return 0;
    }
  }

  private async request(facing: Facing): Promise<MediaStream> {
    const base = {
      width: { ideal: this.opts.idealWidth },
      height: { ideal: this.opts.idealHeight },
    };
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: { exact: facing } },
        audio: false,
      });
    } catch (err) {
      // Laptops have no "environment" camera; fall back to whatever exists.
      const name = isDomExceptionLike(err) ? err.name : '';
      if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw err;
      return navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: facing },
        audio: false,
      });
    }
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private setState(s: CameraState): CameraState {
    this._state = s;
    this.events.emit('state', s);
    return s;
  }
}

function waitForDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      video.removeEventListener('loadedmetadata', done);
      resolve();
    };
    video.addEventListener('loadedmetadata', done);
    setTimeout(done, 3000);
  });
}
