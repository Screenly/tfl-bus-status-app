import './style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  readEdgeAppCache,
  reportError,
  setupErrorHandling,
  setupSentry,
  setupTheme,
  signalReady,
  writeEdgeAppCache,
} from '@screenly/edge-apps'

import {
  departures,
  lineIdsOf,
  minutesLabel,
  routesOf,
  stopDetails,
  stopNotice,
  type Departure,
} from './arrivals.js'
import {
  layoutBoard,
  renderBoard,
  renderClock,
  renderCredit,
  renderMasthead,
  renderDetails,
  renderMessage,
  renderNotice,
  type Detail,
} from './panels.js'
import { resolveTheme } from './theme.js'
import {
  fetchArrivals,
  fetchLineStatuses,
  fetchStopDisruptions,
  fetchStopPoint,
  type Arrival,
  type LineStatus,
  type StopDisruption,
  type StopPoint,
} from './tfl.js'

/** TfL refreshes its predictions about every 30 seconds. */
const ARRIVALS_MS = 30 * 1000
/** How long each route's details stay up when several are disrupted. */
const DETAIL_MS = 10 * 1000
/** Route status and stop notices change by the hour, not by the minute. */
const STATUS_MS = 5 * 60 * 1000
const CACHE = 'tfl-bus-status'

/** Bus stops are in London, so the clock is too, wherever the screen is. */
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
})

interface CachedArrivals {
  receivedAt: number
  arrivals: Arrival[]
}

interface State {
  stopId: string
  apiKey: string
  stop: StopPoint | null
  arrivals: Arrival[]
  statuses: LineStatus[]
  statusesAt: number
  statusesFor: string
  disruptions: StopDisruption[]
  disruptionsAt: number
  /** When the arrivals being shown came from TfL. */
  receivedAt: number | null
  offline: boolean
  error: Error | null
}

function applyTheme(): void {
  document.documentElement.dataset.theme = resolveTheme(
    getSettingWithDefault<string>('theme', 'light'),
  )
}

function readState(): State {
  return {
    stopId: getSettingWithDefault<string>('stop_id', '').trim(),
    apiKey: getSettingWithDefault<string>('tfl_api_token', '').trim(),
    stop: null,
    arrivals: [],
    statuses: [],
    statusesAt: 0,
    statusesFor: '',
    disruptions: [],
    disruptionsAt: 0,
    receivedAt: null,
    offline: false,
    error: null,
  }
}

/** The stop's name and letter. Nice to have: the arrivals carry most of it. */
async function loadStop(state: State): Promise<void> {
  const key = `stop:${state.stopId}`
  try {
    state.stop = await fetchStopPoint(state.stopId, state.apiKey)
    writeEdgeAppCache(CACHE, key, state.stop)
  } catch (error) {
    console.warn('Could not look up the stop', error)
    state.stop = readEdgeAppCache<StopPoint>(CACHE, key)
  }
}

/** Route statuses. A failure leaves the last ones in place. */
async function loadStatuses(state: State): Promise<void> {
  const ids = lineIdsOf(state.arrivals)
  const key = ids.join(',')
  const fresh =
    key === state.statusesFor && Date.now() - state.statusesAt < STATUS_MS
  if (ids.length === 0 || fresh) return

  try {
    state.statuses = await fetchLineStatuses(ids, state.apiKey)
    state.statusesAt = Date.now()
    state.statusesFor = key
  } catch (error) {
    console.warn('Could not fetch route status', error)
  }
}

/** Whether the stop itself is closed or has a notice. A failure keeps the last answer. */
async function loadDisruptions(state: State): Promise<void> {
  if (Date.now() - state.disruptionsAt < STATUS_MS) return

  try {
    state.disruptions = await fetchStopDisruptions(state.stopId, state.apiKey)
    state.disruptionsAt = Date.now()
  } catch (error) {
    console.warn('Could not fetch stop notices', error)
  }
}

/**
 * The arrivals as TfL has them now, or as they were when the screen last had
 * them. Buses already gone are dropped from the cached list as it is drawn,
 * so a screen that loses its connection runs down rather than lying.
 */
async function loadArrivals(state: State): Promise<void> {
  const key = `arrivals:${state.stopId}`
  try {
    state.arrivals = await fetchArrivals(state.stopId, state.apiKey)
    state.receivedAt = Date.now()
    state.offline = false
    state.error = null
    writeEdgeAppCache(CACHE, key, {
      receivedAt: state.receivedAt,
      arrivals: state.arrivals,
    } satisfies CachedArrivals)
  } catch (error) {
    console.warn('Could not fetch arrivals', error)
    reportError(error, { stopId: state.stopId })

    if (state.receivedAt === null) {
      const cached = readEdgeAppCache<CachedArrivals>(CACHE, key)
      if (cached) {
        state.arrivals = cached.arrivals
        state.receivedAt = cached.receivedAt
      }
    }
    state.offline = state.receivedAt !== null
    state.error = state.offline ? null : (error as Error)
  }
}

function freshness(state: State): string {
  if (state.receivedAt === null) return ''
  const at = CLOCK.format(state.receivedAt)
  return state.offline ? `Offline · last updated ${at}` : `Live · updated ${at}`
}

/** What the board would draw this second, as a string that changes when it does. */
function signature(rows: Departure[], capacity: number): string {
  return rows
    .slice(0, capacity)
    .map((row) => `${row.key}|${minutesLabel(row.next)}|${row.status.label}`)
    .join(';')
}

/**
 * Draws the board from the state, but only rebuilds the rows when what they
 * say has changed: rebuilding every second would restart any destination
 * that is scrolling to fit.
 */
function createBoard(state: State) {
  let capacity = layoutBoard()
  let drawn: string | null = null

  const message = (
    key: string,
    title: string,
    hint: string,
    force: boolean,
  ) => {
    if (force || drawn !== key) {
      renderMessage(title, hint)
      drawn = key
    }
  }

  const draw = (force = false) => {
    const now = Date.now()
    renderClock(CLOCK.format(now), freshness(state))

    if (state.error) {
      message(
        'error',
        'Bus times unavailable',
        `${state.error.message}. Check the stop ID and TfL API key in the app settings.`,
        force,
      )
      return
    }

    const rows = departures(
      state.arrivals,
      state.statuses,
      state.receivedAt ?? now,
      now,
    )
    if (rows.length === 0) {
      // With the stop closed, an empty board is expected, not a fault.
      const closed = stopNotice(state.disruptions, now)?.closed ?? false
      message(
        closed ? 'closed' : 'empty',
        closed ? 'No buses from this stop' : 'No buses due',
        closed
          ? 'Buses are not calling here while the stop is closed.'
          : 'TfL has no arrivals predicted for this stop right now.',
        force,
      )
      return
    }

    const next = signature(rows, capacity)
    if (force || next !== drawn) {
      renderBoard(rows, capacity)
      drawn = next
    }
  }

  const relayout = () => {
    capacity = layoutBoard()
    draw(true)
  }

  return { draw, relayout, capacity: () => capacity }
}

/**
 * TfL's explanation for each disrupted route on the board, once each: two
 * routes on the same diversion share one notice.
 */
function detailsFor(state: State, capacity: number): Detail[] {
  const now = Date.now()
  const shown = departures(
    state.arrivals,
    state.statuses,
    state.receivedAt ?? now,
    now,
  ).slice(0, capacity)

  const seen = new Set<string>()
  const details: Detail[] = []
  for (const row of shown) {
    const { detail, label } = row.status
    if (!detail || seen.has(detail)) continue
    seen.add(detail)
    details.push({ route: row.route, label, text: detail })
  }
  return details
}

let detailIndex = 0

async function refresh(state: State, board: ReturnType<typeof createBoard>) {
  await loadArrivals(state)
  await Promise.all([loadStatuses(state), loadDisruptions(state)])
  renderMasthead(
    stopDetails(state.stop, state.stopId, state.arrivals),
    state.stopId,
  )
  renderCredit(routesOf(state.arrivals))

  // The banner and the details strip take room from the rows, so showing or
  // hiding either means measuring again.
  const strip = document.querySelector<HTMLElement>('[data-details]')
  const stripWas = strip?.hidden
  renderDetails(detailsFor(state, board.capacity()), detailIndex)
  const noticeChanged = renderNotice(stopNotice(state.disruptions, Date.now()))

  if (noticeChanged || strip?.hidden !== stripWas) {
    board.relayout()
    // Measured again, fewer routes may fit: only explain the ones on screen.
    renderDetails(detailsFor(state, board.capacity()), detailIndex)
  } else {
    board.draw(true)
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupErrorHandling()
  setupSentry('tfl-bus-status-app')
  setupTheme()
  applyTheme()

  const state = readState()

  if (!state.stopId) {
    renderMasthead({ name: 'Bus stop', letter: '', towards: '' }, '')
    renderMessage(
      'No stop chosen',
      'Set a bus stop ID, such as 490005186S1, in the app settings.',
    )
    signalReady()
    return
  }

  const board = createBoard(state)
  await loadStop(state)
  await refresh(state, board)

  // Again on the next frame: the first render happens before <auto-scaler>
  // has sized its box, so there was nothing to measure the rows against.
  requestAnimationFrame(() => {
    board.relayout()
    signalReady()
  })

  /*
   * One refresh at a time. A slow answer that finished after a newer one
   * would otherwise put older arrivals back on the board. A tick that comes
   * while one is still running is skipped; requests time out, so a stuck one
   * cannot hold the board for long.
   */
  let refreshing = false
  setInterval(() => {
    if (refreshing) return
    refreshing = true
    refresh(state, board)
      .catch((error) => console.error('Could not refresh', error))
      .finally(() => {
        refreshing = false
      })
  }, ARRIVALS_MS)

  // The countdown and the clock move every second without asking TfL.
  setInterval(() => board.draw(), 1000)

  // Several disrupted routes take turns in the details strip. Its height is
  // fixed in the stylesheet, so a turn never changes the room the rows have.
  setInterval(() => {
    detailIndex += 1
    renderDetails(detailsFor(state, board.capacity()), detailIndex)
  }, DETAIL_MS)

  let resizeTimer: number | undefined
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(board.relayout, 150)
  })
})
