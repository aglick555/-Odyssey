// WebGL flow renderer — per-pixel glow + proper taper for strand bundles.
// Drops onto a dedicated canvas layered under the DOM card overlay; the 2D
// canvas below it keeps the background wash, vignette, stars, and the
// compression corridor gradient. This renderer only produces the strands.

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

const VERT_SRC = `
precision mediump float;
attribute vec2 aPos;
attribute float aSide;       // -1 .. +1 across strand width
attribute float aT;          // 0 .. 1 along strand
attribute vec3 aColor;
attribute float aIntensity;  // per-strand base intensity

uniform vec2 uResolution;    // logical WIDTH, HEIGHT
uniform float uDimHighlight; // 1 = full, <1 = dimmed (for non-hover highlight)
uniform float uIsHighlight;  // 1 if this family is the active highlight, else 0

varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;

void main() {
  // logical -> clip
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vT = aT;
  vColor = aColor;
  vIntensity = aIntensity * uDimHighlight * (1.0 + uIsHighlight * 0.4);
}
`;

const FRAG_SRC = `
precision mediump float;
varying float vSide;
varying float vT;
varying vec3 vColor;
varying float vIntensity;

void main() {
  // gaussian glow across width — soft halo with bright core
  float d = vSide;
  float glow = exp(-d * d * 2.4);           // wide halo
  float core = exp(-d * d * 16.0);          // thin bright core
  // endpoint taper — smooth fade at t=0 and t=1
  float taper = smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.88, 1.0, vT));
  // compose: colored halo + near-white core
  float a = (glow * 0.55 + core * 0.9) * taper * vIntensity;
  vec3 rgb = mix(vColor * 1.2, vec3(1.0), core * 0.45);
  gl_FragColor = vec4(rgb * a, a);
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

// Stride per vertex: 2 (pos) + 1 (side) + 1 (t) + 3 (color) + 1 (intensity) = 8 floats
const STRIDE_F = 8;
const STRIDE_B = STRIDE_F * 4;

export type FlowStrandConfig = {
  strandsPerFamily: number; // e.g. 18
  bundleWidth: number;      // logical pixels across the bundle spread
  glowWidth: number;        // logical pixels of half-glow-width perpendicular
};

type StrandGroup = {
  familyId: string;
  offset: number; // vertex offset in global buffer
  count: number;  // vertex count
};

export class FlowRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;
  private attribs: { aPos: number; aSide: number; aT: number; aColor: number; aIntensity: number };
  private uniforms: { uResolution: WebGLUniformLocation; uDimHighlight: WebGLUniformLocation; uIsHighlight: WebGLUniformLocation };
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
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    this.program = link(gl, vs, fs);
    this.vbo = gl.createBuffer()!;
    this.attribs = {
      aPos: gl.getAttribLocation(this.program, "aPos"),
      aSide: gl.getAttribLocation(this.program, "aSide"),
      aT: gl.getAttribLocation(this.program, "aT"),
      aColor: gl.getAttribLocation(this.program, "aColor"),
      aIntensity: gl.getAttribLocation(this.program, "aIntensity"),
    };
    this.uniforms = {
      uResolution: gl.getUniformLocation(this.program, "uResolution")!,
      uDimHighlight: gl.getUniformLocation(this.program, "uDimHighlight")!,
      uIsHighlight: gl.getUniformLocation(this.program, "uIsHighlight")!,
    };
  }

  resize(width: number, height: number, dpr = this.dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  // Build vertex buffer. phase is the animation phase baked in at build time;
  // callers re-call buildGeometry every frame to animate.
  buildGeometry(families: FamilyPath[], cfg: FlowStrandConfig, phase: number) {
    const { strandsPerFamily, bundleWidth, glowWidth } = cfg;
    const verts: number[] = [];
    const groups: StrandGroup[] = [];
    for (const fam of families) {
      const rgb = hexToRgb(fam.color);
      const groupStart = verts.length / STRIDE_F;
      const pts = fam.points;
      const n = pts.length;
      for (let s = 0; s < strandsPerFamily; s += 1) {
        const sRatio = strandsPerFamily <= 1 ? 0 : s / (strandsPerFamily - 1);
        // non-linear bias — denser in the middle, sparser at edges
        const bias = Math.sign(sRatio - 0.5) * Math.pow(Math.abs(sRatio - 0.5) * 2, 1.3) * 0.5;
        const baseOffset = bias * bundleWidth;
        const seed = s * 1.73 + fam.value * (1 + (s % 5) * 0.19);
        // per-strand wave multiplier in [0.5 .. 2]
        const waveAmp = 0.5 + (s % 7) * 0.2;
        const waveFreqA = 2 + (s % 3);
        const waveFreqB = 5 + (s % 4);
        // per-strand intensity — inner strands brighter
        const intensity = 0.35 + (1 - Math.abs(sRatio - 0.5) * 2) * 0.55 + (s % 3) * 0.1;
        // emit a triangle strip; use degenerate verts at start/end to split strands
        for (let i = 0; i < n; i += 1) {
          const t = i / (n - 1);
          const p = pts[i];
          const norm = normalAt(pts, i);
          // compression factor: narrower in middle of path
          const compression = 1 - Math.pow(Math.sin(Math.PI * t), 2.2) * 0.88;
          // wave offset along normal
          const wave =
            Math.sin(t * Math.PI * waveFreqA + seed + phase * 0.7) * 2.4 * waveAmp +
            Math.sin(t * Math.PI * waveFreqB + seed * 0.7 + phase * 0.55) * 1.2 * waveAmp;
          const totalOffset = baseOffset * compression + wave;
          const cx = p.x + norm.x * totalOffset;
          const cy = p.y + norm.y * totalOffset;
          // Two vertices per sample — left and right extrusion
          const lx = cx + norm.x * -glowWidth;
          const ly = cy + norm.y * -glowWidth;
          const rx = cx + norm.x * glowWidth;
          const ry = cy + norm.y * glowWidth;
          // Degenerate start: duplicate left vertex on first sample
          if (i === 0) {
            verts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], intensity);
          }
          verts.push(lx, ly, -1, t, rgb[0], rgb[1], rgb[2], intensity);
          verts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], intensity);
          // Degenerate end: duplicate right vertex on last sample
          if (i === n - 1) {
            verts.push(rx, ry, +1, t, rgb[0], rgb[1], rgb[2], intensity);
          }
        }
      }
      const groupEnd = verts.length / STRIDE_F;
      groups.push({ familyId: fam.id, offset: groupStart, count: groupEnd - groupStart });
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    this.groups = groups;
  }

  render(highlightId: string | null) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // Additive blend in linear-ish space (works best with non-premultiplied alpha)
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, this.width, this.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const { aPos, aSide, aT, aColor, aIntensity } = this.attribs;
    if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE_B, 0); }
    if (aSide >= 0) { gl.enableVertexAttribArray(aSide); gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, STRIDE_B, 8); }
    if (aT >= 0) { gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 1, gl.FLOAT, false, STRIDE_B, 12); }
    if (aColor >= 0) { gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, STRIDE_B, 16); }
    if (aIntensity >= 0) { gl.enableVertexAttribArray(aIntensity); gl.vertexAttribPointer(aIntensity, 1, gl.FLOAT, false, STRIDE_B, 28); }

    for (const g of this.groups) {
      const isHl = highlightId === g.familyId ? 1 : 0;
      const dim = highlightId ? (highlightId === g.familyId ? 1 : 0.25) : 1;
      gl.uniform1f(this.uniforms.uDimHighlight, dim);
      gl.uniform1f(this.uniforms.uIsHighlight, isHl);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.offset, g.count);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteProgram(this.program);
  }
}
