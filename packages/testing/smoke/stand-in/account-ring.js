/**
 * The account-ring case: what the ring around the account's face reads, as the
 * host publishes it — one status entry per session (uiSession), the list that
 * names them, every running session's event feed, and the workspace whose
 * openSession is the press's errand. The probe and the behaviour spec drive all
 * of them through __ring.
 */
(function () {
  var host = window.__dshSmokeHost
  var CASE = host.CASE

  var ring = CASE === 'account-ring' ? (function () {
    var statusListeners = new Set()
    var status = new Map()
    var titles = { 'study-session': 'Study session', 'side-quest': 'Side quest' }
    var list = {
      ids: Object.keys(titles),
      byId: Object.keys(titles).reduce(function (all, id) { all[id] = { id: id, displayTitle: titles[id] }; return all }, {}),
      projectionsBySession: {},
    }
    // Every session's feed, as the host's MutableSessionEventSource publishes
    // one: the entries so far, a revision per change, and the change itself.
    var feeds = new Map()
    var opened = []
    var current = 'study-session'

    /** Tell one set of subscribers that what they read has moved on. */
    function announce(listeners) {
      Array.from(listeners).forEach(function (listener) { listener() })
    }
    /** Subscribe to one set, returning the way out of it. */
    function listening(listeners) {
      return function (listener) {
        listeners.add(listener)
        return function () { listeners.delete(listener) }
      }
    }
    function feedFor(id) {
      var held = feeds.get(id)
      if (held === undefined) {
        held = { listeners: new Set(), entries: [], revision: 0 }
        held.source = {
          getSnapshot: function () {
            return { entries: held.entries, revision: held.revision, change: held.change }
          },
          subscribe: listening(held.listeners),
        }
        feeds.set(id, held)
      }
      return held
    }
    function publish(id, change) {
      var held = feedFor(id)
      held.revision += 1
      held.change = change
      announce(held.listeners)
    }
    function write(id, entry) {
      status = new Map(status)
      status.set(id, Object.assign({ running: false, pendingInteraction: undefined, completionUnread: false }, entry))
      announce(statusListeners)
    }

    window.__ring = {
      /** One session's status entry; the whole map is replaced, as the host's is. */
      setStatus: function (id, entry) { write(id, entry) },
      /** The session the reader is looking at. */
      setCurrent: function (id) {
        current = id
        announce(statusListeners)
      },
      /** Append one live event to a session's feed. */
      emit: function (id, event) {
        var held = feedFor(id)
        var entries = [{ type: 'event', event: event }]
        held.entries = held.entries.concat(entries)
        publish(id, { kind: 'append', entries: entries })
      },
      /** A turn that failed, as its feed writes it. */
      fail: function (id) {
        write(id, { running: true })
        window.__ring.emit(id, { type: 'turn/end', data: { reason: { kind: 'error' } } })
      },
      /** The sessions whose session was opened, in order. */
      opened: function () { return opened.slice() },
      /** Which session the reader stands in. */
      current: function () { return current },
    }

    return {
      sessions: {
        list: { getSnapshot: function () { return list } },
        binding: function (id) {
          return titles[id] === undefined ? undefined : { sessionId: id, eventSource: feedFor(id).source }
        },
      },
      uiSession: {
        // Read on every look, as the host's own current-session slot is: the
        // reader moves between sessions without the service being rebuilt.
        current: { get value() { return { key: current } } },
        sessionStatus: {
          getSnapshot: function () { return status },
          subscribe: listening(statusListeners),
        },
      },
      // Opening a session is the reader's answer to the ring: the host marks
      // that session read, so its news stops asking for them.
      uiWorkspace: {
        openSession: function (id) {
          opened.push(id)
          status = new Map(status)
          status.delete(id)
          announce(statusListeners)
        },
      },
    }
  })() : undefined
  host.accountRing = ring
})()
