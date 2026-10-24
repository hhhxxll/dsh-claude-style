/**
 * The DeepSeek background's mount: the decoration layer rides the conversation
 * column's part mark, sits under its content, and never blocks a pointer. The
 * dynamic mode's canvas joins the layer and leaves it whole; a mode switch or
 * the feature's teardown leaves no node or listener behind.
 *
 * @capability deepseek-background
 * @features deepseek-background
 * @risk A decoration layer that eats presses, paints over the transcript, or survives its feature's teardown.
 */
import { afterEach, expect, test } from 'vitest'
import { hostElement } from '../../fixtures/host-markup'
import { surfaceAttribute, surfaceClass } from '../../fixtures/surface'

/** The conversation column's part mark, from the engine's parts table. */
const PART_ATTRIBUTE = surfaceAttribute('skin.part')
const CENTER_PART = 'center-column'
/** The decoration layer's mark, which the surface table carries for the specs. */
const LAYER_ATTRIBUTE = surfaceAttribute('deepseek.layer')
const CANVAS_CLASS = surfaceClass('deepseek.canvas')

afterEach(() => { document.body.replaceChildren() })

/** The conversation column, the way the parts walk marks it. */
function centerColumn() {
  const column = hostElement(`[${PART_ATTRIBUTE}~="${CENTER_PART}"]`)
  column.style.position = 'relative'
  const content = document.createElement('div')
  content.textContent = 'transcript'
  column.appendChild(content)
  document.body.appendChild(column)
  return column
}

test('the static mode mounts one decoration layer under the content, past no pointer', async () => {
  const { installDeepseekBackground } = await import('@dsh-claude-style/client/pure')
  const column = centerColumn()
  const background = installDeepseekBackground(column, 'static')
  try {
    const layer = column.querySelector(`[${LAYER_ATTRIBUTE}]`)
    expect(layer).not.toBeNull()
    expect(layer!.getAttribute(LAYER_ATTRIBUTE)).toBe('static')
    expect(layer!.querySelector(`.${CANVAS_CLASS}`)).toBeNull()
    expect(getComputedStyle(layer as HTMLElement).pointerEvents).toBe('none')
    expect((layer as HTMLElement).style.zIndex).toBe('-1')
  } finally {
    background.stop()
  }
})

test('switching to dynamic mounts a canvas and back to static removes it whole', async () => {
  const { installDeepseekBackground } = await import('@dsh-claude-style/client/pure')
  const column = centerColumn()
  const background = installDeepseekBackground(column, 'static')
  try {
    background.setMode('dynamic')
    expect(column.querySelector(`.${CANVAS_CLASS}`)).not.toBeNull()
    expect(column.querySelector(`[${LAYER_ATTRIBUTE}]`)!.getAttribute(LAYER_ATTRIBUTE)).toBe('dynamic')
    background.setMode('static')
    expect(column.querySelector(`.${CANVAS_CLASS}`)).toBeNull()
    expect(column.querySelector(`[${LAYER_ATTRIBUTE}]`)!.getAttribute(LAYER_ATTRIBUTE)).toBe('static')
  } finally {
    background.stop()
  }
})

test('the teardown leaves the column as it stood, at every mode', async () => {
  const { installDeepseekBackground } = await import('@dsh-claude-style/client/pure')
  for (const mode of ['static', 'dynamic'] as const) {
    const column = centerColumn()
    const before = column.cloneNode(true)
    const background = installDeepseekBackground(column, mode)
    background.stop()
    expect(column.isEqualNode(before)).toBe(true)
    expect(column.getAttribute(LAYER_ATTRIBUTE)).toBeNull()
  }
})
