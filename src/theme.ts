/**
 * One board, two tones: light for a shelter in daylight or a bright lobby,
 * dark for a dim hall or a screen that runs through the night.
 */

export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value)
}

/** Anything unrecognised stays light, the default the app has always had. */
export function resolveTheme(setting: string): Theme {
  const chosen = setting.trim().toLowerCase()
  return isTheme(chosen) ? chosen : 'light'
}
