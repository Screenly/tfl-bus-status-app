import { test } from '@playwright/test'
import {
  captureScreenshot,
  createMockScreenlyForScreenshots,
  RESOLUTIONS,
} from '@screenly/edge-apps/test/screenshots'

import { mockSettings, setupTflMock } from './tfl-mock.js'
import { THEMES, type Theme } from '../src/theme.js'

const THEME_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
] as const

function screenlyJsFor(theme: Theme): string {
  return createMockScreenlyForScreenshots(
    {
      coordinates: ['51.5080', '-0.1281'] as unknown as [number, number],
      location: 'London',
    },
    mockSettings(theme),
  ).screenlyJsContent
}

for (const { width, height } of RESOLUTIONS) {
  test(`screenshot ${width}x${height}`, async ({ browser }) => {
    await captureScreenshot(browser, {
      width,
      height,
      filenamePrefix: 'tfl-bus-status-app',
      screenlyJsContent: screenlyJsFor('light'),
      setupMocks: setupTflMock,
    })
  })
}

for (const theme of THEMES) {
  for (const { width, height } of THEME_RESOLUTIONS) {
    test(`screenshot ${theme} ${width}x${height}`, async ({ browser }) => {
      await captureScreenshot(browser, {
        width,
        height,
        filenamePrefix: `tfl-bus-status-app-${theme}`,
        screenlyJsContent: screenlyJsFor(theme),
        setupMocks: setupTflMock,
      })
    })
  }
}
