/**
 * When the dynamic layer draws: the choice must be the dynamic one, the
 * reader's motion answer must allow animation, and the page must be in front.
 * Everything else stands still — the static wash keeps standing.
 */
export function shouldAnimateDeepseekBackground(mode: string, reduced: boolean, hidden: boolean): boolean {
  return mode === 'dynamic' && !reduced && !hidden
}

/** How often the drift redraws, in milliseconds: slow on purpose, and off the frame rate. */
export const DEEPSEEK_DRIFT_MS = 66

/** The colours the wash and the drift draw from, per scheme: the DeepSeek site's own reads. */
export const DEEPSEEK_WASH = {
  light: { top: '#9cc1e7', glow: 'rgba(120, 160, 220, 0.16)', glow2: 'rgba(77, 107, 254, 0.07)' },
  dark: { top: '#1a2233', glow: 'rgba(90, 120, 190, 0.10)', glow2: 'rgba(77, 107, 254, 0.06)' },
} as const
