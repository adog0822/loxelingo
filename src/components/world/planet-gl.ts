import { FRAGMENT_SHADER, VERTEX_SHADER } from "./planet-shader";

/**
 * Raw WebGL2. No library.
 * docs/design/discovery-planet-render.md §1, §6, §8
 *
 * Measured, not estimated: three.js is 127.6 KB gzip for this scene and cannot
 * tree-shake, because importing WebGLRenderer pulls the whole shader-chunk
 * graph. OGL is 13.9 KB. This harness is under 1 KB gzip and is the entire
 * implementation. The scene is one fullscreen triangle and zero cameras — the
 * sphere is ray-traced analytically in the fragment shader and there is no
 * mesh at all, so a scene graph and a material system would sit unused.
 *
 * ONE CONTEXT, MANY BODIES. Measured in §6 of that document: creating 24
 * contexts left exactly 16 alive and force-lost the page's own canvas, and
 * getContext never returned null while doing it. Android's cap is 8. So every
 * body on the screen is drawn into one canvas through gl.viewport plus
 * gl.scissor — the "one context, N viewports" arrangement. N is at most seven
 * and each body is under 200 CSS px, so N draw calls is not a cost worth
 * optimising into a single multi-sphere pass.
 */

export interface BodyDraw {
  /** Device-pixel rect inside the canvas, y measured from the TOP. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Seconds. The body's phase offset is already folded in by the caller. */
  readonly time: number;
  readonly atmos: readonly [number, number, number];
  readonly mark: readonly [number, number, number];
  readonly deep: readonly [number, number, number];
  readonly sun: readonly [number, number, number];
  readonly axis: readonly [number, number, number];
  /** seed, plainsLo, plainsHi, craterAmp */
  readonly terrain: readonly [number, number, number, number];
  /** ridgeAmp, plainTint, purity, limb */
  readonly surface: readonly [number, number, number, number];
}

export interface PlanetField {
  /** Returns false if the backing store did not need to change. */
  resize(cssWidth: number, cssHeight: number, dpr: number): boolean;
  draw(bodies: readonly BodyDraw[]): void;
  /**
   * Recompile the program and recreate the VAO on the SAME context, for use
   * from a `webglcontextrestored` handler. A restored context comes back with
   * every object it owned deleted, so redrawing without this draws nothing.
   * Returns false if the rebuild failed, in which case the caller should keep
   * its CSS fallback showing.
   */
  rebuild(): boolean;
  dispose(): void;
  readonly canvas: HTMLCanvasElement;
}

export interface PlanetFieldOptions {
  /**
   * A field that will be drawn once and never again. The drawing buffer must
   * be preserved, because with the default attributes it is cleared as soon as
   * it has been presented and a single frame would flash and vanish. Costs a
   * copy per frame, which is exactly zero frames here.
   */
  readonly still: boolean;
  /**
   * Accept a software rasteriser. Off for the animated path, where a context
   * that renders at 2 fps is worse than no context; on for the still path,
   * where one frame from llvmpipe is still the real body.
   */
  readonly allowSoftware: boolean;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, src.trim());
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[world body] shader compile failed\n", gl.getShaderInfoLog(shader));
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Returns null when WebGL2 is unavailable. The caller keeps its CSS body
 * showing in that case: there is no image asset in any path.
 */
export function createPlanetField(
  canvas: HTMLCanvasElement,
  options: PlanetFieldOptions,
): PlanetField | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: options.still,
    powerPreference: "low-power",
    // The important flag: without it getContext hands back a SwiftShader /
    // llvmpipe context that renders at a few frames per second.
    failIfMajorPerformanceCaveat: !options.allowSoftware,
  });
  if (gl === null) return null;

  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let uResolution: WebGLUniformLocation | null = null;
  let uOrigin: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uAtmos: WebGLUniformLocation | null = null;
  let uMark: WebGLUniformLocation | null = null;
  let uDeep: WebGLUniformLocation | null = null;
  let uSun: WebGLUniformLocation | null = null;
  let uAxis: WebGLUniformLocation | null = null;
  let uTerrain: WebGLUniformLocation | null = null;
  let uSurface: WebGLUniformLocation | null = null;

  const build = (): boolean => {
    if (gl.isContextLost()) return false;

    if (vao !== null) gl.deleteVertexArray(vao);
    if (program !== null) gl.deleteProgram(program);
    vao = null;
    program = null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (vs === null || fs === null) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return false;
    }

    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    // Correct after a successful link, and a real leak if omitted.
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[world body] program link failed\n", gl.getProgramInfoLog(p));
      }
      gl.deleteProgram(p);
      return false;
    }

    program = p;
    gl.useProgram(program);

    // A VAO is required in WebGL2 even with no attributes.
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // getUniformLocation is a string lookup. Cache once, never in the loop.
    const u = (name: string) => gl.getUniformLocation(p, name);
    uResolution = u("iResolution");
    uOrigin = u("iOrigin");
    uTime = u("iTime");
    uAtmos = u("uAtmos");
    uMark = u("uMark");
    uDeep = u("uDeep");
    uSun = u("uSun");
    uAxis = u("uAxis");
    uTerrain = u("uTerrain");
    uSurface = u("uSurface");

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    return true;
  };

  if (!build()) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  // Scratch, so the draw loop allocates nothing.
  const v3 = new Float32Array(3);
  const v4 = new Float32Array(4);
  const set3 = (loc: WebGLUniformLocation | null, s: readonly number[]) => {
    v3[0] = s[0];
    v3[1] = s[1];
    v3[2] = s[2];
    gl.uniform3fv(loc, v3);
  };
  const set4 = (loc: WebGLUniformLocation | null, s: readonly number[]) => {
    v4[0] = s[0];
    v4[1] = s[1];
    v4[2] = s[2];
    v4[3] = s[3];
    gl.uniform4fv(loc, v4);
  };

  let disposed = false;

  return {
    canvas,

    resize(cssWidth, cssHeight, dpr) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      // Guarded: assigning canvas.width reallocates the backing store.
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    },

    rebuild: build,

    draw(bodies) {
      if (disposed || program === null || gl.isContextLost()) return;

      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);

      for (const b of bodies) {
        if (b.w <= 0 || b.h <= 0) continue;
        // WebGL's origin is bottom-left; layout rects are top-left.
        const glY = canvas.height - (b.y + b.h);
        gl.viewport(b.x, glY, b.w, b.h);
        gl.scissor(b.x, glY, b.w, b.h);

        gl.uniform2f(uResolution, b.w, b.h);
        gl.uniform2f(uOrigin, b.x, glY);
        gl.uniform1f(uTime, b.time);
        set3(uAtmos, b.atmos);
        set3(uMark, b.mark);
        set3(uDeep, b.deep);
        set3(uSun, b.sun);
        set3(uAxis, b.axis);
        set4(uTerrain, b.terrain);
        set4(uSurface, b.surface);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.disable(gl.SCISSOR_TEST);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      gl.bindVertexArray(null);
      if (vao !== null) gl.deleteVertexArray(vao);
      if (program !== null) gl.deleteProgram(program);
      // Dropping the JS reference does NOT promptly free the context: it waits
      // for GC, and the budget is 16 contexts (8 on Android), whose overflow
      // silently force-loses the OLDEST canvas on the page. This is the only
      // way to give it back now.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
