import { describe as group, expect, test } from 'bun:test'

import {
  appliesTo,
  causeOf,
  cleanReason,
  describe,
  directionsIn,
  noteFor,
} from './notices'

// Real notices from the TfL API, November 2026.
const P12 =
  "D96484 - SOUTHWARK PARK ROAD, SE16 - ROUTE P12 is on diversion eastbound only, owing to roadworks. Buses are not serving stops from 'Raymouth Road' to 'Hothfield Place'. Please leave more time for your journey."
const R265 =
  'BEVERLEY WAY SW20: Blocked northbound by roadworks. ROUTE 265 towards Putney is diverted and is not serving stops Coombe Lane West/New Victoria Hospital, Coombe Lane West.'
const R359 =
  'ADDINGTON ROAD, CROYDON: Route 359 is on diversion in both directions due to a burst water main. Buses are diverted via Upper Selsdon Road.'
const R465 =
  'D96495 - HIGH STREET, DORKING, SURREY - ROUTE 465 is curtailed to Dorking, Deepdene Avenue owing to a police incident. Buses will not operate between Dorking, Deepdene Avenue and South Street/Rose Hill in either direction.'
const K2 =
  "COX LANE, KT9: ROUTE K2 is disrupted due to emergency Thames Water works taking place at Cox Lane. Towards Hook buses will end journeys at 'Roebuck Road'."
const R468 =
  "NOTTINGHAM ROAD, SOUTH CROYDON: Route 468 is not serving stop 'Swan & Sugar Loaf (G)' due to emergency works."
const R276 =
  "ORDNANCE ROAD: Until 23:00 Thursday 31 December 2026, route 276 towards Newham Hospital is on diversion via Manor Road and Barking Road due to signal works at Ordnance Road. Buses are not serving the stops 'Star Lane Station/Star Lane'."

group('describe', () => {
  test('a diversion', () => {
    expect(describe(R359)).toBe('Diverted')
    expect(describe(P12)).toBe('Diverted')
  })

  test('a route cut short ends early, even when diverted too', () => {
    expect(describe(R465)).toBe('Ends early')
    expect(describe(K2)).toBe('Ends early')
  })

  test('stops missed without a diversion', () => {
    expect(describe(R468)).toBe('Skips stops')
  })

  test('this stop being missed says so', () => {
    expect(describe(R468, 'Swan & Sugar Loaf')).toBe('Not stopping')
    expect(describe(R276, 'Star Lane Station')).toBe('Not stopping')
  })

  test('anything else is disrupted', () => {
    expect(describe('Something unusual is happening.')).toBe('Disrupted')
  })
})

group('causeOf', () => {
  test('short causes, without articles or places', () => {
    expect(causeOf(P12)).toBe('roadworks')
    expect(causeOf(R359)).toBe('burst water main')
    expect(causeOf(R465)).toBe('police incident')
    expect(causeOf(K2)).toBe('Thames Water works')
    expect(causeOf(R276)).toBe('signal works')
    expect(causeOf(R468)).toBe('works')
  })

  test('no cause when the notice gives none', () => {
    expect(causeOf('Route 1 is diverted.')).toBe('')
  })
})

group('cleanReason', () => {
  test("drops TfL's reference from the front", () => {
    expect(cleanReason(P12).startsWith('SOUTHWARK PARK ROAD')).toBe(true)
  })
})

group('appliesTo', () => {
  test('a one-way notice applies to buses going that way only', () => {
    expect(appliesTo(R265, 'Putney Bridge')).toBe(true)
    expect(appliesTo(R265, 'Kingston')).toBe(false)
    expect(appliesTo(R276, 'Newham Hospital')).toBe(true)
    expect(appliesTo(R276, 'Stratford')).toBe(false)
  })

  test('both directions, or no direction, applies to everyone', () => {
    expect(appliesTo(R359, 'Purley')).toBe(true)
    expect(appliesTo(R465, 'Epsom')).toBe(true)
    expect(appliesTo(R468, 'Croydon')).toBe(true)
  })

  test('a compass direction cannot be checked, so it applies', () => {
    expect(appliesTo(P12, 'Surrey Quays')).toBe(true)
  })
})

group('noteFor', () => {
  test('a diverted bus on the board is still coming here', () => {
    expect(noteFor('Diverted')).toBe('Still stops here')
  })

  test('a bus cut short says it will not go all the way', () => {
    expect(noteFor('Ends early')).toBe("Won't reach end")
  })

  test('nothing to add for a normal route', () => {
    expect(noteFor('Normal')).toBe('')
  })
})

group('directionsIn', () => {
  test('the place after "towards", up to the verb', () => {
    expect(directionsIn(R265)).toEqual(['Putney'])
    expect(directionsIn(R276)).toEqual(['Newham Hospital'])
  })

  test('every direction a notice names', () => {
    const notice =
      "Towards Hook buses will end journeys at 'Roebuck Road'. Towards Kingston Hospital buses will begin journeys at 'Jubilee Way'."
    expect(directionsIn(notice)).toEqual(['Hook', 'Kingston Hospital'])
  })
})

group('appliesTo, other direction named among the missed stops', () => {
  const R31 =
    "KILBURN HIGH ROAD, NW6: Route 31 towards Camden Town is diverted and is not serving stops between 'Kilburn Park' and 'White City Bus Station'."

  test('only the direction in the towards clause is affected', () => {
    expect(appliesTo(R31, 'Camden Town')).toBe(true)
    expect(appliesTo(R31, 'White City')).toBe(false)
  })
})
