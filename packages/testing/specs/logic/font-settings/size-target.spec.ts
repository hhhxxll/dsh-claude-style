/**
 * The font controls' size step: one pixel per press, held inside the role's
 * own official range (ui-theme's FONT_SIZE_SPECS) so a control never writes a
 * size the host would throw away.
 *
 * @capability font-settings
 * @features settings
 * @risk A stepper that walks past the host's range throws on every later press, or a step that moves the wrong role's size.
 */
import { expect, test } from 'vitest'
import { fontSizeTarget, FONT_TEXT_RANGE, FONT_CODE_RANGE } from '@dsh-claude-style/client/pure'

test('one press moves one pixel inside the role\'s range', () => {
  expect(fontSizeTarget('text', 14, 1)).toBe(15)
  expect(fontSizeTarget('text', 14, -1)).toBe(13)
  expect(fontSizeTarget('code', 11, 1)).toBe(12)
  expect(fontSizeTarget('code', 11, -1)).toBe(10)
})

test('the step holds at the range\'s ends', () => {
  expect(fontSizeTarget('text', FONT_TEXT_RANGE.max, 1)).toBe(FONT_TEXT_RANGE.max)
  expect(fontSizeTarget('text', FONT_TEXT_RANGE.min, -1)).toBe(FONT_TEXT_RANGE.min)
  expect(fontSizeTarget('code', FONT_CODE_RANGE.max, 1)).toBe(FONT_CODE_RANGE.max)
  expect(fontSizeTarget('code', FONT_CODE_RANGE.min, -1)).toBe(FONT_CODE_RANGE.min)
})

test('the ranges are the host\'s own', () => {
  expect(FONT_TEXT_RANGE).toEqual({ min: 10, max: 22 })
  expect(FONT_CODE_RANGE).toEqual({ min: 10, max: 16 })
})
