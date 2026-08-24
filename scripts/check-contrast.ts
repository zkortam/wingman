import { readFile } from 'node:fs/promises'

const tokenPath = new URL('../apps/web/src/ui/tokens.css', import.meta.url)

const luminance = (hex: string): number => {
  const values = hex.match(/[\da-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255)
  if (!values || values.length !== 3) throw new Error(`Invalid color: ${hex}`)
  const [red, green, blue] = values.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
}

const ratio = (first: string, second: string): number => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)
}

const css = await readFile(tokenPath, 'utf8')
// Quote-agnostic: a formatter that rewrites `[data-theme="dark"]` to single quotes must not.
const themes = [...css.matchAll(/:root(?:\[data-theme=['"]dark['"]\])?\s*\{([^}]+)\}/g)]
if (themes.length !== 2) throw new Error('Both light and dark token themes are required')

for (const [, body] of themes) {
  const tokens = Object.fromEntries(
    [...(body ?? '').matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6})/g)].map((match) => [
      match[1],
      match[2],
    ]),
  )
  const background = tokens.bg
  if (!background) throw new Error('Theme is missing --bg')
  for (const token of ['text', 'accent', 'fail', 'pass', 'warn']) {
    const color = tokens[token]
    if (!color) throw new Error(`Theme is missing --${token}`)
    const minimum = token === 'text' ? 4.5 : 3
    if (ratio(color, background) < minimum)
      throw new Error(`--${token} fails ${minimum}:1 contrast`)
  }
}
