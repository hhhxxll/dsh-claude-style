import { copy } from './copy'
import {
  groupFolded, highlightedGroup, holdsCurrent, menuGroupsOf, pickable, releaseGroups,
  setGroupFolded, wireHeading,
} from './menu-groups'
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { MENU_ROLE_SELECTOR } from '@dsh-claude-style/contracts/dom'
import type { MenuGroup } from './menu-groups'
import type manifest from './model-menu-fold.manifest'
import type { FeatureUi } from '../../core/feature'

/**
 * The provider groups of the host's own model menu, folded (menu-groups.ts).
 *
 * The card is the host's, drawn only while it is open, and its rows are React's:
 * a mark left on a row does not outlive the render that drew it. So the folded
 * set is kept here, keyed by the provider's name, and every pass writes it onto
 * the card again — a pass is one card's worth of attribute writes, and a card
 * that settled is written by none of them.
 *
 * A card opens with the provider carrying the model in force open and the rest
 * folded, which is the state the reader was in when they last chose. A query
 * opens everything: a reader typing is looking for a row, and a match folded
 * away reads as no match at all.
 *
 * The menu walks itself with the arrow keys, over its own numbering of the rows,
 * and with a search field up it moves a highlight while the focus stays in the
 * field. A row hidden from the page must not be a destination there, so the
 * group holding the highlight opens as soon as the highlight reaches it.
 */
export function install(ctx: unknown, ui: FeatureUi<typeof manifest>) {  /** The card the handlers stand on, while one is held. */
  let card: HTMLElement | null = null
  /** The groups as the last pass read them; the key handler walks this list. */
  let groups: MenuGroup[] = []
  /** Which providers the reader folded, by the name their heading draws. */
  const folded = new Set<string>()
  /** Whether this card has been seeded with the state above. */
  let seeded = false
  /**
   * The provider the host's own highlight last opened a group for. The highlight
   * stays where the reader left it, so a group folded by hand stays folded until
   * the highlight MOVES onto another provider.
   */
  let shownHighlight: string | null = null
  /** Stops hearing the held card; null while no card is held. */
  let stopCardWatch: (() => void) | null = null
  /**
   * The page's menu cards, kept current by the bus: the host opens its menus as
   * ports of their own, so a card arrives without a pass hearing of anything
   * else, and the registry answers without walking the document.
   */
  const openMenus = observeMatches<HTMLElement>(MENU_ROLE_SELECTOR, () => { if (ui.schedule) ui.schedule() })

  function announce() {
    return { folded: copy('folded'), open: copy('open') }
  }

  /** Whether the reader is filtering: a reader typing is looking for a row, never for a folded group. */
  function filtering(root: HTMLElement) {
    const field = root.querySelector<HTMLInputElement>('input[role="searchbox"]')
    return field !== null && field.value.trim() !== ''
  }

  /** Write the kept state onto one card, once per pass. */
  function paint() {
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]
      setGroupFolded(group, folded.has(group.id), announce())
    }
  }

  /** The provider carrying the model in force, or null when the menu lists none of it. */
  function seatedProvider() {
    for (let index = 0; index < groups.length; index++) {
      if (holdsCurrent(groups[index])) return groups[index].id
    }
    return null
  }

  /** Seed a freshly built card from the model in force; every pass after it writes the reader's own state. */
  function seed() {
    const seated = seatedProvider()
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]
      // A card whose model in force sits in no group it lists is not one the
      // reader chose on: every provider opens, which is what the host draws.
      if (seated === null || group.id === seated || !pickable(group)) folded.delete(group.id)
      else folded.add(group.id)
    }
    seeded = true
  }

  /**
   * A card under a query shows what the query matched: every group opens, and
   * the seeded state goes with it, so clearing the query seeds from the model in
   * force once more.
   */
  function reveal() {
    for (let index = 0; index < groups.length; index++) setGroupFolded(groups[index], false, announce())
    seeded = false
  }

  /** Read the card: its groups, their headings' roles, and the state they stand in. */
  function read(root: HTMLElement) {
    groups = menuGroupsOf(root)
    for (let index = 0; index < groups.length; index++) wireHeading(groups[index].heading)
    if (filtering(root)) {
      reveal()
      return
    }
    if (!seeded) seed()
    paint()
    followHighlight()
  }

  /**
   * Open the group the host's own highlight has just moved onto.
   *
   * The verdict is the highlight MOVING, not the highlight's place: the mark
   * stands on one row for as long as the card is open, and a group the reader
   * folded by hand would be opened again by every pass if the place alone
   * decided it. `shownHighlight` is the row this feature last opened a group
   * for, so only an arrival opens anything.
   */
  function followHighlight() {
    const reached = highlightedGroup(groups)
    if (reached === null || reached.id === shownHighlight) return
    shownHighlight = reached.id
    if (!groupFolded(reached)) return
    folded.delete(reached.id)
    setGroupFolded(reached, false, announce())
  }

  /** Fold one group, or open it, and remember which way the reader left it. */
  function toggle(group: MenuGroup) {
    const next = !folded.has(group.id)
    if (next) folded.add(group.id)
    else folded.delete(group.id)
    setGroupFolded(group, next, announce())
  }

  /**
   * The group whose heading the event landed on, or null where the event is
   * the card's own. A press and a key both go through here: the two folds one
   * control offers are the same question asked of two events.
   */
  function groupAt(target: EventTarget | null) {
    if (card === null || !(target instanceof Element)) return null
    const heading = target.closest<HTMLElement>('[data-menu-group-heading]')
    if (heading === null || !card.contains(heading)) return null
    return groups.find(own => own.heading === heading) ?? null
  }

  /** A press on a heading folds its group; a press anywhere else stays the host's. */
  function onClick(event: MouseEvent) {
    const group = groupAt(event.target)
    if (group === null) return
    event.preventDefault()
    event.stopPropagation()
    toggle(group)
  }

  /**
   * Enter and Space on a heading press it, which is what a disclosure answers.
   * The press is read in the CAPTURE phase: the host's own key handler runs on
   * the card's bubble path and takes Enter for a selection, so the fold has to
   * answer the control it drew before the menu does. Every other key stays the
   * host's.
   */
  function onKeyDown(event: KeyboardEvent) {
    if (card === null) return
    if (event.target instanceof HTMLInputElement) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    const group = groupAt(event.target)
    if (group === null) return
    event.preventDefault()
    event.stopPropagation()
    toggle(group)
  }

  /** Whether the element is the host's model menu: the one card whose rows name models. */
  function isModelMenu(element: HTMLElement) {
    return element.getAttribute('role') === 'menu' && element.querySelector('[role="menuitemradio"]') !== null
  }

  /** Hold the card on the page now, or let the one held go. */
  function sync() {
    const menus = openMenus.all()
    let next: HTMLElement | null = null
    for (let index = 0; index < menus.length; index++) {
      if (isModelMenu(menus[index])) {
        next = menus[index]
        break
      }
    }
    if (next !== card) {
      if (card !== null) {
        releaseGroups(groups)
        card.removeEventListener('click', onClick, true)
        card.removeEventListener('keydown', onKeyDown, true)
        stopCardWatch?.()
        stopCardWatch = null
      }
      card = next
      groups = []
      folded.clear()
      seeded = false
      shownHighlight = null
      if (card !== null) {
        card.addEventListener('click', onClick, true)
        card.addEventListener('keydown', onKeyDown, true)
        // The card's rows are replaced under a query and a rename; the walk's
        // highlight moves inside the card a keypress at a time.
        stopCardWatch = subscribeMutations(
          card,
          { childList: true, subtree: true, attributes: true, attributeFilter: ['data-highlighted', 'aria-checked'] },
          () => { if (ui.schedule) ui.schedule() },
        )
      }
    }
    if (card === null) return
    read(card)
  }

  /**
   * Install the fold: the handle goes on `ui`, and the pass the scheduler runs
   * is its `sync`. The teardown the entry gets back runs that handle's own
   * teardown, so a menu the feature leaves is handed back with every mark it
   * wrote.
   */
  const handle = {
    sync,
    /**
     * The menu is drawn over the composer, and a background turn keeps mutating
     * the conversation column: the pass cannot stand down for a content batch,
     * because the card it holds is not in that column.
     */
    skipOnContentOnly: false,
    /** Hand the card back: every mark this feature wrote comes off with it. */
    teardown() {
      stopCardWatch?.()
      stopCardWatch = null
      openMenus.release()
      if (card !== null) {
        releaseGroups(groups)
        card.removeEventListener('click', onClick, true)
        card.removeEventListener('keydown', onKeyDown, true)
      }
      card = null
      groups = []
      folded.clear()
      seeded = false
      shownHighlight = null
    },
  }
  ui.modelMenuFold = handle

  return () => { handle.teardown() }
}
