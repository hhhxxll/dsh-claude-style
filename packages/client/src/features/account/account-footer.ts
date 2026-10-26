import { ACCOUNT_ARMED_ATTR, AUTO_POPOVER_OFF } from '../../constants'
import { findFootArea } from '@dsh-claude-style/engine/host'
import { readPrefs } from '../../core/prefs'
import { createFooterMirror } from './footer-mirror'
import { createHostAccountMenu } from './host-menu'
import { createHostMenuPlacement } from './menu-placement'
import { createAccountProfile } from './profile'
import { createAccountRing } from './account-ring'
import { createAccountRows } from './rows'
import { createAccountSurface } from './surface'
import type { AccountSurfaceMode } from './surface'
import { createAccountDrawer } from './account-drawer'
import { POPOVER_CLOSE_DELAY, POPOVER_OPEN_DELAY, closeOtherPopovers, createHoverIntent, pressKeepsPopoverOpen, registerPopover, unregisterPopover } from '../../shared/popover'
import { inPageBox } from '../../shared/page-zoom'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { CloseReason, FeatureHandle } from '@dsh-claude-style/engine/scheduler'
import type { FeatureUi } from '../../core/feature'
import type manifest from './account-footer.manifest'

/** The account footer's handle (ui.footer): the settings drive and whether its drawer is open. */
export interface FooterHandle extends FeatureHandle {
  openSettings(): void
  isOpen(): boolean
}

/**
 * The account area of the sidebar footer.
 *
 * One row model, two mount points (account/surface.ts): on a host that has
 * an account row (Desktop 0.1.7+) that row is the entry and our container is
 * injected into the host's own account menu; on a host without one (Web)
 * the skin self-builds the trigger and the popover (account/account-drawer.ts)
 * and the popover's body is the container. The rows themselves — the account
 * header with the hold-screen easter egg, the plugin footer entries
 * (account/footer-mirror.ts) and, on the self-built path only, the settings
 * row — are shared.
 *
 * The host's row is only marked, never copied or moved, so it keeps its own
 * labels, keyboard order and toggle. Our rows fold the host menu with an
 * Escape carrying `__dshHostMenuEscape`, which the skin's global key path
 * skips so overlays behind the menu stay open. The host re-places its card a
 * frame after our container grows, so the card stays unpainted from the hover
 * until surface.ts writes ACCOUNT_READY_ATTR. A host slot for appended rows
 * retires that wait.
 */
export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  /** The marker the stylesheet hangs the host account row's Claude shape on. */
  const HOST_ROW_ATTR = 'data-dsh-claude-account-host-row'
  const profile = createAccountProfile(ctx, () => {
    if (typeof ui.schedule === 'function') ui.schedule()
  })
  /**
   * The ring around the face, which reports a session elsewhere that wants the
   * reader. It repaints itself on every host change and asks the scheduler for
   * a pass only when the reading changes, so the tooltip and the press gate are
   * settled before a press arrives.
   */
  const ring = createAccountRing(ctx, {
    onChange() {
      if (typeof ui.schedule === 'function') ui.schedule()
    },
  })
  // The host path's hover intent. The host owns its menu and unmounts it on
  // close, so this drives the host's trigger and dismisses the menu with the
  // Escape the host's own Menu handles.
  const hostHoverIntent = createHoverIntent(openHostMenu, closeHostMenuForHover, POPOVER_OPEN_DELAY, POPOVER_CLOSE_DELAY)
  /**
   * Identity of the row bindings THIS generation installed. A client reload
   * drops the old generation's disposals but the host's row node outlives
   * them, so a boolean guard would leave the new generation's listeners
   * unattached (the same reason session-stats keeps a binding token).
   */
  const hostRowBindingToken = {}

  /**
   * Whether this press must leave the account surface open
   * (shared/popover.ts::pressKeepsPopoverOpen). Which surface is up decides
   * what "open" is: the host owns its menu and unmounts it on close, the
   * self-built drawer says so on its own node. The account scope is the one
   * scope that keeps hover when the preference is `account` rather than `all`.
   */
  function pressKeepsAccountOpen() {
    const open = surface.mode() === 'host' ? hostMenu.findMenu() !== null : drawer.isOpen()
    return pressKeepsPopoverOpen(readPrefs().autoPopover !== AUTO_POPOVER_OFF, open)
  }

  const hostMenu = createHostAccountMenu({ close: () => drawer.close() })
  // The host's own card, placed where the host meant it (features/account/
  // menu-placement.ts): its placement is the same at every page scale, and the
  // host writes its own over the skin's on later frames.
  const menuPlacement = createHostMenuPlacement({ trigger: hostMenu.trigger })
  const rows = createAccountRows({
    hostMenu,
    // Drawing the launcher's head is asynchronous and changes no DOM the
    // observer can see, so the picture asks for the pass that paints it.
    onChange() {
      if (typeof ui.schedule === 'function') ui.schedule()
    },
    openBan() {
      // Leave the surface up: the overlay is a full-window surface, so what
      // is behind it does not matter, and the footer is left as the user
      // had it once the screen is dismissed.
      drawer.holdOpen()
      if (ui.ban) ui.ban.open()
    },
    // The handle is there exactly while the easter egg is installed: its
    // language switch is on, its chunk has arrived and it has not retired.
    banAvailable() {
      return ui.ban !== undefined
    },
  })
  /**
   * The self-built trigger and popover (features/account/account-drawer.ts),
   * standing on a host that has no account row of its own.
   */
  const drawer = createAccountDrawer({
    rows,
    beforeOpen() {
      // Mirrors are frozen while the popover is open (footer-mirror.sync
      // bails), so reconcile them before the reveal, to show fresh
      // content/order and bind click targets for the upcoming interaction.
      // Opening must not fail because of a mirror sync; a failing one is reported.
      try {
        const footArea = findFootArea()
        if (footArea) mirror.sync(footArea)
      } catch (error) { reportError(error) }
    },
    banOpen() { return ui.ban?.isOpen() === true },
    keepsOpen: pressKeepsAccountOpen,
  })
  const surface = createAccountSurface({
    hostTrigger: hostMenu.trigger,
    findMenu: hostMenu.findMenu,
    menuViewport: hostMenu.menuViewport,
    buildContainer: rows.buildHostContainer,
    syntheticContainer() { return drawer.body() },
    onMode: onSurfaceMode,
    onMenu: onHostMenuChanged
  })
  const mirror = createFooterMirror({
    body() { return surface.container() },
    anchor() { return drawer.settingsAnchor() },
    isOpen() { return surface.mode() === 'synthetic' && drawer.isOpen() },
    close: closeSurface
  })
  // The account area takes part in the shared popover rule (shared/popover.ts):
  // ONE entry for both surfaces, since a given host has only one of them.
  registerPopover('account', closeAccountSurfaces)

  /**
   * Close the active surface after one of OUR rows was picked. The host's
   * menu belongs to the host: it is dismissed the way the host dismisses it
   * (an Escape its own Menu handles), never by driving its trigger. The
   * self-built popover is ours and closes directly.
   */
  function closeSurface() {
    if (surface.mode() === 'host') {
      const menu = hostMenu.findMenu()
      if (menu !== null) {
        // The scheduler's key handler must not read this as a user's Esc
        // (it would close every overlay, the hold screen included): the
        // event is this skin's own dismissal, addressed to the host's Menu
        // alone.
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        escape.__dshHostMenuEscape = true
        menu.dispatchEvent(escape)
      }
      return
    }
    drawer.close()
  }

  /**
   * Close whichever account surface is up, for the shared popover rule
   * (shared/popover.ts): the self-built drawer directly, the host's menu the
   * way the host dismisses it. Both halves are no-ops while their surface is
   * down, so this is safe to call on every open of every other popover.
   */
  function closeAccountSurfaces() {
    if (surface.mode() === 'host') closeSurface()
    else drawer.close()
  }

  /**
   * Open the host's account menu for the hover preference. The menu is the
   * host's, so it is opened by driving its trigger; when it is already up
   * (the pointer re-entered the row) nothing is pressed, or the host's own
   * toggle would close it.
   */
  /** Set from the row's hover or press until the menu closes (constants.ts). */
  function armAccountMenu() {
    if (!document.body.hasAttribute(ACCOUNT_ARMED_ATTR)) document.body.setAttribute(ACCOUNT_ARMED_ATTR, '')
  }

  function disarmAccountMenu() {
    if (document.body.hasAttribute(ACCOUNT_ARMED_ATTR)) document.body.removeAttribute(ACCOUNT_ARMED_ATTR)
  }

  function openHostMenu() {
    if (surface.mode() !== 'host') return
    if (hostMenu.findMenu() !== null) return
    closeOtherPopovers('account')
    armAccountMenu()
    hostMenu.openMenu()
  }

  /**
   * Close the host's menu for the hover preference.
   *
   * The host renders the row and portals the card, and the card moves over
   * its first placement frames, so a leave can arrive while the pointer is
   * still on the row or on the card. Only a pointer that is genuinely
   * elsewhere dismisses the menu; the next leave closes it.
   *
   * The hold-screen overlay covers the whole window, so opening it "leaves"
   * the row and the card without the pointer moving: that leave stands down
   * — the surface the reader had behind the page stays up and the footer is
   * handed back as it was once the screen is dismissed.
   */
  function closeHostMenuForHover() {
    if (ui.ban?.isOpen() === true) return
    const row = hostMenu.trigger()
    if (row !== null && row.matches(':hover')) return
    const menu = hostMenu.findMenu()
    if (menu !== null && menu.matches(':hover')) return
    closeSurface()
  }

  /** The four listeners the skin binds on the host's row, plus the ring's press gate. */
  interface HostRowBindings {
    reach: (e: Event) => void
    catch: (e: Event) => void
    enter: () => void
    leave: () => void
    press: () => void
  }

  /**
   * The host row's bindings as this generation installed them, so the teardown
   * can take them off again. The token alone keeps a generation from binding the
   * same node twice; a node the host keeps across generations (its own account
   * row) would otherwise collect one set of listeners per switch.
   */
  const hostRowBindings = new Map<HTMLElement, HostRowBindings>()

  /** Take one row's listeners off, and its token with them. */
  function takeHostRowBindings(row: HTMLElement, bindings: HostRowBindings) {
    row.removeEventListener('click', bindings.reach, true)
    row.removeEventListener('click', bindings.catch, true)
    row.removeEventListener('mouseenter', bindings.enter)
    row.removeEventListener('mouseleave', bindings.leave)
    row.removeEventListener('click', bindings.press)
    delete row.__dshHostRowToken
  }
  /**
   * The host's open menu with its two listeners. The host mounts a fresh card
   * for each open, so one binding at a time is all there is, and it is taken
   * off the moment that card goes: a table keyed by node would keep every card
   * the host has already unmounted, and its subtree, reachable until the
   * teardown.
   */
  let hostMenuBinding: { menu: HTMLElement, enter: () => void, leave: () => void } | null = null

  /** Take the host menu's listeners off, mounted or not. */
  function unbindHostMenu() {
    if (hostMenuBinding === null) return
    hostMenuBinding.menu.removeEventListener('mouseenter', hostMenuBinding.enter)
    hostMenuBinding.menu.removeEventListener('mouseleave', hostMenuBinding.leave)
    hostMenuBinding = null
  }

  /**
   * Bind the hover preference on the host's account row. The host renders
   * that row, so its listeners are bound in place and guarded per element:
   * a host re-render that replaces the row must not stack a second pair.
   */
  function bindHostRowHover(row: HTMLElement) {
    if (row.__dshHostRowToken === hostRowBindingToken) return
    // A row the host replaced takes its listeners with it: without this sweep
    // the map would hold every row it ever mounted, and their closures.
    for (const [bound, bindings] of hostRowBindings) {
      if (bound.isConnected) continue
      takeHostRowBindings(bound, bindings)
      hostRowBindings.delete(bound)
    }
    row.__dshHostRowToken = hostRowBindingToken
    const enter = () => {
      if (readPrefs().autoPopover !== AUTO_POPOVER_OFF) hostHoverIntent.scheduleOpen()
    }
    const leave = () => {
      if (readPrefs().autoPopover !== AUTO_POPOVER_OFF) hostHoverIntent.scheduleClose()
    }
    // A press that keeps the surface open is stopped before the host's own
    // toggle sees it: the host closes the menu on a press of its trigger, and
    // that handler is delegated from the document, so only the capture phase
    // can keep the press away from it.
    const stop = (e: Event) => {
      if (!pressKeepsAccountOpen()) return
      e.stopPropagation()
    }
    // A ring standing for a session the reader has not read yet turns the press
    // into a way there: it runs ahead of both the host's toggle and the skin's
    // own open, and a press it answers reaches neither. Stopping the immediate
    // propagation is what keeps a second listener on this same row quiet.
    const reach = (e: Event) => {
      if (!ring.jump()) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    // The row's own click opens the menu too (autoPopover off, or a press
    // before the hover delay elapsed). A listener on the row runs in the
    // target phase, ahead of the host's own delegated onClick, so the armed
    // marker is in place before the host mounts the card.
    const press = () => {
      armAccountMenu()
    }
    row.addEventListener('click', reach, true)
    row.addEventListener('click', stop, true)
    row.addEventListener('mouseenter', enter)
    row.addEventListener('mouseleave', leave)
    row.addEventListener('click', press)
    hostRowBindings.set(row, { reach, catch: stop, enter, leave, press })  }

  /**
   * The host mounts and unmounts its menu around each open. Entering the
   * card cancels the row's pending close; leaving it schedules the close
   * that dismisses the menu.
   */
  function onHostMenuChanged(menu: HTMLElement | null) {
    if (menu === null) {
      disarmAccountMenu()
      unbindHostMenu()
      menuPlacement.unwatch()
      return
    }
    if (hostMenuBinding !== null && hostMenuBinding.menu === menu) return
    // A different card: the host unmounted the one before it, so its listeners
    // come off now rather than at the teardown.
    unbindHostMenu()
    const enter = () => {
      if (readPrefs().autoPopover !== AUTO_POPOVER_OFF) hostHoverIntent.cancel()
    }
    const leave = () => {
      if (readPrefs().autoPopover !== AUTO_POPOVER_OFF) hostHoverIntent.scheduleClose()
    }
    menu.addEventListener('mouseenter', enter)
    menu.addEventListener('mouseleave', leave)
    hostMenuBinding = { menu, enter, leave }
    // The skin's answer goes in before the watch is attached, and the watch
    // then follows the host as it re-places the card from its own geometry on
    // the frames after it grows.
    menuPlacement.place(menu)
    menuPlacement.watch(menu)
  }

  function onSurfaceMode(mode: AccountSurfaceMode) {
    // The host's account row is the entry on that host, so the self-built
    // trigger and popover have no job there.
    if (mode === 'host') drawer.drop()
  }

  /** The entry row's width, as last written to the stylesheet. */
  let accountWidth = 0
  /** The self-built drawer's distance from the footer's edges, as last written. */
  let accountInsetLeft = -1
  let accountInsetRight = -1

  /**
   * Hand the sidebar footer back to the host.
   *
   * The "Redraw the account area" preference turns the whole
   * takeover off, so the skin's own nodes and injected container go and
   * every marker it put on the host's entries is removed — with the
   * stylesheet's takeover rules gated on the same attribute, the footer then
   * renders exactly as shipped.
   */
  function dropAccountFooter(footArea: Element | null) {
    drawer.cancelClose()
    hostHoverIntent.cancel()
    // The drive that presses the host's own settings row stops with the footer
    // it was reaching through.
    hostMenu.stopSettingsDrive()
    disarmAccountMenu()
    if (accountWidth !== 0) {
      accountWidth = 0
      document.body.style.removeProperty('--dsh-claude-account-width')
    }
    if (accountInsetLeft !== -1 || accountInsetRight !== -1) {
      accountInsetLeft = -1
      accountInsetRight = -1
      document.body.style.removeProperty('--dsh-claude-account-inset-left')
      document.body.style.removeProperty('--dsh-claude-account-inset-right')
    }
    drawer.drop()
    // The menu marker goes with the takeover: an open host menu must not
    // keep the skin's card styling after the footer is handed back.
    surface.clearMenu()
    const injected = document.querySelectorAll('.dsh-claude-account-inject')
    for (let i = 0; i < injected.length; i++) injected[i].remove()
    const marked = document.querySelectorAll(`[${HOST_ROW_ATTR}]`)
    for (let m = 0; m < marked.length; m++) marked[m].removeAttribute(HOST_ROW_ATTR)
    // The host's row outlives this generation, so its listeners come off here:
    // a switch off and on again must not leave a second set behind.
    for (const [row, bindings] of hostRowBindings) {
      takeHostRowBindings(row, bindings)
    }
    hostRowBindings.clear()
    unbindHostMenu()
    menuPlacement.unwatch()
    if (footArea) mirror.clear(footArea)
  }

  /** The entry row's boxes, taken in the pass's read phase when the row already stands (D40). */
  let rowBoxes: { row: Element, rowRect: DOMRect, footRect: DOMRect | null } | null = null

  /**
   * Read the entry row's box before the pass writes. The row a pass creates
   * itself (the synthetic button) is not there yet, so that pass falls back to
   * measuring it while writing, as it always did.
   */
  function measureAccountRow() {
    rowBoxes = null
    const footArea = findFootArea()
    if (footArea === null) return
    if (readPrefs().collapseFooter) mirror.measure(footArea)
    const synthetic = surface.mode() === 'synthetic'
    const row = synthetic ? drawer.btn() : hostMenu.trigger()
    if (row === null) return
    rowBoxes = { row, rowRect: inPageBox(row.getBoundingClientRect()), footRect: synthetic ? inPageBox(footArea.getBoundingClientRect()) : null }
  }

  /**
   * Measure the entry row and hand its box to the stylesheet.
   *
   * The host's account menu is portalled outside the sidebar, so it cannot
   * inherit the row's width: the card reads the measured width from
   * --dsh-claude-account-width. The self-built drawer is a child of the
   * footer instead, but the footer's padding box is wider than the row, so
   * its left and right are the measured distances from the footer's edges.
   * Every value is written only on a change.
   */
  function syncAccountRowBox(row: Element | null, footArea: Element) {
    if (row === null) return
    const synthetic = surface.mode() === 'synthetic'
    const measured = rowBoxes !== null && rowBoxes.row === row
      ? rowBoxes
      : { row, rowRect: inPageBox(row.getBoundingClientRect()), footRect: synthetic ? inPageBox(footArea.getBoundingClientRect()) : null }
    const rowRect = measured.rowRect
    const rowWidth = Math.round(rowRect.width)
    if (rowWidth > 0 && rowWidth !== accountWidth) {
      accountWidth = rowWidth
      document.body.style.setProperty('--dsh-claude-account-width', `${rowWidth}px`)
    }
    if (!synthetic || measured.footRect === null) return
    const footRect = measured.footRect
    const left = Math.round(rowRect.left - footRect.left)
    const right = Math.round(footRect.right - rowRect.right)
    if (left !== accountInsetLeft) {
      accountInsetLeft = left
      document.body.style.setProperty('--dsh-claude-account-inset-left', `${left}px`)
    }
    if (right !== accountInsetRight) {
      accountInsetRight = right
      document.body.style.setProperty('--dsh-claude-account-inset-right', `${right}px`)
    }
  }

  function syncAccountFooter() {
    const footArea = findFootArea()
    if (footArea === null) return

    if (!readPrefs().collapseFooter) {
      dropAccountFooter(footArea)
      return
    }
    surface.sync()
    if (surface.mode() === 'host') {
      drawer.drop()
    } else {
      drawer.ensure(footArea)
    }

    // The host's own account row is the entry on the host path: mark it so
    // the stylesheet can repaint it as a Claude row. It is left in the host's
    // DOM and flow, never moved or copied.
    const hostTrigger = hostMenu.trigger()
    if (hostTrigger !== null && !hostTrigger.hasAttribute(HOST_ROW_ATTR)) hostTrigger.setAttribute(HOST_ROW_ATTR, '')
    // The entry row — the host's own row, or the self-built button — is the
    // shape both cards have to match, so its box is measured here and handed
    // to the stylesheet. The hover preference is bound on the host's row in
    // the same pass, since the host renders that row itself.
    const entryRow = surface.mode() === 'host' ? hostTrigger : drawer.btn()
    syncAccountRowBox(entryRow, footArea)
    if (hostTrigger !== null) bindHostRowHover(hostTrigger)
    // The ring stands on the entry row either way: the host's own row on the
    // host path, the skin's button on the drawer path.
    ring.sync(entryRow, readPrefs())

    // The host's footer entries are hidden in place on every pass, drawer or
    // no drawer: the host re-renders them, and a pass that skipped this left
    // their icons painted beside the account row until the drawer had been
    // opened once. Only the mirroring needs a container to write into.
    mirror.sync(footArea)

    const root = surface.mode() === 'host' ? surface.container() : drawer.popover()
    if (root === null) return
    rows.syncHeader(root, hostTrigger)
    // The rail toggle (and any reflow) moves the anchor without a window
    // resize or a page scroll, so an open drawer re-resolves its position at
    // the end of its own pass.
    if (drawer.isOpen()) drawer.placeOpen()
  }

  ui.footer = {
    sync: syncAccountFooter,
    /** The read phase: the entry row's box, so the pass's writes do not force a layout under it. */
    measure: measureAccountRow,
    // The footer sits in the sidebar, outside the column a streaming batch
    // touches, so such a batch skips this pass (D40).
    skipOnContentOnly: true,
    /**
     * The self-built drawer's dismiss routes: 'outside' (a press the footer
     * does not own), 'escape' and 'composer'. The shipped scheduler only
     * closed an OPEN drawer on an outside press, so that reason keeps the
     * open check; Esc and composer focus close regardless. On the host path
     * the drawer is null, so this is a no-op and the host keeps its own
     * dismissal.
     */
    close(reason?: CloseReason) {
      if (reason === 'outside' && !drawer.isOpen()) return
      drawer.close()
    },
    openSettings: hostMenu.openSettings,
    owns(target: Node) {
      if (!target) return false
      if (drawer.btn() !== null && drawer.btn()!.contains(target)) return true
      if (drawer.popover() !== null && drawer.popover()!.contains(target)) return true
      const container = surface.container()
      return container !== null && container.contains(target)
    },
    isOpen() { return drawer.isOpen() },
    /** Re-anchor an open drawer after a viewport change; a closed one has
     * nothing to place. */
    reposition() {
      if (surface.mode() === 'host') {
        const menu = hostMenu.findMenu()
        if (menu !== null) menuPlacement.place(menu)
        return
      }
      if (!drawer.isOpen()) return
      drawer.placeOpen()
    }
  }
  return () => {
    profile.stop()
    ring.stop()
    unregisterPopover('account')
    dropAccountFooter(findFootArea())
  }
}
