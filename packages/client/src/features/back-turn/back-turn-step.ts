/**
 * One press of the back button, as a pure step: which turn the jump goes to,
 * from the rail's reading position and the press that came before.
 */
export interface TurnRef {
  turn: number
}

/** The press state the button keeps: which session, which turn, when. */
export interface BackPress {
  sessionId: string
  turn: number
  at: number
}

/**
 * How long a press chains from the one before it: the same value the
 * navigator's Alt+↑ keys use (features/turn-nav/turn-nav.ts KEY_REPEAT_MS),
 * so the button and the keys walk at the same pace.
 */
export const BACK_REPEAT_MS = 1200

/**
 * The turn one press goes back to.
 *
 * Inside the repeat window the walk continues from the LAST press's turn —
 * the view is still gliding there, so the reading position would send a
 * chained press back to the turn it just left. Outside it, or in another
 * session, the walk starts from the reading position.
 *
 * @returns the turn to jump to, or null when the reading position is unknown
 *     or already at the first turn.
 */
export function previousTurn(items: readonly TurnRef[], currentIndex: number, last: BackPress | null, sessionId: string, now: number, repeatMs = BACK_REPEAT_MS): number | null {
  let from = currentIndex
  if (last !== null && last.sessionId === sessionId && now - last.at < repeatMs) {
    // The turn the last press landed on may have left the list (the host's
    // own lag on a new turn); the chain then starts from the reading
    // position rather than from a turn nobody holds.
    const chained = items.findIndex((item) => item.turn === last.turn)
    if (chained >= 0) from = chained
  }
  const to = from - 1
  if (to < 0) return null
  return items[to].turn
}
