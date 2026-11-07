/**
 * Everything between what TfL returns and what the board draws. Nothing here
 * touches the DOM or the network, so all of it is covered by unit tests.
 */

import {
  appliesTo,
  causeOf,
  cleanReason,
  describe,
  noteFor,
} from './notices.js'
import type { Arrival, LineStatus, StopDisruption, StopPoint } from './tfl.js'

/** A bus that left a few seconds ago is still worth a "Due" while TfL catches up. */
const GRACE_SECONDS = 30

export type Tone = 'good' | 'minor' | 'severe'

export interface RouteStatus {
  tone: Tone
  /** What it means for someone waiting: "Diverted", "Ends early". */
  label: string
  /** What that means for someone at the stop: "Still stops here". */
  note: string
  /** Why, in a word or two, when the notice says: "roadworks". */
  cause: string
  /** TfL's own explanation, for the details strip. */
  detail: string
}

/** One bus on its way to the stop. */
export interface Departure {
  key: string
  route: string
  destination: string
  /** Seconds until it arrives. */
  next: number
  status: RouteStatus
}

export interface StopNotice {
  closed: boolean
  title: string
  text: string
}

export interface StopDetails {
  name: string
  /** The letter on the stop's flag, such as "S" or "KA". */
  letter: string
  towards: string
}

/**
 * TfL's status severities, as published at `Line/Meta/Severity`. Buses only
 * use two in practice: 10, Good Service, and 0, Special Service, which is how
 * TfL marks a diversion somewhere on the route. The others are kept in case
 * that changes.
 */
const SEVERE = new Set([1, 2, 3, 4, 5, 6, 11, 16, 20])
const GOOD = new Set([10, 18])

/**
 * Said on every route with nothing reported, so no row leaves it to be
 * guessed. Not "On time": TfL publishes no timetable for buses to be on.
 */
export const GOOD_SERVICE: RouteStatus = {
  tone: 'good',
  label: 'Normal',
  note: '',
  cause: '',
  detail: '',
}

export function toneFor(severity: number): Tone {
  if (GOOD.has(severity)) return 'good'
  if (SEVERE.has(severity)) return 'severe'
  return 'minor'
}

type Status = LineStatus['lineStatuses'][number]

/**
 * Whether a notice is in effect now, rather than announcing works weeks ahead.
 * Most bus notices are the second kind, and putting them on the board would
 * mark a third of all routes as disrupted on any given day.
 */
function inEffect(status: Status): boolean {
  return (status.validityPeriods ?? []).some((period) => period.isNow)
}

/** Where a row's buses are going and where they are calling, to read a notice against. */
export interface StatusContext {
  destination?: string
  stopName?: string
}

/**
 * The worst status in effect on a line, for buses going this row's way. A
 * route can carry several at once, and the one that matters to somebody at
 * the stop is the most disruptive.
 *
 * TfL's status for a bus notice is always "Special Service", so the label
 * comes from the notice text instead: "Diverted", "Ends early" and so on.
 */
export function statusFor(
  lineId: string,
  statuses: LineStatus[],
  context: StatusContext = {},
): RouteStatus {
  const line = statuses.find((entry) => entry.id === lineId)
  const ranked = (line?.lineStatuses ?? [])
    .filter((status) => !GOOD.has(status.statusSeverity) && inEffect(status))
    .filter((status) =>
      appliesTo(status.reason ?? '', context.destination ?? ''),
    )
    .map((status): RouteStatus => {
      const reason = status.reason ?? ''
      const label = reason
        ? describe(reason, context.stopName)
        : status.statusSeverityDescription
      return {
        tone: toneFor(status.statusSeverity),
        label,
        note: noteFor(label),
        cause: causeOf(reason),
        detail: cleanReason(reason),
      }
    })
    .sort((a, b) => rank(b.tone) - rank(a.tone))

  return ranked[0] ?? GOOD_SERVICE
}

function rank(tone: Tone): number {
  return tone === 'severe' ? 2 : tone === 'minor' ? 1 : 0
}

/**
 * Seconds until a bus, counted down from what TfL said when it answered.
 * The screen's own clock only measures time since then, so a screen whose
 * clock is minutes out still shows the right countdown.
 */
export function secondsAway(
  arrival: Arrival,
  receivedAt: number,
  now: number,
): number {
  return arrival.timeToStation - Math.round((now - receivedAt) / 1000)
}

/**
 * Every bus on its way, soonest first: the order the countdown signs at
 * London bus stops use, so it reads the way anyone at a stop expects. A route
 * with two buses coming is on the board twice.
 */
export function departures(
  arrivals: Arrival[],
  statuses: LineStatus[],
  receivedAt: number,
  now: number,
): Departure[] {
  const seen = new Set<string>()
  const rows: Departure[] = []

  for (const arrival of arrivals) {
    if (seen.has(arrival.id)) continue
    seen.add(arrival.id)

    const seconds = secondsAway(arrival, receivedAt, now)
    if (seconds < -GRACE_SECONDS) continue

    rows.push({
      key: arrival.id,
      route: arrival.lineName,
      destination: arrival.destinationName,
      next: Math.max(0, seconds),
      status: statusFor(arrival.lineId, statuses, {
        destination: arrival.destinationName,
        stopName: arrival.stationName,
      }),
    })
  }

  return rows.sort((a, b) => a.next - b.next || a.route.localeCompare(b.route))
}

/** "Arriving" under a minute: plainer than TfL's "Due" for anyone passing. */
export function minutesLabel(seconds: number): string {
  if (seconds < 60) return 'Arriving'
  return `${Math.floor(seconds / 60)} min`
}

/**
 * What the stop itself has to say: closed, or a notice for passengers. A
 * closure wins, since it is the one thing that changes where to stand.
 *
 * TfL writes these for the narrow screens at the stops, with line breaks
 * escaped into the text, so they are joined back into one line here.
 */
export function stopNotice(
  disruptions: StopDisruption[],
  now: number,
): StopNotice | null {
  const active = disruptions.filter((entry) => {
    const from = Date.parse(entry.fromDate)
    const to = Date.parse(entry.toDate)
    return !(from > now) && !(to < now)
  })
  const chosen =
    active.find((entry) => entry.type === 'Closure') ?? active[0] ?? null
  if (!chosen) return null

  const closed = chosen.type === 'Closure'
  return {
    closed,
    title: closed ? 'This stop is closed' : 'Notice',
    text: chosen.description
      .replace(/\\n|\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

/** The routes serving the stop right now, in the order a person reads them. */
export function routesOf(arrivals: Arrival[]): string[] {
  const names = new Set(arrivals.map((arrival) => arrival.lineName))
  return [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

/** The line ids to ask the status endpoint about, without repeats. */
export function lineIdsOf(arrivals: Arrival[]): string[] {
  return [...new Set(arrivals.map((arrival) => arrival.lineId))].sort()
}

/**
 * `StopPoint/{id}` answers for a single stop with the whole stop area it
 * belongs to, the stop itself somewhere among the children. Find it.
 */
export function findStop(
  stop: StopPoint | null,
  stopId: string,
): StopPoint | null {
  if (!stop) return null
  if (stop.naptanId === stopId) return stop
  for (const child of stop.children ?? []) {
    const found = findStop(child, stopId)
    if (found) return found
  }
  return null
}

/**
 * The stop's name, letter and direction. The stop point lookup is preferred;
 * the arrivals carry most of the same detail, so a board whose lookup failed
 * still knows where it is.
 */
export function stopDetails(
  stop: StopPoint | null,
  stopId: string,
  arrivals: Arrival[],
): StopDetails {
  const found = findStop(stop, stopId)
  const first = arrivals[0]

  const towards =
    found?.additionalProperties?.find((entry) => entry.key === 'Towards')
      ?.value ??
    first?.towards ??
    ''

  return {
    name: found?.commonName ?? first?.stationName ?? stop?.commonName ?? '',
    letter: letterFrom(
      found?.stopLetter ?? found?.indicator ?? first?.platformName ?? '',
    ),
    towards: towards.trim(),
  }
}

/**
 * "Stop S", "S" and "->S" all mean the stop flagged S. A platform name of
 * "null", which TfL does send, means there is no letter at all.
 */
export function letterFrom(raw: string): string {
  const cleaned = raw
    .replace(/^stop\s+/i, '')
    .replace(/^->/, '')
    .trim()
  if (!cleaned || cleaned.toLowerCase() === 'null') return ''
  return /^[A-Z0-9]{1,3}$/i.test(cleaned) ? cleaned.toUpperCase() : ''
}
