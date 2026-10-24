/**
 * The restart polling loop's own logic: what one boot probe answered, when
 * the process behind the page has been replaced, and when the poll ceiling
 * turns the wait into a timeout.
 *
 * @capability restart
 * @features restart
 * @risk The page reloads into the OLD process while it drains (the restart looks like it did nothing), or the wait outlives every reader's patience with no way out.
 */
import { expect, test } from 'vitest'
import { bootReplaced, nextPollState, probeFromBoot, RESTART_MAX_POLLS, restartArrived } from '@dsh-claude-style/client/pure'

test('a boot answer folds into a probe', () => {
  expect(probeFromBoot({ ok: true, boot: '27468-1792827098612', desktop: true }, 200))
    .toEqual({ up: true, ready: false, boot: '27468-1792827098612', desktop: true })
  expect(probeFromBoot({ ok: true, boot: '', desktop: false }, 200).boot).toBe(null)
  expect(probeFromBoot({}, 409)).toEqual({ up: false, ready: false, boot: null, desktop: false })
})

test('the same boot identity means the process was not replaced', () => {
  const probe = { up: true, ready: true, boot: 'a-1', desktop: true }
  expect(bootReplaced('a-1', probe)).toBe(false)
  expect(restartArrived('a-1', probe)).toBe(false)
})

test('a different boot identity replaces the old process once the page is served', () => {
  const probe = { up: true, ready: true, boot: 'b-2', desktop: true }
  expect(bootReplaced('a-1', probe)).toBe(true)
  expect(restartArrived('a-1', probe)).toBe(true)
  // Liveness alone is not arrival: the page must answer too.
  expect(restartArrived('a-1', { ...probe, ready: false })).toBe(false)
})

test('an unreadable boot on either side counts as replaced while the host is up', () => {
  expect(bootReplaced(null, { up: true, ready: false, boot: 'x', desktop: true })).toBe(true)
  expect(bootReplaced('a-1', { up: true, ready: true, boot: null, desktop: true })).toBe(true)
  // A host that is not answering replaced nothing.
  expect(bootReplaced('a-1', { up: false, ready: false, boot: null, desktop: false })).toBe(false)
})

test('the poll ceiling turns the wait into a timeout exactly once', () => {
  let state = { polls: 0, timedOut: false }
  for (let i = 0; i < RESTART_MAX_POLLS - 1; i++) state = nextPollState(state)
  expect(state).toEqual({ polls: RESTART_MAX_POLLS - 1, timedOut: false })
  state = nextPollState(state)
  expect(state).toEqual({ polls: RESTART_MAX_POLLS, timedOut: true })
  state = nextPollState(state)
  expect(state.timedOut).toBe(true)
})
