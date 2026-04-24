// WebGL flow renderer — one wide glowing beam per family with grain particles.
// Matches the parallel-beam reference aesthetic: each fund has its own solid
// colored band with soft outer halo, bright body, and ultra-thin white core;
// dust-like sparkles drift inside each beam to give it a fiber-like grain.

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

// ---- Beam program --------------------------------------------------------
//
// Each family is one triangle strip. aSide ranges across the beam's width
// from -1 (top edge) through 0 (center) to +1 (bottom edge). The fragment
// shader composes halo + body + white-hot core as exponential falloffs of
// that normalized cross-beam distance, then modulates by a length fade and
// a low-frequency grain texture.

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
  vIntensity = uDimHighlight * (1.0 + uIsHighlight * 0.35);
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

// Cheap pseudo-noise for grain striations along the beam.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float grain(vec2 p) {
  // Horizontal striation: vary mostly along y, repeat tightly
  return 0.75 + 0.5 * hash12(vec2(floor(p.x * 0.25), floor(p.y * 0.9)));
}

void main() {
  float d = abs(vSide);
  // Near-flat body with a wide halo that gently dims at the edges, plus an
  // ultra-thin white centerline highlight. Solid saturated color fill.
  float halo = exp(-d * d * 1.5);
  float body = 1.0 - smoothstep(0.55, 1.0, d);
  float core = exp(-d * d * 180.0);

  float lenFade = smoothstep(0.0, 0.22, vT) * (1.0 - smoothstep(0.96, 1.0, vT));
  float cardBoost = 1.0 + smoothstep(0.5, 0.95, vT) * 0.25;

  float g = grain(vWorld + vec2(uTime * 35.0, 0.0));
  float grainMix = mix(0.85, 1.08, g);

  // Solid colored body + soft halo + thin white highlight.
  vec3 rgb = vColor * (body * 0.9 + halo * 0.28);
  rgb += vec3(1.0) * core * 0.5;
  float alpha = (body * 0.72 + halo * 0.26 + core * 0.4) * lenFade * cardBoost * vIntensity * grainMix;

  gl_FragColor = vec4(rgb * alpha, alpha);
}
`;

// ---- Sparkle program -----------------------------------------------------
// Dust particles scattered inside each beam. Much smaller and more numerous
// than the prior "ember" sparkles — the goal here is a fine grain texture,
// not prominent dots. Each particle drifts slowly along the beam length.

const SPARK_VERT = `
precision mediump float;
attribute vec2 aPos;
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;

uniform vec2 uResolution;
uniform float uPixelScale;
uniform float uDimHighlight;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = aSize * uPixelScale;
  vColor = aColor;
  vAlpha = aAlpha * uDimHighlight;
}
`;

const SPARK_FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float core = exp(-d * d * 48.0);
  float halo = exp(-d * d * 10.0);
  float a = (halo * 0.5 + core * 1.8) * vAlpha;
  vec3 rgb = mix(vColor * 1.3, vec3(1.0), core * 0.7);
  gl_FragColor = vec4(rgb * a, a);
}
`;

// --------------------------------------------------------------------------

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

// Beam vertex stride: pos(2) + side(1) + t(1) + color(3) = 7 floats
const BEAM_STRIDE_F = 7;
const BEAM_STRIDE_B = BEAM_STRIDE_F * 4;
// Sparkle vertex stride: pos(2) + size(1) + color(3) + alpha(1) = 7 floats
const SPARK_STRIDE_F = 7;
const SPARK_STRIDE_B = SPARK_STRIDE_F * 4;

export type FlowBeamConfig = {
  beamHalfWidth: number;     // half-height of the extruded beam in logical px
  grainParticles: number;    // sparkle/dust particles per family
};

type BeamGroup = {
  familyId: string;
  beamOffset: number;
  beamCount: number;
  sparkOffset: number;
  sparkCount: number;
};

export class FlowRenderer {
  private gl: WebGLRenderingContext;
  private beamProg: WebGLProgram;
  private sparkProg: WebGLProgram;
  private beamVbo: WebGLBuffer;
  private sparkVbo: WebGLBuffer;
  private beamAttribs: Record<string, number>;
  private sparkAttribs: Record<string, number>;
  private beamUniforms: Record<string, WebGLUniformLocation | null>;
  private sparkUniforms: Record<string, WebGLUniformLocation | null>;
  private groups: BeamGroup[] = [];
  private width: number;
  private height: number;
  private dpr: number;
  private canvas: HTMLCanvasElement;
  private disposed = false;
  private startTime: number;

  constructor(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
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

    const pvs = compile(gl, gl.VERTEX_SHADER, SPARK_VERT);
    const pfs = compile(gl, gl.FRAGMENT_SHADER, SPARK_FRAG);
    this.sparkProg = link(gl, pvs, pfs);
    this.sparkVbo = gl.createBuffer()!;
    this.sparkAttribs = {
      aPos: gl.getAttribLocation(this.sparkProg, "aPos"),
      aSize: gl.getAttribLocation(this.sparkProg, "aSize"),
      aColor: gl.getAttribLocation(this.sparkProg, "aColor"),
      aAlpha: gl.getAttribLocation(this.sparkProg, "aAlpha"),
    };
    this.sparkUniforms = {
      uResolution: gl.getUniformLocation(this.sparkProg, "uResolution"),
      uPixelScale: gl.getUniformLocation(this.sparkProg, "uPixelScale"),
      uDimHighlight: gl.getUniformLocation(this.sparkProg, "uDimHighlight"),
    };
  }

  resize(width: number, height: number, dpr = this.dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  buildGeometry(families: FamilyPath[], cfg: FlowBeamConfig, phase: number) {
    const { beamHalfWidth, grainParticles } = cfg;
    const beamVerts: number[] = [];
    const sparkVerts: number[] = [];
    const groups: BeamGroup[] = [];

    for (const fam of families) {
      const rgb = hexToRgb(fam.color);
      const pts = fam.points;
      const n = pts.length;
      const beamStart = beamVerts.length / BEAM_STRIDE_F;
      const sparkStart = sparkVerts.length / SPARK_STRIDE_F;

      // Build the beam triangle strip. For each sample along the path emit two
      // vertices: (-beamHalfWidth, +beamHalfWidth) perpendicular to the path.
      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const p = pts[i];
        const norm = normalAt(pts, i);
        const hw = beamHalfWidth;
        const lx = p.x + norm.x * -hw;
        const ly = p.y + norm.y * -hw;
        const rx = p.x + norm.x * hw;
        const ry = p.y + norm.y * hw;
        // Degenerate start
        if (i === 0) beamVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2]);
        beamVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2]);
        beamVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2]);
        // Degenerate end
        if (i === n - 1) beamVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2]);
      }

      // Grain particles — scattered within the beam's area, drifting along t.
      for (let k = 0; k < grainParticles; k += 1) {
        // Seeded t drift — particles travel from source to card.
        const baseT = (k / grainParticles + (k * 0.37 + fam.value * 0.013) + phase * 0.04) % 1;
        const t = baseT < 0 ? baseT + 1 : baseT;
        const tVisible = 0.05 + t * 0.9;
        const idx = Math.min(n - 1, Math.max(0, Math.floor(tVisible * (n - 1))));
        const bp = pts[idx];
        const norm = normalAt(pts, idx);
        // Random offset across beam width — biased toward the center a bit.
        const spread = (((k * 7.31 + fam.value * 2.17) % 1) * 2 - 1);
        const biased = Math.sign(spread) * Math.pow(Math.abs(spread), 0.9);
        const offset = biased * beamHalfWidth * 0.85;
        const sx = bp.x + norm.x * offset;
        const sy = bp.y + norm.y * offset;
        const sizeRand = ((k * 13.7 + fam.value * 5.3) % 10);
        const size = 1.3 + sizeRand / 6; // mostly tiny specks, occasional bigger dot
        const alphaRand = ((k * 3.1 + fam.value * 1.7) % 10);
        const alpha = 0.35 + alphaRand / 18;
        sparkVerts.push(sx, sy, size, rgb[0], rgb[1], rgb[2], alpha);
      }

      const beamEnd = beamVerts.length / BEAM_STRIDE_F;
      const sparkEnd = sparkVerts.length / SPARK_STRIDE_F;
      groups.push({
        familyId: fam.id,
        beamOffset: beamStart,
        beamCount: beamEnd - beamStart,
        sparkOffset: sparkStart,
        sparkCount: sparkEnd - sparkStart,
      });
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(beamVerts), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sparkVerts), gl.DYNAMIC_DRAW);
    this.groups = groups;
  }

  render(highlightId: string | null) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const now = (performance.now() - this.startTime) / 1000;

    // -- Beam pass --
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

    if (ba.aPos >= 0) gl.disableVertexAttribArray(ba.aPos);
    if (ba.aSide >= 0) gl.disableVertexAttribArray(ba.aSide);
    if (ba.aT >= 0) gl.disableVertexAttribArray(ba.aT);
    if (ba.aColor >= 0) gl.disableVertexAttribArray(ba.aColor);

    // -- Grain sparkle pass --
    gl.useProgram(this.sparkProg);
    gl.uniform2f(this.sparkUniforms.uResolution!, this.width, this.height);
    gl.uniform1f(this.sparkUniforms.uPixelScale!, this.dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkVbo);
    const pa = this.sparkAttribs;
    const enableP = (loc: number, size: number, off: number) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, SPARK_STRIDE_B, off);
    };
    enableP(pa.aPos, 2, 0);
    enableP(pa.aSize, 1, 8);
    enableP(pa.aColor, 3, 12);
    enableP(pa.aAlpha, 1, 24);

    for (const g of this.groups) {
      if (g.sparkCount === 0) continue;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.25) : 1;
      gl.uniform1f(this.sparkUniforms.uDimHighlight!, dim);
      gl.drawArrays(gl.POINTS, g.sparkOffset, g.sparkCount);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.beamVbo);
    gl.deleteBuffer(this.sparkVbo);
    gl.deleteProgram(this.beamProg);
    gl.deleteProgram(this.sparkProg);
  }
}
