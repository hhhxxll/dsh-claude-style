import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'restart',
  order: 122,
  pref: 'restartButton',
  stylesheets: [{ file: 'restart.css', rank: 262 }],
  settingsRows: [{
    tab: 'sidebar',
    rank: 12,
    pref: 'restartButton',
    title: 'restartTitle',
    desc: 'restartDesc',
  }],
  contracts: ['shell.platform', 'shell.windows-titlebar'],
  cases: ['account'],
} satisfies FeatureManifest
