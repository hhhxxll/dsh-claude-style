/**
 * The host's own model menu, drawn the way ui-model-selection draws it: a
 * `role=menu` card of provider groups (`MenuGroup`'s `section`, its heading and
 * its rows), each row a `menuitemradio` carrying the model's name and the model
 * its provider charges it under.
 *
 * The case exists for the skin's fold (features/model-menu-fold/): the card is
 * mounted by a press on the model seat, the arrow keys move a highlight across
 * the whole catalog while the focus stays in the search field — which is what
 * the host does — and a row picked writes the model's name onto the seat.
 *
 * The stand-in draws the card itself rather than the host component, because no
 * lane boots React's own tree: what the fold reads is the markup below, and the
 * markup is the host's, taken from the component's own source.
 */
(function () {
  var host = window.__dshSmokeHost
  if (host.CASE !== 'menu-fold') return

  /** The providers and their models: two of them, so the fold has one group to open and one to close. */
  var PROVIDERS = [
    {
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: ['DeepSeek V4.1 Flash', 'DeepSeek V4.1 Pro', 'DeepSeek V4 Flash'],
    },
    {
      id: 'zai',
      name: 'Z.ai',
      models: ['GLM-5.3', 'GLM-4.7'],
    },
  ]

  var card = null
  var hidden = null
  /** Where the host's own highlight stands, as an index into the flat catalog. */
  var highlighted = 0
  /** The mark the stand-in puts on a row its query does not reach: the page's own, never the fold's. */
  var DATA_FILTERED_OUT = 'data-filtered-out'

  /** Every row of the card, in the order the card draws them. */
  function rows() {
    return card === null ? [] : Array.prototype.slice.call(card.querySelectorAll('[role="menuitemradio"]'))
  }

  /** Write the highlight the way the host does: one row carries the mark. */
  function paintHighlight() {
    var all = rows()
    for (var index = 0; index < all.length; index++) {
      if (index === highlighted) all[index].setAttribute('data-highlighted', '')
      else all[index].removeAttribute('data-highlighted')
    }
  }

  /** The model the seat names. */
  function seat() {
    var button = document.querySelector('._trigger_m_1')
    return button
  }

  function close() {
    if (card !== null && card.parentElement !== null) card.parentElement.removeChild(card)
    card = null
    hidden = null
    var trigger = seat()
    if (trigger !== null) trigger.setAttribute('aria-expanded', 'false')
  }

  /** The card the host draws: a menu of groups, its search field above the list. */
  function open() {
    close()
    var trigger = seat()
    if (trigger === null) return
    card = document.createElement('div')
    card.setAttribute('role', 'menu')
    card.setAttribute('aria-label', 'Model')
    card.style.cssText = 'position:fixed;left:40px;top:40px;width:320px;max-height:420px;overflow:auto;'
      + 'background:#fff;border:1px solid #ddd;border-radius:10px;padding:6px;'

    var search = document.createElement('div')
    search.className = 'searchRow'
    var field = document.createElement('input')
    field.type = 'text'
    field.setAttribute('role', 'searchbox')
    field.setAttribute('aria-label', 'Search models')
    field.placeholder = 'Search models'
    search.appendChild(field)
    card.appendChild(search)
    var groups = document.createElement('div')
    groups.className = 'groups'
    for (var p = 0; p < PROVIDERS.length; p++) {
      var provider = PROVIDERS[p]
      var section = document.createElement('section')
      section.setAttribute('role', 'group')
      section.setAttribute('data-menu-group', '')
      var start = document.createElement('span')
      start.setAttribute('aria-hidden', 'true')
      start.setAttribute('data-menu-group-start', '')
      section.appendChild(start)
      var heading = document.createElement('div')
      heading.setAttribute('data-menu-group-heading', '')
      heading.textContent = provider.name
      section.appendChild(heading)
      for (var m = 0; m < provider.models.length; m++) {
        var row = document.createElement('button')
        row.type = 'button'
        row.setAttribute('role', 'menuitemradio')
        row.setAttribute('aria-checked', provider.models[m] === 'DeepSeek V4.1 Flash' ? 'true' : 'false')
        row.textContent = provider.models[m]
        section.appendChild(row)
      }
      groups.appendChild(section)
    }
    card.appendChild(groups)
    hidden = groups
    document.body.appendChild(card)
    trigger.setAttribute('aria-expanded', 'true')
    // The host puts the highlight on the model in force, which is the first row
    // of the first provider here.
    highlighted = 0
    paintHighlight()
    // The host moves its highlight under the arrow keys while the focus stays
    // in the field: the fold reads that mark, so it is the same one.
    card.addEventListener('keydown', function (event) {
      if (event.target !== field) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      var step = event.key === 'ArrowDown' ? 1 : -1
      var all = rows()
      if (all.length === 0) return
      highlighted = (highlighted + step + all.length) % all.length
      paintHighlight()
    })
    // The host re-renders its list from the query: the rows under the field are
    // only the models that answer it, which is why a match folded away reads as
    // no match at all. The stand-in draws the same answer by taking the rows the
    // query does not reach out of the layout, and putting every row back when it
    // is cleared. The mark is the page's own, so it is never mistaken for the
    // fold's.
    card.addEventListener('input', function (event) {
      if (event.target !== field) return
      var query = field.value.trim().toLowerCase()
      var all = rows()
      for (var index = 0; index < all.length; index++) {
        var matches = query === '' || (all[index].textContent || '').toLowerCase().indexOf(query) !== -1
        if (matches) all[index].removeAttribute(DATA_FILTERED_OUT)
        else all[index].setAttribute(DATA_FILTERED_OUT, '')
      }
      paintHighlight()
    })
    card.addEventListener('click', function (event) {
      var row = event.target instanceof Element ? event.target.closest('[role="menuitemradio"]') : null
      if (row === null) return
      var all = rows()
      for (var index = 0; index < all.length; index++) all[index].setAttribute('aria-checked', all[index] === row ? 'true' : 'false')
      if (trigger !== null) trigger.textContent = row.textContent
      close()
    })
    // A press outside folds the card, as the host's own outside listener does.
    setTimeout(function () {
      document.addEventListener('mousedown', function outside(event) {
        if (card === null) return
        if (card.contains(event.target)) return
        document.removeEventListener('mousedown', outside)
        close()
      })
    }, 0)
  }

  var seatButton = seat()
  if (seatButton !== null) {
    seatButton.addEventListener('click', function () {
      if (card === null) open()
      else close()
    })
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close()
  })
  host.closeModelMenu = close
  host.openModelMenu = open
  /** The rows the host's own walk would visit: every row of the card, folded or not. */
  host.modelMenuRows = rows
})()
