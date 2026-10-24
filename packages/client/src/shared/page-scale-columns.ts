/**
 * The host frame's three columns, in the pixels the page's own styles read
 * (D43, D81).
 *
 * The host measures its frame with `getBoundingClientRect()` — the window's
 * pixels — and writes the three columns from that measurement into an inline
 * `grid-template-columns`, which the page's scale reads again: every column is
 * drawn at the scale, a sidebar dragged to 280 stands 350 wide, and the columns
 * add up to a factor past the window; a column narrowed to the window's own
 * width stands a factor wider than it and the sidebar it starts is cut off at
 * the page's left edge. Dividing each written length by the scale once draws the
 * frame at the width it was measured at.
 *
 * The sidebar's width is written twice more, from the same number: as the
 * sidebar's own box width, and as its drag handle's `left`. Both are divided
 * with the column, or the sidebar's content stands wider than the column that
 * clips it and the handle leaves the column's edge.
 *
 * A written list holding anything but a length is left alone: `1fr`, `minmax`
 * and `fit-content` are resolved against the track the page gives them, and only
 * a length the host measured doubles. A zero track needs no such guard: it
 * stands at zero on both sides of the division, and the `1fr` beside it takes
 * the rest of the page's own width.
 */
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { cacheFirstMatch } from '@dsh-claude-style/engine/host'
import { ROOT_SLOT_SELECTOR, SIDEBAR_HANDLE_SELECTOR, SIDEBAR_ROOT_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { sidebarDefaultWidth } from './sidebar-width'
import { subscribePrefs } from '../core/prefs'

/** One length in the host's written column list, and the bracket group a length
 * may stand inside (`minmax(0px, 0px)`). */
const LENGTH = /^(\d+(?:\.\d+)?)px$/
const GROUP = /^(minmax|clamp|min|max)\((.*)\)$/

/** One written track, in the page's pixels; null when it holds a `fr` or a
 * keyword the page resolves against the track it is given, never a measurement. */
function trackInPage(track: string, scale: number) {
  const length = LENGTH.exec(track)
  if (length !== null) return `${Math.round(Number(length[1]) / scale * 100) / 100}px`
  const group = GROUP.exec(track)
  if (group === null) return null
  const inner: string[] = []
  for (const part of group[2].split(',')) {
    const trimmed = part.trim()
    inner.push(LENGTH.test(trimmed) ? trackInPage(trimmed, scale)! : trimmed)
  }
  return `${group[1]}(${inner.join(', ')})`
}

/** The written tracks, with a bracket group kept whole (`minmax(0px, 1fr)`). */
function tracks(written: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of written.trim()) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && /\s/.test(character)) {
      if (current !== '') parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current !== '') parts.push(current)
  return parts
}

/**
 * The host's own column list, in the page's pixels.
 *
 * @param written - the value the host wrote into `grid-template-columns`.
 * @param scale - the scale the page is drawn at.
 * @returns the list to write instead, or null when the page is at its own scale,
 *     or the list holds a track the page resolves itself (`1fr`, a keyword).
 */
export function inPageColumns(written: string, scale: number) {
  if (!(scale > 0) || scale === 1 || written.trim() === '') return null
  const inPage: string[] = []
  for (const part of tracks(written)) {
    const converted = trackInPage(part, scale)
    if (converted === null) return null
    inPage.push(converted)
  }
  return inPage.join(' ')
}

/**
 * One pixel length the host wrote, in the page's pixels.
 *
 * @returns the length to write instead, or null when the page is at its own
 *     scale or the value is not a pixel length.
 */
export function inPageLength(written: string, scale: number) {
  const trimmed = written.trim()
  if (!(scale > 0) || scale === 1 || !LENGTH.test(trimmed)) return null
  return trackInPage(trimmed, scale)
}

/** What this rule needs from the skin it serves (D73). */
export interface FrameColumnsVocabulary {
  /** The scale the page is drawn at right now: 1 while the page is not scaled. */
  scale(): number
}

/** The one inline declaration of a host box this rule carries, and how it is read into the page's pixels. */
interface Declaration {
  property: string
  inPage(written: string, scale: number): string | null
  /**
   * The host's write as this rule lays it out before any scale: the sidebar's
   * default stands at the contract minimum (shared/sidebar-width.ts), and
   * every other declaration hands its write through. The carry records the
   * rebased value as the host's own, so a scale change and the teardown both
   * answer from it.
   */
  rebase(written: string): string
}

/** The sidebar's default width and the two lengths the page divides: only the length declarations rebase. */
const rebaseLength = (written: string) => sidebarDefaultWidth(written) ?? written

const FRAME_COLUMNS: Declaration = { property: 'grid-template-columns', inPage: inPageColumns, rebase: (written) => tracks(written).map(part => rebaseLength(part)).join(' ') }
const SIDEBAR_WIDTH: Declaration = { property: 'width', inPage: inPageLength, rebase: rebaseLength }
const SIDEBAR_HANDLE_LEFT: Declaration = { property: 'left', inPage: inPageLength, rebase: rebaseLength }
/** The sidebar's width written a second time for the Windows caption strip (ui-layout's AppFrame). */
const SIDEBAR_WINDOWS_VARIABLE: Declaration = { property: '--dsh-windows-sidebar-width', inPage: inPageLength, rebase: rebaseLength }

/** One write this rule made: the number the host wrote, and the number it drew. */
interface Carry {
  /** The value the host itself wrote, which this rule has already read. */
  from: string
  /** The value read from it, which this rule left in place. */
  to: string
  /** The page's scale when the read happened: a different scale asks for the read again. */
  scale: number
}

/**
 * The shell's frame. It is marked only while it carries a host class the parts
 * table reads; a shell whose class names the table has not been taught leaves
 * it unmarked, and the frame is then the root slot's own child (D3).
 */
export const FRAME_SELECTOR = '[data-dsh-claude-part~="layout-frame"]'

/**
 * What each box's last carry left, kept on the box itself.
 *
 * The skin's rules can stand on the page twice — a hot reload mounts the new
 * module before the old one is torn down — and a record kept in the module would
 * be one per copy: the copy that was not the writer reads the other's number as
 * the host's measurement, and divides it again on every pass until almost
 * nothing is left. The box is what both copies share, so the record is kept
 * there, under a name no host and no stylesheet writes.
 */
const CARRY_ATTRIBUTE = 'data-dsh-claude-frame-columns'

function seenOn(box: HTMLElement, property: string): Carry | null {
  const raw = box.getAttribute(CARRY_ATTRIBUTE)
  if (raw === null) return null
  // One record per declaration: a box can carry two (the frame's columns and
  // the Windows caption strip's width variable), keyed by property after the
  // separator. A legacy record without the property part reads as the columns'.
  for (const record of raw.split('\u0001')) {
    const [key, scale, from, to] = record.split('\u0000')
    if (from === undefined || to === undefined) continue
    if ((key ?? 'grid-template-columns') !== property) continue
    return { from, to, scale: Number(scale) }
  }
  return null
}

function markOn(box: HTMLElement, property: string, carry: Carry) {
  const kept: string[] = []
  const raw = box.getAttribute(CARRY_ATTRIBUTE)
  if (raw !== null) {
    for (const record of raw.split('\u0001')) {
      const [key] = record.split('\u0000')
      if ((key ?? 'grid-template-columns') !== property) kept.push(record)
    }
  }
  kept.push(`${property}\u0000${carry.scale}\u0000${carry.from}\u0000${carry.to}`)
  box.setAttribute(CARRY_ATTRIBUTE, kept.join('\u0001'))
}

function forgetOn(box: HTMLElement, property: string) {
  const raw = box.getAttribute(CARRY_ATTRIBUTE)
  if (raw === null) return
  const kept: string[] = []
  for (const record of raw.split('\u0001')) {
    const [key] = record.split('\u0000')
    if ((key ?? 'grid-template-columns') !== property) kept.push(record)
  }
  if (kept.length === 0) box.removeAttribute(CARRY_ATTRIBUTE)
  else box.setAttribute(CARRY_ATTRIBUTE, kept.join('\u0001'))
}

/**
 * Lay the host frame's columns, the sidebar's own width and the sidebar
 * handle's place out in the page's own pixels.
 *
 * @returns settle: read every box again, for a host write or a scale that
 *     changed under it; stop: give every box back.
 */
export function installFrameColumns(vocabulary: FrameColumnsVocabulary) {
  const carry = (box: HTMLElement, declaration: Declaration) => {
    const { property } = declaration
    const value = box.style.getPropertyValue(property)
    const seen = seenOn(box, property)
    if (value === '') {
      // The host took its declaration away — the sidebar drops its width once it
      // is collapsed — so the next number it writes is a fresh one, even when it
      // is the number this record holds.
      if (seen !== null) forgetOn(box, property)
      return
    }
    const scale = vocabulary.scale()
    // A second pass reads this rule's own number back as the host's write; it is
    // the one kept from the last read, and dividing it again would shrink the
    // box on every pass. A different scale is a different answer, though: the
    // held number is the host's own, and it is carried again from there.
    if (seen !== null && value === seen.to && seen.scale !== scale) {
      const rebased = declaration.rebase(seen.from)
      const converted = scale === 1 ? (rebased === seen.from ? null : rebased) : declaration.inPage(rebased, scale)
      if (converted === null) {
        forgetOn(box, property)
        box.style.setProperty(property, seen.from)
        return
      }
      markOn(box, property, { from: seen.from, to: converted, scale })
      box.style.setProperty(property, converted)
      return
    }
    if (seen !== null && (value === seen.from || value === seen.to)) return
    // The default sidebar width stands at the contract minimum whatever the
    // scale, so the rebase runs first and the page's own scale (1) lays the
    // rebased length out as it stands. The carry records the rebased value as
    // the host's own write: a scale change and the teardown both answer from
    // the minimum, and a later host write (a drag) is a fresh value again.
    const rebased = declaration.rebase(value)
    const inPage = scale === 1 ? (rebased === value ? null : rebased) : declaration.inPage(rebased, scale)
    if (inPage === null) {
      // The page is at its own scale again, or the write holds a value this rule
      // does not read. A value the rule itself wrote hands the host's own number
      // back; the host's original number, or a fresh write of its own (a drag
      // away from the default), stands as written.
      if (seen !== null) {
        if (value === seen.to) box.style.setProperty(property, seen.from)
        forgetOn(box, property)
      }
      return
    }
    markOn(box, property, { from: rebased, to: inPage, scale })
    box.style.setProperty(property, inPage)
  }

  /** The boxes being heard, each with the declarations standing on it and the subscription that hears the host's write. */
  const heard = new Map<HTMLElement, { declarations: Declaration[], off: () => void }>()
  // Each box is remounted with the shell: the bus's registry follows it (D40),
  // and the host's own write lands on the box, which this hears.
  const seats = observeMatches<HTMLElement>(FRAME_SELECTOR, () => sync())
  const sidebars = observeMatches<HTMLElement>(SIDEBAR_ROOT_SELECTOR, () => sync())
  const handles = observeMatches<HTMLElement>(SIDEBAR_HANDLE_SELECTOR, () => sync())
  // The root slot is read through the engine's kept match (D40), never walked.
  const rootSlot = cacheFirstMatch<HTMLElement>(ROOT_SLOT_SELECTOR)

  /** Every frame standing in the shell: the marked one, or the root slot's own child. */
  const framesInShell = () => {
    const marked = seats.all()
    if (marked.length > 0) return marked
    const slot = rootSlot()
    const child = slot === null ? null : slot.firstElementChild
    return child instanceof HTMLElement ? [child] : []
  }

  /** Every box the page draws, with the declarations this rule carries on it. */
  const standing = (): [HTMLElement, Declaration[]][] => [
    ...framesInShell().map((frame): [HTMLElement, Declaration[]] => [
      frame,
      [
        FRAME_COLUMNS,
        // The Windows caption strip reads the sidebar's width a second time off
        // the frame itself; one carry per declaration keeps the two apart.
        SIDEBAR_WINDOWS_VARIABLE,
      ],
    ]),
    ...sidebars.all().map((sidebar): [HTMLElement, Declaration[]] => [sidebar, [SIDEBAR_WIDTH]]),
    ...handles.all().map((handle): [HTMLElement, Declaration[]] => [handle, [SIDEBAR_HANDLE_LEFT]]),
  ]

  /** Hear every box the page draws, and drop the ones that left. */
  const sync = () => {
    const present = new Set<HTMLElement>()
    for (const [box, declarations] of standing()) {
      present.add(box)
      const known = heard.get(box)
      if (known === undefined) {
        heard.set(box, {
          declarations,
          off: subscribeMutations(box, { attributes: true, attributeFilter: ['style'] }, () => {
            for (const declaration of heard.get(box)?.declarations ?? []) carry(box, declaration)
          }),
        })
      } else {
        known.declarations = declarations
      }
      for (const declaration of declarations) carry(box, declaration)
    }
    for (const [box, { off, declarations }] of [...heard]) {
      if (present.has(box)) continue
      heard.delete(box)
      off()
      for (const declaration of declarations) forgetOn(box, declaration.property)
    }
  }

  const offPrefs = subscribePrefs(sync)
  sync()

  return {
    settle: sync,
    stop() {
      seats.release()
      sidebars.release()
      handles.release()
      offPrefs()
      for (const [box, { declarations, off }] of heard) {
        off()
        for (const declaration of declarations) {
          const seen = seenOn(box, declaration.property)
          if (seen !== null) box.style.setProperty(declaration.property, seen.from)
          forgetOn(box, declaration.property)
        }
      }
      heard.clear()
    },
  }
}
