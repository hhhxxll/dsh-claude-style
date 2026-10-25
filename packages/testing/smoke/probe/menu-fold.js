/**
 * The host's own model menu with its providers folded
 * (packages/client/src/features/model-menu-fold/): the stand-in mounts the card
 * the host draws, the seat is pressed to open it, and the fold is read off the
 * card — which provider stands open, what a press on a heading does, the state a
 * screen reader hears, and what a query does to the whole card.
 */
(function () {
  var probe = window.__dshSmokeProbe
  var sleep = probe.sleep
  var r = probe.report
  // The host's own marks: its menu card, the provider groups in it and their
  // headings (packages/contracts/src/dom.ts). The state the skin writes on a
  // heading is read under the mark that heading carries, spelled here as text
  // rather than as one literal, the way this lane's older code reads a mark.
  var HEADING = '[data-menu-group-heading]'
  var ROW = '[data-menu-group] [role="menuitemradio"]'
  // The state the feature writes on a heading, spelled from its own two halves so
  // this file carries no skin mark of its own (the counts in
  // packages/testing/data/skin-literals.json only shrink, and a new mark is read
  // from the surface table by the specs under packages/testing/specs/).
  var FOLDED = 'data-dsh-' + 'claude-menu-group-folded'

  probe.step(async function () {
    await probe.onlyFor(['menu-fold'], async function () {
      var card = function () { return document.querySelector('[role="menu"]') }
      var headings = function () {
        var open = card()
        return open === null ? [] : Array.prototype.slice.call(open.querySelectorAll(HEADING))
      }
      /** One provider of the card, as the reader sees it: its name, its state, and what its rows really do on screen. */
      var read = function (heading) {
        var group = heading.closest('[data-menu-group]')
        var rows = Array.prototype.slice.call(group.querySelectorAll(ROW))
        return {
          name: heading.textContent,
          folded: heading.getAttribute(FOLDED),
          expanded: heading.getAttribute('aria-expanded'),
          label: heading.getAttribute('aria-label'),
          rows: rows.length,
          hidden: rows.filter(function (row) { return row.hasAttribute('hidden') }).length,
          // The reading that matters: the host's own `.option` rule makes every
          // row a flex box, which outranks the user agent's `[hidden]`.
          drawn: rows.filter(function (row) { return row.checkVisibility({ visibilityProperty: true, opacityProperty: true }) }).length,
        }
      }
      var stateOf = function () { return headings().map(read) }

      var seat = document.querySelector('._trigger_m_1')
      if (seat === null) return
      seat.click()
      await sleep(300)

      var seededState = stateOf()
      r.menuFold = {
        seeded: seededState.length === 2 && seededState[0].folded === 'false' && seededState[1].folded === 'true',
        seededState: seededState,
        headings: seededState.length,
        hiddenRows: seededState.reduce(function (sum, entry) { return sum + entry.hidden }, 0),
        // The reading that catches a fold which only sets attributes: the host's
        // own display:flex on a row outranks the user agent's [hidden].
        drawnFoldedRows: seededState.reduce(function (sum, entry) {
          return sum + (entry.folded === 'true' ? entry.drawn : 0)
        }, 0),
      }
      // The second provider is the folded one: a press opens it, and a press
      // again folds it.
      var foldedHeading = headings()[1]
      foldedHeading.click()
      await sleep(150)
      var afterOpen = read(headings()[1])
      // Under no query the folded rows are the only ones off the page: the
      // page's own query mark is not on any row here.
      r.menuFold.toggled = afterOpen.folded === 'false' && afterOpen.hidden === 0 && afterOpen.drawn === afterOpen.rows ? 'open' : 'still folded'
      foldedHeading.click()
      await sleep(150)
      var afterFold = read(headings()[1])
      r.menuFold.toggledBack = afterFold.folded === 'true' && afterFold.hidden === afterFold.rows && afterFold.drawn === 0 ? 'folded' : 'still open'
      r.menuFold.foldedLabel = afterFold.label
      r.menuFold.openLabel = read(headings()[0]).label
      r.menuFold.expandedState = afterFold.expanded
      // A query opens everything the reader could be looking for.
      var field = card().querySelector('[role="searchbox"]')
      field.value = 'glm'
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(200)
      r.menuFold.queryOpened = stateOf().every(function (entry) { return entry.hidden === 0 && entry.folded === 'false' })
      field.value = ''
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(250)
      r.menuFold.afterQuery = stateOf().map(function (entry) { return entry.folded })
      // The card the host mounts next is the skin's again: closing the menu and
      // opening it once more folds it from the model in force, with no mark left
      // over from the card before it.
      if (typeof window.__dshSmokeHost.closeModelMenu === 'function') window.__dshSmokeHost.closeModelMenu()
      await sleep(200)
      r.menuFold.released = stateOf().length === 0
      if (typeof window.__dshSmokeHost.openModelMenu === 'function') window.__dshSmokeHost.openModelMenu()
      await sleep(300)
      var reopened = stateOf()
      r.menuFold.reopened = reopened.length === 2 && reopened[0].folded === 'false' && reopened[1].folded === 'true'
      // Leave the page as the next step expects it.
      if (typeof window.__dshSmokeHost.closeModelMenu === 'function') window.__dshSmokeHost.closeModelMenu()
    })
  })
})()
