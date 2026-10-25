/**
 * Merging the per-session folds into one day map, and shaping the payload the
 * `usage` route answers with.
 *
 * The merge keeps the ids behind each day, because the dashboard unions session
 * ids over an arbitrary range window instead of summing per-day counts (a session
 * spanning two days is one session). The payload's `hours` arrays are the one
 * figure the fold alone can supply; the ledger has no hour dimension.
 *
 * The cost meter's ledger and our own fold are two accounts of the same days, so
 * they combine by date and never by addition: a day the ledger recorded is the
 * ledger's, and every day it left out comes from the fold — the stretch after it
 * stopped writing, the history before it was installed, and the days of sessions
 * deleted since. Adding the fold's days on top of the ledger's would count the
 * same settlements twice.
 */
import { BUCKET_KEYS, addBuckets, emptyBuckets } from './usage-ledger.js'
import type { Buckets, DayBuckets } from './usage-ledger.js'
import type { RecordSession } from './usage-record.js'

/** What the service reads out: the summarized days, models and totals, or null before the first read. */
export interface UsageSummary {
  source: string
  /** Set when the figures could not be read at all this pass. */
  unavailable?: boolean
  /** How many session logs this pass folded afresh, against the ones the cache answered. */
  read?: number
  /** How many session logs this pass could not read: they keep no fingerprint and are retried next pass. */
  failed?: number
  computedAt: number
  days: Record<string, unknown>[]
  models: Record<string, unknown>[]
  firstDay: string | null
  lastDay: string | null
  hours?: number[]
  totals: Record<string, unknown>
  /** How many session logs the pass walked, against `totals.sessions` from the accounts behind them. */
  sessions?: number
}

/** The four disjoint buckets of one day or one model, summed. */
function bucketTotal(buckets: Partial<Buckets> | null | undefined): number {
  let total = 0
  for (const key of BUCKET_KEYS) total += Number(buckets?.[key]) || 0
  return total
}

/** Sum the per-session day maps into one, tracking distinct sessions per day. */
export function mergeSessions(sessions: ReadonlyMap<string, RecordSession>): Map<string, DayBuckets> {
  const days = new Map<string, DayBuckets>()
  for (const [id, entry] of sessions) {
    for (const [day, buckets] of entry.days) {
      let target = days.get(day)
      if (target === undefined) {
        target = emptyBuckets()
        target.sessions = new Set()
        target.hours = new Array(24).fill(0)
        days.set(day, target)
      }
      addBuckets(target, buckets, 1)
      if (target.sessions instanceof Set) target.sessions.add(id)
      const dayHours = target.hours ?? (target.hours = new Array(24).fill(0))
      for (let hour = 0; hour < 24; hour += 1) dayHours[hour] += (buckets.hours ?? [])[hour] ?? 0
      if (buckets.models === undefined) continue
      for (const [model, cell] of buckets.models) {
        if (target.models === undefined) target.models = new Map()
        let into = target.models.get(model)
        if (into === undefined) {
          into = emptyBuckets()
          target.models.set(model, into)
        }
        addBuckets(into, cell, 1)
      }
    }
  }
  for (const day of days.values()) {
    const behind = day.sessions instanceof Set ? [...day.sessions].sort() : []
    day.sessionIds = behind
    day.sessions = behind.length
  }
  return days
}

export function summarize(
  days: Map<string, DayBuckets>,
  sessionCount: number,
  source: string,
  hours?: number[],
  window?: { sessionIds?: ReadonlySet<string>, dates?: ReadonlySet<string> },
): UsageSummary {
  const inWindow = (date: string) => window?.dates === undefined || window.dates.has(date)
  const list = [...days.entries()].map(([date, buckets]) => ({
    date,
    input: buckets.input,
    output: buckets.output,
    cacheRead: buckets.cacheRead,
    cacheWrite: buckets.cacheWrite,
    calls: buckets.calls,
    sessions: Number.isFinite(buckets.sessions) ? buckets.sessions : 0,
    // The ids behind the day, so the dashboard can union them over any range
    // window instead of summing per-day counts (a two-day session is one).
    sessionIds: buckets.sessionIds === undefined ? []
      : [...buckets.sessionIds].filter((id) => typeof id === 'string').sort(),
    // The day's tokens per model, for the models chart. Absent when nothing
    // on the day is attributed to a model.
    models: buckets.models === undefined ? undefined
      : Object.fromEntries([...buckets.models].map(([id, cell]) => [id, bucketTotal(cell)])),
    // The day's settlements per hour, so a range window can find its own peak
    // hour. Only the fold knows the hour of a settlement.
    ...(buckets.hours === undefined ? {} : { hours: buckets.hours }),
  })).sort((left, right) => (left.date < right.date ? -1 : 1))
  const totals = emptyBuckets()
  const byModel = new Map<string, Buckets>()
  for (const [date, buckets] of days) {
    // The window's own sums: over every day the summary carries, or over the
    // dates and sessions a caller names — the two accounts behind a merged map
    // cover different spans, so neither may answer for the whole map alone.
    if (!inWindow(date)) continue
    addBuckets(totals, buckets, 1)
    if (buckets.models === undefined) continue
    for (const [id, cell] of buckets.models) {
      let into = byModel.get(id)
      if (into === undefined) {
        into = emptyBuckets()
        byModel.set(id, into)
      }
      addBuckets(into, cell, 1)
    }
  }
  // Biggest spender first: the dashboard's ranked list and its colour ramp
  // both read this order.
  const models = [...byModel.entries()]
    .map(([id, cell]) => ({ id, ...cell, tokens: bucketTotal(cell) }))
    .sort((left, right) => right.tokens - left.tokens)
  const count = window?.sessionIds === undefined ? sessionCount : window.sessionIds.size
  return {
    source,
    computedAt: Date.now(),
    days: list,
    models,
    firstDay: list.length === 0 ? null : list[0].date,
    lastDay: list.length === 0 ? null : list[list.length - 1].date,
    // The fold knows the hour of every settlement; the cost-meter ledger has
    // no hour dimension, so its histogram arrives from the fold afterwards.
    ...(hours === undefined ? {} : { hours }),
    totals: {
      ...totals,
      sessions: count,
      activeDays: list.filter((day) => inWindow(day.date)).length,
    },
  }
}

/** What merging the two accounts produced: the days, the sessions behind them, and whether the fold contributed a day. */
export interface LedgerMerge {
  days: Map<string, DayBuckets>
  sessionIds: Set<string>
  /** Whether any day came from the fold rather than the ledger. */
  folded: boolean
}

/**
 * Combine the cost meter's ledger with our own fold by date.
 *
 * A ledger day is the ledger's, down to its per-day session ids and its model
 * split; the ledger is the account that saw every provider, so the fold never
 * overwrites one of its days. The fold supplies every date the ledger did not
 * record — the stretch after the cost meter stopped writing, the history before
 * it was installed, and the days of sessions deleted since — which is also
 * where its hour histograms, the one dimension the ledger has no column for,
 * are worth keeping.
 *
 * @param ledgerDays - the ledger's day map, or null when there is no ledger at
 *     all: a null is what tells the caller the answer is the fold's alone, which
 *     an empty map cannot say.
 * @param sessions - the per-session folds, keyed by the name the usage record holds (the stored directory name).
 */
export function mergeLedgerFold(
  ledgerDays: ReadonlyMap<string, DayBuckets> | null,
  sessions: ReadonlyMap<string, RecordSession>,
): LedgerMerge {
  const days = new Map<string, DayBuckets>()
  const sessionIds = new Set<string>()
  for (const [date, buckets] of ledgerDays ?? []) {
    days.set(date, buckets)
    for (const id of buckets.sessionIds ?? []) sessionIds.add(id)
  }
  // A day the ledger did not record is the fold's whole day: its model split,
  // the sessions that settled on it and its hour histogram, as the fold alone
  // would answer.
  let folded = false
  for (const [date, buckets] of mergeSessions(sessions)) {
    if (days.has(date)) continue
    days.set(date, buckets)
    folded = true
    // The count follows the days rather than the logs: a session whose log is
    // gone is still behind the days the record holds for it.
    for (const id of buckets.sessionIds ?? []) sessionIds.add(id)
  }
  return { days, sessionIds, folded }
}
