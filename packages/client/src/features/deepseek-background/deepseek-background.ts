import { requestFrame } from '@dsh-claude-style/engine/frame'
import type { FrameTask } from '@dsh-claude-style/engine/frame'
import { buildElement } from '@dsh-claude-style/engine/dom'
import { motionReduced } from '../../core/prefs'
import { DEEPSEEK_DRIFT_MS, shouldAnimateDeepseekBackground } from './motion-state'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './deepseek-background.manifest'

/**
 * The conversation area's DeepSeek wash (features/deepseek-background/
 * deepseek-background.css): one decoration layer inside the conversation
 * column, above its background and under its content, drawn by CSS gradients
 * in the static mode and by one slow canvas over them in the dynamic one. The
 * layer never takes a press and the column's own layout is not touched.
 *
 * The mode change rides `setMode`; the canvas joins it only there. The drift
 * redraws on a timer, not per frame, stops while the page is hidden or the
 * reader holds animation still, and leaves with the mode or the feature — a
 * static switch takes the canvas away whole.
 */

/** The layer's mark, which the stylesheet reads for the mode. */
const LAYER_ATTRIBUTE = 'data-dsh-claude-deepseek-background'

/** One mount: the layer in its column, the dynamic canvas, and what owns it. */
interface Mount {
  column: HTMLElement
  layer: HTMLElement
  canvas: HTMLCanvasElement | null
  /** The drift's pending timer; 0 while none is set. */
  timer: number
  /** Cancels the frame the drift's draw waits on; null while none is set. */
  cancelFrame: (() => void) | null
  stopVisibility: () => void
}

/** The drift the page is running right now; one at a time. */
let drift: Mount | null = null

/**
 * Stand the wash in `column` for `mode`. The returned handle moves the mode
 * (`setMode`), sizes the canvas to the column (`resize`), and takes everything
 * back (`stop`), whatever the mode was.
 */
export function installDeepseekBackground(column: HTMLElement, mode: 'static' | 'dynamic') {
  const layer = buildElement('div', 'dsh-claude-deepseek-layer')
  layer.setAttribute(LAYER_ATTRIBUTE, mode)
  layer.setAttribute('aria-hidden', 'true')
  // The layer never takes a press, whatever stylesheets stand: the wash must
  // not block a row, a menu or the composer over it.
  layer.style.pointerEvents = 'none'
  layer.style.zIndex = '-1'
  column.appendChild(layer)
  const mount: Mount = { column, layer, canvas: null, timer: 0, cancelFrame: null, stopVisibility: () => {} }
  if (mode === 'dynamic') mountCanvas(mount)
  return {
    layer,
    setMode(next: 'static' | 'dynamic') {
      if (next === mode || layer.parentElement !== column) return
      mode = next
      layer.setAttribute(LAYER_ATTRIBUTE, mode)
      if (mode === 'dynamic') mountCanvas(mount)
      else unmountCanvas(mount)
    },
    resize() {
      sizeCanvas(mount)
    },
    stop() {
      unmountCanvas(mount)
      if (layer.parentElement === column) layer.remove()
      if (drift === mount) drift = null
    },
  }
}

/** Build the canvas and start the drift loop, once. */
function mountCanvas(mount: Mount) {
  if (mount.canvas !== null) return
  const canvas = buildElement('canvas', 'dsh-claude-deepseek-canvas') as HTMLCanvasElement
  canvas.setAttribute('aria-hidden', 'true')
  mount.layer.appendChild(canvas)
  mount.canvas = canvas
  sizeCanvas(mount)
  // A page coming back from a background tab waits out no timer: hearing the
  // flip restarts the drift the moment the page is in front again.
  const onVisibility = () => { syncDrift(mount) }
  document.addEventListener('visibilitychange', onVisibility)
  mount.stopVisibility = () => { document.removeEventListener('visibilitychange', onVisibility) }
  drift = mount
  syncDrift(mount)
}

/** Take the canvas and its loop away; the layer stays. */
function unmountCanvas(mount: Mount) {
  if (mount.timer !== 0) {
    window.clearTimeout(mount.timer)
    mount.timer = 0
  }
  if (mount.cancelFrame !== null) {
    mount.cancelFrame()
    mount.cancelFrame = null
  }
  mount.stopVisibility()
  mount.stopVisibility = () => {}
  if (mount.canvas !== null) {
    mount.canvas.remove()
    mount.canvas = null
  }
  if (drift === mount) drift = null
}

/** Size the canvas to the layer, at a device pixel ratio capped at 2. */
function sizeCanvas(mount: Mount) {
  const canvas = mount.canvas
  if (canvas === null) return
  const width = mount.layer.clientWidth
  const height = mount.layer.clientHeight
  if (width === 0 || height === 0) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
}

/** Whether the drift should be running, and start or stop it to match. */
function syncDrift(mount: Mount) {
  const want = shouldAnimateDeepseekBackground('dynamic', motionReduced(), document.hidden)
  if (!want) {
    if (mount.cancelFrame !== null) {
      mount.cancelFrame()
      mount.cancelFrame = null
    }
    return
  }
  if (mount.canvas === null || mount.timer !== 0 || mount.cancelFrame !== null) return
  mount.timer = window.setTimeout(() => {
    mount.timer = 0
    if (mount.canvas === null) return
    if (!shouldAnimateDeepseekBackground('dynamic', motionReduced(), document.hidden)) return
    mount.cancelFrame = requestFrame({
      write(now) {
        mount.cancelFrame = null
        if (mount.canvas === null) return
        drawDrift(mount, now)
        scheduleDrift(mount)
      },
    })
  }, DEEPSEEK_DRIFT_MS)
}

/** Wait out the drift period, then ask for the next draw. */
function scheduleDrift(mount: Mount) {
  if (mount.canvas === null) return
  syncDrift(mount)
}

/**
 * One drift step: two soft light pools crossing the layer slowly, drawn over a
 * cleared canvas. The layer's gradients carry the wash; the canvas only moves
 * the light over it, so a still page keeps the wash whole.
 */
function drawDrift(mount: Mount, now: number) {
  const canvas = mount.canvas
  const context = canvas === null ? null : canvas.getContext('2d')
  if (canvas === null || context === null) return
  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)
  const dark = document.body.hasAttribute('data-ds-dark-theme')
  const ink = dark ? 'rgba(122, 155, 240, 0.05)' : 'rgba(255, 255, 255, 0.16)'
  const seconds = now / 1000
  for (let i = 0; i < 2; i++) {
    const phase = seconds * (0.05 + i * 0.02) + i * Math.PI
    const x = width * (0.5 + 0.45 * Math.sin(phase))
    const y = height * (0.3 + 0.25 * Math.cos(phase * 0.7))
    const radius = Math.max(width, height) * (0.35 + i * 0.1)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, ink)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }
}

/** The column the wash stands in, read from the part the engine marks. */
const findColumn = () => document.querySelector<HTMLElement>('[data-dsh-claude-part~="center-column"]')

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  let mount: ReturnType<typeof installDeepseekBackground> | null = null
  let resizeObserver: ResizeObserver | null = null

  /** Mount, move or hand back, from the column and the mode the page carries. */
  function sync() {
    const column = findColumn()
    const mode = document.body.getAttribute('data-dsh-claude-deepseek-background')
    const wanted = mode === 'static' || mode === 'dynamic' ? mode : null
    if (mount !== null && (mount.layer.parentElement !== column || wanted === null)) {
      stopMount()
    }
    if (mount === null && column !== null && wanted !== null) {
      mount = installDeepseekBackground(column, wanted)
      resizeObserver = new ResizeObserver(() => { mount?.resize() })
      resizeObserver.observe(column)
    } else if (mount !== null && wanted !== null) {
      mount.setMode(wanted)
    }
  }

  function stopMount() {
    if (resizeObserver !== null) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (mount !== null) {
      mount.stop()
      mount = null
    }
  }

  ui.deepseekBackground = { sync }
  return () => {
    stopMount()
    delete ui.deepseekBackground
  }
}
