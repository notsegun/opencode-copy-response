/** @jsxImportSource @opentui/solid */
//
// opencode-copy-response: slash commands that copy the latest assistant
// response, or the whole session transcript, to the operating system
// clipboard. Real local actions: no model call, no prompt, no new message.
//
//   /copy-response    copy the newest assistant reply as markdown
//   /c                alias for /copy-response
//   /copy-transcript  copy the whole session transcript
//
// How it works:
//   - The primary path dispatches opencode's own built-in commands
//     (messages.copy / session.copy) through the documented plugin keymap API.
//     Those commands read the stored assistant text parts of the active
//     session and write them to the OS clipboard with opencode's native
//     clipboard service, so formatting, ordering and failure behaviour are
//     exactly the ones opencode already ships.
//   - When the built-in command is unavailable (a future opencode version) or
//     would refuse (the newest assistant step is running tools and carries no
//     text yet), the plugin extracts the newest assistant step that does have
//     text itself (response.ts, unit tested) and writes it through the
//     renderer OSC 52 clipboard path. The clipboard is only written after the
//     text was found, so a failure never clears or replaces it.
//
// opencode's built-in /copy still copies the transcript; there is no supported
// way for a plugin to take over a slash name that opencode already owns, so
// this plugin uses its own names and leaves the built-in command untouched.

import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { beforeRevert, latestResponse, runFallback, type CopyMessage } from "./response"

/** opencode's "Copy last assistant message" command id. */
const RESPONSE_COMMAND = "messages.copy"
/** opencode's "Copy session transcript" command id. */
const TRANSCRIPT_COMMAND = "session.copy"

type Variant = "info" | "success" | "warning" | "error"

function toast(context: Context, message: string, variant: Variant = "info") {
  context.ui.toast.show({ message, variant, duration: 4000 })
}

function isEnabled(command: { enabled?: boolean | (() => boolean) }): boolean {
  if (typeof command.enabled === "function") {
    try {
      return command.enabled()
    } catch {
      return false
    }
  }
  return command.enabled !== false
}

/** True when opencode currently exposes the given command id to plugins. */
function reachable(context: Context, id: string): boolean {
  try {
    const command = context.keymap.commands().find((entry) => entry.id === id)
    return command !== undefined && isEnabled(command)
  } catch {
    return false
  }
}

/** The focused session, or undefined on the home screen and plugin pages. */
function activeSession(context: Context): string | undefined {
  try {
    const route = context.ui.router.current()
    return route.type === "session" ? route.sessionID : undefined
  } catch {
    return undefined
  }
}

function copyPlain(context: Context, text: string): boolean {
  // The renderer write returns false when the terminal refused the OSC 52
  // sequence; nothing is written in that case, so the previous clipboard stays.
  if (typeof context.renderer.isOsc52Supported === "function" && !context.renderer.isOsc52Supported()) {
    return false
  }
  return context.renderer.copyToClipboardOSC52(text)
}

function copyResponse(context: Context) {
  const sessionID = activeSession(context)
  const session = sessionID ? context.data.session.get(sessionID) : undefined
  const stored = sessionID ? (context.data.session.message.list(sessionID) as CopyMessage[]) : []
  const messages = beforeRevert(stored, session?.revert?.messageID)

  // Preferred path: opencode's own copy command, dispatching through the
  // documented plugin keymap API. It reads the same stored text parts and
  // writes with opencode's native clipboard service, and its toast reports
  // success or failure. Only taken when it would copy exactly the response
  // this plugin would; the newest assistant step may still be running tools
  // with no text, in which case the built-in refuses and the fallback below
  // copies the newest step that does have text.
  if (reachable(context, RESPONSE_COMMAND) && latestResponse(messages).ok) {
    context.keymap.dispatch(RESPONSE_COMMAND)
    return
  }

  const outcome = runFallback({
    sessionID,
    messages,
    write: (text) => copyPlain(context, text),
  })
  toast(context, outcome.message, outcome.ok ? "success" : "error")
}

function copyTranscript(context: Context) {
  if (reachable(context, TRANSCRIPT_COMMAND)) {
    context.keymap.dispatch(TRANSCRIPT_COMMAND)
    return
  }
  toast(context, "this opencode version does not expose the built-in transcript copy command", "error")
}

export default Plugin.define({
  id: "local.copy-response",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "copy-response.copy",
          title: "Copy latest assistant response",
          description: "Copy the newest assistant reply as markdown",
          group: "Session",
          slash: { name: "copy-response", aliases: ["c"] },
          run: () => copyResponse(context),
        },
        {
          id: "copy-response.transcript",
          title: "Copy session transcript",
          description: "Copy the whole session transcript, like opencode's /copy",
          group: "Session",
          slash: { name: "copy-transcript" },
          run: () => copyTranscript(context),
        },
      ],
    }))
  },
})
