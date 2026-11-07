import quadVert from './shaders/quad.vert.glsl?raw';
import maskVert from './shaders/mask.vert.glsl?raw';
import maskFrag from './shaders/mask.frag.glsl?raw';
import blurFrag from './shaders/blur.frag.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';
import blitFrag from './shaders/blit.frag.glsl?raw';
import statsFrag from './shaders/stats.frag.glsl?raw';
import { withIncludes } from './blend';
import { blendModeIndex } from './color';
import { shapeBBox, shapeTriangles, unionBBox } from './mask';
import {
  FINISH_PRESETS,
  RENDER_CONFIG,
  type FrameInfo,
  type RenderEffect,
  type Renderer,
} from './types';

/**
 * WebGL2 pipeline (build plan §5.4):
 *  1. upload the video frame (with mipmaps, used for lighting + texture detail),
 *  2. per effect: rasterise region triangles into a mask, feather it with a separable
 *     Gaussian blur, composite the colour through it with the blend mode + finish,
 *  3. copy the result to the canvas.
 */
export class WebGLRenderer implements Renderer {
  readonly kind = 'webgl2' as const;
  readonly canvas: HTMLCanvasElement;
  /** Set when the browser drops the GPU context; the owner should switch renderers. */
  lost = false;

  private readonly gl: WebGL2RenderingContext;
  private readonly progs: Record<'mask' | 'blur' | 'stats' | 'composite' | 'blit', Program>;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly triVao: WebGLVertexArrayObject;
  private readonly triBuf: WebGLBuffer;
  private readonly videoTex: WebGLTexture;
  private frames: Target[] = [];
  private mask: Target | null = null;
  private blur: Target | null = null;
  /** Mipmapped (lum·mask, mask) for the mask-weighted region mean luminance. */
  private stats: Target | null = null;
  private w = 0;
  private h = 0;
  private hasFrame = false;
  private mw = 0;
  private mh = 0;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.progs = {
      mask: new Program(gl, maskVert, maskFrag),
      blur: new Program(gl, quadVert, blurFrag),
      stats: new Program(gl, quadVert, statsFrag),
      composite: new Program(gl, quadVert, withIncludes(compositeFrag)),
      blit: new Program(gl, quadVert, blitFrag),
    };
    this.quadVao = makeVao(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    this.triBuf = must(gl.createBuffer(), 'buffer');
    this.triVao = must(gl.createVertexArray(), 'vao');
    gl.bindVertexArray(this.triVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.videoTex = must(gl.createTexture(), 'texture');
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  /** Returns null when WebGL2 (or a needed feature) is unavailable. */
  static create(): WebGLRenderer | null {
    const canvas = document.createElement('canvas');
    let gl: WebGL2RenderingContext | null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    try {
      const r = new WebGLRenderer(canvas, gl);
      r.resize(64, 64); // proves the render targets are complete
      return r;
    } catch (err) {
      console.warn('[TryOn] WebGL2 renderer init failed, using Canvas 2D', err);
      return null;
    }
  }

  captureFrame(source: TexImageSource, width: number, height: number): void {
    if (this.lost || width <= 0 || height <= 0) return;
    const gl = this.gl;
    this.resize(width, height);
    // texImage2D copies the frame that is current *now*, on the GPU.
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.hasFrame = true;
  }

  render(effects: RenderEffect[], frame: FrameInfo): void {
    if (this.lost || !this.hasFrame) return;
    const gl = this.gl;
    const width = this.w;
    const height = this.h;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    const maxLod = Math.floor(Math.log2(Math.max(width, height)));

    let src = this.videoTex;
    let ping = 0;
    for (const fx of effects) {
      if (fx.opacity <= 0.003 || fx.shapes.length === 0) continue;
      if (!this.drawMask(fx)) continue;
      this.featherMask(fx.featherPx);
      this.measureRegion();
      const target = this.frames[ping] as Target;
      this.composite(fx, src, target, frame, maxLod);
      src = target.tex;
      ping ^= 1;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const p = this.progs.blit.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(p.loc('u_tex'), 0);
    this.drawQuad();
  }

  destroy(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.canvas.remove();
  }

  // ---- passes ----------------------------------------------------------------------------

  private drawMask(fx: RenderEffect): boolean {
    const gl = this.gl;
    const mask = this.mask as Target;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mask.fb);
    gl.viewport(0, 0, this.mw, this.mh);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    const p = this.progs.mask.use();
    gl.uniform2f(p.loc('u_size'), this.w, this.h);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);

    let drew = false;
    const plain: number[] = [];
    for (const shape of fx.shapes) {
      const { fill, clip } = shapeTriangles(shape);
      if (fill.length === 0) continue;
      if (!clip) {
        for (const v of fill) plain.push(v);
        continue;
      }
      // Clipped shape (iris inside the eyelids): stencil = clip polygon, then fill where 1.
      gl.enable(gl.STENCIL_TEST);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      this.drawTriangles(clip);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      this.drawTriangles(fill);
      gl.disable(gl.STENCIL_TEST);
      drew = true;
    }
    if (plain.length) {
      this.drawTriangles(plain);
      drew = true;
    }
    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    return drew;
  }

  private featherMask(featherPx: number): void {
    const gl = this.gl;
    // Always blur a little: even "hard" edges need anti-aliasing at mask resolution.
    const sigma = Math.max(
      RENDER_CONFIG.minFeatherTexels,
      (featherPx * RENDER_CONFIG.maskScale) / 2,
    );
    const p = this.progs.blur.use();
    gl.uniform1f(p.loc('u_sigma'), sigma);
    gl.uniform1i(p.loc('u_tex'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0, 0, this.mw, this.mh);
    const mask = this.mask as Target;
    const blur = this.blur as Target;
    // horizontal: mask → blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, blur.fb);
    gl.bindTexture(gl.TEXTURE_2D, mask.tex);
    gl.uniform2f(p.loc('u_dir'), 1 / this.mw, 0);
    this.drawQuad();
    // vertical: blur → mask
    gl.bindFramebuffer(gl.FRAMEBUFFER, mask.fb);
    gl.bindTexture(gl.TEXTURE_2D, blur.tex);
    gl.uniform2f(p.loc('u_dir'), 0, 1 / this.mh);
    this.drawQuad();
  }

  /** (lum·mask, mask) into the stats target, then mipmap it (see stats.frag.glsl). */
  private measureRegion(): void {
    const gl = this.gl;
    const stats = this.stats as Target;
    gl.bindFramebuffer(gl.FRAMEBUFFER, stats.fb);
    gl.viewport(0, 0, this.mw, this.mh);
    const p = this.progs.stats.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (this.mask as Target).tex);
    gl.uniform1i(p.loc('u_video'), 0);
    gl.uniform1i(p.loc('u_mask'), 1);
    this.drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stats.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  private composite(
    fx: RenderEffect,
    src: WebGLTexture,
    target: Target,
    frame: FrameInfo,
    maxLod: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, this.w, this.h);
    const p = this.progs.composite.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, (this.mask as Target).tex);
    gl.uniform1i(p.loc('u_base'), 0);
    gl.uniform1i(p.loc('u_video'), 1);
    gl.uniform1i(p.loc('u_mask'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, (this.stats as Target).tex);
    gl.uniform1i(p.loc('u_stats'), 3);

    const box = unionBBox(fx.shapes.map(shapeBBox));
    const cx = box ? (box.minX + box.maxX) / 2 : this.w / 2;
    const cy = box ? (box.minY + box.maxY) / 2 : this.h / 2;
    const size = box ? Math.max(box.maxX - box.minX, box.maxY - box.minY) : this.w;
    // Stats mip where one texel ≈ the region size (so the sample averages the whole region).
    const maskMaxLod = Math.floor(Math.log2(Math.max(this.mw, this.mh)));
    const regionLod = clamp(Math.log2(Math.max(1, size * RENDER_CONFIG.maskScale)), 0, maskMaxLod);
    const detailLod = clamp(
      Math.log2(Math.max(2, (frame.faceWidth || this.w / 3) / 40)),
      1,
      maxLod,
    );
    const f = FINISH_PRESETS[fx.finish];

    gl.uniform3f(p.loc('u_color'), fx.color[0], fx.color[1], fx.color[2]);
    gl.uniform1i(p.loc('u_mode'), blendModeIndex(fx.blend));
    gl.uniform1f(p.loc('u_opacity'), clamp(fx.opacity, 0, 1));
    gl.uniform1f(p.loc('u_featherInset'), clamp(fx.featherInset ?? 0, 0, 1));
    gl.uniform1f(p.loc('u_tintContrast'), RENDER_CONFIG.tintContrast);
    gl.uniform1f(p.loc('u_lightAdapt'), RENDER_CONFIG.lightAdaptByMode[fx.blend]);
    gl.uniform1f(p.loc('u_refLum'), RENDER_CONFIG.referenceLuminance);
    gl.uniform2f(p.loc('u_regionCenter'), cx / this.w, cy / this.h);
    gl.uniform1f(p.loc('u_regionLod'), regionLod);
    gl.uniform1f(p.loc('u_detailLod'), detailLod);
    gl.uniform1f(p.loc('u_detail'), RENDER_CONFIG.detailByMode[fx.blend]);
    gl.uniform1f(p.loc('u_matte'), f.matte);
    gl.uniform1f(p.loc('u_highlightKeep'), f.highlightKeep);
    gl.uniform1f(p.loc('u_gloss'), f.gloss);
    gl.uniform1f(p.loc('u_sparkle'), f.sparkle);
    gl.uniform1f(p.loc('u_metal'), f.metal);
    gl.uniformMatrix3fv(
      p.loc('u_faceXform'),
      false,
      frame.faceTransform ?? new Float32Array([1 / this.w, 0, 0, 0, 1 / this.w, 0, 0, 0, 1]),
    );
    gl.uniform1f(p.loc('u_sparkleDensity'), RENDER_CONFIG.sparkleDensity);
    gl.uniform2f(p.loc('u_size'), this.w, this.h);
    gl.uniform1f(p.loc('u_time'), frame.time);
    this.drawQuad();
    gl.activeTexture(gl.TEXTURE0);
  }

  // ---- helpers ---------------------------------------------------------------------------

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  private drawTriangles(coords: number[]): void {
    const gl = this.gl;
    gl.bindVertexArray(this.triVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, coords.length / 2);
    gl.bindVertexArray(null);
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.mw = Math.max(1, Math.round(w * RENDER_CONFIG.maskScale));
    this.mh = Math.max(1, Math.round(h * RENDER_CONFIG.maskScale));
    for (const t of [...this.frames, this.mask, this.blur, this.stats]) t?.dispose(gl);
    this.frames = [
      new Target(gl, w, h, gl.RGBA8, gl.RGBA, false),
      new Target(gl, w, h, gl.RGBA8, gl.RGBA, false),
    ];
    this.mask = new Target(gl, this.mw, this.mh, gl.R8, gl.RED, true);
    this.blur = new Target(gl, this.mw, this.mh, gl.R8, gl.RED, false);
    this.stats = new Target(gl, this.mw, this.mh, gl.RGBA8, gl.RGBA, false, true);
  }
}

class Program {
  private readonly prog: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private gl: WebGL2RenderingContext,
    vs: string,
    fs: string,
  ) {
    const p = must(gl.createProgram(), 'program');
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(p) ?? ''}`);
    }
    this.prog = p;
  }

  use(): this {
    this.gl.useProgram(this.prog);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.locs.get(name) ?? null;
  }
}

class Target {
  readonly tex: WebGLTexture;
  readonly fb: WebGLFramebuffer;
  private readonly rb: WebGLRenderbuffer | null = null;

  constructor(
    gl: WebGL2RenderingContext,
    w: number,
    h: number,
    internal: number,
    format: number,
    withStencil: boolean,
    mipmapped = false,
  ) {
    this.tex = must(gl.createTexture(), 'texture');
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fb = must(gl.createFramebuffer(), 'framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    if (withStencil) {
      this.rb = must(gl.createRenderbuffer(), 'renderbuffer');
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER,
        this.rb,
      );
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete (0x${status.toString(16)})`);
    }
  }

  dispose(gl: WebGL2RenderingContext): void {
    gl.deleteTexture(this.tex);
    gl.deleteFramebuffer(this.fb);
    if (this.rb) gl.deleteRenderbuffer(this.rb);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = must(gl.createShader(type), 'shader');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s) ?? ''}`);
  }
  return s;
}

function makeVao(gl: WebGL2RenderingContext, data: Float32Array): WebGLVertexArrayObject {
  const vao = must(gl.createVertexArray(), 'vao');
  gl.bindVertexArray(vao);
  const buf = must(gl.createBuffer(), 'buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

function must<T>(v: T | null, what: string): T {
  if (v === null) throw new Error(`WebGL: could not create ${what}`);
  return v;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
