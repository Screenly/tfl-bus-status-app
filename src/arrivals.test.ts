import { describe, expect, test } from 'bun:test'

import {
  departures,
  findStop,
  GOOD_SERVICE,
  letterFrom,
  lineIdsOf,
  minutesLabel,
  routesOf,
  secondsAway,
  statusFor,
  stopDetails,
  stopNotice,
  toneFor,
} from './arrivals'
import type { Arrival, LineStatus, StopDisruption, StopPoint } from './tfl'

const NOW = Date.parse('2026-11-07T08:00:00Z')

function arrival(overrides: Partial<Arrival>): Arrival {
  return {
    id: '1',
    lineId: '31',
    lineName: '31',
    destinationName: 'White City',
    towards: 'Westbourne Park',
    stationName: 'Shirland Road',
    platformName: 'MD',
    timeToStation: 120,
    expectedArrival: new Date(NOW + 120_000).toISOString(),
    ...overrides,
  }
}

describe('toneFor', () => {
  test('good service and no issues are quiet', () => {
    expect(toneFor(10)).toBe('good')
    expect(toneFor(18)).toBe('good')
  })

  test('closures and suspensions are severe', () => {
    expect(toneFor(1)).toBe('severe')
    expect(toneFor(2)).toBe('severe')
    expect(toneFor(6)).toBe('severe')
  })

  test('delays and diversions are minor', () => {
    expect(toneFor(9)).toBe('minor')
    expect(toneFor(15)).toBe('minor')
  })
})

const NOW_PERIOD = [{ fromDate: '', toDate: '', isNow: true }]
const LATER_PERIOD = [{ fromDate: '', toDate: '', isNow: false }]

type Notice = [number, string, typeof NOW_PERIOD?, string?]

function line(id: string, ...statuses: Notice[]): LineStatus {
  return {
    id,
    lineStatuses: statuses.map(([severity, description, periods, reason]) => ({
      statusSeverity: severity,
      statusSeverityDescription: description,
      validityPeriods: periods,
      reason,
    })),
  }
}

const DIVERTED =
  'HARROW ROAD, W9: Route 31 towards White City is on diversion via Elgin Avenue due to roadworks.'

describe('statusFor', () => {
  test('a diversion in effect says what it is and why', () => {
    const statuses = [line('31', [0, 'Special Service', NOW_PERIOD, DIVERTED])]
    expect(
      statusFor('31', statuses, { destination: 'White City' }),
    ).toMatchObject({
      tone: 'minor',
      label: 'Diverted',
      note: 'Still stops here',
      cause: 'roadworks',
    })
  })

  test('a one-way diversion leaves the other direction alone', () => {
    const statuses = [line('31', [0, 'Special Service', NOW_PERIOD, DIVERTED])]
    expect(statusFor('31', statuses, { destination: 'Camden Town' })).toEqual(
      GOOD_SERVICE,
    )
  })

  test('a notice for works not yet started reads as good service', () => {
    const statuses = [
      line('31', [0, 'Special Service', LATER_PERIOD, DIVERTED]),
    ]
    expect(statusFor('31', statuses)).toEqual(GOOD_SERVICE)
  })

  test('the most disruptive status in effect wins', () => {
    const statuses = [
      line('31', [9, 'Minor Delays', NOW_PERIOD], [2, 'Suspended', NOW_PERIOD]),
    ]
    expect(statusFor('31', statuses)).toMatchObject({
      tone: 'severe',
      label: 'Suspended',
    })
  })

  test('good service and unknown lines read as good service', () => {
    const statuses = [line('6', [10, 'Good Service'])]
    expect(statusFor('6', statuses)).toEqual(GOOD_SERVICE)
    expect(statusFor('328', statuses)).toEqual(GOOD_SERVICE)
  })
})

describe('secondsAway', () => {
  test('counts down from when TfL answered, not from the screen clock', () => {
    // TfL's timestamp is ignored: a screen clock ten minutes fast changes nothing.
    const bus = arrival({
      timeToStation: 300,
      expectedArrival: new Date(NOW - 600_000).toISOString(),
    })
    expect(secondsAway(bus, NOW, NOW + 60_000)).toBe(240)
  })
})

describe('departures', () => {
  test('every bus, soonest first, the same route as often as it comes', () => {
    const rows = departures(
      [
        arrival({ id: 'a', lineId: '31', lineName: '31', timeToStation: 600 }),
        arrival({
          id: 'b',
          lineId: '6',
          lineName: '6',
          destinationName: 'Victoria',
          timeToStation: 90,
        }),
        arrival({ id: 'c', lineId: '31', lineName: '31', timeToStation: 200 }),
      ],
      [],
      NOW,
      NOW,
    )
    expect(rows.map((row) => `${row.route}@${row.next}`)).toEqual([
      '6@90',
      '31@200',
      '31@600',
    ])
  })

  test('drops buses that have gone, and repeats', () => {
    const rows = departures(
      [
        arrival({ id: 'gone', timeToStation: 60 }),
        arrival({ id: 'x', timeToStation: 400 }),
        arrival({ id: 'x', timeToStation: 400 }),
      ],
      [],
      NOW,
      NOW + 180_000,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.next).toBe(220)
  })

  test('a bus a few seconds late is still arriving', () => {
    const rows = departures(
      [arrival({ timeToStation: 5 })],
      [],
      NOW,
      NOW + 20_000,
    )
    expect(rows[0]!.next).toBe(0)
  })
})

describe('labels', () => {
  test('under a minute is arriving', () => {
    expect(minutesLabel(0)).toBe('Arriving')
    expect(minutesLabel(59)).toBe('Arriving')
  })

  test('whole minutes, rounded down', () => {
    expect(minutesLabel(60)).toBe('1 min')
    expect(minutesLabel(359)).toBe('5 min')
  })
})

describe('stopNotice', () => {
  const closure: StopDisruption = {
    atcoCode: '490000269N',
    type: 'Closure',
    description:
      'This bus stop is closed due to\\nworks until 17:30 on 23 December\\nPlease use the next or previous\\nbus stops.',
    fromDate: '2026-09-21T06:30:00Z',
    toDate: '2026-12-23T17:30:00Z',
  }
  const info: StopDisruption = {
    ...closure,
    type: 'Information',
    description: 'Step-free interchange is via the next stop.',
  }

  test('a closure in effect, with its text on one line', () => {
    expect(stopNotice([info, closure], NOW)).toEqual({
      closed: true,
      title: 'This stop is closed',
      text: 'This bus stop is closed due to works until 17:30 on 23 December Please use the next or previous bus stops.',
    })
  })

  test('information when there is no closure', () => {
    expect(stopNotice([info], NOW)?.closed).toBe(false)
  })

  test('nothing outside its dates', () => {
    expect(stopNotice([closure], Date.parse('2027-01-01T00:00:00Z'))).toBeNull()
    expect(stopNotice([], NOW)).toBeNull()
  })
})

describe('routes and lines', () => {
  const arrivals = [
    arrival({ id: '1', lineId: '328', lineName: '328' }),
    arrival({ id: '2', lineId: '31', lineName: '31' }),
    arrival({ id: '3', lineId: 'n31', lineName: 'N31' }),
    arrival({ id: '4', lineId: '31', lineName: '31' }),
  ]

  test('routes read in numeric order without repeats', () => {
    expect(routesOf(arrivals)).toEqual(['31', '328', 'N31'])
  })

  test('line ids without repeats', () => {
    expect(lineIdsOf(arrivals)).toEqual(['31', '328', 'n31'])
  })
})

describe('stops', () => {
  const area: StopPoint = {
    naptanId: '490G00005189',
    commonName: 'Shirland Road',
    children: [
      {
        naptanId: '490005186S1',
        commonName: 'Shirland Road',
        stopLetter: 'MD',
        indicator: 'Stop MD',
        additionalProperties: [{ key: 'Towards', value: 'Westbourne Park' }],
      },
    ],
  }

  test('finds the stop among the area it belongs to', () => {
    expect(findStop(area, '490005186S1')?.stopLetter).toBe('MD')
    expect(findStop(area, 'nope')).toBeNull()
  })

  test('details come from the stop point', () => {
    expect(stopDetails(area, '490005186S1', [])).toEqual({
      name: 'Shirland Road',
      letter: 'MD',
      towards: 'Westbourne Park',
    })
  })

  test('details fall back to the arrivals', () => {
    expect(stopDetails(null, '490005186S1', [arrival({})])).toEqual({
      name: 'Shirland Road',
      letter: 'MD',
      towards: 'Westbourne Park',
    })
  })

  test('letters', () => {
    expect(letterFrom('Stop S')).toBe('S')
    expect(letterFrom('->KA')).toBe('KA')
    expect(letterFrom('null')).toBe('')
    expect(letterFrom('Opposite the station')).toBe('')
  })
})
