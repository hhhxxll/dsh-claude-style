import { COMPOSER_SCOPE_ALL, COMPOSER_SCOPE_CONVERSATION, COMPOSER_SCOPE_HERO, CONTEXT_DISPLAY_PIE, CONTEXT_DISPLAY_RING_BAND, SLOT_NODE_ATTR, STATS_POSITION_CONTEXT, STATS_POSITION_FOOTER } from '../../constants'
import { DIALOG_TRIGGER_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { findHeroRoot, findModelSlot } from '@dsh-claude-style/engine/host'
import { composerRestyleRetired, readPrefs } from '../../core/prefs'
import { removeStrayNodes } from '../../shared/popover'
import { setAttributeIfChanged } from '@dsh-claude-style/engine/dom'
import { CONTEXT_STOPS, rampPosition, writeRamp } from './stats-ramp'
import { contextTrigger, findContextMeter, markContextMeter, meterOccupancy } from './stats-panel'
import { paintContextPie, readPieColours, releaseContextPie } from './context-meter-pie'
import { METER_RING_RADIUS, METER_RING_SIZE, ringDash, writeContextBand } from './context-meter-face'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureHandle } from '@dsh-claude-style/engine/scheduler'
import type { FeatureUi } from '../../core/feature'
import type { PieColours } from './context-meter-pie'
import type manifest from './meter-ring.manifest'

/**
 * The context meter's own ring in the composer row.
 *
 * The host's meter cannot leave the dock the host renders it in — moving it out
 * crashed React's unmount — so the skin draws the ring itself, and the host's
 * node stays where it is and leaves the row unpainted: it keeps only the job of
 * opening its own context panel, which stats-binding.ts presses its trigger
 * for. The ring is the skin's own node, appended after the seat box in the
 * host's model slot (features/model/seat-box.ts is the same arrangement), so
 * the row lays it out and shortens the model's name before it.
 *
 * The reading is the host's projection of the session's context pressure. A
 * host that serves none is read off its own ring's text, which is still in the
 * document behind the paint. The ring's look is the face the reader picked
 * (context-meter-face.ts): the pie in the continuous band, dsh's thin ring in
 * that band, or the measured ring in three bands, with the number beside it.
 */

/** The mark on the ring's root, which the ring's own rules and the specs read. */
export const METER_RING_ATTR = 'data-dsh-claude-meter-ring'
/**
 * The mark on the host's meter while the skin's ring stands in its place: the
 * stylesheet drops the host's node out of the row without moving it.
 */
export const METER_HIDDEN_ATTR = 'data-dsh-claude-meter-hidden'

/** What the context statistics read off the ring (ui.meterRing). */
export interface MeterRingHandle extends FeatureHandle {
  /** The ring's root while it stands in the row, else null. */
  root(): HTMLElement | null
  /** Say what the ring reads: the occupancy as a percentage, or null while none can be taken. */
  setReading(percent: number | null): void
}

/**
 * @param ctx - the plugin context (unused; the ring reads the page through the engine).
 * @param ui - the shared registry. `ui.model` answers the seat box the ring stands after.
 * @returns the teardown.
 */
export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  let ring: HTMLElement | null = null
  let ringButton: HTMLButtonElement | null = null
  let ringValue: HTMLElement | null = null
  let ringFill: SVGCircleElement | null = null
  /** The host's meter the hidden mark stands on right now, or null. */
  let hiddenMeter: HTMLElement | null = null
  /** The watch on that meter's open state, or null while no meter is hidden. */
  let stopExpandedWatch: (() => void) | null = null
  /** The occupancy the context statistics answered, or null while their projection says nothing. */
  let answered: number | null = null
  /** The percentage the ring was last drawn for, so an unmoved reading writes nothing. */
  let shown: number | null = null
  /** The pie's colours, read in a pass's own read phase (D40). */
  let colours: PieColours | null = null

  /**
   * The number the ring shows: the projection the context statistics followed,
   * else the reading the host's own ring still carries behind the paint.
   */
  function reading() {
    if (answered !== null) return answered
    const meter = findContextMeter()
    return meter === null ? null : meterOccupancy(meter)
  }

  /** Build the ring once: the button, its ring and the number beside it, in the host's own anatomy. */
  function ensureRing(slot: HTMLElement, seat: HTMLElement | null) {
    if (ring === null) {
      const root = document.createElement('span')
      root.setAttribute(METER_RING_ATTR, '')
      root.setAttribute(SLOT_NODE_ATTR, '')
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.innerHTML = `<svg viewBox="0 0 ${METER_RING_SIZE} ${METER_RING_SIZE}" width="${METER_RING_SIZE}" height="${METER_RING_SIZE}" aria-hidden="true"><circle class="dsh-claude-meter-ring-track" cx="${METER_RING_SIZE / 2}" cy="${METER_RING_SIZE / 2}" r="${METER_RING_RADIUS}"></circle><circle class="dsh-claude-meter-ring-fill" cx="${METER_RING_SIZE / 2}" cy="${METER_RING_SIZE / 2}" r="${METER_RING_RADIUS}" transform="rotate(-90 ${METER_RING_SIZE / 2} ${METER_RING_SIZE / 2})"></circle></svg><span class="dsh-claude-meter-ring-value"></span>`
      root.appendChild(button)
      ring = root
      ringButton = button
      ringValue = button.querySelector('span')
      ringFill = button.querySelector('circle.dsh-claude-meter-ring-fill')
      shown = null
    }
    // After the seat box the picker keeps first in the slot; with the picker
    // off, at the slot's own end, after the host's model control.
    // After the seat box the picker keeps first in the slot; with the picker
    // off, at the slot's own end, after the host's model control. Both sides are
    // read as element siblings: the slot holds text nodes too, and comparing
    // against one would move the ring on every pass (D40, the pass must settle).
    const placed = seat === null
      ? ring.parentElement === slot && slot.lastElementChild === ring
      : ring.parentElement === slot && ring.previousElementSibling === seat
    if (!placed) slot.insertBefore(ring, seat === null ? null : seat.nextSibling)
  }

  /** The ring's own words and arc for the percentage it shows. */
  function drawReading(percent: number | null) {
    if (ringFill === null || ringValue === null) return
    if (percent === shown) return
    shown = percent
    const text = percent === null ? '' : `${percent}%`
    if (ringValue.textContent !== text) ringValue.textContent = text
    // The arc the host draws for the same reading: the dash covers the share
    // taken and the gap the rest of the ring.
    ringFill.setAttribute('stroke-dasharray', ringDash(percent))
    ringFill.toggleAttribute('data-empty', percent === null || percent <= 0)
  }

  /** Read the colours the pie's own words take: their band, mixed by the browser (stats-ramp.ts). A drawn ring takes its colour from the stylesheet, so only the pie is read. */
  function readColours() {
    colours = ring === null || readPrefs().contextDisplay !== CONTEXT_DISPLAY_PIE ? null : readPieColours(ring)
    return colours
  }

  /**
   * Paint the reading on the face the reader picked, with the host's trigger's
   * own words for a screen reader, so the control the reader finds is named the
   * same as the one it stands for.
   */
  function paintRing() {
    if (ring === null) return
    const percent = reading()
    const display = readPrefs().contextDisplay
    const trigger = contextTrigger()
    if (ringButton !== null) {
      const label = trigger === null ? null : trigger.getAttribute('aria-label')
      if (label !== null) setAttributeIfChanged(ringButton, 'aria-label', label)
    }
    mirrorExpanded()
    drawReading(percent)
    if (display === CONTEXT_DISPLAY_PIE) {
      writeContextBand(ring, null)
      const moved = writeRamp(ring, 'context', percent === null ? null : rampPosition(percent, CONTEXT_STOPS))
      // A band that moved carries a new colour: the plate's image is drawn from
      // the colours read for it, and only a moved band needs a new reading.
      paintContextPie(ring, percent, moved || colours === null ? readColours() : colours)
      return
    }
    // The drawn ring: no plate, and the colour rule the reader picked — the
    // continuous band, or the three bands with their floor at 70 and 90.
    releaseContextPie(ring)
    if (display === CONTEXT_DISPLAY_RING_BAND) {
      writeRamp(ring, 'context', null)
      writeContextBand(ring, percent)
    } else {
      writeContextBand(ring, null)
      writeRamp(ring, 'context', percent === null ? null : rampPosition(percent, CONTEXT_STOPS))
    }
  }

  /** Say on the ring whether the host's panel is open, as the host's trigger says it. */
  function mirrorExpanded() {
    if (ringButton === null) return
    const trigger = contextTrigger()
    setAttributeIfChanged(ringButton, 'aria-expanded', trigger !== null && trigger.getAttribute('aria-expanded') === 'true' ? 'true' : 'false')
  }

  /**
   * Follow the hidden meter's open state as the host writes it. The host shows
   * its panel in the batch its trigger flips in, and the skin places it in that
   * same batch (stats-binding.ts), so a ring that waited for the next pass
   * would say "closed" over a panel the reader already sees.
   */
  function watchExpanded(meter: HTMLElement | null) {
    if (stopExpandedWatch !== null) stopExpandedWatch()
    stopExpandedWatch = meter === null ? null : subscribeMutations(meter, { subtree: true, attributeFilter: ['aria-expanded'] }, mirrorExpanded)
  }

  /** Take the ring down and hand the host's meter back. */
  function dropRing() {
    if (ring !== null && ring.parentElement !== null) ring.parentElement.removeChild(ring)
    ring = null
    ringButton = null
    ringValue = null
    ringFill = null
    shown = null
    colours = null
    answered = null
    if (hiddenMeter !== null) hiddenMeter.removeAttribute(METER_HIDDEN_ATTR)
    hiddenMeter = null
    watchExpanded(null)
  }

  /**
   * Whether the skin still owns the composer's row: the answer the composer
   * feature reaches, read here from the preferences and the page rather than
   * from the body attribute that feature writes on its own pass. Reading the
   * attribute would drop the ring on any pass that ran before the composer's,
   * and a ring that comes and goes moves the row's width under the wording
   * beside it, frame by frame.
   */
  function composerOwned() {
    if (composerRestyleRetired) return false
    const scope = readPrefs().composerScope
    const hero = findHeroRoot() !== null
    return scope === COMPOSER_SCOPE_ALL || (hero ? scope === COMPOSER_SCOPE_HERO : scope === COMPOSER_SCOPE_CONVERSATION)
  }

  /**
   * Where the ring belongs: the row's own position and a card the host has not
   * drawn as the hero — the home page's composer keeps the host's line, as does
   * the line of their own. The ring stands after the model seat the picker
   * draws; with the picker off the slot holds the host's own model control
   * alone, and the ring takes the row's same end after it. The compact footer
   * reads the same ring in the row, so its figures ride the toolbar alone.
   */
  function placeOf(): { slot: HTMLElement; seat: HTMLElement | null } | null {
    const position = readPrefs().statsPosition
    if (position !== STATS_POSITION_CONTEXT && position !== STATS_POSITION_FOOTER) return null
    // The ring is part of the restyled composer: with the composer handed back
    // to the host (the scope off, or the page out of the scope) the host's own
    // meter comes back whole.
    if (!composerOwned()) return null
    const slot = findModelSlot()
    const card = slot === null ? null : slot.closest<HTMLElement>('[data-composer-card]')
    if (slot === null || card === null || card.getAttribute('data-composer-variant') === 'hero') return null
    const seat = typeof ui.model?.seatBox === 'function' ? ui.model.seatBox() : null
    return { slot, seat }
  }

  function syncRing() {
    const place = placeOf()
    if (place === null) {
      if (ring !== null) dropRing()
      return
    }
    ensureRing(place.slot, place.seat)
    hideHostMeter()
    paintRing()
  }

  /**
   * The host's meter keeps the host's place and stops painting: its trigger is
   * the panel's, the reading is the ring's. It is marked the way the context
   * statistics mark it, since the hiding rule reads both marks.
   */
  function hideHostMeter() {
    const meter = findContextMeter()
    if (hiddenMeter !== meter) {
      if (hiddenMeter !== null) hiddenMeter.removeAttribute(METER_HIDDEN_ATTR)
      watchExpanded(meter)
    }
    hiddenMeter = meter
    if (meter === null) return
    markContextMeter(meter)
    meter.setAttribute(METER_HIDDEN_ATTR, '')
  }

  // The host renders its meter anew at moments of its own (a turn ending), and
  // the new node would paint in the dock for the frame before the next pass,
  // pushing the card up by its height: it is hidden in the batch that brought it.
  const triggers = observeMatches<HTMLElement>(DIALOG_TRIGGER_SELECTOR, () => {
    if (ring !== null) hideHostMeter()
  })

  function teardown() {
    triggers.release()
    dropRing()
  }

  // A generation whose teardown a client reload dropped leaves its ring in the
  // slot: this one sweeps it out before drawing its own.
  removeStrayNodes(document, `[${METER_RING_ATTR}]`, [])
  ui.meterRing = {
    sync: syncRing,
    // The ring's colours come off the page's own styles, which a pass reads in
    // its read phase alone (D40).
    measure: readColours,
    /** The ring the context panel is placed against, as the pass that drew it left it. */
    root() {
      return ring !== null && ring.isConnected ? ring : null
    },
    /**
     * The occupancy the session's own projection answered. The ring is drawn
     * from it in the same pass, and a projection frame arriving between passes
     * repaints the number at once rather than waiting for the next one.
     */
    setReading(percent: number | null) {
      if (percent === answered) return
      answered = percent
      paintRing()
    },
    teardown,
  }

  return teardown
}
