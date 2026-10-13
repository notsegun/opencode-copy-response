// Pure helpers for opencode-copy-response. No opencode imports live here, so
// `node --test` can exercise the selection and fallback logic directly.
//
// The selection mirrors opencode's own "Copy last assistant message" command
// exactly: the newest assistant message, its text parts in order, joined with a
// single newline, trimmed. Keeping the same rule means the built-in copy path
// and the offline fallback can never disagree about what "the latest response"
// is.

/** Minimal structural view of a stored session message. */
export interface CopyMessage {
  id: string
  type: string
  content?: Array<{ type: string; text?: string }>
}

export type ResponseSelection =
  | { ok: true; text: string }
  | { ok: false; error: string }

export const NO_ASSISTANT = "no assistant messages found"
export const NO_TEXT_PARTS = "no text parts found in the last assistant message"
export const NO_TEXT_CONTENT = "the last assistant message has no text content"
export const NO_TEXT_RESPONSE = "no assistant response with text to copy yet"

/**
 * Drops messages at or after a revert boundary, mirroring the transcript the
 * TUI shows. Without a boundary (or with an unknown boundary id) the list is
 * returned unchanged. The input array is never mutated.
 */
export function beforeRevert<Message extends { id: string }>(
  messages: readonly Message[],
  revertMessageID?: string,
): Message[] {
  if (!revertMessageID) return [...messages]
  const boundary = messages.findIndex((message) => message.id === revertMessageID)
  if (boundary === -1) return [...messages]
  return messages.slice(0, boundary)
}

/**
 * The exact Markdown source of the latest assistant response: newest assistant
 * message, all text parts in their original order, joined with one newline and
 * trimmed. Tool calls, reasoning, metadata and earlier messages are excluded.
 *
 * This mirrors opencode's built-in "Copy last assistant message" command
 * exactly. It is used to decide whether dispatching that built-in command is
 * known to produce the same text this plugin would copy itself.
 */
export function latestResponse(messages: readonly CopyMessage[]): ResponseSelection {
  const assistant = messages.findLast((message) => message.type === "assistant")
  if (!assistant) return { ok: false, error: NO_ASSISTANT }
  return messageText(assistant)
}

/**
 * The response this plugin copies: the newest assistant message that contains
 * text, skipping steps that only carry tool calls or reasoning. During a long
 * turn opencode appends tool-only assistant steps after the text it wrote, so
 * skipping them keeps `/copy-response` useful while the agent is still working.
 */
export function selectResponse(messages: readonly CopyMessage[]): ResponseSelection {
  let sawAssistant = false
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.type !== "assistant") continue
    sawAssistant = true
    const selection = messageText(message)
    if (selection.ok) return selection
  }
  return { ok: false, error: sawAssistant ? NO_TEXT_RESPONSE : NO_ASSISTANT }
}

function messageText(message: CopyMessage): ResponseSelection {
  const parts = (message.content ?? []).filter((part) => part.type === "text")
  if (parts.length === 0) return { ok: false, error: NO_TEXT_PARTS }
  const text = parts.map((part) => part.text ?? "").join("\n").trim()
  if (!text) return { ok: false, error: NO_TEXT_CONTENT }
  return { ok: true, text }
}

export interface FallbackOutcome {
  ok: boolean
  message: string
}

export interface FallbackInput {
  /** Session whose response should be copied; undefined on the home screen. */
  sessionID?: string
  messages: readonly CopyMessage[]
  revertMessageID?: string
  /** Writes to the clipboard; returns false when the write did not happen. */
  write: (text: string) => boolean
}

/**
 * The copy used when opencode's built-in message copy cannot be reused: either
 * the installed opencode does not expose it, or the newest assistant step has
 * no text yet (the agent is running tools) and the built-in would refuse.
 * Extracts the response first and writes only on success, so a failed lookup
 * or a failed clipboard write leaves the previous clipboard contents
 * untouched. The copied text is never returned in the outcome message and
 * never logged.
 */
export function runFallback(input: FallbackInput): FallbackOutcome {
  if (!input.sessionID) {
    return { ok: false, message: "no active session to copy the response from" }
  }
  const selection = selectResponse(beforeRevert(input.messages, input.revertMessageID))
  if (!selection.ok) {
    return { ok: false, message: selection.error }
  }
  let written = false
  try {
    written = input.write(selection.text)
  } catch {
    written = false
  }
  if (!written) {
    return { ok: false, message: "the terminal refused the clipboard write; clipboard left unchanged" }
  }
  return { ok: true, message: "latest assistant response copied to the clipboard" }
}
