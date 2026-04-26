// WebGL flow renderer — one wide solid beam per family, plus a small set of
// thin bright "leader" fiber lines inside each beam. Alpha-over composite,
// no additive blending. The 2D canvas below keeps background + stars.

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

vec4 over(vec4 acc, vec3 srcRgb, float srcA) {
  float outA = srcA + acc.a * (1.0 - srcA);
  vec3 outRgb = srcRgb * srcA + acc.rgb * acc.a * (1.0 - srcA);
  if (outA > 0.0001) outRgb /= outA;
  return vec4(outRgb, outA);
}

void main() {
  float d = abs(vSide);
  float halo = exp(-d * d * 0.8);
  float body = 1.0 - smoothstep(0.84, 0.98, d);

  // Fine stripe texture across the body for base fiber grain
  float stripeSlot = floor(vSide * 32.0);
  float stripeRnd = hash12(vec2(stripeSlot, 0.0));
  float stripes = 0.8 + stripeRnd * 0.28;
  float flicker = 0.95 + 0.08 * hash12(vec2(stripeSlot, floor(vWorld.x * 0.015 + uTime * 0.2)));

  float lenFade = smoothstep(0.0, 0.18, vT) * (1.0 - smoothstep(0.97, 1.0, vT));

  float aHalo = clamp(halo * 0.32, 0.0, 1.0);
  float aBody = clamp(body * stripes * flicker, 0.0, 1.0);

  vec3 cHalo = vColor * 0.78;
  vec3 cBody = vColor;

  vec4 acc = vec4(cHalo, aHalo);
  acc = over(acc, cBody, aBody);

  float finalA = acc.a * lenFade * vIntensity;
  gl_FragColor = vec4(acc.rgb * finalA, finalA);
}
`;

// ---- Leader program ------------------------------------------------------
// Thin bright fiber lines rendered as narrow triangle strips inside each
// beam. Each leader runs along the same underlying path as its parent beam,
// offset perpendicular by a per-leader amount. Fragment shader paints a
// tight gaussian with a near-white core, giving the visible bright-hair
// stripe the reference shows inside each beam.

const LEADER_VERT = `
precision mediump float;
attribute vec2 aPos;
attribute float aSide;
attribute float aT;
attribute vec3 aColor;
attribute float aBrightness;

uniform vec2 uResolution;
uniform float uDimHighlight;

varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vBrightness;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vT = aT;
  vColor = aColor;
  vBrightness = aBrightness * uDimHighlight;
}
`;

const LEADER_FRAG = `
precision mediump float;
varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vBrightness;

void main() {
  float d = abs(vSide);
  // Tight gaussian across the leader width.
  float intensity = exp(-d * d * 5.0);
  // Fade in/out along the leader length.
  float lenFade = smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.95, 1.0, vT));
  // White-biased color: core fades toward white for the bright-fiber look.
  vec3 rgb = mix(vColor, vec3(1.0), 0.6);
  float a = intensity * lenFade * vBrightness;
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

const BEAM_STRIDE_F = 7; // pos(2) + side(1) + t(1) + color(3)
const BEAM_STRIDE_B = BEAM_STRIDE_F * 4;
// Leader stride: pos(2) + side(1) + t(1) + color(3) + brightness(1) = 8 floats
const LEADER_STRIDE_F = 8;
const LEADER_STRIDE_B = LEADER_STRIDE_F * 4;

export type FlowBeamConfig = {
  beamHalfWidth: number;
  leaderCount: number;       // thin bright fiber lines per beam
  leaderHalfWidth: number;   // half-thickness of each leader in logical px
};

type BeamGroup = {
  familyId: string;
  beamOffset: number;
  beamCount: number;
  leaderOffset: number;
  leaderCount: number;
};

export class FlowRenderer {
  private gl: WebGLRenderingContext;
  private beamProg: WebGLProgram;
  private leaderProg: WebGLProgram;
  private beamVbo: WebGLBuffer;
  private leaderVbo: WebGLBuffer;
  private beamAttribs: Record<string, number>;
  private leaderAttribs: Record<string, number>;
  private beamUniforms: Record<string, WebGLUniformLocation | null>;
  private leaderUniforms: Record<string, WebGLUniformLocation | null>;
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

    const lvs = compile(gl, gl.VERTEX_SHADER, LEADER_VERT);
    const lfs = compile(gl, gl.FRAGMENT_SHADER, LEADER_FRAG);
    this.leaderProg = link(gl, lvs, lfs);
    this.leaderVbo = gl.createBuffer()!;
    this.leaderAttribs = {
      aPos: gl.getAttribLocation(this.leaderProg, "aPos"),
      aSide: gl.getAttribLocation(this.leaderProg, "aSide"),
      aT: gl.getAttribLocation(this.leaderProg, "aT"),
      aColor: gl.getAttribLocation(this.leaderProg, "aColor"),
      aBrightness: gl.getAttribLocation(this.leaderProg, "aBrightness"),
    };
    this.leaderUniforms = {
      uResolution: gl.getUniformLocation(this.leaderProg, "uResolution"),
      uDimHighlight: gl.getUniformLocation(this.leaderProg, "uDimHighlight"),
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
    const { beamHalfWidth, leaderCount, leaderHalfWidth } = cfg;
    const beamVerts: number[] = [];
    const leaderVerts: number[] = [];
    const groups: BeamGroup[] = [];

    for (const fam of families) {
      const rgb = hexToRgb(fam.color);
      const pts = fam.points;
      const n = pts.length;
      const beamStart = beamVerts.length / BEAM_STRIDE_F;

      // ---- Beam body geometry ----
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
      const leaderStart = leaderVerts.length / LEADER_STRIDE_F;

      // ---- Leader strand geometry ----
      // Pick a deterministic set of offsets within the beam (avoid the very
      // edges), each leader with its own brightness.
      for (let k = 0; k < leaderCount; k += 1) {
        // Seeded offset in [-0.7, 0.7] of beam half-width
        const seedRaw = (k * 2.71828 + fam.value * 0.131) % 1;
        const seed = seedRaw < 0 ? seedRaw + 1 : seedRaw;
        const offsetFrac = (seed * 2 - 1) * 0.7;
        const offsetPx = offsetFrac * beamHalfWidth;
        // Brightness varies per leader: some prominent, some subtle
        const brightRaw = (k * 1.414 + fam.value * 0.079) % 1;
        const brightSeed = brightRaw < 0 ? brightRaw + 1 : brightRaw;
        const brightness = 0.45 + brightSeed * 0.55;

        for (let i = 0; i < n; i += 1) {
          const t = i / (n - 1);
          const p = pts[i];
          const norm = normalAt(pts, i);
          const cx = p.x + norm.x * offsetPx;
          const cy = p.y + norm.y * offsetPx;
          const hw = leaderHalfWidth;
          const lx = cx + norm.x * -hw;
          const ly = cy + norm.y * -hw;
          const rx = cx + norm.x * hw;
          const ry = cy + norm.y * hw;
          if (i === 0) leaderVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], brightness);
          leaderVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], brightness);
          leaderVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], brightness);
          if (i === n - 1) leaderVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], brightness);
        }
      }

      const leaderEnd = leaderVerts.length / LEADER_STRIDE_F;

      groups.push({
        familyId: fam.id,
        beamOffset: beamStart,
        beamCount: beamEnd - beamStart,
        leaderOffset: leaderStart,
        leaderCount: leaderEnd - leaderStart,
      });
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(beamVerts), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.leaderVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(leaderVerts), gl.DYNAMIC_DRAW);
    this.groups = groups;
  }

  render(highlightId: string | null) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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

    // -- Leader pass --
    gl.useProgram(this.leaderProg);
    gl.uniform2f(this.leaderUniforms.uResolution!, this.width, this.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.leaderVbo);
    const la = this.leaderAttribs;
    const enableL = (loc: number, size: number, off: number) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, LEADER_STRIDE_B, off);
    };
    enableL(la.aPos, 2, 0);
    enableL(la.aSide, 1, 8);
    enableL(la.aT, 1, 12);
    enableL(la.aColor, 3, 16);
    enableL(la.aBrightness, 1, 28);

    for (const g of this.groups) {
      if (g.leaderCount === 0) continue;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.25) : 1;
      gl.uniform1f(this.leaderUniforms.uDimHighlight!, dim);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.leaderOffset, g.leaderCount);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.beamVbo);
    gl.deleteBuffer(this.leaderVbo);
    gl.deleteProgram(this.beamProg);
    gl.deleteProgram(this.leaderProg);
  }
}
