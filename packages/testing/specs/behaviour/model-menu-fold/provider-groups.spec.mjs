/**
 * The host's own model menu — the card the reader gets with the skin's picker
 * switched off — carries its models under one heading per provider, and a press
 * on a heading closes that provider and opens it again. The card opens on the
 * provider holding the model in force; a query opens every provider, because a
 * reader typing is looking for a row and a match folded away reads as no match.
 *
 * @capability model-menu-fold
 * @features model-menu-fold
 * @risk A catalog of hundreds of models stays one long scroll with no way to put a provider away, or a press on a provider's name hides models with no way to bring them back.
 */
import { spec } from '../../fixtures/behaviour.mjs'

/**
 * Open the host's model menu. The feature acts on the card the HOST draws, which
 * is the one the reader gets with the skin's own picker switched off — so the
 * picker is switched off first, and the host's seat is the one left on the page.
 */
async function openMenu(t) {
  await t.prefs({ modelPicker: false })
  await t.page.locator(t.surface('menuFold.seat')).click()
  await t.settle()
}
/**
 * The card's providers as the reader can read them: one entry per heading, with
 * the state the skin wrote on it and what its rows really do on screen.
 *
 * `drawn` is the reading that matters: an element's `[hidden]` is a user agent
 * declaration and any author rule outranks it, so a fold that only sets the
 * attribute leaves every row on screen. These rows carry the host's own
 * `display: flex`, and only the drawn count can tell the two apart.
 */
function providers(t) {
  return t.page.evaluate(([headingSelector, groupSelector, rowSelector, foldedMark]) => {
    const groups = [...document.querySelectorAll(headingSelector)].map((heading) => {
      const section = heading.closest(groupSelector)
      const rows = section === null ? [] : [...section.querySelectorAll(rowSelector)]
      return {
        name: heading.textContent,
        folded: heading.getAttribute(foldedMark),
        expanded: heading.getAttribute('aria-expanded'),
        label: heading.getAttribute('aria-label'),
        rows: rows.length,
        hidden: rows.filter(row => row.hasAttribute('hidden')).length,
        drawn: rows.filter(row => row.checkVisibility({ visibilityProperty: true, opacityProperty: true })).length,
      }
    })
    return groups
  }, [t.surface('menuFold.heading'), t.surface('menuFold.group'), t.surface('menuFold.row'), t.surface.attribute('menuFold.folded')])
}

export default spec({ page: 'menu-fold' }, ({ test }) => {
  test('the card opens with the provider holding the model in force open and the rest folded', async (t) => {
    await openMenu(t)
    const groups = await providers(t)
    t.expectThat.equal(groups.length, 2, 'the card draws one heading per provider')
    t.expectThat.equal(groups[0].folded, 'false', 'the provider holding the model in force stands open')
    t.expectThat.equal(groups[0].drawn, groups[0].rows, 'and every model of it is on the page')
    t.expectThat.equal(groups[1].folded, 'true', 'the other provider stands folded')
    t.expectThat.equal(groups[1].drawn, 0, `a folded provider draws none of its rows (${groups[1].drawn} of ${groups[1].rows} still drawn)`)
  })

  test('a press on a folded provider opens it, and a press again folds it', async (t) => {
    await openMenu(t)
    const heading = t.page.locator(t.surface('menuFold.heading')).nth(1)
    await heading.click()
    await t.settle()
    const opened = (await providers(t))[1]
    t.expectThat.equal(opened.folded, 'false', 'the press opened the provider')
    t.expectThat.equal(opened.drawn > 0, true, 'and its models are on the page')
    await heading.click()
    await t.settle()
    const folded = (await providers(t))[1]
    t.expectThat.equal(folded.folded, 'true', 'the second press folded it again')
    t.expectThat.equal(folded.drawn, 0, `and its models leave the page again (${folded.drawn} still drawn)`)
    t.expectThat.visible(await t.read.box(t.surface('menuFold.heading')), 'a folded provider still draws a heading the reader can find')
  })

  test('a folded provider keeps its rows out of the reader\'s way and says so', async (t) => {
    await openMenu(t)
    const groups = await providers(t)
    const folded = groups.find(group => group.folded === 'true')
    const open = groups.find(group => group.folded === 'false')
    t.expectThat.equal(folded !== undefined && open !== undefined, true, 'the card carries both states to read')
    t.expectThat.equal(folded.drawn, 0, 'no row of the folded provider is drawn')
    t.expectThat.equal(folded.expanded, 'false', 'the heading reports itself collapsed')
    t.expectThat.equal(folded.label !== open.label, true, `the two states say different things to a screen reader (${folded.label} / ${open.label})`)
  })

  test('a query opens every provider, and clearing it folds the state back', async (t) => {
    await openMenu(t)
    const before = (await providers(t)).map(group => group.folded)
    await t.page.locator('[role="searchbox"]').fill('glm')
    await t.settle()
    const queried = await providers(t)
    t.expectThat.equal(queried.every(group => group.hidden === 0), true, 'the query opened every provider it searched')
    // The row the query reached is on the page: a match folded away reads as no
    // match at all, which is what this press has to prevent.
    const match = t.page.locator(t.surface('menuFold.row')).filter({ hasText: 'GLM-5.3' })
    t.expectThat.equal(await match.count(), 1, 'the model the query names is still listed')
    t.expectThat.visible(await match.boundingBox(), 'and it is on the page while the query stands')
    await t.page.locator('[role="searchbox"]').fill('')
    await t.settle()
    t.expectThat.equal((await providers(t)).map(group => group.folded), before, 'the card folded back to the state the reader left it in')
  })

  test('a provider is folded from the keyboard as well as from the pointer', async (t) => {
    await openMenu(t)
    // The heading is a tab stop of its own: the reader reaches it from the
    // keyboard and presses the key a disclosure answers. The press is the
    // browser's own key event, not a dispatched stand-in, so the card's key
    // handling is what the page really does with it.
    const heading = t.page.locator(t.surface('menuFold.heading')).nth(0)
    await heading.focus()
    t.expectThat.equal(await t.page.evaluate((selector) => document.activeElement === document.querySelector(selector), t.surface('menuFold.heading')), true, 'the heading takes the focus')
    const before = (await providers(t))[0].folded
    await heading.press('Enter')
    await t.settle()
    const after = (await providers(t))[0].folded
    t.expectThat.equal(after !== before, true, `Enter pressed the heading the focus stood on (${before} → ${after})`)
    const back = before === 'true' ? 'false' : 'true'
    t.expectThat.equal(after, back, 'the press turned the provider over')
  })
})
