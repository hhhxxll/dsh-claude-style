/**
 * The account-ring case: the ring around the host's own account row, walked
 * through every state it reports — the running turn the default setting keeps
 * quiet, the unread finish, the turn that failed and stays failed until that
 * session works again, the waiting turn, and the press that takes the reader to
 * the session that wants them instead of opening the account menu.
 */
(function () {
  var probe = window.__dshSmokeProbe
  var sleep = probe.sleep
  var r = probe.report
  var RING = '.' + 'dsh-' + 'claude-account-ring'
  var PRESS = 'data-dsh-' + 'claude-account-ring-press'
  var STATE = 'data-dsh-' + 'claude-account-ring'
  var MARK = 'data-dsh-' + 'claude-account-host-row'

  probe.step(async function () {
    await probe.onlyFor(['account-ring'], async function () {
      var row = document.getElementById('host-account')
      var faces = function () { return document.querySelectorAll(RING) }
      var state = function () {
        var face = faces()[0]
        return face === undefined || face === null ? null : face.getAttribute(STATE)
      }
      // What one look at the row shows: the ring's state, whether it claims the
      // press, and the words it puts on the row while it does.
      var settle = async function (label) {
        await probe.settle()
        await sleep(40)
        return { at: label, state: state(), rings: faces().length, pressed: row.hasAttribute(PRESS), title: row.getAttribute('title') }
      }
      // The ring's own animations, read the way the behaviour fixtures read
      // them: what plays on the ring's element, and for how long.
      var animations = function () {
        return document.getAnimations()
          .filter(function (animation) {
            return animation.effect !== null && animation.effect.target instanceof Element && animation.effect.target.matches(RING)
          })
          .map(function (animation) {
            return { playState: animation.playState, duration: Number(animation.effect.getComputedTiming().duration) }
          })
      }
      // Where the ring stands against the face it surrounds: the same centre,
      // and a ring wider than the image so the border shows outside it.
      var geometry = function () {
        var face = faces()[0]
        var photo = row.querySelector('img')
        if (!face || !photo) return null
        var box = face.getBoundingClientRect()
        var pic = photo.getBoundingClientRect()
        var style = getComputedStyle(face)
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          photoWidth: Math.round(pic.width),
          radius: style.borderTopLeftRadius,
          border: style.borderTopWidth,
          colour: style.borderTopColor,
          offsetX: Math.round(box.left + box.width / 2 - (pic.left + pic.width / 2)),
          offsetY: Math.round(box.top + box.height / 2 - (pic.top + pic.height / 2)),
        }
      }
      // One press, with the row's own handlers in place: the state afterwards and
      // whether the account menu came up behind it.
      var press = async function () {
        var before = window.__ring.opened().length
        row.click()
        await sleep(150)
        await probe.settle()
        return {
          opened: window.__ring.opened().slice(before),
          menu: document.querySelectorAll('[role="menu"]').length,
          state: state(),
        }
      }
      r.ring = {}
      r.ring.rest = await settle('rest')
      r.ring.marked = row.hasAttribute(MARK)
      // The setting ships as `alerts`: a session working is not news, so no ring.
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true })
      r.ring.running = await settle('running')
      // The setting's widest value asks for it, and the ring then breathes.
      window.__pushForm({ accountRing: 'all' })
      r.ring.runningAll = await settle('running-all')
      r.ring.runningAnimations = animations()
      r.ring.geometry = geometry()
      // The turn ends unread: the ring holds a still mark for it, and the press
      // is the answer — it opens that session and no menu comes up.
      window.__ring.setStatus('side-quest', { running: false, completionUnread: true })
      r.ring.done = await settle('done')
      r.ring.doneAnimations = animations()
      r.ring.doneGeometry = geometry()
      r.ring.pressDone = await press()
      // A turn that fails keeps the ring up and names the session it stands for.
      window.__ring.setCurrent('study-session')
      window.__ring.fail('side-quest')
      r.ring.failed = await settle('failed')
      r.ring.failedAnimations = animations()
      r.ring.failedGeometry = geometry()
      r.ring.pressFailed = await press()
      // The session works again: the next turn's end answers the failure, and the
      // ring stands down without the reader touching it.
      window.__ring.setStatus('side-quest', { running: true })
      await settle('failed-running')
      window.__ring.emit('side-quest', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
      window.__ring.setStatus('side-quest', { running: false })
      r.ring.answered = await settle('answered')
      // A turn waiting on the reader asks in its own colour.
      window.__ring.setStatus('side-quest', { running: true, pendingInteraction: { kind: 'approval' } })
      r.ring.waiting = await settle('waiting')
      r.ring.waitingAnimations = animations()
      r.ring.waitingColour = faces()[0] ? getComputedStyle(faces()[0]).borderTopColor : null
      // The setting off hands the row back bare, whatever the sessions say.
      window.__pushForm({ accountRing: 'off' })
      r.ring.off = await settle('off')
      window.__pushForm({ accountRing: 'alerts' })
      r.ring.back = await settle('back')
      // Reduced motion holds every state still: the ring is a static border.
      window.__pushForm({ motion: 'reduced' })
      r.ring.reduced = { attr: document.body.getAttribute('data-dsh-' + 'claude-motion'), animations: animations() }
      window.__pushForm({ motion: 'full' })
      // With nothing asking, the row is the host's own again: a press opens the
      // account menu, so the ring never makes the menu unreachable.
      window.__ring.setStatus('side-quest', { running: false })
      r.ring.quiet = await settle('quiet')
      r.ring.pressQuiet = await press()
      r.ring.rowsLeft = document.querySelectorAll(RING).length
      // The host's card is up now, and its own placement runs a frame whenever the
      // box resizes; leave the page the way the other cases leave it, with no card
      // standing open behind the teardown.
      for (var open = 0; open < document.querySelectorAll('[role="menu"]').length + 1; open++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      }
      await probe.settle()
    })
  })
})()
