/**
 * Reading TfL's bus notices.
 *
 * For buses TfL sets one status, Special Service, on anything from a
 * diversion to a route cut short, so the status says nothing a passenger can
 * use. What it means is in the notice text, written by TfL's controllers in
 * a fairly regular style:
 *
 *   "BEVERLEY WAY SW20: Blocked northbound by roadworks. ROUTE 265 towards
 *    Putney is diverted and is not serving stops Coombe Lane West."
 *
 * Everything here works on that text. When it cannot tell, it says less
 * rather than guessing: "Disrupted", and no cause.
 */

/** The longest cause the status column will carry. */
const MAX_CAUSE_LENGTH = 26

const SKIPS =
  /not serv|miss(es|ed|ing)? (the )?stops?|will be missed|will not serve/i

/**
 * What a notice means for someone waiting, in a few words. Checked from the
 * most specific to the least: a route cut short is usually diverted too, and
 * "Ends early" is what matters more to someone at the stop.
 */
export function describe(reason: string, stopName = ''): string {
  const name = stopName.trim().toLowerCase()
  if (name && reason.toLowerCase().includes(name) && SKIPS.test(reason)) {
    return 'Not stopping'
  }
  if (
    /curtail|end(s)? (its |their )?journeys|will not operate between|begin journeys|turn(s|ing)? short/i.test(
      reason,
    )
  ) {
    return 'Ends early'
  }
  if (/not running|suspended|withdrawn/i.test(reason)) return 'Not running'
  if (/divert|diversion/i.test(reason)) return 'Diverted'
  if (SKIPS.test(reason)) return 'Skips stops'
  if (/delay/i.test(reason)) return 'Delays'
  if (/frequen|reduced service/i.test(reason)) return 'Fewer buses'
  return 'Disrupted'
}

/**
 * The one thing someone at the stop wants to know next, under the status.
 *
 * A bus only appears on the board because TfL predicts it at this stop, so a
 * diverted bus on the board is still coming here, and the board says so.
 */
const NOTES: Record<string, string> = {
  Diverted: 'Still stops here',
  'Skips stops': 'Still stops here',
  'Ends early': "Won't reach end",
  'Not stopping': 'Use another stop',
  'Fewer buses': 'Longer waits',
  Delays: 'Allow extra time',
  Disrupted: 'Details below',
}

export function noteFor(label: string): string {
  return NOTES[label] ?? ''
}

/**
 * Why, in a word or two: "roadworks", "burst water main", "police incident".
 * Taken from the "due to …" or "owing to …" part of the notice.
 */
export function causeOf(reason: string): string {
  const match = /\b(?:due to|owing to|because of|by)\s+([^.,;:]+)/i.exec(reason)
  if (!match) return ''

  const cause = match[1]!
    .replace(/^(an?|the|emergency)\s+/i, '')
    .replace(/\s+(taking place|at|in|on|near|between|from|until)\b.*$/i, '')
    .trim()
  if (!cause || cause.length > MAX_CAUSE_LENGTH) return ''
  return cause
}

/**
 * The notice as it will be shown in full: TfL's internal reference dropped
 * from the front, and its line breaks and spacing tidied.
 */
export function cleanReason(reason: string): string {
  return reason
    .replace(/^\s*[A-Z]\d{3,}\s*-\s*/, '')
    .replace(/\\n|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A destination's first real word, which is how a notice usually names it. */
function keyWord(destination: string): string {
  const words = destination
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4)
  return words[0] ?? ''
}

/**
 * The places a notice says buses are heading: "Putney" from "Route 265
 * towards Putney is diverted", "Hook" from "Towards Hook buses will end".
 * Only these clauses say which direction is affected; the rest of a notice
 * often names the other direction's destination among the missed stops.
 */
export function directionsIn(reason: string): string[] {
  const clauses: string[] = []
  const pattern =
    /\btowards\s+(.+?)(?=\s+(?:is|are|will|buses|bus|has|have|was|were)\b|[.,;:]|$)/gi
  for (const match of reason.matchAll(pattern)) {
    const place = match[1]!.trim()
    if (place) clauses.push(place)
  }
  return clauses
}

/**
 * Whether a notice is about the direction this row's buses are going.
 *
 * Around half of all diversions are one way. A notice that names a
 * direction ("towards Putney") applies only to rows whose destination is in
 * that clause. Anything that says both directions, or names no direction it
 * can check, applies.
 */
export function appliesTo(reason: string, destination: string): boolean {
  if (/both directions|either direction/i.test(reason)) return true

  const word = keyWord(destination)
  const directions = directionsIn(reason)
  // A compass direction ("eastbound") or no direction at all cannot be
  // checked against a destination, so it is given the benefit of the doubt.
  if (!word || directions.length === 0) return true

  return directions.some((place) => place.toLowerCase().includes(word))
}
