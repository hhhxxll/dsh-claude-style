import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'footer',
  order: 120,
  reads: ['ban'],
  contracts: ['shell.account-trigger', 'shell.foot-area', 'shell.footer-actions', 'shell.menu', 'shell.menu-list', 'shell.settings-button'],
  pref: 'collapseFooter',
  stylesheets: [
    { file: 'account-footer.css', rank: 240 },
    { file: 'footer-takeover.css', rank: 290 },
  ],
  settingsRows: [{
    tab: 'sidebar',
    rank: 10,
    pref: 'collapseFooter',
    title: 'collapseTitle',
    desc: 'collapseDesc',
  }, {
    // Under the switch above it: a ring on a face the takeover never drew would
    // report into a row the host paints, so the row refuses input while the
    // account area's own switch is off.
    tab: 'sidebar',
    rank: 11,
    pref: 'accountRing',
    parent: 'collapseFooter',
    title: 'ringTitle',
    desc: 'ringDesc',
    choiceLabels: {
      off: 'ringOff',
      alerts: 'ringAlerts',
      all: 'ringAll',
    },
  }],
  cases: ['account', 'account-ring', 'desktop', 'markup', 'install-fault']
} satisfies FeatureManifest
