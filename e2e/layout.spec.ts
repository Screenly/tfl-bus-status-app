/**
 * Nothing on the board overlaps, spills out of its box, or gets cut off, on
 * any screen size the app ships for.
 *
 * Each scenario loads the real app against made-up TfL answers chosen to be
 * awkward: every status the board can show, four-character routes, long
 * destinations, double-digit minutes, a closed stop with a details strip, and
 * the empty and error messages. The browser then measures every element.
 *
 * Set LAYOUT_SHOTS to a directory to also save a screenshot of each case.
 */

import { expect, test, type Page } from '@playwright/test'
import {
  createMockScreenlyForScreenshots,
  FIXED_SCREENSHOT_DATE,
  RESOLUTIONS,
  setupClockMock,
  setupScreenlyJsMock,
} from '@screenly/edge-apps/test/screenshots'
import path from 'path'

import type { Arrival, LineStatus, StopDisruption } from '../src/tfl.js'

type Notice = 'normal' | keyof typeof REASONS

/** One of each, worded the way TfL words them. */
const REASONS = {
  diverted:
    'OXFORD STREET, W1: Route {r} is on diversion in both directions via Wigmore Street due to roadworks.',
  skips:
    "KING STREET, W6: Route {r} is not serving stop 'Ravenscourt Park' due to emergency works.",
  endsEarly:
    "FINCHLEY ROAD, NW3: Route {r} is curtailed to 'Finchley Road Station' in both directions owing to a police incident.",
  notStopping:
    "TRAFALGAR SQUARE, WC2: Route {r} is not serving stop 'Trafalgar Square' due to an event.",
  notRunning:
    'Route {r} is not running in either direction due to industrial action.',
  fewer:
    'Route {r} is running a reduced service in both directions due to staff shortages.',
  delays:
    'Route {r} is experiencing delays in both directions due to heavy traffic.',
  disrupted: 'Route {r}: please check before you travel.',
} as const

interface Bus {
  route: string
  destination: string
  seconds: number
  notice: Notice
}

interface Scenario {
  name: string
  stopName: string
  letter: string
  towards: string
  buses: Bus[]
  closure?: string
  /** Answer the arrivals request with this status instead of the buses. */
  failWith?: number
}

const STATUSES_A: Bus[] = [
  {
    route: 'N207',
    destination: 'Uxbridge, Belmont Road',
    seconds: 20,
    notice: 'normal',
  },
  {
    route: 'SL10',
    destination: 'North Finchley Bus Station',
    seconds: 59,
    notice: 'diverted',
  },
  {
    route: '607',
    destination: 'Hammersmith Bus Station',
    seconds: 61,
    notice: 'skips',
  },
  {
    route: '13',
    destination: 'Golders Green Station',
    seconds: 540,
    notice: 'endsEarly',
  },
  {
    route: '24',
    destination: 'Hampstead Heath, South End Green',
    seconds: 600,
    notice: 'notStopping',
  },
]

const STATUSES_B: Bus[] = [
  {
    route: '24',
    destination: 'Hampstead Heath, South End Green',
    seconds: 40,
    notice: 'notStopping',
  },
  {
    route: 'X140',
    destination: 'Heathrow Airport Central Bus Station',
    seconds: 30,
    notice: 'notRunning',
  },
  {
    route: '88',
    destination: 'Parliament Hill Fields',
    seconds: 650,
    notice: 'fewer',
  },
  {
    route: '139',
    destination: 'West Hampstead Station',
    seconds: 1700,
    notice: 'delays',
  },
  {
    route: '453',
    destination: 'Marylebone Station',
    seconds: 2750,
    notice: 'disrupted',
  },
  { route: 'C1', destination: 'Victoria', seconds: 3590, notice: 'normal' },
]

const SCENARIOS: Scenario[] = [
  {
    name: 'statuses-a',
    stopName: 'Trafalgar Square',
    letter: 'S',
    towards: 'Piccadilly Circus or Oxford Circus',
    buses: [...STATUSES_A, ...STATUSES_B],
  },
  {
    name: 'statuses-b',
    stopName: 'Trafalgar Square',
    letter: 'S',
    towards: 'Piccadilly Circus or Oxford Circus',
    buses: STATUSES_B,
  },
  {
    name: 'closed-stop',
    stopName: 'Kensington High Street / Kensington Town Hall',
    letter: 'KB',
    towards: 'Hammersmith, Shepherds Bush or Notting Hill Gate',
    closure:
      'This bus stop is closed due to\\nwater main replacement works\\nuntil 19:00 on 19 January.\\nPlease use the next or previous\\nbus stops in either direction.',
    buses: STATUSES_A,
  },
  {
    // Longer than any real London stop or destination, to prove the board
    // shrinks or scrolls them rather than letting them push into the status.
    name: 'long-names',
    stopName:
      'Hammersmith Bus Station / Hammersmith Broadway Shopping Centre Upper Level',
    letter: 'HX',
    towards:
      'Shepherds Bush Green, White City Station, Wood Lane or East Acton Station',
    buses: [
      {
        route: '220',
        destination:
          'Willesden Junction Station, Harrow Road and Old Oak Common Lane',
        seconds: 15,
        notice: 'diverted',
      },
      {
        route: 'N207',
        destination:
          'Heathrow Airport Terminal 5 Central Bus and Coach Station',
        seconds: 300,
        notice: 'endsEarly',
      },
      {
        route: '72',
        destination: "Roehampton, Queen Mary's Hospital via Barnes Common",
        seconds: 1500,
        notice: 'normal',
      },
      { route: '9', destination: 'Aldwych', seconds: 2400, notice: 'delays' },
    ],
  },
  {
    name: 'empty',
    stopName: 'Shirland Road',
    letter: 'MD',
    towards: 'Westbourne Park',
    buses: [],
  },
  {
    name: 'error',
    stopName: 'Shirland Road',
    letter: 'MD',
    towards: 'Westbourne Park',
    buses: [],
    failWith: 401,
  },
]

const STOP_ID = '490000173S'

function arrivals(scenario: Scenario): Arrival[] {
  const now = FIXED_SCREENSHOT_DATE.getTime()
  return scenario.buses.map((bus, index) => ({
    id: String(index),
    lineId: bus.route.toLowerCase(),
    lineName: bus.route,
    destinationName: bus.destination,
    stationName: scenario.stopName,
    platformName: scenario.letter,
    towards: scenario.towards,
    timeToStation: bus.seconds,
    expectedArrival: new Date(now + bus.seconds * 1000).toISOString(),
  }))
}

function lineStatuses(scenario: Scenario): LineStatus[] {
  return scenario.buses.map((bus) => ({
    id: bus.route.toLowerCase(),
    lineStatuses: [
      bus.notice === 'normal'
        ? { statusSeverity: 10, statusSeverityDescription: 'Good Service' }
        : {
            statusSeverity: bus.notice === 'notRunning' ? 16 : 0,
            statusSeverityDescription: 'Special Service',
            reason: REASONS[bus.notice].replace('{r}', bus.route),
            validityPeriods: [{ fromDate: '', toDate: '', isNow: true }],
          },
    ],
  }))
}

function disruptions(scenario: Scenario): StopDisruption[] {
  if (!scenario.closure) return []
  return [
    {
      atcoCode: STOP_ID,
      type: 'Closure',
      description: scenario.closure,
      // Around the fixed clock the screenshot helper gives the page.
      fromDate: new Date(
        FIXED_SCREENSHOT_DATE.getTime() - 86_400_000,
      ).toISOString(),
      toDate: new Date(
        FIXED_SCREENSHOT_DATE.getTime() + 86_400_000,
      ).toISOString(),
    },
  ]
}

async function mockTfl(page: Page, scenario: Scenario): Promise<void> {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  await page.route('**/api.tfl.gov.uk/StopPoint/*/Arrivals**', (route) =>
    route.fulfill(
      scenario.failWith
        ? json({ message: 'nope' }, scenario.failWith)
        : json(arrivals(scenario)),
    ),
  )
  await page.route('**/api.tfl.gov.uk/StopPoint/*/Disruption**', (route) =>
    route.fulfill(json(disruptions(scenario))),
  )
  await page.route(/api\.tfl\.gov\.uk\/StopPoint\/[^/?]+(\?.*)?$/, (route) =>
    route.fulfill(
      json({
        naptanId: STOP_ID,
        commonName: scenario.stopName,
        stopLetter: scenario.letter,
        additionalProperties: [{ key: 'Towards', value: scenario.towards }],
      }),
    ),
  )
  await page.route('**/api.tfl.gov.uk/Line/*/Status**', (route) =>
    route.fulfill(json(lineStatuses(scenario))),
  )
}

/**
 * Runs in the page. Every pair of boxes that should sit side by side must not
 * overlap, everything must stay inside its parent and the screen, and no text
 * may be cut off with an ellipsis or clipped.
 */
// One function on purpose: page.evaluate sends it to the browser on its own,
// so it cannot call helpers defined out here.
// eslint-disable-next-line max-lines-per-function
function findLayoutIssues(): string[] {
  const issues: string[] = []
  const SLACK = 1

  const box = (el: Element) => el.getBoundingClientRect()
  const visible = (el: Element | null): el is HTMLElement =>
    !!el &&
    (el as HTMLElement).offsetParent !== null &&
    box(el).width > 0 &&
    box(el).height > 0
  const label = (el: Element) =>
    `${el.className || el.tagName}${el.textContent ? ` "${el.textContent.trim().slice(0, 30)}"` : ''}`

  const overlaps = (a: DOMRect, b: DOMRect) =>
    a.left < b.right - SLACK &&
    b.left < a.right - SLACK &&
    a.top < b.bottom - SLACK &&
    b.top < a.bottom - SLACK

  const inside = (inner: DOMRect, outer: DOMRect) =>
    inner.left >= outer.left - SLACK &&
    inner.right <= outer.right + SLACK &&
    inner.top >= outer.top - SLACK &&
    inner.bottom <= outer.bottom + SLACK

  const noOverlap = (elements: Element[], where: string) => {
    const shown = elements.filter(visible)
    for (let i = 0; i < shown.length; i += 1) {
      for (let j = i + 1; j < shown.length; j += 1) {
        if (overlaps(box(shown[i]!), box(shown[j]!))) {
          issues.push(
            `${where}: ${label(shown[i]!)} overlaps ${label(shown[j]!)}`,
          )
        }
      }
    }
  }

  const within = (elements: Element[], parent: Element, where: string) => {
    for (const el of elements.filter(visible)) {
      // The strip fit-text slides back and forth is meant to be wider than
      // the box that clips it; the box itself is what has to fit.
      if (el.classList.contains('scroller')) continue
      if (!inside(box(el), box(parent))) {
        issues.push(`${where}: ${label(el)} spills out of ${label(parent)}`)
      }
    }
  }

  /** Text wider than its box is cut off, unless fit-text is carrying it. */
  const notCut = (elements: Element[], where: string) => {
    for (const el of elements.filter(visible)) {
      if (el.closest('.is-scrolling')) continue
      if (el.scrollWidth > el.clientWidth + SLACK) {
        issues.push(`${where}: ${label(el)} is cut off`)
      }
    }
  }

  const screen = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const app = document.querySelector('#app')!

  // The big blocks, top to bottom, on screen and clear of each other.
  const blocks = Array.from(app.children)
  noOverlap(blocks, 'page')
  for (const block of blocks.filter(visible)) {
    if (!inside(box(block), screen)) {
      issues.push(`page: ${label(block)} is off screen`)
    }
  }

  // Masthead.
  const masthead = document.querySelector('.masthead')!
  noOverlap(
    [
      document.querySelector('.flag')!,
      document.querySelector('.stop-text')!,
      document.querySelector('.now')!,
    ],
    'masthead',
  )
  within(Array.from(masthead.querySelectorAll('*')), masthead, 'masthead')
  notCut(
    Array.from(
      document.querySelectorAll('.stop-name, .towards, .freshness, .clock'),
    ),
    'masthead',
  )
  const flag = document.querySelector('.flag')!
  if (visible(flag) && flag.scrollWidth > flag.clientWidth + SLACK) {
    issues.push(`masthead: stop letter "${flag.textContent}" is cut off`)
  }

  // Rows, and the labels over them.
  const board = document.querySelector('[data-board]')!
  for (const [index, row] of Array.from(
    board.querySelectorAll('.row'),
  ).entries()) {
    const where = `row ${index}`
    const cells = Array.from(row.children)
    noOverlap(cells, where)
    within(cells, row, where)

    const route = row.querySelector('.route')
    if (route && route.scrollWidth > route.clientWidth + SLACK) {
      issues.push(`${where}: route "${route.textContent}" is cut off`)
    }

    const status = row.querySelector('.status')
    if (status) {
      noOverlap(
        Array.from(status.querySelectorAll('.status-mark, .status-text')),
        `${where} status`,
      )
      within(Array.from(status.querySelectorAll('*')), row, `${where} status`)
      notCut(
        Array.from(status.querySelectorAll('.status-label, .status-note')),
        `${where} status`,
      )
      noOverlap(
        Array.from(status.querySelectorAll('.status-label, .status-note')),
        `${where} status`,
      )
    }

    notCut(Array.from(row.querySelectorAll('.next, .destination')), where)
  }
  within(Array.from(board.querySelectorAll('.row')), board, 'board')

  // Messages.
  for (const message of Array.from(board.querySelectorAll('.message'))) {
    within(Array.from(message.children), board, 'message')
    noOverlap(Array.from(message.children), 'message')
  }

  // Stop banner and details strip.
  for (const selector of ['[data-notice]', '[data-details]']) {
    const strip = document.querySelector(selector)!
    if (!visible(strip)) continue
    noOverlap(Array.from(strip.children), selector)
    within(Array.from(strip.children), strip, selector)
  }

  // Footer.
  const credit = document.querySelector('.credit')!
  noOverlap(Array.from(credit.children), 'footer')
  within(Array.from(credit.children), credit, 'footer')
  notCut(Array.from(credit.children), 'footer')

  return issues
}

for (const scenario of SCENARIOS) {
  for (const { width, height } of RESOLUTIONS) {
    test(`layout ${scenario.name} ${width}x${height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } })
      try {
        const page = await context.newPage()
        await setupClockMock(page)
        await setupScreenlyJsMock(
          page,
          createMockScreenlyForScreenshots(
            { location: 'London' },
            { stop_id: STOP_ID, tfl_api_token: 'test', theme: 'light' },
          ).screenlyJsContent,
        )
        await mockTfl(page, scenario)
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        // Let the board measure itself and fit its text.
        await page.waitForTimeout(400)

        const shots = process.env.LAYOUT_SHOTS
        if (shots) {
          await page.screenshot({
            path: path.join(shots, `${scenario.name}-${width}x${height}.png`),
          })
        }

        expect(await page.evaluate(findLayoutIssues)).toEqual([])
        if (scenario.closure) {
          await expect(page.locator('[data-notice]')).toBeVisible()
        }
      } finally {
        await context.close()
      }
    })
  }
}
