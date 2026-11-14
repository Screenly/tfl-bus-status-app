/**
 * Drawing the board. Every function here writes into the markup in
 * `index.html` and takes already-worked-out values: the decisions about what
 * to show live in `arrivals.ts` and `main.ts`.
 *
 * Sized to be read from the stop, a few metres away: the route number and
 * the minutes to the next bus are the largest things on the screen, and
 * anything that is not news (a route running normally) draws nothing at all.
 */

import {
  type Departure,
  type StopDetails,
  type StopNotice,
} from './arrivals.js'
import { escapeText } from './escape.js'
import { fitToWidth } from './fit-text.js'

/** The smallest a row may be before the board shows fewer of them. */
const MIN_ROW_HEIGHT = 120
/** Past this many routes, the bottom of the list is too far off to scan. */
const MAX_ROWS = 10
const MIN_ROWS = 2

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) {
    throw new Error(`Missing element ${selector}`)
  }
  return found
}

export function renderMasthead(details: StopDetails, stopId: string): void {
  const letter = element('[data-letter]')
  letter.textContent = details.letter
  letter.hidden = details.letter === ''
  letter.classList.toggle('is-long', details.letter.length > 1)

  element('[data-stop-name]').textContent = details.name || stopId
  element('[data-towards]').textContent = details.towards
    ? `Towards ${details.towards}`
    : ''
}

export function renderClock(clock: string, freshness: string): void {
  element('[data-clock]').textContent = clock
  element('[data-freshness]').textContent = freshness
}

export function renderCredit(routes: string[]): void {
  const line = element('[data-routes]')
  line.textContent = routes.length > 0 ? `Routes ${routes.join(' · ')}` : ''
  fitToWidth(line, 25)
}

/**
 * The banner under the masthead. Returns whether it changed, since showing or
 * hiding it changes how much room the rows have.
 */
export function renderNotice(notice: StopNotice | null): boolean {
  const banner = element('[data-notice]')
  const before = banner.hidden ? '' : banner.textContent

  banner.hidden = notice === null
  banner.classList.toggle('is-closed', notice?.closed ?? false)
  banner.innerHTML = notice
    ? `<span class="notice-mark" aria-hidden="true">!</span>
       <span class="notice-text">
         <b>${escapeText(notice.title)}</b>
         <span>${escapeText(notice.text)}</span>
       </span>`
    : ''

  return before !== (banner.hidden ? '' : banner.textContent)
}

/** The labels above the columns, in reference pixels. */
const HEADER_HEIGHT = 52

/**
 * How many rows fit at the smallest size a row may be. The board shows at
 * most this many routes.
 */
export function layoutBoard(): number {
  const height = element('[data-board]').clientHeight - HEADER_HEIGHT
  return Math.max(
    MIN_ROWS,
    Math.min(MAX_ROWS, Math.floor(height / MIN_ROW_HEIGHT)),
  )
}

/**
 * The largest a row may be. Rows share the board up to this size and no
 * further: every column but the destination grows with the row, so a quiet
 * stop with three routes blown up to fill the screen leaves the destination
 * no room at all.
 */
const MAX_ROW_HEIGHT = 150

function sizeRows(shown: number): void {
  const board = element('[data-board]')
  const share = (board.clientHeight - HEADER_HEIGHT) / Math.max(1, shown)
  board.style.setProperty('--header-height', `${HEADER_HEIGHT}px`)
  board.style.setProperty(
    '--row-height',
    `${Math.min(MAX_ROW_HEIGHT, share)}px`,
  )
}

/**
 * Every column says what it is: which bus, where to, how it is running, and
 * how long until it gets here.
 */
const HEADER = `
  <div class="row heading" aria-hidden="true">
    <div class="h-route">Route</div>
    <div class="h-destination">Destination</div>
    <div class="h-status">Status</div>
    <div class="h-next">Arrives in</div>
  </div>`

const STATUS_MARK = { good: '✓', minor: '!', severe: '!' } as const

function nextMarkup(seconds: number): string {
  if (seconds < 60) {
    return `<div class="next is-due">Arriving</div>`
  }
  return `<div class="next"><span class="num">${Math.floor(seconds / 60)}</span><span class="unit">min</span></div>`
}

function rowMarkup(departure: Departure): string {
  const { tone, label, note } = departure.status

  return `
    <div class="row" data-tone="${tone}">
      <div class="route${departure.route.length >= 4 ? ' is-long' : ''}"><span>${escapeText(departure.route)}</span></div>
      <div class="destination" data-fit>${escapeText(departure.destination)}</div>
      <div class="status is-${tone}">
        <span class="status-mark" aria-hidden="true">${STATUS_MARK[tone]}</span>
        <span class="status-text">
          <span class="status-label">${escapeText(label)}</span>
          ${note ? `<span class="status-note">${escapeText(note)}</span>` : ''}
        </span>
      </div>
      ${nextMarkup(departure.next)}
    </div>`
}

export function renderBoard(departures: Departure[], capacity: number): void {
  const shown = departures.slice(0, capacity)
  sizeRows(shown.length)
  element('[data-board]').innerHTML = HEADER + shown.map(rowMarkup).join('')
  fitDynamicText()
}

export interface Detail {
  route: string
  label: string
  text: string
}

/**
 * The full story behind one disrupted route, in TfL's words, under the rows.
 * Several are shown in turn; `index` picks which.
 */
export function renderDetails(details: Detail[], index: number): void {
  const strip = element('[data-details]')
  const detail = details.length > 0 ? details[index % details.length]! : null

  strip.hidden = detail === null
  strip.innerHTML = detail
    ? `<span class="details-route">${escapeText(detail.route)}</span>
       <span class="details-text">
         <span class="details-copy">
           <b>${escapeText(detail.label)}</b>
           ${escapeText(detail.text)}
         </span>
       </span>
       ${details.length > 1 ? `<span class="details-count">${(index % details.length) + 1}/${details.length}</span>` : ''}`
    : ''
}

export function renderMessage(title: string, hint: string): void {
  element('[data-board]').innerHTML = `
    <div class="message">
      <div class="message-title">${escapeText(title)}</div>
      <div class="message-hint">${escapeText(hint)}</div>
    </div>`
  fitDynamicText()
}

/** Shrink, or carry, any line too long for its box. */
export function fitDynamicText(): void {
  fitToWidth(element('[data-stop-name]'), 40)
  fitToWidth(element('[data-towards]'), 25)
  fitToWidth(element('[data-routes]'), 25)
  for (const line of document.querySelectorAll<HTMLElement>(
    '[data-board] [data-fit]',
  )) {
    fitToWidth(line, 32)
  }
}
