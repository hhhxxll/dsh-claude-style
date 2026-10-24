import * as React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { hostSlots, conversationSessionId, findConversationSession } from '@dsh-claude-style/engine/host'
import { holdReader } from '@dsh-claude-style/engine/scroll-owner'
import { createTurnNavHost } from '../turn-nav/turn-nav-host'
import { previousTurn } from './back-turn-step'
import type { BackPress } from './back-turn-step'
import { copy } from './copy'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './back-turn.manifest'

/**
 * The conversation header's back-to-previous-answer button.
 *
 * The jump is the host's own (features/turn-nav/turn-nav-host.ts presses the
 * host rail's mark), so it pages in a turn outside the loaded window and
 * lands exactly where the navigator's Alt+↑ lands. What this feature adds is
 * the reach: a press in the header's utilities seat, next to the skin's own
 * right-panel control, where the reader's pointer already is.
 *
 * The render reads the DOM alone; the session's turns and the reading
 * position are read once per press, when the reader asks for the jump.
 */
export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  /** The seat the button registers in, shared with the right-panel control (header-band). */
  const UTILITIES_SLOT = 'conversation.session.header.utilities'
  const host = createTurnNavHost(ctx)
  let lastPress: BackPress | null = null
  let disposed = false

  /**
   * One press: walk one turn back from the reading position, or from the
   * previous press while the chain holds. The follow stands down the way it
   * does after the reader's own wheel, so the next burst of output does not
   * drag the view back to the end.
   */
  function press() {
    const rail = host.findRail()
    const session = findConversationSession()
    const sessionId = conversationSessionId(session)
    if (rail === null || sessionId === null || !host.railShown(rail)) return
    const items = host.turnItems(sessionId)
    const now = Date.now()
    const turn = previousTurn(items, host.currentIndex(rail, items), lastPress, sessionId, now)
    if (turn === null) return
    lastPress = { sessionId, turn, at: now }
    host.jumpToTurn(turn, (scroller) => {
      if (scroller !== null) holdReader(scroller)
    })
  }

  /** The button itself. The render reads the DOM alone — the rail's presence
   * decides whether the button stands — because the turns and the reading
   * position come through the host's session services, and a render that read
   * them would do so on every frame of every conversation page. The press
   * reads them once, when the reader asks for the jump. */
  function BackButton() {
    const rail = host.findRail()
    if (rail === null || !host.railShown(rail)) return null
    return React.createElement(primitives.Tooltip, {
      label: copy('backTurnHint'),
      side: 'bottom',
      delayMs: 500,
      children: React.createElement('button', {
        type: 'button',
        'aria-label': copy('backTurnRow'),
        'data-dsh-claude-back-turn': '',
        className: 'dsh-claude-icon-button',
        onClick: press,
      }, React.createElement(primitives.IconChevronUpOutlineRegular, { size: 16 })),
    })
  }

  if (typeof ctx.inject !== 'function') return () => {
    disposed = true
    host.stop()
  }
  ctx.inject(['slots'], (scope) => {
    const slots = hostSlots(scope)
    if (slots === undefined || slots === null || typeof slots.inject !== 'function') return
    scope.effect(() => slots.inject(UTILITIES_SLOT, () => slots.register(
      { name: UTILITIES_SLOT, id: 'claude-style-back-turn', order: 85 },
      BackButton,
    )), 'dsh-claude-style: back-to-previous-turn')
  })

  return () => {
    disposed = true
    host.stop()
  }
}
