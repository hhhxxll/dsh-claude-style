import * as React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as reactDom from 'react-dom/client'
import { SESSION_DELETE_ROUTE } from '../../constants'
import { findSidebarRoot, hostLocale, hostSessions, hostWorkspaces } from '@dsh-claude-style/engine/host'
import { observeMatches } from '@dsh-claude-style/engine/bus'
import type { MatchList } from '@dsh-claude-style/engine/bus'
import { buildElement, closestFrom, createStamp } from '@dsh-claude-style/engine/dom'
import { removeStrayNodes } from '../../shared/popover'
import { createHostToast } from '../../shared/host-toast'
import { VIEW_SWITCH_CLASS } from '../../shared/segment-control'
import type { HostAnswer } from '@dsh-claude-style/engine/resource'
import { createSlidingPill } from '../../shared/sliding-pill'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { HostSessionsService, HostWorkspacesService } from '@dsh-claude-style/contracts/services'
import type { FeatureUi } from '../../core/feature'
import type manifest from './workspace-view.manifest'
import { copy } from './copy'
import type { CopyKey } from './copy'

/**
 * The sidebar's workspace section, re-cut as a two-state view.
 *
 * 进行中 needs no filtering of its own: the host's tree already leaves
 * archived sessions out. 已归档 is the skin's own flat list of archived
 * conversations, a live projection of the host's two client lists — the
 * workspace controller's archive set (ids) and the session list (titles and
 * times) — with an unarchive and a delete button on every row.
 *
 * The host ships this filter, but its state lives in a store the ui-workspace
 * plugin keeps private (`createWorkspaceViewStore`), reachable only by clicking
 * its menu. The rows are recomputed by the host's own archived-only rule so
 * the two lists agree; a host release that changes the rule has to be read
 * back into `refreshItems`. Deleting goes through the host half's route (D75),
 * then re-pulls the session list so the stale summary leaves. A filter opened
 * as a client service retires this list.
 */
export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  /**
   * The host's own Tooltip, Toast and icons, reached through the plugin
   * loader's `require` — the same packages its UI uses, so these row actions
   * and the notice look and behave like the host's.
   */
  /** React roots holding the row actions, unmounted when the list is rebuilt. */
  let actionRoots: reactDom.Root[] = []
  /** The host's notice channel for a clicked archived row. */
  const toast = createHostToast()
  /** The section's view (active / archived), its heading and the host's tree, marked for workspace.css. */
  const viewStamp = createStamp('data-dsh-claude-ws-view')
  const labelStamp = createStamp('data-dsh-claude-ws-label')
  const treeStamp = createStamp('data-dsh-claude-ws-tree')
  const SEGMENTS: { id: string, key: CopyKey }[] = [
    { id: 'active', key: 'archiveActive' },
    { id: 'archived', key: 'archiveArchived' }
  ]
  let view = 'active'
  let control: HTMLElement | null = null
  /** The control's sliding highlight (packages/client/src/shared/sliding-pill.ts). */
  const segmentPill = createSlidingPill('[aria-checked="true"]')
  let listHost: HTMLElement | null = null
  /** `null` until both host lists have arrived; then `[{ id, title, at }]`. */
  let items: { id: string, title: string, at: number }[] | null = null
  /** Ids, titles and times of the rows on screen, joined; a list tick that changes none of them leaves the rows alone. */
  let renderedKey: string | null | undefined
  /** Rows deleted through the host half, hidden while the host's two lists catch up. */
  const deletedIds: Record<string, boolean> = {}
  /**
   * The host's workspace and session services, once both are reachable;
   * until then the section keeps its plain label. `unwatch` drops the two
   * list subscriptions.
   */
  let workspaces: HostWorkspacesService | null = null
  let sessions: HostSessionsService | null = null
  let unwatch: (() => void) | null = null
  let disposed = false

  /**
   * The workspace section's label: the skin's own part for it (D3), kept only
   * where the section around it holds a list area — the label's parent is the
   * header and the header's parent is the section root, where the view mark and
   * the control go. A host that renames the local name leaves the part
   * unwritten, and the section keeps its plain label: the feature stays off
   * rather than mounting on a section that happens to be first.
   *
   * The answer is kept while it still stands: the section is a seat the host
   * mounts once and replaces whole, and this runs on every pass — a document
   * query and a walk of every label per frame for an answer the pass before it
   * had already given (D9).
   */
  let sectionLabel: HTMLElement | null = null
  /** The section labels on the page, taken from the bus and released with the section. */
  let labelWatch: MatchList<HTMLElement> | null = null
  /** The section root a label sits in: the label's header, and that header's parent. */
  function sectionRoot(label: Element) {
    const header = label.parentElement
    return header === null ? null : header.parentElement
  }
  /** The section root a label stands in, or null when that root keeps no list area. */
  function sectionOf(label: Element) {
    const root = sectionRoot(label)
    if (root === null) return null
    return root.querySelector(LIST_AREA_SELECTOR) === null ? null : root
  }
  function findSection() {
    const kept = sectionLabel
    if (kept !== null && kept.isConnected && sectionOf(kept) !== null) return kept
    // The labels of every section the sidebar holds, kept current by the bus
    // (D40): which one dresses a control is decided here per pass, but the
    // document is walked once rather than on every pass.
    labelWatch ??= observeMatches<HTMLElement>('[data-dsh-claude-part~="section-label"]')
    const labels = labelWatch.all()
    for (let i = 0; i < labels.length; i++) {
      if (sectionOf(labels[i]) === null) continue
      sectionLabel = labels[i]
      return labels[i]
    }
    sectionLabel = null
    return null
  }

  /** The tree's rows: the host's own row key, or either row part. */
  const TREE_ROW_SELECTOR = '[data-row-key], [data-dsh-claude-part~="session-row"], [data-dsh-claude-part~="project-row"]'
  /** The section's list area, the sibling its header shares a parent with. */
  const LIST_AREA_SELECTOR = '[data-dsh-claude-part~="list-area"]'

  /**
   * The section's list area, which is what the view mark rides: the mark goes on
   * the list area's PARENT (sync below), and the header is that parent's other
   * child, so the stylesheet's cross-fade reads both (D3). The list area holds
   * the tree and its rows, which is how it is told apart from the header.
   */
  function findTree(label: Element) {
    let region = label.parentElement
    while (region !== null && region !== document.body) {
      const tree = region.querySelector(LIST_AREA_SELECTOR)
      if (tree !== null && tree.querySelector(TREE_ROW_SELECTOR) !== null) return tree
      region = region.parentElement
    }
    return null
  }

  function relativeTime(at: unknown) {
    if (typeof at !== 'number' || !isFinite(at)) return ''
    const minutes = Math.floor((Date.now() - at) / 60000)
    if (minutes < 1) return copy('archiveJustNow')
    if (minutes < 60) return copy('archiveMinutes', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return copy('archiveHours', { count: hours })
    return copy('archiveDays', { count: Math.floor(hours / 24) })
  }

  /**
   * Follow the host's two client lists: `workspaces.list` carries the
   * registry-global archive set, `sessions.list` every session's title,
   * time and origin. Both arrive after the skin installs — the archive set
   * reads `[]` while the workspace list is still `pending` — so the rows are
   * recomputed on every tick of either list, never read once.
   * @returns whether both lists are being followed.
   */
  function watch() {
    if (unwatch !== null) return true
    const nextWorkspaces = hostWorkspaces(ctx)
    const nextSessions = hostSessions(ctx)
    if (nextWorkspaces === undefined || nextWorkspaces === null || nextWorkspaces.list === undefined) return false
    if (nextSessions === undefined || nextSessions === null || nextSessions.list === undefined) return false
    workspaces = nextWorkspaces
    sessions = nextSessions
    const stopArchive = nextWorkspaces.list.subscribe(refreshItems)
    const stopSessions = nextSessions.list.subscribe(refreshItems)
    unwatch = () => {
      stopArchive()
      stopSessions()
    }
    refreshItems()
    return true
  }

  /**
   * The archived rows, by the host's own archived-only rule (ui-workspace
   * `sessionVisible`): an archived id whose session summary has landed,
   * neither a subagent child nor a blank placeholder. Newest first.
   */
  function refreshItems() {
    if (disposed) return
    const followed = workspaces
    const followedSessions = sessions
    if (followed === null || followedSessions === null) return
    const archive = followed.list.getSnapshot()
    const list = followedSessions.list.getSnapshot()
    if (archive.phase !== 'ready' || list.phase !== 'ready') {
      items = null
    } else {
      items = []
      for (let i = 0; i < archive.archivedSessionIds.length; i++) {
        const id = archive.archivedSessionIds[i]
        const summary = list.byId[id]
        if (summary === undefined || summary.origin === 'subagent' || summary.blank || deletedIds[id] === true) continue
        items.push({ id, title: summary.displayTitle, at: summary.updatedAt })
      }
      items.sort((a, b) => b.at - a.at)
    }
    const key = items === null ? null : items.map(item => `${item.id}\n${item.title}\n${item.at}`).join('\n')
    if (key === renderedKey) return
    renderedKey = key
    renderList()
  }

  /**
   * The host's Toast, warning glyph included, rendered by the skin itself:
   * the host's notice channel is private to ui-workspace. The Toast
   * portals to the body, and a new key restarts it the way the host
   * re-shows it.
   */
  function notifyToast(text: string) {
    toast.show({ text, icon: React.createElement(primitives.IconWarningOutlineRegular) })
  }

  /** The host's own notice for a clicked archived row (`toast.archivedNotOpenable`). */
  function notifyArchivedNotOpenable() {
    const t = hostLocale(ctx)!.bind('workspace')
    notifyToast(t('toast.archivedNotOpenable'))
  }

  /**
   * Delete one stored session through the host half's own route.
   *
   * The harness gives the browser half no deletion API of its own (the
   * workspace controller archives and unarchives; the agent protocol's
   * session delete is the host delegating to an ACP agent that owns the
   * storage), so the skin's host half removes the session's stored
   * directory and drops the id from the registry's archive set before it
   * answers. A stored-directory miss answers success too — an archive
   * entry whose directory is already gone is the ghost this buries — and
   * a 404 that still carries the host's own "session not found" JSON is
   * the same miss from an older host half without that branch: the storage
   * is gone all the same, so the row leaves too. Every other refusal keeps
   * the row and raises the host's Toast: the "session is open" answer (the
   * app still holds the session's agent attached, and only a restart
   * releases it) carries its own copy, everything else names the refusal
   * the route sent.
   */
  function removeArchived(id: string) {
    fetch(SESSION_DELETE_ROUTE, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: id }),
    }).then(response => response.json().then((result: HostAnswer) => ({ status: response.status, result }))).then(({ status, result }) => {
      if (result?.ok === true || (status === 404 && result?.error === 'session not found')) {
        deletedIds[id] = true
        refreshItems()
        refreshSessions()
        return
      }
      const refusal: Error & { status?: number } = new Error(String(result?.error || `HTTP ${status}`))
      refusal.status = status
      throw refusal
    }).catch((reason: { status?: number, message?: string }) => {
      console.warn('dsh-claude-style: session delete rejected:', reason)
      notifyToast(reason?.status === 409
        ? copy('archiveDeleteOpen')
        : copy('archiveDeleteFailed', { detail: reason?.message ?? String(reason) }))
    })
  }

  /**
   * Re-pull the host's session baseline right after a delete.
   *
   * The full list is what the projection prunes by: the host's fresh list
   * answer no longer carries the removed id, so its stale summary — the
   * one that kept a deleted session looking alive — leaves `sessions.list`
   * at this pull instead of at the next reconnect, and the host's own tree
   * drops the row with it. The pull is the sessions service's single-flight
   * refresh, so a pull already under way is reused.
   */
  function refreshSessions() {
    const followed = sessions
    if (followed === null || typeof followed.refresh !== 'function') return
    // Best effort against the host's sessions service: a rejection leaves the list as it stands (D12).
    followed.refresh().catch((reason: unknown) => {
      console.warn('dsh-claude-style: session baseline refresh rejected:', reason)
    })
  }

  /**
   * Put a conversation back among the live ones. The row leaves this list
   * on the archive set's next tick; a refusal leaves it in place.
   */
  function restoreArchived(id: string) {
    const followed = workspaces
    if (followed === null) return
    // A refused unarchive keeps the row in the archive set; the host stays the owner of the verdict (D12).
    Promise.resolve(followed.unarchiveSession(id)).catch((reason: unknown) => {
      console.warn('dsh-claude-style: session unarchive rejected:', reason)
    })
  }

  /** One row action: the host's icon inside the host's tooltip. */
  function actionButton(kind: 'restore' | 'delete', label: string, onClick: (event: React.MouseEvent) => void) {
    const wrapper = buildElement('span', 'dsh-claude-archive-action')
    const className = kind === 'restore' ? 'dsh-claude-archive-restore' : 'dsh-claude-archive-delete'
    const Icon = kind === 'restore' ? primitives.IconUnarchiveOutlineRegular : primitives.IconTrashOutlineRegular
    const root = reactDom.createRoot(wrapper)
    actionRoots.push(root)
    root.render(React.createElement(primitives.Tooltip, {
      label,
      side: 'top',
      delayMs: 500,
      children: React.createElement('button', { type: 'button', className, 'aria-label': label, title: label, onClick },
        React.createElement(Icon, { size: 14 })),
    }))
    return wrapper
  }

  function buildArchivedRow(item: { id: string, title: string, at: number }) {
    const row = buildElement('div', 'dsh-claude-archive-row')
    row.setAttribute('role', 'button')
    row.setAttribute('tabindex', '0')
    row.setAttribute('data-session-id', item.id)
    row.appendChild(buildElement('span', 'dsh-claude-archive-title', item.title))
    row.appendChild(buildElement('span', 'dsh-claude-archive-time', relativeTime(item.at)))
    // The host's archived rows offer an unarchive action; the skin's list
    // carries the same pair, so leaving the archived view is not the only way
    // back to a conversation.
    row.appendChild(actionButton('restore', copy('archiveRestore'), event => {
      event.stopPropagation()
      restoreArchived(item.id)
    }))
    row.appendChild(actionButton('delete', copy('archiveDelete'), event => {
      event.stopPropagation()
      removeArchived(item.id)
    }))
    row.addEventListener('click', notifyArchivedNotOpenable)
    return row
  }

  function renderList() {
    if (listHost === null) return
    // The actions live in React roots; drop them before the rows go, or every
    // rebuild would leave a tree behind.
    for (let r = 0; r < actionRoots.length; r++) {
      actionRoots[r].unmount()
    }
    actionRoots = []
    while (listHost.firstChild) listHost.removeChild(listHost.firstChild)
    if (items === null) {
      listHost.appendChild(buildElement('div', 'dsh-claude-archive-status', copy('archiveLoading')))
      return
    }
    if (items.length === 0) {
      listHost.appendChild(buildElement('div', 'dsh-claude-archive-status', copy('archiveEmpty')))
      return
    }
    for (let i = 0; i < items.length; i++) listHost.appendChild(buildArchivedRow(items[i]))
  }

  function buildControl() {
    // The shared small segment look (shared/segment-control.css); the feature
    // class stays for the placement and label crossfade in workspace.css.
    const group = buildElement('div', `${VIEW_SWITCH_CLASS} dsh-claude-ws-segments`)
    group.setAttribute('role', 'radiogroup')
    for (let i = 0; i < SEGMENTS.length; i++) {
      const item = buildElement('button', 'dsh-claude-ws-segment', '')
      item.type = 'button'
      item.setAttribute('role', 'radio')
      item.setAttribute('data-view', SEGMENTS[i].id)
      group.appendChild(item)
    }
    group.addEventListener('click', event => {
      const item = closestFrom(event.target, '.dsh-claude-ws-segment')
      if (item === null) return
      event.stopPropagation()
      event.preventDefault()
      setView(item.getAttribute('data-view'))
    })
    return group
  }

  function setView(next: string | null) {
    if (next !== 'active' && next !== 'archived') return
    if (next === view) return
    view = next
    sync()
  }

  /**
   * Stand the feature down: the control and the archived list leave the page
   * and the section's marks go with them.
   *
   * The host renders the section's heading only while the sidebar is wide
   * (ui-sidebar's SidebarRoot unmounts it in the rail), while the header and
   * the list area's own boxes stay mounted: with no heading to lay it over, an
   * absolutely placed control would paint on the rail's own section buttons.
   */
  function dropSection() {
    segmentPill.release()
    if (control !== null && control.parentElement !== null) control.parentElement.removeChild(control)
    control = null
    if (listHost !== null && listHost.parentElement !== null) listHost.parentElement.removeChild(listHost)
    listHost = null
    labelStamp.release()
    treeStamp.release()
    viewStamp.release()
    labelWatch?.release()
    labelWatch = null
  }

  function sync() {
    const label = findSection()
    // No heading to dress: the sidebar is a rail, and the section keeps its
    // plain look until it is wide again.
    if (label === null || label.parentElement === null) {
      dropSection()
      return
    }
    const header = label.parentElement
    // Until the host's workspace and session services are both reachable
    // the section keeps its plain label.
    if (!watch()) return
    labelStamp.mark(label)
    if (control === null || control.parentElement !== header) {
      if (control !== null && control.parentElement !== null) control.parentElement.removeChild(control)
      control = buildControl()
      header.insertBefore(control, header.firstChild)
    }
    for (let i = 0; i < control.children.length; i++) {
      const item = control.children[i]
      const id = item.getAttribute('data-view')
      for (let s = 0; s < SEGMENTS.length; s++) {
        if (SEGMENTS[s].id !== id) continue
        const text = copy(SEGMENTS[s].key)
        if (item.textContent !== text) item.textContent = text
      }
      const on = id === view
      if (item.getAttribute('aria-checked') !== (on ? 'true' : 'false')) item.setAttribute('aria-checked', on ? 'true' : 'false')
    }
    segmentPill.sync(control)
    const tree = findTree(label)
    if (tree === null) return
    treeStamp.mark(tree)
    const host = tree.parentElement
    if (host === null) return
    if (listHost === null || listHost.parentElement !== host) {
      if (listHost !== null && listHost.parentElement !== null) listHost.parentElement.removeChild(listHost)
      listHost = buildElement('div', 'dsh-claude-archive-list')
      host.insertBefore(listHost, tree.nextSibling)
      renderList()
    }
    // The sidebar re-renders its own way: when React replaces the container
    // that held the list, the old copy can stay in the document while a new
    // one is built elsewhere. Sweep every copy but the live one, scoped to the
    // sidebar the list lives in (packages/engine/src/host.ts): the sweep runs
    // every pass, and a whole-document query costs a walk of the conversation's
    // rows too.
    const sidebar = findSidebarRoot()
    removeStrayNodes(sidebar ?? document, '.dsh-claude-archive-list', [listHost])
    viewStamp.mark(host, view)
  }

  /**
   * The pass's read phase: the segment control's own box, taken before this
   * frame's writes. A pass that builds the control measures it in the write
   * phase instead (sliding-pill).
   */
  function measure() {
    if (control !== null && control.parentElement !== null) segmentPill.measure(control)
  }

  ui.workspace = { measure, sync }

  return () => {
    disposed = true
    for (let r = 0; r < actionRoots.length; r++) {
      actionRoots[r].unmount()
    }
    actionRoots = []
    toast.dispose()
    if (unwatch !== null) {
      unwatch()
      unwatch = null
    }
    dropSection()
    delete ui.workspace
  }
}
