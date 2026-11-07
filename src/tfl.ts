/**
 * The three TfL Unified API calls this app makes, and the shapes it reads
 * back from them. Only the fields the board uses are typed.
 *
 * https://api.tfl.gov.uk/swagger/ui/index.html
 */

export const API_BASE = 'https://api.tfl.gov.uk'

/** One predicted arrival, as `StopPoint/{id}/Arrivals` returns it. */
export interface Arrival {
  id: string
  lineId: string
  lineName: string
  destinationName: string
  towards?: string
  stationName?: string
  platformName?: string
  /** Seconds until the bus reaches the stop, as of when TfL answered. */
  timeToStation: number
  /** When the bus is expected, as an ISO timestamp. */
  expectedArrival: string
}

/** A line's statuses, from `Line/{ids}/Status`. */
export interface LineStatus {
  id: string
  lineStatuses: Array<{
    statusSeverity: number
    statusSeverityDescription: string
    reason?: string
    /**
     * When the notice applies. For buses `isNow` is the part that matters:
     * most notices are published weeks ahead of the works they describe.
     */
    validityPeriods?: Array<{
      fromDate: string
      toDate: string
      isNow: boolean
    }>
  }>
}

/** A notice about the stop itself, from `StopPoint/{id}/Disruption`. */
export interface StopDisruption {
  atcoCode: string
  /** "Closure" when the stop is shut, "Information" otherwise. */
  type: string
  description: string
  fromDate: string
  toDate: string
}

/** The parts of a `StopPoint/{id}` answer the masthead needs. */
export interface StopPoint {
  naptanId: string
  commonName: string
  indicator?: string
  stopLetter?: string
  additionalProperties?: Array<{ key: string; value: string }>
  children?: StopPoint[]
}

/** A failure the board can explain, rather than an HTTP status code. */
export class TflError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'TflError'
  }
}

function explain(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return 'TfL did not accept the API key'
    case 404:
      return 'TfL does not know this stop ID'
    case 429:
      return 'TfL is rate limiting this API key'
    default:
      return `TfL answered with HTTP ${status}`
  }
}

async function get<T>(path: string, apiKey: string): Promise<T> {
  const url = new URL(path, API_BASE)
  if (apiKey) {
    url.searchParams.set('app_key', apiKey)
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new TflError(explain(response.status), response.status)
  }
  return (await response.json()) as T
}

export function fetchArrivals(
  stopId: string,
  apiKey: string,
): Promise<Arrival[]> {
  return get<Arrival[]>(
    `/StopPoint/${encodeURIComponent(stopId)}/Arrivals`,
    apiKey,
  )
}

export function fetchStopPoint(
  stopId: string,
  apiKey: string,
): Promise<StopPoint> {
  return get<StopPoint>(`/StopPoint/${encodeURIComponent(stopId)}`, apiKey)
}

export function fetchLineStatuses(
  lineIds: string[],
  apiKey: string,
): Promise<LineStatus[]> {
  const ids = lineIds.map(encodeURIComponent).join(',')
  return get<LineStatus[]>(`/Line/${ids}/Status`, apiKey)
}

export function fetchStopDisruptions(
  stopId: string,
  apiKey: string,
): Promise<StopDisruption[]> {
  return get<StopDisruption[]>(
    `/StopPoint/${encodeURIComponent(stopId)}/Disruption`,
    apiKey,
  )
}
