import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'modelMenuFold',
  // After the model picker: the two are the same decision (the host's menu and
  // the skin's own), and a card the picker hands back is one this feature may
  // take over in the same pass.
  order: 81,
  contracts: ['shell.menu', 'shell.menu-group', 'shell.menu-group-heading'],
  /**
   * It acts on the host's own menu, which exists precisely while the skin's
   * picker is off — the row that switches the picker off is the explanation,
   * so the feature takes no row of its own.
   */
  ungated: '折叠宿主模型菜单里的供应商分组；只在「重绘模型选择器」关闭时那个菜单才由宿主绘制，故它不设自己的开关',
  stylesheets: [{ file: 'model-menu-fold.css', rank: 261 }],
  cases: ['menu-fold'],
} satisfies FeatureManifest
