/**
 * Escaping for the markup this app builds. Kept local so the render code can
 * be imported outside a browser: the library's entry point pulls in an error
 * overlay that needs a DOM.
 */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
