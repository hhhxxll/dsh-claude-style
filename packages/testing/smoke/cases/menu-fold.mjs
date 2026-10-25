import { check, basicChecks } from './_shared.mjs'

export default {
  /**
   * The host's own model menu with its providers folded
   * (packages/client/src/features/model-menu-fold/): the card opens on the
   * provider carrying the model in force, a press on a heading closes that
   * provider, and the reader's own state survives the passes after it.
   */
  'menu-fold'(r) {
    basicChecks(r)
    const fold = r.menuFold || {}
    check('the card opens with the provider holding the model in force open and the other folded',
      fold.seeded === true, JSON.stringify(fold.seededState))
    check('a press on a folded provider opens it, and a press again folds it',
      fold.toggled === 'open' && fold.toggledBack === 'folded', JSON.stringify({ toggled: fold.toggled, back: fold.toggledBack }))
    check('a folded provider keeps its heading and hides every row it names',
      fold.hiddenRows > 0 && fold.headings === 2,
      JSON.stringify({ hiddenRows: fold.hiddenRows, headings: fold.headings }))
    check('the heading carries the state a screen reader reads',
      fold.foldedLabel !== null && fold.foldedLabel !== fold.openLabel && fold.expandedState === 'false',
      JSON.stringify({ folded: fold.foldedLabel, open: fold.openLabel, expanded: fold.expandedState }))
    check('a query opens every provider, and clearing it folds the state back',
      fold.queryOpened === true && Array.isArray(fold.afterQuery) &&
        JSON.stringify(fold.afterQuery) === JSON.stringify(fold.seededState.map((entry) => entry.folded)),
      JSON.stringify({ queryOpened: fold.queryOpened, afterQuery: fold.afterQuery, seeded: fold.seededState.map((entry) => entry.folded) }))
    check('a card the host mounts again opens on the model in force, with no mark left from the last one',
      fold.released === true && fold.reopened === true, JSON.stringify({ released: fold.released, reopened: fold.reopened }))
  },
}
