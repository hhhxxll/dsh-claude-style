import { check, basicChecks, commonChecks } from './_shared.mjs'

export default {
  /**
   * The ring around the account's face (packages/client/src/features/account/
   * account-ring.ts): it stands around the host's own account row, says which
   * of four states the sessions are in, holds a failure until that session
   * works again, and — while it is up — its press takes the reader to the
   * session that wants them instead of opening the account menu.
   */
  'account-ring'(r) {
    basicChecks(r)
    const ring = r.ring || {}
    const state = (look) => (look === undefined || look === null ? null : look.state)
    check('the row starts bare: the setting ships as `alerts`, so nothing is drawn until a session has news',
      ring.rest !== undefined && ring.rest.state === null && ring.rest.rings === 0 && ring.marked === true,
      JSON.stringify(ring.rest))
    check('a session working is not news under the shipped setting, and the widest value draws it breathing',
      state(ring.running) === null && state(ring.runningAll) === 'running',
      JSON.stringify({ running: ring.running, all: ring.runningAll }))
    check('the running ring breathes: an animation runs on the ring itself and never ends',
      Array.isArray(ring.runningAnimations) && ring.runningAnimations.some((one) => one.playState === 'running'),
      JSON.stringify(ring.runningAnimations))
    check('the ring stands around the face, not beside it: the same centre and a box wider than the image',
      ring.geometry !== null && ring.geometry.width > ring.geometry.photoWidth &&
        ring.geometry.radius === '50%' && Math.abs(ring.geometry.offsetX) <= 1 && Math.abs(ring.geometry.offsetY) <= 1,
      JSON.stringify(ring.geometry))
    check('an unread finish leaves the ring up, still after its three breaths rather than looping',
      state(ring.done) === 'done' && ring.done.pressed === true && ring.done.title !== null &&
        (!Array.isArray(ring.doneAnimations) || ring.doneAnimations.every((one) => one.playState !== 'running')),
      JSON.stringify({ done: ring.done, animations: ring.doneAnimations }))
    check('a press on an unread finish opens that session, and the account menu stays shut',
      ring.pressDone !== undefined && ring.pressDone.opened.length === 1 && ring.pressDone.menu === 0,
      JSON.stringify(ring.pressDone))
    check('a turn that failed keeps the ring up and names the session it stands for',
      state(ring.failed) === 'failed' && ring.failed.pressed === true && typeof ring.failed.title === 'string' &&
        ring.failed.title.length > 0,
      JSON.stringify(ring.failed))
    check('a press on a failure goes to the session that failed instead of opening the menu',
      ring.pressFailed !== undefined && ring.pressFailed.opened.length === 1 && ring.pressFailed.menu === 0,
      JSON.stringify(ring.pressFailed))
    check('the failure stands down on its own once that session finishes a turn again',
      state(ring.answered) === null, JSON.stringify(ring.answered))
    check('a turn waiting on the reader asks in its own state, and its press answers it too',
      state(ring.waiting) === 'waiting' && ring.waiting.pressed === true &&
        ring.waitingColour !== null && ring.failedGeometry !== null && ring.waitingColour !== ring.failedGeometry.colour,
      JSON.stringify({ waiting: ring.waiting, colour: ring.waitingColour, failed: ring.failedGeometry && ring.failedGeometry.colour }))
    check('the setting off hands the row back bare, and back on it reports again',
      state(ring.off) === null && ring.off.rings === 0 && state(ring.back) === 'waiting',
      JSON.stringify({ off: ring.off, back: ring.back }))
    check('reduced motion holds the ring still: the state stays, its animation does not run',
      ring.reduced !== undefined && ring.reduced.animations.every((one) => one.playState !== 'running'),
      JSON.stringify(ring.reduced))
    check('with nothing asking, the press is the host\'s again: the account menu opens over the row',
      state(ring.quiet) === null && ring.pressQuiet !== undefined && ring.pressQuiet.menu > 0 &&
        ring.pressQuiet.opened.length === 0 && ring.rowsLeft === 0,
      JSON.stringify({ quiet: ring.quiet, press: ring.pressQuiet, left: ring.rowsLeft }))
    commonChecks(r)
  },
}
