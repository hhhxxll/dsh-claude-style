/**
 * Code keeps the face's ligatures only when the reader asks for them: with the
 * switch off — the state the skin ships — `==` and `===` stand as two and three
 * separate marks, and a caret can sit between them.
 *
 * @capability typography
 * @features settings
 * @risk A reader still learning a language sees `==` and `===` drawn at the same
 *   length, reads a strict comparison as a loose one, and cannot place the caret
 *   between two characters a ligature has merged into one glyph.
 */
import { spec } from '../../fixtures/behaviour.mjs'

/**
 * The ligature setting the page computes for the code it draws, block and inline
 * alike. The block is built the way the host draws one — a prose parent carrying
 * the markdown part mark, the code block under it — because the skin scopes its
 * typography to that part.
 */
async function readCode(t) {
  const prose = t.surface('codeLigatures.prose')
  const block = t.surface('codeLigatures.block')
  const inline = t.surface('codeLigatures.inline')
  return t.page.evaluate(([proseSelector, blockSelector, inlineSelector]) => {
    const parent = document.body.appendChild(document.createElement('div'))
    parent.setAttribute(proseSelector.match(/data-[a-z-]+/)[0], 'markdown')
    parent.innerHTML = '<div class="md-code-block"><pre><code>if (a == b) x = 1</code></pre></div>' +
      '<p><code>inline a == b</code></p>'
    const read = (selector) => {
      const node = parent.querySelector(selector) ?? document.querySelector(selector)
      return node === null ? null : getComputedStyle(node).fontVariantLigatures
    }
    const answer = { block: read(blockSelector), inline: read(inlineSelector) }
    parent.remove()
    return answer
  }, [prose, block, inline])
}

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('code carries no ligatures while the switch is off, which is where it ships', async (t) => {
    await t.prefs({ codeLigatures: false })
    await t.settle()
    const code = await readCode(t)
    t.expectThat.equal(code.block, 'none', 'a code block takes the face\'s ligatures away')
    t.expectThat.equal(code.inline, 'none', 'inline code as well: code reads the same wherever it is set')
  })

  test('turning the switch on hands the face its ligatures back', async (t) => {
    await t.prefs({ codeLigatures: false })
    await t.settle()
    await t.prefs({ codeLigatures: true })
    await t.settle()
    const code = await readCode(t)
    t.expectThat.equal(code.block, 'normal', 'a code block keeps the ligatures the face ships')
    t.expectThat.equal(code.inline, 'normal', 'inline code keeps them too')
  })

  test('the switch reaches the page as a mark the stylesheet reads', async (t) => {
    const mark = t.surface.attribute('codeLigatures.mark')
    await t.prefs({ codeLigatures: false })
    await t.settle()
    t.expectThat.equal(await t.read.attribute('body', mark), 'off', 'the page says off')
    await t.prefs({ codeLigatures: true })
    await t.settle()
    t.expectThat.equal(await t.read.attribute('body', mark), 'on', 'the page says on')
  })
})
