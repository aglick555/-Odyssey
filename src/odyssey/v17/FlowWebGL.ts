// WebGL flow renderer — one wide solid beam per family, alpha-over composite.
// No additive blending, no sparkle pass. Each family's path becomes a single
// triangle strip; the fragment shader composites halo -> body -> rim -> core
// in straight alpha and outputs a premultiplied color for proper over-blend
// against the 2D canvas below (stars, background, vignette).

export type Point2 = { x: number; y: number };
export type FamilyPath = {
  id: string;
  color: string;       // "#rrggbb"
  value: number;       // used for seed
  points: Point2[];    // sampled CPU path (~90 points)
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const BEAM_VERT = `
precision mediump float;
attribute vec2 aPos;
attribute float aSide;
attribute float aT;
attribute vec3 aColor;

uniform vec2 uResolution;
uniform float uDimHighlight;
uniform float uIsHighlight;

varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;
varying vec2 vWorld;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vT = aT;
  vColor = aColor;
  vIntensity = uDimHighlight * (1.0 + uIsHighlight * 0.3);
  vWorld = aPos;
}
`;

const BEAM_FRAG = `
precision mediump float;
varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;
varying vec2 vWorld;

uniform float uTime;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Composite a layer (srcRgb, srcA) "over" an accumulated (rgb, a).
// Straight-alpha Porter-Duff over.
vec4 over(vec4 acc, vec3 srcRgb, float srcA) {
  float outA = srcA + acc.a * (1.0 - srcA);
  vec3 outRgb = srcRgb * srcA + acc.rgb * acc.a * (1.0 - srcA);
  if (outA > 0.0001) outRgb /= outA;
  return vec4(outRgb, outA);
}

void main() {
  float d = abs(vSide);
  // Soft halo just outside the body; flat body; narrow rim highlight at
  // the body edge; hairline white centerline. Tuned so each layer is an
  // independent alpha contribution rather than additive brightness.
  float halo = exp(-d * d * 2.0) * (1.0 - smoothstep(0.75, 1.0, d));
  float body = 1.0 - smoothstep(0.72, 0.98, d);
  float rim = smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.85, 0.98, d));
  float core = exp(-d * d * 240.0);

  float lenFade = smoothstep(0.0, 0.22, vT) * (1.0 - smoothstep(0.96, 1.0, vT));
  float cardBoost = 1.0 + smoothstep(0.5, 0.95, vT) * 0.2;

  // Subtle noise modulation along the beam — gives dust/grain feel without
  // a separate particle pass.
  float g = 0.7 + 0.4 * hash12(floor(vWorld * 0.35) + floor(vec2(uTime * 0.7, 0.0)));
  float grainMix = mix(0.88, 1.08, g);

  // Layer alphas (straight, 0..~1).
  float aHalo = clamp(halo * 0.45, 0.0, 1.0);
  float aBody = clamp(body * 0.92 * grainMix, 0.0, 1.0);
  float aRim = clamp(rim * 0.7, 0.0, 1.0);
  float aCore = clamp(core * 0.65, 0.0, 1.0);

  // Per-layer colors.
  vec3 cHalo = vColor * 0.85;
  vec3 cBody = vColor;
  vec3 cRim = mix(vColor, vec3(1.0), 0.25);
  vec3 cCore = vec3(1.0);

  // Composite halo -> body -> rim -> core using over.
  vec4 acc = vec4(cHalo, aHalo);
  acc = over(acc, cBody, aBody);
  acc = over(acc, cRim, aRim);
  acc = over(acc, cCore, aCore);

  // Modulate overall opacity by length + intensity.
  float finalA = acc.a * lenFade * cardBoost * vIntensity;
  // Premultiplied alpha output for gl.ONE, gl.ONE_MINUS_SRC_ALPHA blend.
  gl_FragColor = vec4(acc.rgb * finalA, finalA);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("Program link failed: " + log);
  }
  return p;
}

function normalAt(pts: Point2[], i: number) {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}

const BEAM_STRIDE_F = 7; // pos(2) + side(1) + t(1) + color(3)
const BEAM_STRIDE_B = BEAM_STRIDE_F * 4;

export type FlowBeamConfig = {
  beamHalfWidth: number;
};

type BeamGroup = {
  familyId: string;
  beamOffset: number;
  beamCount: number;
};

export class FlowRenderer {
  private gl: WebGLRenderingContext;
  private beamProg: WebGLProgram;
  private beamVbo: WebGLBuffer;
  private beamAttribs: Record<string, number>;
  private beamUniforms: Record<string, WebGLUniformLocation | null>;
  private groups: BeamGroup[] = [];
  private width: number;
  private height: number;
  private dpr: number;
  private canvas: HTMLCanvasElement;
  private disposed = false;
  private startTime: number;

  constructor(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.startTime = performance.now();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const bvs = compile(gl, gl.VERTEX_SHADER, BEAM_VERT);
    const bfs = compile(gl, gl.FRAGMENT_SHADER, BEAM_FRAG);
    this.beamProg = link(gl, bvs, bfs);
    this.beamVbo = gl.createBuffer()!;
    this.beamAttribs = {
      aPos: gl.getAttribLocation(this.beamProg, "aPos"),
      aSide: gl.getAttribLocation(this.beamProg, "aSide"),
      aT: gl.getAttribLocation(this.beamProg, "aT"),
      aColor: gl.getAttribLocation(this.beamProg, "aColor"),
    };
    this.beamUniforms = {
      uResolution: gl.getUniformLocation(this.beamProg, "uResolution"),
      uDimHighlight: gl.getUniformLocation(this.beamProg, "uDimHighlight"),
      uIsHighlight: gl.getUniformLocation(this.beamProg, "uIsHighlight"),
      uTime: gl.getUniformLocation(this.beamProg, "uTime"),
    };
  }

  resize(width: number, height: number, dpr = this.dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  buildGeometry(families: FamilyPath[], cfg: FlowBeamConfig, _phase: number) {
    const { beamHalfWidth } = cfg;
    const beamVerts: number[] = [];
    const groups: BeamGroup[] = [];

    for (const fam of families) {
      const rgb = hexToRgb(fam.color);
      const pts = fam.points;
      const n = pts.length;
      const beamStart = beamVerts.length / BEAM_STRIDE_F;

      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const p = pts[i];
        const norm = normalAt(pts, i);
        const hw = beamHalfWidth;
        const lx = p.x + norm.x * -hw;
        const ly = p.y + norm.y * -hw;
        const rx = p.x + norm.x * hw;
        const ry = p.y + norm.y * hw;
        if (i === 0) beamVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2]);
        beamVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2]);
        beamVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2]);
        if (i === n - 1) beamVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2]);
      }

      const beamEnd = beamVerts.length / BEAM_STRIDE_F;
      groups.push({
        familyId: fam.id,
        beamOffset: beamStart,
        beamCount: beamEnd - beamStart,
      });
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(beamVerts), gl.DYNAMIC_DRAW);
    this.groups = groups;
  }

  render(highlightId: string | null) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // Premultiplied alpha-over: src is already multiplied by alpha in the shader.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const now = (performance.now() - this.startTime) / 1000;

    gl.useProgram(this.beamProg);
    gl.uniform2f(this.beamUniforms.uResolution!, this.width, this.height);
    gl.uniform1f(this.beamUniforms.uTime!, now);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamVbo);
    const ba = this.beamAttribs;
    const enableB = (loc: number, size: number, off: number) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, BEAM_STRIDE_B, off);
    };
    enableB(ba.aPos, 2, 0);
    enableB(ba.aSide, 1, 8);
    enableB(ba.aT, 1, 12);
    enableB(ba.aColor, 3, 16);

    for (const g of this.groups) {
      const isHl = highlightId === g.familyId ? 1 : 0;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.25) : 1;
      gl.uniform1f(this.beamUniforms.uDimHighlight!, dim);
      gl.uniform1f(this.beamUniforms.uIsHighlight!, isHl);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.beamOffset, g.beamCount);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.beamVbo);
    gl.deleteProgram(this.beamProg);
  }
}
