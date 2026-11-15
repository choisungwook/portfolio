// Clips text for events and summaries. Clipped text ends with an ellipsis so the cut is visible.
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}
