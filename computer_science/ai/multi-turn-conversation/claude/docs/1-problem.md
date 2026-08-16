# The problem: the model forgets between calls

## The situation

A chatbot ships. A user says "내 이름은 악분이야", then asks "내 이름이 뭐야?" one
message later, and the bot has no idea. Nothing crashed, no error was logged,
and the same prompt works fine when pasted into the Claude app. The bug is not
in the prompt — it is in what the second HTTP request contained.

## Why it happens

`POST /v1/messages` is an ordinary stateless HTTP endpoint. The request body
carries the entire input, the response carries the output, and the server keeps
nothing that links the two calls. There is no session cookie, no connection
affinity, and no hidden buffer holding turn 1 when turn 2 arrives.

So a "conversation" is not something the model has. It is something the caller
rebuilds on every request by resending the whole history.

## What multi-turn actually means

Two definitions get mixed up, and separating them is the point of this track.

- **From the user's side**, multi-turn is the experience: several exchanges
  where later questions can lean on earlier ones.
- **From the API's side**, multi-turn is a growing `messages` array. Turn 3
  sends turns 1 and 2 back verbatim, plus the new question.

The second is the mechanism that produces the first. There is no third thing.
A "multi-turn model" does not exist — only a caller that resends more input.

## Three consequences worth expecting

- **Cost and latency grow with the conversation.** Every turn re-bills every
  earlier token as input. A 30-turn chat pays for turn 1 thirty times.
- **The context window is a hard ceiling.** History accumulates until the
  request no longer fits, and then something has to be dropped or summarized.
- **Storage becomes an application concern.** Restarting the process, or
  routing the next request to a different pod, loses the conversation unless
  the history lives somewhere outside the process.

## One way to solve it

Accumulate the messages in the application and resend them, then move that
accumulated list into a store that outlives the process. That is the whole
technique, and [2-handson.md](./2-handson.md) walks it in four steps.

Two things complicate the picture and are covered at the end of the hands-on:
the server *does* cache, and Anthropic's Managed Agents *is* stateful. Neither
changes the rule for the Messages API.
