/**
 * TfL, answered from here, so that a screenshot is the same picture every run.
 *
 * Left to the real API a screenshot would depend on the time of day and the
 * network, and a run that caught an outage would save the failure message as
 * though it were the app. Arrival times are set against the fixed clock the
 * screenshot helper gives the page, so the minutes come out the same.
 */

import type { Page } from '@playwright/test'
import { FIXED_SCREENSHOT_DATE } from '@screenly/edge-apps/test/screenshots'

import type { Arrival, LineStatus, StopPoint } from '../src/tfl.js'

export const STOP_ID = '490000173S'

const STATION = 'Trafalgar Square / Charing Cross Station'

/** Route, destination, seconds away. A busy central stop in the evening. */
const BUSES: Array<[string, string, number]> = [
  ['24', 'Hampstead Heath', 25],
  ['6', 'Willesden Bus Garage', 95],
  ['13', 'Golders Green', 170],
  ['23', 'Westbourne Park', 260],
  ['139', 'West Hampstead', 340],
  ['453', 'Marylebone Station', 455],
  ['6', 'Willesden Bus Garage', 560],
  ['88', 'Parliament Hill Fields', 690],
  ['24', 'Hampstead Heath', 780],
  ['13', 'Golders Green', 905],
  ['159', 'Oxford Circus', 1010],
  ['23', 'Westbourne Park', 1150],
]

export function arrivals(): Arrival[] {
  const now = FIXED_SCREENSHOT_DATE.getTime()
  return BUSES.map(([line, destination, seconds], index) => ({
    id: String(1000 + index),
    lineId: line.toLowerCase(),
    lineName: line,
    destinationName: destination,
    towards: 'Piccadilly Circus or Oxford Circus',
    stationName: STATION,
    platformName: 'S',
    timeToStation: seconds,
    expectedArrival: new Date(now + seconds * 1000).toISOString(),
  }))
}

const NOW = [{ fromDate: '', toDate: '', isNow: true }]
const AHEAD = [{ fromDate: '', toDate: '', isNow: false }]

/**
 * Notices written the way TfL writes them. Buses always carry the status
 * Special Service; what it means is in the text. Route 6's notice is for the
 * other direction and route 24's is for works next week, so the board shows
 * both of them as good service.
 */
const NOTICES: Record<string, { periods: typeof NOW; reason: string }> = {
  '13': {
    periods: NOW,
    reason:
      "FINCHLEY ROAD, NW3: Route 13 towards Golders Green is curtailed to 'Finchley Road Station' owing to a police incident. Buses will not operate between 'Finchley Road Station' and 'Golders Green Station'.",
  },
  '23': {
    periods: NOW,
    reason:
      "HARROW ROAD, W9: Route 23 towards Westbourne Park is on diversion via Elgin Avenue due to roadworks. Buses are not serving stops from 'Warwick Avenue' to 'Great Western Road'.",
  },
  '139': {
    periods: NOW,
    reason:
      "ABBEY ROAD, NW8: Route 139 is on diversion in both directions due to a burst water main. Buses are not serving the stops between 'Abbey Road' and 'Belsize Road'.",
  },
  '6': {
    periods: NOW,
    reason:
      'STRAND, WC2: Route 6 towards Aldwych is on diversion via Charing Cross Road due to gas works.',
  },
  '24': {
    periods: AHEAD,
    reason:
      'Road will be closed from 14 Nov 06:00 until 15 Nov 18:00. Buses will be diverted.',
  },
}

export function lineStatuses(): LineStatus[] {
  return [...new Set(BUSES.map(([line]) => line.toLowerCase()))].map((id) => {
    const notice = NOTICES[id]
    return {
      id,
      lineStatuses: [
        notice
          ? {
              statusSeverity: 0,
              statusSeverityDescription: 'Special Service',
              validityPeriods: notice.periods,
              reason: notice.reason,
            }
          : { statusSeverity: 10, statusSeverityDescription: 'Good Service' },
      ],
    }
  })
}

export function stopPoint(): StopPoint {
  return {
    naptanId: '490G00173000',
    commonName: STATION,
    children: [
      {
        naptanId: STOP_ID,
        commonName: STATION,
        stopLetter: 'S',
        indicator: 'Stop S',
        additionalProperties: [
          { key: 'Towards', value: 'Piccadilly Circus or Oxford Circus' },
        ],
      },
    ],
  }
}

export function mockSettings(theme = 'light'): Record<string, string> {
  return { stop_id: STOP_ID, tfl_api_token: 'screenshot', theme }
}

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

export async function setupTflMock(page: Page): Promise<void> {
  await page.route('**/api.tfl.gov.uk/StopPoint/*/Arrivals**', (route) =>
    route.fulfill(json(arrivals())),
  )
  await page.route(/api\.tfl\.gov\.uk\/StopPoint\/[^/?]+(\?.*)?$/, (route) =>
    route.fulfill(json(stopPoint())),
  )
  await page.route('**/api.tfl.gov.uk/StopPoint/*/Disruption**', (route) =>
    route.fulfill(json([])),
  )
  await page.route('**/api.tfl.gov.uk/Line/*/Status**', (route) =>
    route.fulfill(json(lineStatuses())),
  )
}
