import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'backTurn',
  order: 182,
  load: 'deferred',
  contracts: [
    'chat.scroller', 'chat.turn-attribute', 'conversation.session', 'conversation.session-attribute',
    'shell.foreground', 'turn.rail', 'turn.rail-current', 'turn.rail-inset', 'turn.rail-mark',
    'turn.rail-pitch', 'turn.rail-scroller',
  ],
  pref: 'backTurnButton',
  stylesheets: [{ file: 'back-turn.css', rank: 263 }],
  settingsRows: [{
    tab: 'conversation',
    rank: 22,
    pref: 'backTurnButton',
    title: 'backTurnTitle',
    desc: 'backTurnDesc',
  }],
  cases: ['turn-nav'],
} satisfies FeatureManifest
