import { requestFrame } from '@dsh-claude-style/engine/frame'
import { buildElement } from '@dsh-claude-style/engine/dom'
import { cacheFirstMatch } from '@dsh-claude-style/engine/host'
import { motionReduced } from '../../core/prefs'
import { DEEPSEEK_DRIFT_MS, shouldAnimateDeepseekBackground } from './motion-state'
import { createDeepseekWarp } from './warp-shader'
import type { DeepseekWarp } from './warp-shader'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './deepseek-background.manifest'

/**
 * The DeepSeek wash across the whole conversation area. Static and dynamic
 * share the same Warp texture: static draws its first frame and stops there;
 * dynamic advances the texture on a slow timer. The layer never takes a press
 * or moves the transcript.
 */

/** The layer's mark, which the stylesheet reads for the mode. */
const LAYER_ATTRIBUTE = 'data-dsh-claude-deepseek-background'

/** One mount: the layer in its column, the Warp canvas, and its animation. */
interface Mount {
  column: HTMLElement
  layer: HTMLElement
  canvas: HTMLCanvasElement | null
  warp: DeepseekWarp | null
  dark: boolean
  timer: number
  cancelFrame: (() => void) | null
  stopVisibility: () => void
  stopContext: () => void
}

/**
 * Stand the wash in `column` for `mode`. `setMode` changes it in place;
 * `stop` cancels the timer, the frame, the observers and the GPU resources.
 */
export function installDeepseekBackground(column: HTMLElement, mode: 'static' | 'dynamic') {
  const layer = buildElement('div', 'dsh-claude-deepseek-layer')
  layer.setAttribute(LAYER_ATTRIBUTE, mode)
  layer.setAttribute('aria-hidden', 'true')
  layer.style.pointerEvents = 'none'
  layer.style.zIndex = '-1'
  column.appendChild(layer)
  const canvas = buildElement('canvas', 'dsh-claude-deepseek-canvas') as HTMLCanvasElement
  canvas.setAttribute('aria-hidden', 'true')
  layer.appendChild(canvas)
  const warp = createDeepseekWarp(canvas)
  const mount: Mount = {
    column,
    layer,
    canvas,
    warp,
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    timer: 0,
    cancelFrame: null,
    stopVisibility: () => {},
    stopContext: () => {},
  }

  const onVisibility = () => { syncDrift(mount, mode) }
  const onMotion = () => { syncDrift(mount, mode) }
  const onLost = (event: Event) => { event.preventDefault() }
  const onRestored = () => {
    mount.warp?.dispose()
    mount.warp = createDeepseekWarp(canvas)
    mount.warp.resize()
    mount.warp.draw()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  mount.stopContext = () => {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
  }
  if (mode === 'dynamic') {
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('dsh-claude-motion-change', onMotion)
    mount.stopVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('dsh-claude-motion-change', onMotion)
    }
  }
  resizeCanvas(mount)
  syncDrift(mount, mode)

  return {
    layer,
    setMode(next: 'static' | 'dynamic') {
      if (layer.parentElement !== column) return
      const nextDark = document.body.hasAttribute('data-ds-dark-theme')
      if (next === mode) {
        if (nextDark !== mount.dark) {
          mount.dark = nextDark
          mount.warp?.draw()
        }
        syncDrift(mount, mode)
        return
      }
      stopDrift(mount)
      mount.stopVisibility()
      mount.stopVisibility = () => {}
      mode = next
      mount.dark = nextDark
      layer.setAttribute(LAYER_ATTRIBUTE, mode)
      if (mode === 'dynamic') {
        document.addEventListener('visibilitychange', onVisibility)
        document.addEventListener('dsh-claude-motion-change', onMotion)
        mount.stopVisibility = () => {
          document.removeEventListener('visibilitychange', onVisibility)
          document.removeEventListener('dsh-claude-motion-change', onMotion)
        }
        syncDrift(mount, mode)
      } else {
        mount.warp?.draw()
      }
    },
    resize() { resizeCanvas(mount) },
    stop() {
      stopDrift(mount)
      mount.stopVisibility()
      mount.stopContext()
      mount.warp?.dispose()
      mount.warp = null
      if (layer.parentElement === column) layer.remove()
    },
  }
}

/** Cancel a pending timer and frame without touching the canvas. */
function stopDrift(mount: Mount) {
  if (mount.timer !== 0) {
    window.clearTimeout(mount.timer)
    mount.timer = 0
  }
  if (mount.cancelFrame !== null) {
    mount.cancelFrame()
    mount.cancelFrame = null
  }
  mount.warp?.park()
}

/** Size and redraw the texture after a column resize. */
function resizeCanvas(mount: Mount) {
  mount.warp?.resize()
  mount.warp?.draw()
}

/** Start or hold the texture according to motion and page visibility. */
function syncDrift(mount: Mount, mode: 'static' | 'dynamic') {
  if (!shouldAnimateDeepseekBackground(mode, motionReduced(), document.hidden)) {
    stopDrift(mount)
    return
  }
  if (mount.canvas === null || mount.timer !== 0 || mount.cancelFrame !== null) return
  mount.timer = window.setTimeout(() => {
    mount.timer = 0
    if (mount.canvas === null) return
    if (!shouldAnimateDeepseekBackground(mode, motionReduced(), document.hidden)) return
    mount.cancelFrame = requestFrame({
      write(now) {
        mount.cancelFrame = null
        if (mount.canvas === null) return
        mount.dark = document.body.hasAttribute('data-ds-dark-theme')
        mount.warp?.draw(now)
        syncDrift(mount, mode)
      },
    })
  }, DEEPSEEK_DRIFT_MS)
}

/** The column the wash stands in, kept from the part the engine marks (D40). */
const findColumn = cacheFirstMatch<HTMLElement>('[data-dsh-claude-part~="center-column"]')

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  let mount: ReturnType<typeof installDeepseekBackground> | null = null
  let resizeObserver: ResizeObserver | null = null

  function sync() {
    const column = findColumn()
    const mode = document.body.getAttribute(LAYER_ATTRIBUTE)
    const wanted = mode === 'static' || mode === 'dynamic' ? mode : null
    if (mount !== null && (mount.layer.parentElement !== column || wanted === null)) stopMount()
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
