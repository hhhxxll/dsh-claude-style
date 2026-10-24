/**
 * The back button's one step: which turn a press goes to, from the rail's
 * reading position and the press that came before it.
 *
 * @capability back-turn
 * @features back-turn
 * @risk A chained press jumps back to the turn it just left (the view is still gliding), or the button walks past the first turn.
 */
import { expect, test } from 'vitest'
import { BACK_REPEAT_MS, previousTurn } from '@dsh-claude-style/client/pure'

const items = [{ turn: 3 }, { turn: 7 }, { turn: 12 }, { turn: 20 }]

test('a press from the reading position walks one turn back', () => {
  expect(previousTurn(items, 2, null, 's1', 1000)).toBe(7)
  expect(previousTurn(items, 3, null, 's1', 1000)).toBe(12)
})

test('a press at the first turn goes nowhere', () => {
  expect(previousTurn(items, 0, null, 's1', 1000)).toBe(null)
})

test('an unknown reading position goes nowhere', () => {
  expect(previousTurn(items, -1, null, 's1', 1000)).toBe(null)
})

test('a chained press inside the window continues from the last press', () => {
  const last = { sessionId: 's1', turn: 7, at: 1000 }
  // The rail still reads turn 12 (index 2) while the view glides to 7 (index 1);
  // the chain continues from 7 and lands on turn 3 (index 0).
  expect(previousTurn(items, 2, last, 's1', 1000 + BACK_REPEAT_MS - 1)).toBe(3)
})

test('a press outside the window starts from the reading position again', () => {
  const last = { sessionId: 's1', turn: 7, at: 1000 }
  expect(previousTurn(items, 2, last, 's1', 1000 + BACK_REPEAT_MS)).toBe(7)
})

test("a press in another session starts from that session's reading position", () => {
  const last = { sessionId: 's1', turn: 7, at: 1000 }
  expect(previousTurn(items, 2, last, 's2', 1000 + 1)).toBe(7)
})

test('a chained press whose turn is gone from the list starts from the reading position', () => {
  const last = { sessionId: 's1', turn: 99, at: 1000 }
  expect(previousTurn(items, 3, last, 's1', 1000 + 1)).toBe(12)
})
