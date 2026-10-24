import { RESTART_PATH } from '@dsh-claude-style/contracts/routes'

/** One probe of the restart route: the boot identity and the readiness of the page behind it. */
export interface RestartProbe {
  up: boolean
  ready: boolean
  boot: string | null
  desktop: boolean
}

/** The unset probe: nothing answered. */
export const PROBE_DOWN: RestartProbe = { up: false, ready: false, boot: null, desktop: false }

/** How the polling loop is shaped; the numbers ride with the logic that reads them. */
export const RESTART_SETTLE_MS = 1500
export const RESTART_POLL_MS = 800
export const RESTART_MAX_POLLS = 120

/**
 * What one `GET RESTART_PATH` answered, folded into a probe: a refusal or a
 * body without a boot identity is a host that is not answering, and the page
 * readiness is decided by the caller, which fetches the page itself.
 */
export function probeFromBoot(body: unknown, status: number): RestartProbe {
  if (status !== 200 || typeof body !== 'object' || body === null) return { ...PROBE_DOWN }
  const boot = (body as { boot?: unknown }).boot
  const desktop = (body as { desktop?: unknown }).desktop
  return {
    up: true,
    ready: false,
    boot: typeof boot === 'string' && boot !== '' ? boot : null,
    desktop: desktop === true,
  }
}

/**
 * Whether the restart has replaced the process behind the page: the boot the
 * browser held when it asked (`left`) has given way to a different one, or was
 * never readable — liveness alone never proves a restart finished, because the
 * process being replaced keeps answering while it drains.
 */
export function bootReplaced(left: string | null, probe: RestartProbe) {
  if (!probe.up) return false
  if (left === null || probe.boot === null) return true
  return probe.boot !== left
}

/**
 * One polling step's verdict: reload the page once the new boot is serving
 * it, keep waiting while either answer is missing.
 */
export function restartArrived(left: string | null, probe: RestartProbe) {
  return bootReplaced(left, probe) && probe.ready
}

/**
 * The restart polling loop's state, advanced one poll at a time: `polls` counts
 * the polls already run, and a poll past the ceiling is a timeout.
 */
export function nextPollState(state: { polls: number, timedOut: boolean }) {
  const polls = state.polls + 1
  return { polls, timedOut: polls >= RESTART_MAX_POLLS }
}

/** The route's own path, for the fetches the feature runs (D73). */
export const RESTART_ROUTE = RESTART_PATH
