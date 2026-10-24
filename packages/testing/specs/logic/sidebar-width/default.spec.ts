/**
 * The sidebar's default width, mapped to the host contract's minimum (264px):
 * only the host's own default (280px) maps, and every other width the reader
 * or the host wrote stands.
 *
 * @capability sidebar-width
 * @features shared
 * @risk A width the reader dragged to is shrunk back to the default, or a second pass of the rule shrinks the sidebar again on every pass.
 */
import { expect, test } from 'vitest'
import { sidebarDefaultWidth } from '@dsh-claude-style/client/pure'

test('the host\'s own default maps to the contract minimum', () => {
  expect(sidebarDefaultWidth('280px')).toBe('264px')
  expect(sidebarDefaultWidth(' 280px ')).toBe('264px')
})

test('a width the reader dragged to, the collapse and anything else stand', () => {
  expect(sidebarDefaultWidth('264px')).toBe(null)
  expect(sidebarDefaultWidth('320px')).toBe(null)
  expect(sidebarDefaultWidth('420px')).toBe(null)
  expect(sidebarDefaultWidth('0px')).toBe(null)
  expect(sidebarDefaultWidth('')).toBe(null)
  expect(sidebarDefaultWidth('280')).toBe(null)
  expect(sidebarDefaultWidth('280PX')).toBe(null)
  expect(sidebarDefaultWidth('minmax(0px, 1fr)')).toBe(null)
})
