import { ACCOUNT_RING_ATTR, ACCOUNT_RING_PRESS_ATTR } from '../../constants'
import { ACCOUNT_RING_ALL, ACCOUNT_RING_OFF } from '@dsh-claude-style/contracts/prefs'
import type { Prefs } from '@dsh-claude-style/contracts/prefs'
import { hostSessions, hostUiSession, hostUiWorkspace } from '@dsh-claude-style/engine/host'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { HostSessionEvent, HostSnapshotSource } from '@dsh-claude-style/contracts/services'

/** What the ring reports, quietest first: the loudest state in force is the one painted. */
export const RING_STATES = ['running', 'done', 'waiting', 'failed'] as const

export type RingState = typeof RING_STATES[number]

/** One session the ring speaks for. */
interface RingSession {
  id: string
  /** The name the reader knows it by; the ring's tooltip quotes it. */
  title: string
  /** A turn of it failed, held until a turn of it ends any other way. */
  failed: boolean
  /** A turn of it finished unread, cleared when a turn of it starts again. */
  done: boolean
  /** What the host's status snapshot says of it, without the failure above. */
  held: RingState | null
}

/** What the ring reads, and what a press on it would do. */
export interface RingReading {
  state: RingState | null
  /** The session a press opens, when the reading came from one the reader can act on. */
  targetId: string | null
  /** The name of that session, for the tooltip. */
  title: string | null
}

interface RingOptions {
  /** Called when the reading changes and the row may want a repaint of its own. */
  onChange(): void
}

export interface AccountRing {
  /** Mount the ring into the account row, or take it away when the setting is off. */
  sync(row: HTMLElement | null, prefs: Prefs): void
  /** What the ring currently reports. */
  reading(): RingReading
  /** Send the reader to the session the ring speaks for; false when nothing is owed. */
  jump(): boolean
  /** Let go of the host's sessions. */
  stop(): void
}

/** The rank a state holds when several sessions speak at once. */
function rank(state: RingState): number {
  return RING_STATES.indexOf(state)
}

/** Whether a turn's end is a failure the ring keeps. */
function failedEvent(event: HostSessionEvent): boolean {
  if (event.type === 'turn/end') {
    const kind = event.data?.reason?.kind
    return kind === 'error' || kind === 'blocked'
  }
  if (event.type === 'tool/result') {
    // A tool the reader aborted says nothing about the session: the turn
    // reports its own end, and an AbortError is that end arriving early.
    return event.data?.message?.isError === true && event.data?.error?.name !== 'AbortError'
  }
  return false
}

/**
 * The ring around the account's face: one look at it says whether anything in
 * another session wants the reader. The states and what clears them live here;
 * the paint is features/account/account-footer.css and the press is
 * bindHostRowHover in account-footer.ts.
 *
 * The host offers two signals, and the ring needs both. `uiSession.sessionStatus`
 * carries one entry per session (running, waiting on the reader, finished
 * unread) and costs nothing to follow. It cannot say whether a turn *failed* —
 * that lives only in a session's own event feed, so the ring follows the feed of
 * every session that is running (one to three at a time) and keeps what it
 * learned once that session stops.
 */
export function createAccountRing(ctx: HostContext, options: RingOptions): AccountRing {
  let row: HTMLElement | null = null
  let ring: HTMLElement | null = null
  let setting: string = ACCOUNT_RING_OFF
  const sessions = new Map<string, RingSession>()
  const followed = new Map<string, () => void>()
  let statusSeen: unknown = null
  let stopStatus: (() => void) | null = null
  let current: RingReading = { state: null, targetId: null, title: null }

  /** The session the reader is looking at: they can see it, so it asks for nothing. */
  function currentId(): string | null {
    const key = hostUiSession(ctx)?.current?.value?.key
    return typeof key === 'string' ? key : null
  }

  function sessionFor(id: string): RingSession {
    let held = sessions.get(id)
    if (held === undefined) {
      held = { id, title: id, failed: false, done: false, held: null }
      sessions.set(id, held)
    }
    return held
  }

  /** The names the host lists, so a tooltip can speak for a session that stopped. */
  function titles(): Map<string, string> {
    const known = new Map<string, string>()
    const snapshot = hostSessions(ctx)?.list?.getSnapshot()
    const byId = snapshot?.byId ?? {}
    for (const id of Object.keys(byId)) known.set(id, byId[id]?.displayTitle ?? id)
    return known
  }

  /** Take the status snapshot the host publishes for every session. */
  function readStatus(): void {
    const source = hostUiSession(ctx)?.sessionStatus
    if (source === undefined || source === null) return
    if (source !== statusSeen) {
      stopStatus?.()
      statusSeen = source
      stopStatus = typeof source.subscribe === 'function' ? source.subscribe(() => { readStatus(); notify() }) : null
    }
    if (typeof source.getSnapshot !== 'function') return
    const names = titles()
    const me = currentId()
    const seen = new Set<string>()
    for (const [id, entry] of source.getSnapshot()) {
      const held = sessionFor(id)
      const status = entry as { running?: boolean, pendingInteraction?: unknown, completionUnread?: boolean }
      held.title = names.get(id) ?? held.title
      seen.add(id)
      // The two soft states are the host's answer alone: a session's feed says
      // what happened inside it, the status says whether the turn is over.
      held.done = id !== me && status.completionUnread === true
      held.held = status.pendingInteraction ? 'waiting' : status.running === true ? 'running' : null
      if (status.running === true) follow(id)
      else unfollow(id)
    }
    // A session the host stopped listing is gone: its ring is spent.
    for (const id of [...sessions.keys()]) if (!seen.has(id)) sessions.delete(id)
  }

  function take(held: RingSession, entries: unknown): void {
    if (!Array.isArray(entries)) return
    for (const item of entries) {
      const event = (item as { event?: HostSessionEvent } | null)?.event
      if (event === undefined || event === null || typeof event.type !== 'string') continue
      if (failedEvent(event)) held.failed = true
      // A turn that ended any way but a failure is the session working again:
      // the failure it carried is answered, and the ring lets it go.
      else if (event.type === 'turn/end') held.failed = false
    }
  }

  function follow(id: string): void {
    if (followed.has(id)) return
    const feed: HostSnapshotSource<{ entries: unknown[], change?: { kind?: string, entries?: unknown[] } }> | undefined =
      hostSessions(ctx)?.binding(id)?.eventSource
    if (feed === undefined || feed === null || typeof feed.subscribe !== 'function') return
    const held = sessionFor(id)
    // Whatever the feed already holds was written before the ring attached and
    // is still the session's state: a failure in it is not history.
    take(held, feed.getSnapshot()?.entries)
    followed.set(id, feed.subscribe(() => {
      const latest = feed.getSnapshot()
      const change = latest?.change
      if (change?.kind === 'append') take(held, change.entries)
      else if (change?.kind === 'replace') take(held, latest?.entries)
      notify()
    }))
  }

  function unfollow(id: string): void {
    const stop = followed.get(id)
    if (stop === undefined) return
    followed.delete(id)
    stop()
  }

  /** The state one session holds, as the reader would see it. */
  function stateOf(held: RingSession, me: string | null): RingState | null {
    if (held.failed) return 'failed'
    if (held.held === 'waiting') return 'waiting'
    // The reader's own session is not news: only its running turn can matter,
    // and only the widest setting asks for that either.
    if (held.id === me) return null
    if (held.held === 'running') return setting === ACCOUNT_RING_ALL ? 'running' : null
    return held.done ? 'done' : null
  }

  /** Read every session into one reading: the loudest state, and the session behind it. */
  function read(): RingReading {
    if (setting === ACCOUNT_RING_OFF) return { state: null, targetId: null, title: null }
    const me = currentId()
    let state: RingState | null = null
    let target: RingSession | null = null
    for (const held of sessions.values()) {
      const held_state = stateOf(held, me)
      if (held_state === null) continue
      if (state === null || rank(held_state) > rank(state)) {
        state = held_state
        target = held
      }
    }
    // A running turn asks for no press: there is nothing to go and read yet, so
    // the press keeps opening the account card.
    const pressable = state !== null && state !== 'running' ? target : null
    return { state, targetId: pressable?.id ?? null, title: pressable?.title ?? null }
  }

  function unmount(): void {
    ring?.remove()
    ring = null
    row?.removeAttribute(ACCOUNT_RING_PRESS_ATTR)
    row?.removeAttribute('title')
  }

  function paint(): void {
    if (row === null) return
    if (current.state === null) {
      unmount()
      return
    }
    // The host repaints its own row, which drops whatever stood in it: a ring
    // that left the row is built again rather than written to off the page.
    if (ring !== null && !ring.isConnected) ring = null
    if (ring === null) {
      ring = document.createElement('span')
      ring.className = 'dsh-claude-account-ring'
      ring.setAttribute('aria-hidden', 'true')
      row.appendChild(ring)
    }
    ring.setAttribute(ACCOUNT_RING_ATTR, current.state)
    // The title is the one way a ring the reader cannot see the reason for says
    // what it wants: a press takes them there, so the words offer that.
    if (current.title !== null) {
      ring.setAttribute('title', current.title)
      row.setAttribute('title', current.title)
      row.setAttribute(ACCOUNT_RING_PRESS_ATTR, '')
    } else {
      ring.removeAttribute('title')
      row.removeAttribute('title')
      row.removeAttribute(ACCOUNT_RING_PRESS_ATTR)
    }
  }

  function notify(): void {
    const next = read()
    const changed = next.state !== current.state || next.targetId !== current.targetId || next.title !== current.title
    current = next
    paint()
    if (changed) options.onChange()
  }

  return {
    sync(nextRow: HTMLElement | null, prefs: Prefs) {
      setting = prefs.accountRing
      if (nextRow !== row) {
        unmount()
        row = nextRow
      }
      if (row === null || setting === ACCOUNT_RING_OFF) {
        unmount()
        return
      }
      readStatus()
      notify()
    },
    reading(): RingReading {
      return current
    },
    jump(): boolean {
      const id = current.targetId
      if (id === null) return false
      const workspace = hostUiWorkspace(ctx) as { openSession?: (id: string) => void } | null | undefined
      if (typeof workspace?.openSession !== 'function') return false
      workspace.openSession(id)
      // Reading is answering: the session stops asking the ring for attention.
      const held = sessions.get(id)
      if (held !== undefined) {
        held.failed = false
        held.done = false
        held.held = null
      }
      notify()
      return true
    },
    stop() {
      for (const id of [...followed.keys()]) unfollow(id)
      stopStatus?.()
      stopStatus = null
      statusSeen = null
      unmount()
      row = null
      sessions.clear()
    },
  }
}
