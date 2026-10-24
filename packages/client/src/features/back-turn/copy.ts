import COPY from './back-turn.copy.json'
import { featureCopy } from '../../core/i18n'
import type { CopyParams } from '../../core/i18n'

export type CopyKey = keyof typeof COPY

/**
 * One line of this feature's own interface copy, in the shell's language
 * (packages/client/src/features/back-turn/back-turn.copy.json).
 */
export function copy(key: CopyKey, params?: CopyParams) {
  return featureCopy(COPY, key, params)
}
