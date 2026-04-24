// WebGL flow renderer — per-pixel glow + proper taper for strand bundles,
// plus a second POINTS pass for sparkle embers drifting along each strand.
// The 2D canvas below keeps background/stars/compression corridor; this
// renderer draws strands and sparkles only.

export type Point2 = { x: number; y: number };
export type FamilyPath = {
  id: string;
  color: string;       // "#rrggbb"
  value: number;       // used for seed
  points: Point2[];    // sampled CPU path (~120 points)
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---- Strand program ------------------------------------------------------

const STRAND_VERT = `
precision mediump float;
attribute vec2 aPos;
attribute float aSide;
attribute float aT;
attribute vec3 aColor;
attribute float aIntensity;
attribute float aLead;       // 0 or 1 — lead strands have a brighter core

uniform vec2 uResolution;
uniform float uDimHighlight;
uniform float uIsHighlight;

varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;
varying float vLead;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vT = aT;
  vColor = aColor;
  vIntensity = aIntensity * uDimHighlight * (1.0 + uIsHighlight * 0.4);
  vLead = aLead;
}
`;

const STRAND_FRAG = `
precision mediump float;
varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;
varying float vLead;

void main() {
  float d = vSide;
  // Tight individual strands — halo is narrow relative to the extruded quad
  // so each strand reads as a distinct filament rather than blending into a band.
  float haloFalloff = mix(4.0, 3.2, vLead);
  float coreFalloff = mix(26.0, 42.0, vLead);
  float glow = exp(-d * d * haloFalloff);
  float core = exp(-d * d * coreFalloff);
  float taper = smoothstep(0.0, 0.10, vT) * (1.0 - smoothstep(0.90, 1.0, vT));
  float coreMix = mix(0.45, 0.8, vLead);
  float a = (glow * 0.5 + core * (0.9 + 0.8 * vLead)) * taper * vIntensity;
  vec3 rgb = mix(vColor * 1.2, vec3(1.0), core * coreMix);
  gl_FragColor = vec4(rgb * a, a);
}
`;

// ---- Sparkle program -----------------------------------------------------

const SPARK_VERT = `
precision mediump float;
attribute vec2 aPos;
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;

uniform vec2 uResolution;
uniform float uPixelScale;
uniform float uDimHighlight;
uniform float uIsHighlight;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = aSize * uPixelScale;
  vColor = aColor;
  vAlpha = aAlpha * uDimHighlight * (1.0 + uIsHighlight * 0.4);
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
  float glow = exp(-d * d * 10.0);
  float core = exp(-d * d * 55.0);
  float a = (glow * 1.2 + core * 2.2) * vAlpha;
  vec3 rgb = mix(vColor * 1.5, vec3(1.0), core * 0.85);
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

// Strand vertex stride: pos(2) + side(1) + t(1) + color(3) + intensity(1) + lead(1) = 9 floats
const STRAND_STRIDE_F = 9;
const STRAND_STRIDE_B = STRAND_STRIDE_F * 4;

// Sparkle vertex stride: pos(2) + size(1) + color(3) + alpha(1) = 7 floats
const SPARK_STRIDE_F = 7;
const SPARK_STRIDE_B = SPARK_STRIDE_F * 4;

export type FlowStrandConfig = {
  strandsPerFamily: number;
  bundleWidth: number;
  glowWidth: number;
  leadEvery: number;       // every Nth strand is a "lead" strand
  sparklesPerStrand: number;
};

type StrandGroup = {
  familyId: string;
  offset: number;
  count: number;
  sparkOffset: number;
  sparkCount: number;
};

export class FlowRenderer {
  private gl: WebGLRenderingContext;
  private strandProg: WebGLProgram;
  private sparkProg: WebGLProgram;
  private strandVbo: WebGLBuffer;
  private sparkVbo: WebGLBuffer;
  private strandAttribs: Record<string, number>;
  private sparkAttribs: Record<string, number>;
  private strandUniforms: Record<string, WebGLUniformLocation | null>;
  private sparkUniforms: Record<string, WebGLUniformLocation | null>;
  private groups: StrandGroup[] = [];
  private width: number;
  private height: number;
  private dpr: number;
  private canvas: HTMLCanvasElement;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const svs = compile(gl, gl.VERTEX_SHADER, STRAND_VERT);
    const sfs = compile(gl, gl.FRAGMENT_SHADER, STRAND_FRAG);
    this.strandProg = link(gl, svs, sfs);
    this.strandVbo = gl.createBuffer()!;
    this.strandAttribs = {
      aPos: gl.getAttribLocation(this.strandProg, "aPos"),
      aSide: gl.getAttribLocation(this.strandProg, "aSide"),
      aT: gl.getAttribLocation(this.strandProg, "aT"),
      aColor: gl.getAttribLocation(this.strandProg, "aColor"),
      aIntensity: gl.getAttribLocation(this.strandProg, "aIntensity"),
      aLead: gl.getAttribLocation(this.strandProg, "aLead"),
    };
    this.strandUniforms = {
      uResolution: gl.getUniformLocation(this.strandProg, "uResolution"),
      uDimHighlight: gl.getUniformLocation(this.strandProg, "uDimHighlight"),
      uIsHighlight: gl.getUniformLocation(this.strandProg, "uIsHighlight"),
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
      uIsHighlight: gl.getUniformLocation(this.sparkProg, "uIsHighlight"),
    };
  }

  resize(width: number, height: number, dpr = this.dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  // Build strand + sparkle vertex buffers for this frame. Called every RAF so
  // the wave phase and sparkle positions animate.
  buildGeometry(families: FamilyPath[], cfg: FlowStrandConfig, phase: number) {
    const { strandsPerFamily, bundleWidth, glowWidth, leadEvery, sparklesPerStrand } = cfg;
    const strandVerts: number[] = [];
    const sparkVerts: number[] = [];
    const groups: StrandGroup[] = [];
    for (const fam of families) {
      const rgb = hexToRgb(fam.color);
      const groupStart = strandVerts.length / STRAND_STRIDE_F;
      const sparkStart = sparkVerts.length / SPARK_STRIDE_F;
      const pts = fam.points;
      const n = pts.length;
      for (let s = 0; s < strandsPerFamily; s += 1) {
        const sRatio = strandsPerFamily <= 1 ? 0 : s / (strandsPerFamily - 1);
        const bias = Math.sign(sRatio - 0.5) * Math.pow(Math.abs(sRatio - 0.5) * 2, 1.25) * 0.5;
        const baseOffset = bias * bundleWidth;
        const seed = s * 1.73 + fam.value * (1 + (s % 5) * 0.19);
        const waveAmp = 0.9 + (s % 7) * 0.35;
        const waveFreqA = 2 + (s % 3);
        const waveFreqB = 5 + (s % 4);
        // Every Nth strand is a lead strand — brighter and tighter core.
        const isLead = s % leadEvery === 0 ? 1 : 0;
        const innerBias = 1 - Math.abs(sRatio - 0.5) * 2;
        const intensity = isLead
          ? 0.75 + innerBias * 0.3
          : 0.35 + innerBias * 0.4 + (s % 3) * 0.08;

        // Cache final strand points for sparkle sampling.
        const strandPts: Point2[] = new Array(n);

        for (let i = 0; i < n; i += 1) {
          const t = i / (n - 1);
          const p = pts[i];
          const norm = normalAt(pts, i);
          const compression = 1 - Math.pow(Math.sin(Math.PI * t), 2.2) * 0.88;
          // End-fan: extra spread near the endpoints so strands don't converge to one point at cards.
          const endFan = 1 - 4 * t * (1 - t);
          const wave =
            Math.sin(t * Math.PI * waveFreqA + seed + phase * 0.7) * 2.6 * waveAmp +
            Math.sin(t * Math.PI * waveFreqB + seed * 0.7 + phase * 0.5) * 1.3 * waveAmp +
            Math.sin(t * Math.PI * (waveFreqA + waveFreqB) + seed * 1.7 + phase * 0.3) * 0.55 * waveAmp;
          const totalOffset = baseOffset * compression + baseOffset * endFan * 0.6 + wave;
          const cx = p.x + norm.x * totalOffset;
          const cy = p.y + norm.y * totalOffset;
          strandPts[i] = { x: cx, y: cy };
          const lx = cx + norm.x * -glowWidth;
          const ly = cy + norm.y * -glowWidth;
          const rx = cx + norm.x * glowWidth;
          const ry = cy + norm.y * glowWidth;
          if (i === 0) {
            strandVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], intensity, isLead);
          }
          strandVerts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], intensity, isLead);
          strandVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], intensity, isLead);
          if (i === n - 1) {
            strandVerts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], intensity, isLead);
          }
        }

        // Sparkle embers drifting along this strand. t advances with phase so
        // sparkles travel along the strand over time.
        for (let k = 0; k < sparklesPerStrand; k += 1) {
          const base = (k / sparklesPerStrand) + (seed * 0.017);
          const driftSpeed = 0.06 + ((s * 7 + k * 13) % 7) / 80;
          const tRaw = (base + phase * driftSpeed) % 1;
          const t = tRaw < 0 ? tRaw + 1 : tRaw;
          const tVisible = 0.08 + t * 0.84;
          const idx = Math.min(n - 1, Math.max(0, Math.floor(tVisible * (n - 1))));
          const sp = strandPts[idx];
          if (!sp) continue;
          // Bigger, brighter sparkles — leads pop especially hard.
          const sizeBase = isLead ? 8 : 4.5;
          const size = sizeBase + ((s * 3 + k * 11) % 10) / 3;
          const alpha = (isLead ? 1.1 : 0.7) * (0.6 + ((s * 5 + k * 7) % 10) / 14);
          sparkVerts.push(sp.x, sp.y, size, rgb[0], rgb[1], rgb[2], alpha);
        }
      }
      const groupEnd = strandVerts.length / STRAND_STRIDE_F;
      const sparkEnd = sparkVerts.length / SPARK_STRIDE_F;
      groups.push({
        familyId: fam.id,
        offset: groupStart,
        count: groupEnd - groupStart,
        sparkOffset: sparkStart,
        sparkCount: sparkEnd - sparkStart,
      });
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strandVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strandVerts), gl.DYNAMIC_DRAW);
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

    // -- Strand pass --
    gl.useProgram(this.strandProg);
    gl.uniform2f(this.strandUniforms.uResolution!, this.width, this.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strandVbo);
    const sa = this.strandAttribs;
    const enable = (loc: number, size: number, off: number) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRAND_STRIDE_B, off);
    };
    enable(sa.aPos, 2, 0);
    enable(sa.aSide, 1, 8);
    enable(sa.aT, 1, 12);
    enable(sa.aColor, 3, 16);
    enable(sa.aIntensity, 1, 28);
    enable(sa.aLead, 1, 32);

    for (const g of this.groups) {
      const isHl = highlightId === g.familyId ? 1 : 0;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.2) : 1;
      gl.uniform1f(this.strandUniforms.uDimHighlight!, dim);
      gl.uniform1f(this.strandUniforms.uIsHighlight!, isHl);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.offset, g.count);
    }

    // Disable strand attribs before swapping programs
    if (sa.aPos >= 0) gl.disableVertexAttribArray(sa.aPos);
    if (sa.aSide >= 0) gl.disableVertexAttribArray(sa.aSide);
    if (sa.aT >= 0) gl.disableVertexAttribArray(sa.aT);
    if (sa.aColor >= 0) gl.disableVertexAttribArray(sa.aColor);
    if (sa.aIntensity >= 0) gl.disableVertexAttribArray(sa.aIntensity);
    if (sa.aLead >= 0) gl.disableVertexAttribArray(sa.aLead);

    // -- Sparkle pass --
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
      const isHl = highlightId === g.familyId ? 1 : 0;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.2) : 1;
      gl.uniform1f(this.sparkUniforms.uDimHighlight!, dim);
      gl.uniform1f(this.sparkUniforms.uIsHighlight!, isHl);
      gl.drawArrays(gl.POINTS, g.sparkOffset, g.sparkCount);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.strandVbo);
    gl.deleteBuffer(this.sparkVbo);
    gl.deleteProgram(this.strandProg);
    gl.deleteProgram(this.sparkProg);
  }
}
