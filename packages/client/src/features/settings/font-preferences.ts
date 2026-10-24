import { hostTheme } from '@dsh-claude-style/engine/host'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { HostFontRole, HostThemeService } from '@dsh-claude-style/contracts/services'

/**
 * The host's font settings, carried into the skin: sizes and families ride
 * ui-theme's own service (`ctx.theme`), which keeps them in the host's
 * settings document and answers every write with a `theme/change`. This
 * module is the only reader: the settings page's controls and the token
 * adapter both go through it, so the two settings seats and the host's own
 * font rows stay one configuration.
 *
 * A non-empty custom family is written onto the skin's own font tokens —
 * the interface face, the prose face and the code face — because the skin's
 * stylesheet would otherwise keep the Claude faces standing over the host's
 * variables. An empty family removes those writes again, and the typeface
 * switch's answer stands. Whatever an inline style held before the write is
 * handed back on the teardown.
 */

/** The official size ranges (ui-theme's FONT_SIZE_SPECS), in px. */
export const FONT_TEXT_RANGE = { min: 10, max: 22 } as const
export const FONT_CODE_RANGE = { min: 10, max: 16 } as const

/** The skin's font tokens each role's family is carried to, exported for the specs. */
export const FAMILY_TOKENS: Record<HostFontRole, string[]> = {
  text: ['--dsw-font-family', '--dsh-claude-font-prose'],
  code: ['--dsh-claude-font-code'],
  terminal: [],
}

/** The brand lockup's face token, which no custom family ever touches. */
export const BRAND_FONT_TOKEN = '--dsh-claude-font-brand'

const RANGES: Record<'text' | 'code', { min: number, max: number }> = {
  text: FONT_TEXT_RANGE,
  code: FONT_CODE_RANGE,
}

/**
 * The size one press lands on: one pixel from `current`, held inside the
 * role's official range.
 */
export function fontSizeTarget(role: 'text' | 'code', current: number, delta: -1 | 1): number {
  const range = RANGES[role]
  return Math.min(range.max, Math.max(range.min, current + delta))
}

/** What an inline font token held before this module wrote it, by token. */
const heldStyles = new Map<string, string>()

/** Write one family onto the skin's tokens, keeping what stood before. */
function writeFamily(tokens: string[], family: string) {
  for (const token of tokens) {
    if (family !== '' && !heldStyles.has(token)) {
      heldStyles.set(token, document.body.style.getPropertyValue(token))
    }
    if (family === '') {
      const held = heldStyles.get(token)
      if (held !== undefined) {
        if (held === '') document.body.style.removeProperty(token)
        else document.body.style.setProperty(token, held)
        heldStyles.delete(token)
      }
    } else {
      document.body.style.setProperty(token, family)
    }
  }
}

/** The families the adapter last saw, so a theme flip that moves no font field rewrites nothing. */
let lastFamilies: Record<HostFontRole, string> | null = null

/**
 * The theme service read through the context, or null where the host carries
 * none (an older build, a page the skin does not own). Everything the
 * controls ask goes through one lookup (D73).
 */
export function fontThemeOf(ctx: HostContext): HostThemeService | null {
  return hostTheme(ctx)
}

/**
 * The change listener the theme service carries. The host's own service
 * publishes through `ctx.on('theme/change')`; this field is the test double's
 * and the facade's shared seam, typed as the one thing both sides give.
 */
interface ListenableTheme extends HostThemeService {
  listeners?: (() => void)[]
}

/**
 * The font settings' face: a read-only snapshot from the host's service, one
 * subscription per reader, and the two writes. A host without the service
 * answers `available: false`, and the controls say so instead of keeping a
 * private configuration.
 */
export function installFontPreferences(
  theme: HostThemeService | null,
  onChange?: (listener: () => void) => (() => void) | undefined,
) {
  const listeners: (() => void)[] = []
  let offTheme: (() => void) | undefined

  /** Re-carry the families onto the tokens, once per real change. */
  function adopt() {
    const families = theme?.getTheme()?.fontFamilies
    if (families === undefined || families === null) return
    if (lastFamilies !== null
      && families.text === lastFamilies.text
      && families.code === lastFamilies.code
      && families.terminal === lastFamilies.terminal) return
    lastFamilies = { ...families }
    for (const role of ['text', 'code', 'terminal'] as const) {
      writeFamily(FAMILY_TOKENS[role], typeof families[role] === 'string' ? families[role] : '')
    }
  }

  /** Every reader hears a change: the host's own events fan out through here. */
  function notify() {
    adopt()
    for (const listener of [...listeners]) listener()
  }

  if (theme !== null) {
    adopt()
    const listenable = theme as ListenableTheme
    if (Array.isArray(listenable.listeners)) {
      listenable.listeners.push(notify)
    }
    offTheme = onChange?.(notify)
  }

  return {
    /** Whether a host theme service is carrying the settings. */
    available: theme !== null,
    /** The settings as the host holds them right now; the defaults while it carries none. */
    snapshot() {
      const current = theme?.getTheme()
      return {
        fontSizes: {
          text: current?.fontSizes?.text ?? 14,
          code: current?.fontSizes?.code ?? 11,
          terminal: current?.fontSizes?.terminal ?? 13,
        },
        fontFamilies: {
          text: current?.fontFamilies?.text ?? '',
          code: current?.fontFamilies?.code ?? '',
          terminal: current?.fontFamilies?.terminal ?? '',
        },
        revision: current?.revision ?? 0,
      }
    },
    /** Hear the host's changes; the call returned takes this reader off. */
    subscribe(listener: () => void) {
      listeners.push(listener)
      return () => {
        const at = listeners.lastIndexOf(listener)
        if (at !== -1) listeners.splice(at, 1)
      }
    },
    /** One role's family, written through the host; empty hands the type back. */
    setFamily(role: HostFontRole, value: string) {
      if (theme === null) return
      theme.setFontFamily(role, value)
      if (!Array.isArray((theme as ListenableTheme).listeners)) notify()
    },
    /** One role's size, written through the host. */
    setSize(role: HostFontRole, px: number) {
      if (theme === null) return
      theme.setFontSize(role, px)
      if (!Array.isArray((theme as ListenableTheme).listeners)) notify()
    },
    /** Take the reader off and hand the tokens back. */
    stop() {
      listeners.splice(0)
      offTheme?.()
      offTheme = undefined
      if (theme !== null) {
        const own = (theme as ListenableTheme).listeners
        if (Array.isArray(own)) {
          const at = own.indexOf(notify)
          if (at !== -1) own.splice(at, 1)
        }
      }
      for (const tokens of Object.values(FAMILY_TOKENS)) writeFamily(tokens, '')
      lastFamilies = null
    },
  }
}

/** The size one role's press lands on, from the snapshot the face holds. */
export function fontStepFace(face: ReturnType<typeof installFontPreferences>, role: 'text' | 'code', delta: -1 | 1) {
  const target = fontSizeTarget(role, face.snapshot().fontSizes[role], delta)
  face.setSize(role, target)
  return target
}
