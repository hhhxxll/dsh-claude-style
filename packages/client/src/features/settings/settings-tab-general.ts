import * as React from 'react'
import { AUTO_POPOVER_ACCOUNT, AUTO_POPOVER_ALL, AUTO_POPOVER_OFF, BRAND_CLAUDE, BRAND_DEEPSEEK, PAGE_ZOOM_08, PAGE_ZOOM_1, PAGE_ZOOM_125, PAGE_ZOOM_15, PAGE_ZOOM_SYSTEM, PALETTE_COLORING_BRAND, PALETTE_COLORING_CUSTOM, USERNAME_MAX } from '../../constants'
import { COMBINE_SVGS } from 'virtual:dsh-claude-style/generated'
import { createHostToast } from '../../shared/host-toast'
import type { Prefs } from '../../constants'
import type { SegmentOption, SettingsTab, SettingsView } from './settings-controls'
import { copy } from './copy'

/**
 * The settings page's General tab: the theme style, the username, the page's
 * own scale and the hover-open popovers.
 *
 * Each tab is a `{ id, label, rows(view) }` record: `rows` runs on every
 * render of the page (packages/client/src/features/settings/settings.ts) with the page's
 * view — the preferences, the write path, the controls and the username
 * field's state.
 */
export function createSettingsGeneralTab(): SettingsTab {
  const toast = createHostToast()

  /** The name of the colour card that is keeping the page's colours fixed. */
  function paletteName(colouring: Prefs['paletteColors']) {
    if (colouring === PALETTE_COLORING_CUSTOM) return copy('paletteCustom')
    return colouring === BRAND_DEEPSEEK ? copy('brandDeepseek') : copy('brandClaude')
  }

  /**
   * The theme style renders as a grid of large cards, each carrying the
   * brand's own mark: brands are presets, not sibling tiers of one setting.
   * The stylesheet picks the mark off the logo's data-brand, so a new brand
   * is one option here plus one rule in settings-cards.css.
   */
  function themePicker(prefs: Prefs, write: SettingsView['write']) {
    const brandOptions: SegmentOption<Prefs['brand']>[] = [
      { value: BRAND_DEEPSEEK, label: copy('brandDeepseek') },
      { value: BRAND_CLAUDE, label: copy('brandClaude') },
    ]
    return React.createElement(
      'div',
      { className: 'dsh-claude-brand-picker', role: 'group' },
      brandOptions.map(option => React.createElement(
        'button',
        {
          key: option.value,
          type: 'button',
          className: 'dsh-claude-brand-card',
          // The card names its own brand: the two cards draw their art differently
          // (Claude's mark beside its word, DeepSeek's lockup as one piece), so the
          // card, not the art inside it, is what a reader and the lane press.
          'data-brand': option.value,
          'data-active': option.value === prefs.brand ? '' : undefined,
          'aria-pressed': option.value === prefs.brand ? 'true' : 'false',
          'aria-label': option.label,
          onClick: () => {
            if (option.value === prefs.brand) return
            write({ brand: option.value })
            if (prefs.paletteColors === PALETTE_COLORING_BRAND) return
            toast.show({
              text: copy('paletteFixed', { name: paletteName(prefs.paletteColors) }),
              actions: [{
                label: copy('paletteFollowBrand'),
                onClick: () => {
                  write({ paletteColors: PALETTE_COLORING_BRAND })
                  toast.hide()
                },
              }],
            })
          },
        },
        option.value === BRAND_DEEPSEEK
          // DeepSeek's lockup is one piece of art that already draws the mark with its word.
          ? React.createElement('span', {
            className: 'dsh-claude-brand-card-lockup',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: COMBINE_SVGS.deepseek },
          })
          : [
            React.createElement('span', { key: 'mark', className: 'dsh-claude-brand-card-logo', 'data-brand': option.value, 'aria-hidden': 'true' }),
            React.createElement('span', { key: 'word', className: 'dsh-claude-brand-card-word dsh-claude-masked-word', 'aria-hidden': 'true' }),
          ],
      )),
    )
  }

  function rows(view: SettingsView) {
    const prefs = view.prefs
    const write = view.write
    const controls = view.controls
    const autoPopoverOptions: SegmentOption<Prefs['autoPopover']>[] = [
      { value: AUTO_POPOVER_OFF, label: copy('autoPopoverOff') },
      { value: AUTO_POPOVER_ACCOUNT, label: copy('autoPopoverAccount') },
      { value: AUTO_POPOVER_ALL, label: copy('autoPopoverAll') },
    ]
    const pageZoomOptions: SegmentOption<Prefs['pageZoom']>[] = [
      { value: PAGE_ZOOM_SYSTEM, label: copy('pageZoomSystem') },
      { value: PAGE_ZOOM_08, label: copy('pageZoom08') },
      { value: PAGE_ZOOM_1, label: copy('pageZoom1') },
      { value: PAGE_ZOOM_125, label: copy('pageZoom125') },
      { value: PAGE_ZOOM_15, label: copy('pageZoom15') },
    ]
    const username = view.username
    return [
      {
        rank: 10,
        node: controls.row(
          'brand',
          copy('brandTitle'),
          copy('brandDesc'),
          themePicker(prefs, write),
          { block: true },
        ),
      },
      {
        rank: 20,
        node: controls.row(
          'username',
          copy('usernameTitle'),
          copy('usernameDesc'),
          React.createElement('input', {
            type: 'text',
            className: 'dsh-claude-settings-input',
            value: username.value,
            maxLength: USERNAME_MAX,
            placeholder: copy('usernamePlaceholder'),
            spellCheck: false,
            autoComplete: 'off',
            onChange: username.onChange,
            onBlur: username.onBlur,
            onKeyDown: username.onKeyDown,
          }),
        ),
      },
      {
        rank: 30,
        node: controls.row(
          'pageZoom',
          copy('pageZoomTitle'),
          copy('pageZoomDesc'),
          controls.segment(pageZoomOptions, prefs.pageZoom, value => { write({ pageZoom: value }) }),
          { experimental: true },
        ),
      },
      {
        rank: 40,
        node: controls.row(
          'autoPopover',
          copy('autoPopoverTitle'),
          null,
          controls.segment(autoPopoverOptions, prefs.autoPopover, value => { write({ autoPopover: value }) }),
        ),
      },
    ]
  }
  return { id: 'general', label: () => copy('tabGeneral'), rows }
}
