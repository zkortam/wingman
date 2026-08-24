/** Turns a delivery-note request into the instruction the courier actually sees. */
export function parseInstructions(utterance: string): string {
  const text = utterance.toLowerCase()
  const parts: string[] = []
  if (/\bleave\b.*\b(door|porch|doorstep)\b|\b(door|porch|doorstep)\b/.test(text)) {
    parts.push('leave at the door')
  }
  if (/don'?t ring|do not ring|no (bell|knock)|silent drop/.test(text)) {
    parts.push('do not ring the bell')
  }
  if (/\b(neighbou?r|concierge|front desk)\b/.test(text)) {
    parts.push('leave with a neighbor')
  }
  if (parts.length > 0) return [...new Set(parts)].join('; ')
  return utterance.trim().replace(/^(please\s+)+/i, '')
}
