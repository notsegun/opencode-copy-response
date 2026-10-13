// unit tests for the pure selection and fallback helpers. run with: npm test
//
// the clipboard itself is exercised for real in a live opencode session (see
// the README verification section); these tests pin the exact text that the
// fallback path is allowed to hand to the clipboard.
import test from "node:test"
import assert from "node:assert/strict"

import {
  NO_ASSISTANT,
  NO_TEXT_CONTENT,
  NO_TEXT_PARTS,
  NO_TEXT_RESPONSE,
  beforeRevert,
  latestResponse,
  runFallback,
  selectResponse,
  type CopyMessage,
} from "../response.ts"

/** representative markdown: headings, lists, nesting, links, tables, fences. */
const PART_ONE = `# copy response check

a **bold** word, an *italic* one, and \`inline code\`.

- first item
  - nested item with a [link](https://opencode.ai/v2/docs/build/plugins/cli)
  - nested item with \`code\`
- second item

> a blockquote line
> and its continuation

| command | what it copies |
| --- | --- |
| \`/copy\` | the latest assistant response |
| \`/copy-transcript\` | the whole session transcript |`

const PART_TWO = `\`\`\`ts
const fence = "\`\`\`" // inner backticks stay literal
export function hello(name: string): string {
  return \`hello \${name}\`
}
\`\`\`

1. ordered
2. list

done.`

function user(text: string, id = "msg_user"): CopyMessage {
  return { id, type: "user", content: [] }
}

function assistant(parts: Array<{ type: string; text?: string }>, id = "msg_assistant"): CopyMessage {
  return { id, type: "assistant", content: parts }
}

test("joins every text part of the latest assistant message in order", () => {
  const selection = latestResponse([
    user("copy response fixture"),
    assistant([{ type: "text", text: "an older answer" }], "msg_old"),
    assistant([
      { type: "text", text: PART_ONE },
      { type: "reasoning", text: "hidden thinking" },
      { type: "tool", text: undefined },
      { type: "text", text: PART_TWO },
    ]),
  ])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.equal(selection.text, `${PART_ONE}\n${PART_TWO}`)
})

test("preserves markdown byte for byte: headings, lists, links, tables, fences", () => {
  const selection = latestResponse([assistant([{ type: "text", text: PART_ONE }])])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.equal(selection.text, PART_ONE)
  assert.ok(selection.text.includes("| command | what it copies |"))
  assert.ok(selection.text.includes("[link](https://opencode.ai/v2/docs/build/plugins/cli)"))
  assert.ok(selection.text.split("\n").length > 10)
})

test("keeps fenced code blocks intact, including inner backticks", () => {
  const selection = latestResponse([assistant([{ type: "text", text: PART_TWO }])])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.ok(selection.text.startsWith("```ts\n"))
  assert.ok(selection.text.includes('const fence = "```"'))
  assert.ok(selection.text.endsWith("done."))
})

test("only the newest assistant message is selected", () => {
  const selection = latestResponse([
    assistant([{ type: "text", text: "older answer" }], "msg_a"),
    user("follow up"),
    assistant([{ type: "text", text: "newer answer" }], "msg_b"),
  ])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.equal(selection.text, "newer answer")
})

test("user messages alone are not a response", () => {
  const selection = latestResponse([user("just a question")])
  assert.deepEqual(selection, { ok: false, error: NO_ASSISTANT })
})

test("assistant message without text parts is an empty response", () => {
  const selection = latestResponse([assistant([{ type: "tool", text: undefined }, { type: "reasoning", text: "thinking" }])])
  assert.deepEqual(selection, { ok: false, error: NO_TEXT_PARTS })
})

test("selectResponse skips tool-only steps and copies the newest text", () => {
  const selection = selectResponse([
    user("do the thing"),
    assistant([{ type: "text", text: "working on it\n\nfirst finding" }], "msg_text"),
    assistant([{ type: "reasoning", text: "thinking" }, { type: "tool" }], "msg_tools"),
    assistant([{ type: "tool" }], "msg_more_tools"),
  ])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.equal(selection.text, "working on it\n\nfirst finding")
})

test("selectResponse still copies a streaming step that already has text", () => {
  const selection = selectResponse([assistant([{ type: "text", text: "streaming so far" }])])
  assert.deepEqual(selection, { ok: true, text: "streaming so far" })
})

test("selectResponse reports when only empty steps exist", () => {
  assert.deepEqual(selectResponse([assistant([{ type: "tool" }])]), { ok: false, error: NO_TEXT_RESPONSE })
  assert.deepEqual(selectResponse([user("q"), assistant([{ type: "reasoning", text: "hmm" }])]), {
    ok: false,
    error: NO_TEXT_RESPONSE,
  })
})

test("selectResponse without any assistant message is an empty response", () => {
  assert.deepEqual(selectResponse([user("q")]), { ok: false, error: NO_ASSISTANT })
  assert.deepEqual(selectResponse([]), { ok: false, error: NO_ASSISTANT })
})

test("whitespace-only text counts as empty", () => {
  const selection = latestResponse([assistant([{ type: "text", text: "   \n\t  " }])])
  assert.deepEqual(selection, { ok: false, error: NO_TEXT_CONTENT })
})

test("no messages at all is an empty response", () => {
  assert.deepEqual(latestResponse([]), { ok: false, error: NO_ASSISTANT })
})

test("trailing whitespace of the whole response is trimmed, inner spacing is not", () => {
  const selection = latestResponse([assistant([{ type: "text", text: "line one\nline two\n\n" }])])
  assert.equal(selection.ok, true)
  if (!selection.ok) return
  assert.equal(selection.text, "line one\nline two")
})

test("selection does not mutate the stored messages", () => {
  const messages = [assistant([{ type: "text", text: "answer  " }])]
  latestResponse(messages)
  assert.equal(messages[0].content?.[0].text, "answer  ")
})

test("beforeRevert drops messages at and after the revert boundary", () => {
  const messages = [user("question"), assistant([{ type: "text", text: "reverted" }], "msg_revert"), assistant([])]
  const kept = beforeRevert(messages, "msg_revert")
  assert.deepEqual(
    kept.map((message) => message.id),
    ["msg_user"],
  )
})

test("beforeRevert keeps everything without a boundary or with an unknown id", () => {
  const messages = [user("question"), assistant([{ type: "text", text: "answer" }])]
  assert.equal(beforeRevert(messages).length, 2)
  assert.equal(beforeRevert(messages, "msg_missing").length, 2)
})

test("fallback copies the exact markdown into the clipboard once", () => {
  const seen: string[] = []
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [user("q"), assistant([{ type: "text", text: PART_ONE }, { type: "text", text: PART_TWO }])],
    write: (text) => {
      seen.push(text)
      return true
    },
  })
  assert.equal(outcome.ok, true)
  assert.deepEqual(seen, [`${PART_ONE}\n${PART_TWO}`])
})

test("fallback respects the revert boundary", () => {
  const seen: string[] = []
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [
      user("q"),
      assistant([{ type: "text", text: "kept answer" }], "msg_keep"),
      assistant([{ type: "text", text: "reverted answer" }], "msg_revert"),
    ],
    revertMessageID: "msg_revert",
    write: (text) => {
      seen.push(text)
      return true
    },
  })
  assert.equal(outcome.ok, true)
  assert.deepEqual(seen, ["kept answer"])
})

test("fallback skips tool-only steps while the agent is working", () => {
  const seen: string[] = []
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [
      user("q"),
      assistant([{ type: "text", text: "answer so far" }], "msg_text"),
      assistant([{ type: "tool" }], "msg_tools"),
    ],
    write: (text) => {
      seen.push(text)
      return true
    },
  })
  assert.equal(outcome.ok, true)
  assert.deepEqual(seen, ["answer so far"])
})

test("no session leaves the clipboard untouched", () => {
  let calls = 0
  const outcome = runFallback({
    sessionID: undefined,
    messages: [assistant([{ type: "text", text: "answer" }])],
    write: () => {
      calls++
      return true
    },
  })
  assert.equal(outcome.ok, false)
  assert.equal(calls, 0)
})

test("empty response leaves the clipboard untouched", () => {
  let calls = 0
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [user("q")],
    write: () => {
      calls++
      return true
    },
  })
  assert.equal(outcome.ok, false)
  assert.equal(calls, 0)
})

test("failed clipboard write is reported and never retried with fallback content", () => {
  const seen: string[] = []
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [assistant([{ type: "text", text: "answer" }])],
    write: (text) => {
      seen.push(text)
      return false
    },
  })
  assert.equal(outcome.ok, false)
  assert.equal(seen.length, 1)
  assert.ok(!outcome.message.includes("answer"), "outcome must not echo copied content")
})

test("a throwing clipboard write is reported as a failure", () => {
  const outcome = runFallback({
    sessionID: "ses_active",
    messages: [assistant([{ type: "text", text: "answer" }])],
    write: () => {
      throw new Error("no clipboard provider")
    },
  })
  assert.equal(outcome.ok, false)
})
