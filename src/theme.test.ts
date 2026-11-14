import { expect, test } from 'bun:test'

import { resolveTheme } from './theme'

test('known themes pass through, in any case', () => {
  expect(resolveTheme('dark')).toBe('dark')
  expect(resolveTheme(' Light ')).toBe('light')
})

test('anything else is light', () => {
  expect(resolveTheme('')).toBe('light')
  expect(resolveTheme('sepia')).toBe('light')
})
