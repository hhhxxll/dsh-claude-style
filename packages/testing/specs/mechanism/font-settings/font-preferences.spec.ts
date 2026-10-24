/**
 * The font preferences' ride on the host's theme service: a write reaches the
 * host and comes back through `theme/change`, the skin's own font tokens carry
 * a non-empty custom family, and an empty one hands the type back to the
 * typeface switch. A theme flip that changes no font field keeps the custom
 * families standing.
 *
 * @capability font-settings
 * @features settings
 * @risk The skin's own font token overrides the host's families so the custom choice never shows, a teardown strips the host's own styles, or a theme flip wipes the reader's fonts.
 */
import { afterEach, expect, test } from 'vitest'
import { hostElement } from '../../fixtures/host-markup'
import { surfaceAttribute } from '../../fixtures/surface'

/** The part mark of the element the spec builds the host's frame from. */
const PART_ATTRIBUTE = surfaceAttribute('skin.part')

/** The three tokens the skin's custom family is written to, and the brand token it must not touch. */
const TEXT_TOKENS = ['--dsw-font-family', '--dsh-claude-font-prose']
const CODE_TOKENS = ['--dsh-claude-font-code']
const BRAND_TOKEN = '--dsh-claude-font-brand'

/** A test double of the host's theme service: writes land, and `change` answers. */
function fakeTheme() {
  const listeners: (() => void)[] = []
  const state = {
    fontSizes: { text: 14, code: 11, terminal: 13 } as Record<string, number>,
    fontFamilies: { text: '', code: '', terminal: '' } as Record<string, string>,
    revision: 0,
  }
  return {
    listeners,
    fontSizes: state.fontSizes,
    fontFamilies: state.fontFamilies,
    getTheme: () => state,
    setFontSize: (role: string, px: number) => {
      state.fontSizes[role] = px
      state.revision += 1
      for (const listener of listeners) listener()
    },
    setFontFamily: (role: string, value: string) => {
      state.fontFamilies[role] = value
      state.revision += 1
      for (const listener of listeners) listener()
    },
    /** A theme flip that touches no font field: the revision moves, the fonts stand. */
    flipTheme: () => {
      state.revision += 1
      for (const listener of listeners) listener()
    },
  }
}

afterEach(() => { document.body.replaceChildren() })

test('a custom family reaches the skin\'s text and code tokens, and nothing else', async () => {
  const { installFontPreferences } = await import('@dsh-claude-style/client/pure')
  const theme = fakeTheme()
  const prefs = installFontPreferences(theme)
  try {
    prefs.setFamily('text', '思源黑体, sans-serif')
    for (const token of TEXT_TOKENS) expect(document.body.style.getPropertyValue(token)).toContain('思源黑体')
    for (const token of CODE_TOKENS) expect(document.body.style.getPropertyValue(token)).toBe('')
    expect(document.body.style.getPropertyValue(BRAND_TOKEN)).toBe('')
    prefs.setFamily('code', 'JetBrains Mono, monospace')
    for (const token of CODE_TOKENS) expect(document.body.style.getPropertyValue(token)).toContain('JetBrains Mono')
    for (const token of TEXT_TOKENS) expect(document.body.style.getPropertyValue(token)).toContain('思源黑体')
  } finally {
    prefs.stop()
  }
})

test('an empty family hands the type back, and a theme flip keeps a standing family', async () => {
  const { installFontPreferences } = await import('@dsh-claude-style/client/pure')
  const theme = fakeTheme()
  const prefs = installFontPreferences(theme)
  try {
    prefs.setFamily('text', '思源黑体')
    prefs.setFamily('text', '')
    for (const token of TEXT_TOKENS) expect(document.body.style.getPropertyValue(token)).toBe('')
    expect(theme.fontFamilies.text).toBe('')
    prefs.setFamily('code', 'JetBrains Mono')
    theme.flipTheme()
    expect(document.body.style.getPropertyValue('--dsh-claude-font-code')).toContain('JetBrains Mono')
  } finally {
    prefs.stop()
  }
})

test('the teardown hands the tokens back to whatever stood before, once', async () => {
  const { installFontPreferences } = await import('@dsh-claude-style/client/pure')
  const theme = fakeTheme()
  document.body.style.setProperty('--dsw-font-family', '"Before"')
  const prefs = installFontPreferences(theme)
  prefs.setFamily('text', '思源黑体')
  prefs.stop()
  expect(document.body.style.getPropertyValue('--dsw-font-family')).toBe('"Before"')
  expect(document.body.style.getPropertyValue('--dsh-claude-font-prose')).toBe('')
})

test('the host\'s write comes back through theme/change and sizes stay readable', async () => {
  const { installFontPreferences } = await import('@dsh-claude-style/client/pure')
  const theme = fakeTheme()
  const prefs = installFontPreferences(theme)
  try {
    let seen = -1
    const off = prefs.subscribe(() => { seen = prefs.snapshot().fontSizes.text })
    prefs.setSize('text', 16)
    expect(seen).toBe(16)
    expect(theme.fontSizes.text).toBe(16)
    off()
    expect(prefs.snapshot().fontFamilies.code).toBe('')
  } finally {
    prefs.stop()
  }
})
