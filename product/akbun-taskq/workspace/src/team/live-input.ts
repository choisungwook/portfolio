import { randomUUID } from 'node:crypto'

// The input stream of a running bot turn. The turn starts with the messages that woke the bot; messages that arrive
// while it works are pushed into the same stream, the way a Claude Code session takes a message typed mid-turn, instead
// of waiting for the next turn. When the session has answered everything it was given, the stream closes and the turn
// ends. A push after that is refused and the message waits for the next turn.
//
// Each input carries a uuid. The SDK may merge inputs sent close together into one turn, or fold one into a running
// turn between tool rounds, so a result can answer several inputs; it lists them in user_message_uuids. The stream
// ends when no input is left unanswered, not after a count of results.
export interface LiveText {
  uuid: string
  text: string
}

export class LiveInput {
  private queue: LiveText[] = []
  private wake: (() => void) | undefined
  private closed = false
  private sent: string[] = []          // handed to the SDK and not answered yet, oldest first

  push(text: string): boolean {
    if (this.closed) return false
    this.queue.push({ uuid: randomUUID(), text })
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

  // Marks inputs answered. Without ids (an older SDK), the oldest one is taken as answered; `all` takes every input the
  // SDK has read, for a result that says nothing is queued.
  answer(ids: string[] | undefined, all = false): void {
    if (all) this.sent = []
    else if (ids && ids.length) this.sent = this.sent.filter((id) => !ids.includes(id))
    else this.sent.shift()
  }

  // Inputs not answered yet: those the SDK read without a result, and those still waiting to be read.
  unanswered(): number {
    return this.sent.length + this.queue.length
  }

  async *texts(first: string): AsyncIterable<LiveText> {
    const start = { uuid: randomUUID(), text: first }
    this.sent.push(start.uuid)
    yield start
    for (;;) {
      const next = this.queue.shift()
      if (next !== undefined) {
        this.sent.push(next.uuid)
        yield next
        continue
      }
      if (this.closed) return
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
  }
}
