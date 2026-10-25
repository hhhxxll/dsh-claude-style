import { MENU_GROUP_HEADING_SELECTOR, MENU_GROUP_SELECTOR } from '@dsh-claude-style/contracts/dom'

/**
 * The provider groups of the host's own model menu, folded.
 *
 * With the skin's picker switched off the reader gets the host's menu back, and
 * that menu draws every provider's models one after another: on a catalog of a
 * few hundred models the list is a scroll with no handles on it. This module
 * gives each provider's heading the one thing the menu lacks — a press that
 * closes the group and another that opens it.
 *
 * The card is the host's and its rows are React's, so a mark left on a row does
 * not outlive the render that drew it. What this file holds is therefore the
 * reading and the writing of one pass: the groups as the card draws them, and
 * which provider each group belongs to. Which groups stand folded is the
 * feature's (model-menu-fold.ts), keyed by that provider, so a card the host
 * re-renders is folded again in the pass that follows.
 *
 * Every write is guarded against its current value: the headings carry
 * `aria-label`, the scheduler hears every `aria-label` change on the page, and
 * an unguarded write would ask for the pass that writes it again.
 */

/** The heading's own mark: folded, which is where the pass reads the state back from. */
export const FOLD_MARK = 'data-dsh-claude-menu-group-folded'
/** The row mark the host's search-driven highlight rides. */
const HIGHLIGHT_MARK = 'data-highlighted'

/** One provider group of the open menu, as a pass reads it. */
export interface MenuGroup {
  /** The provider's name, which is the key its folded state is kept under. */
  id: string
  /** The `section` the host draws the group in. */
  section: HTMLElement
  /** The provider's name, drawn as the group's heading. */
  heading: HTMLElement
  /** The rows the heading names, in the order the menu draws them. */
  rows: HTMLElement[]
}

/** Write an attribute only where it moved, so a settled card stays settled. */
export function mark(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value)
}

/** Take an attribute off only where it stands. */
export function unmark(element: Element, name: string) {
  if (element.hasAttribute(name)) element.removeAttribute(name)
}

/** Whether every row of a group is one the menu cannot pick: folding it would hide a heading with nothing under it. */
function allDisabled(rows: HTMLElement[]) {
  return rows.every(row => (row as HTMLButtonElement).disabled === true)
}

/** Whether a group has a model to offer at all. */
export function pickable(group: MenuGroup) {
  return group.rows.length > 0 && !allDisabled(group.rows)
}

/** Whether the group holds the row the menu marks as the model in force. */
export function holdsCurrent(group: MenuGroup) {
  return group.section.querySelector('[aria-checked="true"]') !== null
}

/**
 * The provider groups under one menu card.
 *
 * @param card - the `[role="menu"]` element the models are listed in.
 * @returns one entry per group, in the order the menu draws them.
 */
export function menuGroupsOf(card: HTMLElement) {
  const groups: MenuGroup[] = []
  const sections = card.querySelectorAll<HTMLElement>(MENU_GROUP_SELECTOR)
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]
    const heading = section.querySelector<HTMLElement>(`:scope > ${MENU_GROUP_HEADING_SELECTOR}`)
    if (heading === null) continue
    // Only this group's own rows: a group nested in another answers to itself.
    const rows: HTMLElement[] = []
    const own = section.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    for (let row = 0; row < own.length; row++) {
      if (own[row].closest(MENU_GROUP_SELECTOR) === section) rows.push(own[row])
    }
    const id = (heading.textContent ?? '').trim()
    if (id === '') continue
    groups.push({ id, section, heading, rows })
  }
  return groups
}

/** Whether a group stands folded right now, read off the heading the last pass wrote. */
export function groupFolded(group: MenuGroup) {
  return group.heading.getAttribute(FOLD_MARK) === 'true'
}

/** The two notes a heading carries for a screen reader, in the shell's language. */
export interface FoldAnnounce {
  folded: string
  open: string
}

/**
 * Write one group's state onto the card: the mark, the state a screen reader
 * hears, and the rows' own hiding. A group with nothing left to pick stays open
 * — its heading is the one line saying the provider stands in the menu.
 *
 * The rows carry the host's own `display: flex` (its `.option` rule), and
 * `[hidden]` is a user-agent declaration: any author rule outranks it, so the
 * attribute alone leaves every row on screen. The inline `display: none` is what
 * actually folds them, and it leaves with the state.
 *
 * @param folded - what the group should stand as.
 * @returns whether it stands folded afterwards.
 */
export function setGroupFolded(group: MenuGroup, folded: boolean, announce: FoldAnnounce) {
  const next = folded && pickable(group)
  mark(group.heading, FOLD_MARK, next ? 'true' : 'false')
  mark(group.heading, 'aria-expanded', next ? 'false' : 'true')
  mark(group.heading, 'aria-label', next ? announce.folded : announce.open)
  for (let index = 0; index < group.rows.length; index++) {
    const row = group.rows[index]
    if (next) {
      mark(row, 'hidden', '')
      if (row.style.display !== 'none') row.style.display = 'none'
      continue
    }
    unmark(row, 'hidden')
    if (row.style.display !== '') row.style.display = ''
  }
  return next
}

/**
 * Hand one heading the role and the tab stop a disclosure needs. The host draws
 * it as a plain `div`; the press is this feature's, so the heading answers the
 * keyboard as the control it now is.
 */
export function wireHeading(heading: HTMLElement) {
  mark(heading, 'role', 'button')
  mark(heading, 'tabindex', '0')
}

/**
 * Take every mark this feature wrote off one card, and the rows' hiding with
 * them: a menu the feature leaves gets the host's own card back.
 */
export function releaseGroups(groups: MenuGroup[]) {
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]
    for (const name of [FOLD_MARK, 'aria-expanded', 'aria-label', 'role', 'tabindex']) unmark(group.heading, name)
    for (let row = 0; row < group.rows.length; row++) {
      unmark(group.rows[row], 'hidden')
      if (group.rows[row].style.display !== '') group.rows[row].style.display = ''
    }
  }
}

/**
 * The group the host's own highlight stands in right now, or null. The search
 * field moves that highlight across the whole catalog, folded rows included.
 */
export function highlightedGroup(groups: MenuGroup[]) {
  for (let index = 0; index < groups.length; index++) {
    const rows = groups[index].rows
    for (let row = 0; row < rows.length; row++) {
      if (rows[row].hasAttribute(HIGHLIGHT_MARK)) return groups[index]
    }
  }
  return null
}

/** The rows of every group, unfolded, in document order: what the host's own walk sees. */
export function rowsOf(groups: MenuGroup[]) {
  const rows: HTMLElement[] = []
  for (let index = 0; index < groups.length; index++) {
    for (let row = 0; row < groups[index].rows.length; row++) rows.push(groups[index].rows[row])
  }
  return rows
}
