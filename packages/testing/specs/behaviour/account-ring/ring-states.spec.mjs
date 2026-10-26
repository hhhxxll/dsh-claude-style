/**
 * The ring around the account's face (packages/client/src/features/account/
 * account-ring.ts): what it reports, where it stands, and what its press is for.
 * The ring is drawn around the host's own account row, and it is the whole of
 * the report — a waiting turn, an unread finish and a failure each leave a
 * still ring whose colour says which; a running session breathes only when the
 * setting asks for it.
 *
 * @capability account-ring
 * @features account
 * @risk A failure in another session goes unnoticed until the reader happens to open it, or a ring bright enough to say so quietly takes the account menu away from its own row.
 */
import { spec } from '../../fixtures/behaviour.mjs'

/** The four states the ring reports: the order the feature ranks them by, least urgent first. */
const REPORTS = ['running', 'done', 'waiting', 'failed']

/**
 * The ring as the page draws it: the state it carries, its box against the face
 * it surrounds, the colour of its border, and whether the row is a press away
 * from a session.
 */
function reading(t) {
  return t.page.evaluate(([ringSelector, stateAttribute, pressAttribute]) => {
    const rings = [...document.querySelectorAll(ringSelector)]
    const ring = rings[0] ?? null
    const row = document.getElementById('host-account')
    const photo = row === null ? null : row.querySelector('img')
    const box = ring === null ? null : ring.getBoundingClientRect()
    const pic = photo === null ? null : photo.getBoundingClientRect()
    const style = ring === null ? null : getComputedStyle(ring)
    return {
      rings: rings.length,
      state: ring === null ? null : ring.getAttribute(stateAttribute),
      pressed: row !== null && row.hasAttribute(pressAttribute),
      title: row === null ? null : row.getAttribute('title'),
      width: box === null ? 0 : box.width,
      photo: pic === null ? 0 : pic.width,
      radius: style === null ? null : style.borderTopLeftRadius,
      border: style === null ? null : style.borderTopWidth,
      colour: style === null ? null : style.borderTopColor,
      offsetX: box === null || pic === null ? null : box.left + box.width / 2 - (pic.left + pic.width / 2),
      offsetY: box === null || pic === null ? null : box.top + box.height / 2 - (pic.top + pic.height / 2),
      runs: ring === null
        ? []
        : document.getAnimations()
          .filter((animation) => animation.effect !== null && animation.effect.target === ring)
          .map((animation) => ({ playState: animation.playState, duration: Number(animation.effect.getComputedTiming().duration) })),
    }
  }, [t.surface('account.ring-face'), t.surface.attribute('account.ring'), t.surface.attribute('account.ring-press')])
}

/**
 * Publish one piece of news the way the host does, then take the reading back.
 * The stand-in carries the host's own session status map and every session's
 * event feed, so the state is written into the host's services rather than
 * assumed on the skin.
 */
async function news(t, script) {
  await t.page.evaluate(script)
  await t.settle()
  return reading(t)
}

/**
 * The reader pressing the account row, and what the page did with it. The
 * pointer arriving also starts the hover that opens the card, so the press is
 * read with that hover switched off: what is left is the press itself.
 */
async function pressRow(t) {
  await t.prefs({ autoPopover: 'off' })
  const before = await t.read.count('[role="menu"]')
  await t.page.locator('#host-account').click()
  await t.settle()
  return {
    opened: await t.page.evaluate(() => window.__ring.opened()),
    menus: (await t.read.count('[role="menu"]')) - before,
  }
}

/** A session the reader is not looking at, and one they are. */
const ELSEWHERE = () => {
  window.__ring.setCurrent('study-session')
}

export default spec({ page: 'account-ring' }, ({ test }) => {
  test('the row starts bare, and a session working is not news under the setting the host ships with', async (t) => {
    await t.settle()
    const rest = await reading(t)
    t.expectThat.equal(rest.state, null, 'nothing is drawn before a session has anything to say')
    t.expectThat.equal(rest.rings, 0, 'and no ring stands on the page at all')
    const running = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true })
    })
    t.expectThat.equal(running.state, null, `a session working elsewhere stays quiet (${running.state})`)
  })

  test('the widest setting draws the running turn, and it breathes while it runs', async (t) => {
    await t.prefs({ accountRing: 'all' })
    const running = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true })
    })
    t.expectThat.equal(running.state, 'running', 'the ring reports the running turn')
    t.expectThat.equal(REPORTS.includes(running.state), true, `the state is one the ring reports (${running.state})`)
    t.expectThat.equal(running.runs.some((one) => one.playState === 'running'), true, 'and the ring plays an animation while it runs')
  })

  test('the ring stands around the face, not beside it', async (t) => {
    await t.prefs({ accountRing: 'all' })
    const ring = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true })
    })
    t.expectThat.equal(ring.rings, 1, 'one ring, on the account row')
    t.expectThat.equal(ring.width > ring.photo, true, `the ring is wider than the face it holds (${ring.width} > ${ring.photo})`)
    t.expectThat.equal(ring.radius, '50%', 'it is a circle')
    t.expectThat.equal(Math.abs(ring.offsetX) <= 1 && Math.abs(ring.offsetY) <= 1, true, `and its centre is the face's (${ring.offsetX}, ${ring.offsetY})`)
    t.expectThat.equal(Number.parseFloat(ring.border) > 0, true, 'the ring is a border, so the face inside it stays whole')
  })

  test('an unread finish leaves a still ring that names the session, and its press opens that session', async (t) => {
    const done = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: false, completionUnread: true })
    })
    t.expectThat.equal(done.state, 'done', 'the ring reports the finish')
    t.expectThat.equal(done.pressed, true, 'the row answers a press with that session')
    t.expectThat.equal(typeof done.title === 'string' && done.title.length > 0, true, `the row says where the press goes (${done.title})`)
    t.expectThat.equal(done.runs.every((one) => one.playState !== 'running'), true, 'the finish is a still mark, not a loop')
    const pressed = await pressRow(t)
    t.expectThat.equal(pressed.opened.length, 1, 'the press opened exactly one session')
    t.expectThat.equal(pressed.menus, 0, 'and the account menu did not come up behind it')
  })

  test('a failed turn holds the ring until its session is read, and its press goes to it', async (t) => {
    const failed = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.fail('side-quest')
    })
    t.expectThat.equal(failed.state, 'failed', 'the ring reports the failure')
    t.expectThat.equal(failed.pressed, true, 'and the row is a press away from the session that failed')
    // Another session finishing is not an answer to this one's failure.
    const elsewhere = await news(t, () => {
      window.__ring.setStatus('other-session', { running: false, completionUnread: true })
    })
    t.expectThat.equal(elsewhere.state, 'failed', 'a failure outranks a finish elsewhere')
    t.expectThat.equal(elsewhere.colour, failed.colour, 'and it keeps the failure colour')
    const pressed = await pressRow(t)
    t.expectThat.equal(pressed.opened.length, 1, 'the press went to one session')
    t.expectThat.equal(pressed.opened[0], 'side-quest', 'and that session is the one that failed')
    t.expectThat.equal(pressed.menus, 0, 'and it did not open the account menu')
    // Reading the failure is what answers it: the news is spent, not worn away.
    const settled = await news(t, () => {
      window.__ring.setStatus('other-session', { running: false, completionUnread: false })
    })
    t.expectThat.equal(settled.state, null, 'with the failure read, nothing asks any more')
    t.expectThat.equal(settled.rings, 0, 'and the ring is gone from the row')
  })

  test('a turn waiting on the reader asks in its own colour, and the menu is the host\'s again when nothing asks', async (t) => {
    const waiting = await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true, pendingInteraction: { kind: 'approval' } })
    })
    t.expectThat.equal(waiting.state, 'waiting', 'the waiting turn has a state of its own')
    t.expectThat.equal(waiting.pressed, true, 'which also answers a press')
    t.expectThat.equal(waiting.runs.every((one) => one.playState !== 'running'), true, 'and it asks with a still ring, not a loop')
    const quiet = await news(t, () => window.__ring.setStatus('side-quest', { running: false }))
    t.expectThat.equal(quiet.state, null, 'with nothing asking the ring stands down')
    const pressed = await pressRow(t)
    t.expectThat.equal(pressed.opened.length, 0, 'the press opens no session of its own')
    t.expectThat.equal(pressed.menus > 0, true, 'and the account menu opens, as the host draws it')
  })

  test('the setting off hands the row back bare, and reduced motion holds the ring still', async (t) => {
    await t.prefs({ accountRing: 'all' })
    await news(t, () => {
      window.__ring.setCurrent('study-session')
      window.__ring.setStatus('side-quest', { running: true })
    })
    await t.prefs({ accountRing: 'off' })
    t.expectThat.equal((await reading(t)).rings, 0, 'the setting off draws no ring, whatever the sessions say')
    await t.prefs({ accountRing: 'all', motion: 'reduced' })
    await t.settle()
    const still = await reading(t)
    t.expectThat.equal(still.state, 'running', 'the state still reports')
    t.expectThat.equal(still.runs.every((one) => one.playState !== 'running' || one.duration === 0), true, 'and nothing plays under reduced motion')
  })
})
