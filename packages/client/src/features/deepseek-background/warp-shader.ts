/**
 * The DeepSeek site's blue-and-white hero wash (`ds-hero-section`): a
 * domain-warped swirl marble field (`scale: 0.5`, `rotation: -5`,
 * `offsetY: 65`, `distortion: 20`, `swirl: 12`, `swirlIterations: 8`,
 * `shapeScale: 10`, `softness: 100`, `speed: 14`, `#8AA3D6` / `#FFFFFF` /
 * `#FFFFFF`). Static draws the first frame once; dynamic advances the field
 * on the feature's drift cadence.
 */

const VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float time;
uniform float dark;
out vec4 color;

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float t = 0.07 * time;
  uv -= 0.5;
  uv *= 0.0035 * resolution;
  uv = rotate(uv, -5.0 * 3.14159265358979323846 / 180.0);
  uv /= pixelRatio;
  uv += vec2(0.5, 1.15);

  float n1 = valueNoise(uv + t);
  float n2 = valueNoise(uv * 2.0 - t);
  float angle = n1 * 6.28318530718;
  uv.x += 0.8 * n2 * cos(angle);
  uv.y += 0.8 * n2 * sin(angle);

  for (int i = 1; i <= 8; i++) {
    float step = float(i);
    uv.x += 0.24 / step * cos(t + step * 1.5 * uv.y);
    uv.y += 0.24 / step * cos(t + step * uv.x);
  }

  vec2 checks = uv * 0.85;
  float shape = 0.5 + 0.5 * sin(checks.x) * cos(checks.y);
  vec3 c1 = mix(vec3(0.541176, 0.639216, 0.839216), vec3(0.165, 0.255, 0.420), dark);
  vec3 c2 = mix(vec3(1.0), vec3(0.090, 0.118, 0.165), dark);
  vec3 c3 = mix(vec3(1.0), vec3(0.075, 0.082, 0.102), dark);
  vec3 col = mix(c1, c2, smoothstep(0.0, 0.7, shape));
  col = mix(col, c3, smoothstep(0.3, 1.0, shape));
  color = vec4(col, 1.0);
}`

/** One WebGL field and the state needed to draw and pause it. */
export interface DeepseekWarp {
  resize(): void
  draw(now?: number): void
  park(): void
  dispose(): void
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('deepseek-background: the shader could not be created')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`deepseek-background: ${gl.getShaderInfoLog(shader) ?? 'shader failed to compile'}`)
  return shader
}

export function createDeepseekWarp(canvas: HTMLCanvasElement): DeepseekWarp {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  if (gl === null) throw new Error('deepseek-background: the canvas has no webgl2 context')
  const program = gl.createProgram()
  if (program === null) throw new Error('deepseek-background: the program could not be created')
  const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`deepseek-background: ${gl.getProgramInfoLog(program) ?? 'shader failed to link'}`)
  gl.useProgram(program)
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of ['resolution', 'pixelRatio', 'time', 'dark']) uniforms[name] = gl.getUniformLocation(program, name)
  let dpr = 1
  let start: number | null = null
  let elapsed = 0

  return {
    resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    },
    draw(now?: number) {
      if (now !== undefined) {
        if (start === null) start = now - elapsed
        elapsed = now - start
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uniforms.resolution!, canvas.width, canvas.height)
      gl.uniform1f(uniforms.pixelRatio!, dpr)
      gl.uniform1f(uniforms.time!, elapsed / 1000)
      gl.uniform1f(uniforms.dark!, document.body.hasAttribute('data-ds-dark-theme') ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    park() {
      start = null
    },
    dispose() {
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
