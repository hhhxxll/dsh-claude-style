import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'deepseekBackground',
  order: 37,
  pref: 'deepseekBackground',
  prefValues: ['static', 'dynamic'],
  stylesheets: [{ file: 'deepseek-background.css', rank: 327 }],
  settingsRows: [{
    tab: 'appearance',
    rank: 22,
    pref: 'deepseekBackground',
    title: 'deepseekBackgroundTitle',
    desc: 'deepseekBackgroundDesc',
    choiceLabels: {
      off: 'deepseekBackgroundOff',
      static: 'deepseekBackgroundStatic',
      dynamic: 'deepseekBackgroundDynamic',
    },
  }],
  contracts: [],
  cases: ['hero'],
} satisfies FeatureManifest
