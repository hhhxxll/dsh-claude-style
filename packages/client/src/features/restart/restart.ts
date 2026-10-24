import * as React from 'react'
import * as reactDom from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { PLATFORM_ATTRIBUTE, WINDOWS_TITLEBAR_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'
import { hostSlots } from '@dsh-claude-style/engine/host'
import { copy } from './copy'
import { nextPollState, probeFromBoot, RESTART_POLL_MS, RESTART_ROUTE, RESTART_SETTLE_MS, restartArrived } from './restart-probe'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './restart.manifest'

/**
 * Whether this page is a desktop shell, read ONCE at module load.
 *
 * The shell's preload writes `data-windows-titlebar` (Windows) or
 * `data-platform="darwin"` (macOS) before any plugin code runs, and neither
 * mark ever changes. Reading it per install would instead see the marks the
 * smoke's own probes set mid-run on a plain web page, and the entry would
 * register there — one wake-up pass the stand-in pages do not expect. The
 * marks are the contract (contracts/table.ts's shell.platform and
 * shell.windows-titlebar), so no host service read is needed.
 */
const DESKTOP_PAGE = typeof document === 'undefined'
  ? false
  : document.documentElement.hasAttribute(WINDOWS_TITLEBAR_ATTRIBUTE) ||
    document.documentElement.getAttribute(PLATFORM_ATTRIBUTE) === 'darwin'

/**
 * The desktop restart entry: one button in the sidebar footer's action seat.
 *
 * The footer's takeover (features/account/footer-mirror.ts) mirrors each
 * `sidebar.footer.action` entry into the account popover as ONE row, whose
 * label is the entry's `aria-label` and whose press reaches the entry's first
 * interactive element — so the entry renders exactly one button. On a host
 * without the takeover the same entry stands in the footer as an icon button.
 *
 * The dialog is the host's own Modal, mounted through a root of its own: the
 * entry's own box is hidden by the takeover, so nothing the feature draws can
 * live inside it. The restart itself is the host half's route
 * (packages/host/src/restart.ts): the browser half only asks and then waits
 * for the new boot to serve the page.
 */
export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  /** The seat the button registers in. */
  const FOOTER_SLOT = 'sidebar.footer.action'
  /** The dialog's own mount, kept while the feature stands. */
  let dialogRoot: reactDom.Root | null = null
  /** The probe the confirm was armed with: the boot the restart must replace. */
  let leftBoot: string | null = null
  /** The restart is underway; Escape and the backdrop must not close the dialog. */
  let restarting = false
  let disposed = false

  /**
   * Ask the route for its boot identity. A network refusal folds into the
   * down probe: the caller decides what that means for its own step.
   */
  async function probeBoot(): Promise<ReturnType<typeof probeFromBoot>> {
    try {
      const answer = await fetch(`${RESTART_ROUTE}?t=${Date.now()}`, { cache: 'no-store' })
      if (!answer.ok) return { up: false, ready: false, boot: null, desktop: false }
      return probeFromBoot(await answer.json(), answer.status)
    } catch {
      return { up: false, ready: false, boot: null, desktop: false }
    }
  }

  /**
   * Whether the page the browser would reload is being served: the web server
   * starts listening before the app shell registers its own routes, and until
   * then every unclaimed path answers 404 — a reload on liveness alone lands
   * on the browser's error page over a healthy backend.
   */
  async function probePage() {
    try {
      const answer = await fetch(window.location.href, { cache: 'no-store' })
      const type = answer.headers.get('content-type') ?? ''
      return answer.ok && type.includes('text/html')
    } catch {
      return false
    }
  }

  /** Ask the host half to relaunch the app, then poll until the page is back. */
  async function runRestart() {
    restarting = true
    drawDialog('restarting')
    const settle = new Promise<void>((settleTimer) => { setTimeout(settleTimer, RESTART_SETTLE_MS) })
    try {
      const ask = await fetch(RESTART_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' } })
      if (!ask.ok) {
        // An explicit refusal (409 desktop-only or in-flight) is a failure the
        // reader must see.
        restarting = false
        drawDialog('failed', `${copy('failed')} (${ask.status})`)
        return
      }
    } catch {
      // A network refusal here is not a failure: the helper may already be
      // stopping the server mid-answer, and the boot probe below is the
      // authority on whether a restart actually happened.
    }
    await settle
    if (disposed) return
    const state = { polls: 0, timedOut: false }
    const timer = setInterval(() => {
      void (async () => {
        if (disposed) {
          clearInterval(timer)
          return
        }
        Object.assign(state, nextPollState(state))
        const probe = { ...(await probeBoot()), ready: await probePage() }
        if (disposed) {
          clearInterval(timer)
          return
        }
        if (restartArrived(leftBoot, probe)) {
          clearInterval(timer)
          window.location.reload()
          return
        }
        if (state.timedOut) {
          clearInterval(timer)
          restarting = false
          drawDialog('timeout')
        } else {
          drawDialog('restarting', copy('waited', { seconds: Math.round(state.polls * (RESTART_POLL_MS / 1000)) }))
        }
      })()
    }, RESTART_POLL_MS)
  }

  /**
   * Draw the dialog for one step. The Modal mounts through a root of the
   * feature's own, so the takeover-hidden footer entry never carries it; the
   * action row is the Modal's own footer seat.
   */
  function drawDialog(step: 'confirm' | 'restarting' | 'timeout' | 'failed', note?: string) {
    if (dialogRoot === null) dialogRoot = reactDom.createRoot(document.createElement('div'))
    const close = () => {
      if (restarting) return
      drawOff()
    }
    const body = step === 'confirm'
      ? copy('confirmBody')
      : step === 'restarting'
        ? copy('restartingDesc')
        : step === 'timeout' ? copy('timeout') : note ?? copy('failed')
    const footer = step === 'confirm'
      ? React.createElement(React.Fragment, null,
        React.createElement(primitives.Button, { variant: 'outline', onClick: drawOff }, copy('cancel')),
        React.createElement(primitives.Button, { variant: 'primary', onClick: () => void runRestart() }, copy('confirm')))
      : step === 'restarting' ? undefined
        : React.createElement(React.Fragment, null,
          React.createElement(primitives.Button, { variant: 'outline', onClick: drawOff }, copy('close')),
          React.createElement(primitives.Button, { variant: 'primary', onClick: () => { window.location.reload() } }, copy('reload')))
    dialogRoot.render(React.createElement(primitives.Modal, {
      open: true,
      onClose: close,
      title: copy('confirmTitle'),
      closeLabel: copy('close'),
      description: step === 'restarting' ? copy('restarting') : undefined,
      footer,
      shortcutModal: 'dsh-claude-restart',
      className: 'dsh-claude-restart-dialog',
    },
    step === 'restarting'
      ? React.createElement(primitives.TextShimmer, null, note ?? body)
      : React.createElement('p', { className: 'dsh-claude-restart-line' }, body)))
  }

  /** Drop the dialog. */
  function drawOff() {
    if (dialogRoot !== null) dialogRoot.render(React.createElement(primitives.Modal, { open: false, onClose: () => {}, closeLabel: copy('close'), title: copy('confirmTitle'), shortcutModal: 'dsh-claude-restart' }))
  }

  /** The footer entry: one button, one icon, one label. */
  function RestartEntry() {
    return React.createElement('button', {
      type: 'button',
      'aria-label': copy('restartRow'),
      'data-dsh-claude-restart': '',
      onClick: () => {
        void (async () => {
          // The boot the restart must replace, read at the moment of asking.
          const probe = await probeBoot()
          if (!probe.up) return
          leftBoot = probe.boot
          drawDialog('confirm')
        })()
      },
    }, React.createElement(primitives.IconRefreshOutlineRegular, { size: 16 }))
  }

  /**
   * The entry stands on the desktop shell alone: a web page has no way to
   * relaunch itself, and the route refuses the request there anyway. The
   * answer is the module-load platform mark (DESKTOP_PAGE), never a per-install
   * read: the smoke's own probes set and clear the titlebar mark mid-run on a
   * plain page, and an install that re-read it would register the entry there.
   */
  if (!DESKTOP_PAGE) return () => {
    disposed = true
    if (dialogRoot !== null) {
      dialogRoot.unmount()
      dialogRoot = null
    }
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['slots'], (scope) => {
      const slots = hostSlots(scope)
      if (slots === undefined || slots === null || typeof slots.inject !== 'function') return
      scope.effect(() => slots.inject(FOOTER_SLOT, () => slots.register(
        { name: FOOTER_SLOT, id: 'claude-style-restart', order: 50 },
        RestartEntry,
      )), 'dsh-claude-style: restart entry')
    })
  }

  return () => {
    disposed = true
    if (dialogRoot !== null) {
      dialogRoot.unmount()
      dialogRoot = null
    }
  }
}
