import COPY from './model-menu-fold.copy.json'
import { featureCopy } from '../../core/i18n'
import type { CopyParams } from '../../core/i18n'

export type CopyKey = keyof typeof COPY

/**
 * One line of this feature's own interface copy, in the shell's language
 * (packages/client/src/features/model-menu-fold/model-menu-fold.copy.json): the
 * copy ships with the bundle, so the first paint carries it and a key is this
 * file's own.
 */
export function copy(key: CopyKey, params?: CopyParams) {
  return featureCopy(COPY, key, params)
}
