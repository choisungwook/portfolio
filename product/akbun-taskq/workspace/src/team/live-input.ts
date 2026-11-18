// The input stream of a running bot turn. The turn starts with the messages that woke the bot; messages that arrive
// while it works are pushed into the same stream, the way a Claude Code session takes a message typed mid-turn, instead
// of waiting for the next turn. When the session has answered everything it was given, the stream closes and the turn
// ends. A push after that is refused and the message waits for the next turn.
export class LiveInput {
  private queue: string[] = []
  private wake: (() => void) | undefined
  private closed = false
  given = 1          // user messages sent into the session: the first prompt plus every accepted push

  push(text: string): boolean {
    if (this.closed) return false
    this.queue.push(text)
    this.given += 1
    this.wake?.()
    return true
  }

  close(): void {
    this.closed = true
    this.wake?.()
  }

  isClosed(): boolean {
    return this.closed
  }

  async *texts(first: string): AsyncIterable<string> {
    yield first
    for (;;) {
      const next = this.queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.closed) return
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
  }
}
