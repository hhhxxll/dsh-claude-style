/**
 * The DeepSeek background's motion decision: when the dynamic layer draws and
 * when it stands still, from the preference, the reader's motion choice and
 * the page's visibility alone.
 *
 * @capability deepseek-background
 * @features deepseek-background
 * @risk The dynamic layer keeps drawing behind the reader's back (a hidden page or a reduced-motion reader), or a mode switch leaves the canvas mounted.
 */
import { expect, test } from 'vitest'
import { shouldAnimateDeepseekBackground } from '@dsh-claude-style/client/pure'

test('only the dynamic mode in the foreground with motion allowed animates', () => {
  expect(shouldAnimateDeepseekBackground('dynamic', false, false)).toBe(true)
})

test('the static and off modes never animate', () => {
  expect(shouldAnimateDeepseekBackground('static', false, false)).toBe(false)
  expect(shouldAnimateDeepseekBackground('off', false, false)).toBe(false)
  expect(shouldAnimateDeepseekBackground('', false, false)).toBe(false)
})

test('a reduced-motion reader or a hidden page stands the dynamic layer still', () => {
  expect(shouldAnimateDeepseekBackground('dynamic', true, false)).toBe(false)
  expect(shouldAnimateDeepseekBackground('dynamic', false, true)).toBe(false)
  expect(shouldAnimateDeepseekBackground('dynamic', true, true)).toBe(false)
})
