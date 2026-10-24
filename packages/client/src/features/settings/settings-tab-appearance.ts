import * as React from 'react'
import { PALETTE_CLAUDE, PALETTE_HOST, TYPEFACE_CLAUDE, TYPEFACE_HOST } from '../../constants'
import { brandRows, paletteCardsRow } from './settings-brand'
import { copy } from './copy'
import { fontSizeTarget, FONT_CODE_RANGE, FONT_TEXT_RANGE } from './font-preferences'
import type { HostFontRole } from '@dsh-claude-style/contracts/services'
import type { Prefs } from '../../constants'
import type { SegmentOption, SettingsTab, SettingsView } from './settings-controls'

/**
 * The settings page's Appearance tab: the custom brand rows that open it
 * (settings-brand.ts), who paints the colours — with the colour cards as that
 * row's sub-row — who sets the type, the DeepSeek background and who owns it
 * (their manifests place those rows here, D72), and the font rows: the text
 * and code sizes' steppers and the two custom families, carried by the host's
 * theme service (font-preferences.ts) so the host's own font rows and this
 * page stay one configuration.
 */

/** The page's font face, set once and shared by every row. */
type FontFace = ReturnType<typeof import('./font-preferences')['installFontPreferences']> | null
let fontFace: NonNullable<FontFace> | null = null
let fontCtx: unknown = null

/** The face over the host's theme service, bound once per page render. */
export function bindFontFace(face: NonNullable<FontFace> | null) {
  fontFace = face
}

/** The context the face was bound from, so a page whose service moved rebinds. */
export function bindFontContext(ctx: unknown) {
  fontCtx = ctx
}

/** The face, or null on a page whose host carries no theme service. */
function face() {
  return fontFace
}

/** One size stepper: − current px +, held inside the role's own range. */
function sizeStepper(role: 'text' | 'code') {
  const range = role === 'text' ? FONT_TEXT_RANGE : FONT_CODE_RANGE
  return React.createElement(
    'div',
    { className: 'dsh-claude-settings-stepper', role: 'group' },
    React.createElement('button', {
      type: 'button',
      className: 'dsh-claude-settings-stepper-btn',
      'aria-label': copy('fontDecrease'),
      disabled: !fontFace || !fontFace.available || fontFace.snapshot().fontSizes[role] <= range.min,
      onClick: () => {
        const current = fontFace!.snapshot().fontSizes[role]
        fontFace!.setSize(role, fontSizeTarget(role, current, -1))
      },
    }, '−'),
    React.createElement('span', { className: 'dsh-claude-settings-stepper-value' }, `${fontFace?.snapshot().fontSizes[role] ?? ''}`),
    React.createElement('button', {
      type: 'button',
      className: 'dsh-claude-settings-stepper-btn',
      'aria-label': copy('fontIncrease'),
      disabled: !fontFace || !fontFace.available || fontFace.snapshot().fontSizes[role] >= range.max,
      onClick: () => {
        const current = fontFace!.snapshot().fontSizes[role]
        fontFace!.setSize(role, fontSizeTarget(role, current, 1))
      },
    }, '+'),
  )
}

/**
 * One family field: the draft keeps the caret while the reader types, the
 * write lands on blur or Enter, Escape hands the host's value back, and a
 * change from outside fills an untouched field. The draft lives in a ref, so
 * the caret never moves under a re-render the face's change fires.
 */
function familyField(role: HostFontRole) {
  const face = fontFace
  const value = face?.snapshot().fontFamilies[role] ?? ''
  const draftRef = React.useRef(value)
  // A change from outside (the host's own row, another seat) fills an
  // untouched field; one the reader is editing keeps its draft.
  if (draftRef.current === value || draftRef.current === '') draftRef.current = value
  const unavailable = face === null || !face.available
  return React.createElement('input', {
    type: 'text',
    className: 'dsh-claude-settings-input dsh-claude-settings-font-input',
    value: draftRef.current,
    disabled: unavailable,
    placeholder: copy('fontPlaceholder'),
    spellCheck: false,
    autoComplete: 'off',
    'aria-label': role === 'text' ? copy('fontFamilyTitle') : copy('fontFamilyCodeTitle'),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { draftRef.current = e.target.value },
    onBlur: () => {
      if (face !== null && draftRef.current !== face.snapshot().fontFamilies[role]) face.setFamily(role, draftRef.current)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (face !== null && draftRef.current !== face.snapshot().fontFamilies[role]) face.setFamily(role, draftRef.current)
        e.currentTarget.blur()
      } else if (e.key === 'Escape') {
        draftRef.current = value
        e.currentTarget.blur()
      }
    },
  })
}

export function createSettingsAppearanceTab(): SettingsTab {
  function rows(view: SettingsView) {
    const prefs = view.prefs
    const write = view.write
    const controls = view.controls
    const paletteOptions: SegmentOption<Prefs['palette']>[] = [
      { value: PALETTE_CLAUDE, label: copy('paletteClaude') },
      { value: PALETTE_HOST, label: copy('paletteHost') },
    ]
    const typefaceOptions: SegmentOption<Prefs['typeface']>[] = [
      { value: TYPEFACE_CLAUDE, label: copy('typefaceClaude') },
      { value: TYPEFACE_HOST, label: copy('typefaceHost') },
    ]
    const unavailable = fontFace === null || !fontFace.available
    return [
      ...brandRows(view),
      {
        rank: 10,
        node: controls.row(
          'palette',
          copy('paletteTitle'),
          copy('paletteDesc'),
          controls.segment(paletteOptions, prefs.palette, value => { write({ palette: value }) }),
        ),
      },
      // The cards belong to the skin's own colours: following the host leaves nothing to pick.
      ...(prefs.palette === PALETTE_HOST ? [] : [paletteCardsRow(view)]),
      {
        rank: 20,
        node: controls.row(
          'typeface',
          copy('typefaceTitle'),
          copy('typefaceDesc'),
          controls.segment(typefaceOptions, prefs.typeface, value => { write({ typeface: value }) }),
        ),
      },
      // The font rows carry the host's own settings, so they stand whatever the
      // typeface switch holds: the switch paints the faces the family leaves
      // alone, and a family written here stands over it.
      {
        rank: 50,
        node: controls.row(
          'fontSize',
          copy('fontTitle'),
          unavailable ? copy('fontUnavailable') : copy('fontDesc'),
          sizeStepper('text'),
        ),
      },
      {
        rank: 51,
        node: controls.row(
          'fontCodeSize',
          copy('fontCodeTitle'),
          unavailable ? null : copy('fontCodeDesc'),
          sizeStepper('code'),
        ),
      },
      {
        rank: 52,
        node: controls.row(
          'fontFamily',
          copy('fontFamilyTitle'),
          unavailable ? null : copy('fontFamilyDesc'),
          familyField('text'),
        ),
      },
      {
        rank: 53,
        node: controls.row(
          'fontFamilyCode',
          copy('fontFamilyCodeTitle'),
          unavailable ? null : copy('fontFamilyCodeDesc'),
          familyField('code'),
        ),
      },
    ]
  }
  return { id: 'appearance', label: () => copy('tabAppearance'), rows }
}

/** Re-exported for the page's module: the face lives here, the page binds it. */
export { fontCtx as fontFaceContext }
