/**
 * The sidebar's default width, laid out at the host contract's minimum.
 *
 * The host solves its columns from one preference whose default (280px) is
 * wider than the smallest width its drag clamp accepts (264px, ui-layout's
 * `SIDEBAR_MIN`). The reader asked for the default to sit at that minimum:
 * the width the host writes as its own default maps to 264px, and every other
 * value — a width the reader dragged to, the collapse (0), a track keyword —
 * stands as written.
 */

/** The width the host writes when the sidebar opens at its preference's default. */
const HOST_DEFAULT = '280px'
/** The smallest width the host's own drag clamp accepts (ui-layout's SIDEBAR_MIN). */
const CONTRACT_MIN = '264px'

/**
 * The page width to lay a written sidebar width out at, or null when it is not
 * the host's default and stands as written.
 *
 * @param written - the width the host wrote, as it stands in the declaration.
 * @returns `264px` for the host's `280px` default (whitespace tolerated),
 *     null for everything else.
 */
export function sidebarDefaultWidth(written: string): string | null {
  return written.trim() === HOST_DEFAULT ? CONTRACT_MIN : null
}
