import { STATS_POSITION_CONTEXT, STATS_POSITION_FOOTER } from '../../constants'
import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'meterRing',
  // After the context statistics (70), which answer the occupancy this ring
  // draws, and before the settings page's own rows: the two features of this
  // directory are one surface's halves — the ring in the row, the panel above
  // it — and a pass draws the ring with the reading the same pass handed it.
  order: 72,
  // The ring stands in the row the seat box is laid out in, under the popover
  // position and under the compact footer whose figures ride the toolbar alone:
  // the line of their own keeps the host's meter at the host's place. With the
  // picker off the ring stands at the slot's own end, after the host's model
  // control, so the popover position does not require the picker.
  pref: 'statsPosition',
  prefValues: [STATS_POSITION_CONTEXT, STATS_POSITION_FOOTER],
  reads: ['model'],
  contracts: ['composer.dialog-trigger'],
  stylesheets: [{ file: 'meter-ring.css', rank: 105 }],
  cases: [],
} satisfies FeatureManifest
