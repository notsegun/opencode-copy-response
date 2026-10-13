# opencode-copy-response

copy the latest assistant response, or the whole session transcript, out of
[opencode](https://opencode.ai) and into your operating system clipboard.

```
  ┃ /copy              Copy session transcript     ← opencode's own command, untouched
  ┃ /copy-response     Copy the newest assistant reply as markdown
  ┃ /copy-transcript   Copy the whole session transcript, like opencode's /copy
  ┃ /c                 Copy the newest assistant reply as markdown
  ┃  /copy-response
```

## why this exists

opencode's built-in `/copy` copies the **entire session transcript**. when i
finished a task and wanted to carry the agent's final answer (an implementation
summary, an endpoint list, handoff notes) into another chat, i had to select it
by hand or paste the whole conversation somewhere and cut it down.

this plugin adds real, instantaneous commands that read the stored assistant
text of the active session and put exactly that markdown on the clipboard:
headings, nested lists, links, tables, newlines and fenced code blocks intact,
nothing rendered, nothing flattened, no model call, no new message, nothing
queued or cancelled.

## commands

| command | what lands on the clipboard |
| --- | --- |
| `/copy-response` | the newest assistant message that contains text, all its text parts in order, joined exactly the way opencode's own "copy last assistant message" joins them |
| `/c` | alias for `/copy-response` |
| `/copy-transcript` | the whole session transcript, identical to opencode's `/copy` |
| `/copy` | opencode's built-in transcript copy, left completely untouched |

all of them appear in the normal slash autocomplete, right where `/use` and the
built-in commands live.

what "the newest assistant message that contains text" means in practice:

- after the agent answers, that is the final answer;
- while the agent is running tools mid-turn (the newest step is a tool call with
  no text yet), the newest step that does have text is used instead of an error;
- empty sessions, sessions with only tool activity, and the start screen all
  produce a clear toast instead of a stale copy;
- the clipboard is only written after text was found, so a failure never clears
  or replaces what you had copied before.

## install

opencode v2, terminal (tui) side. no build step, the plugin is typescript and
opencode loads it directly. no root.

### 1. clone and run the installer

```sh
git clone https://github.com/notsegun/opencode-copy-response \
  ~/.config/opencode/plugins/opencode-copy-response
~/.config/opencode/plugins/opencode-copy-response/install.sh
```

`install.sh` symlinks the checkout into the opencode plugin directory so
`git pull` updates it. running it again is safe; it never touches other
plugins or any configuration file. `./install.sh --copy` copies `tui.tsx` and
`response.ts` instead, for setups where a symlink is inconvenient.

restart the tui and the commands are in the slash list.

### 2. manual install

copy `tui.tsx` and `response.ts` into
`~/.config/opencode/plugins/opencode-copy-response/` and restart the tui.
opencode discovers every directory under `plugins/` automatically.

### 3. let your agent build it for you

if you would rather not clone anything, copy the prompt below into your agent
(claude code, codex, opencode itself, anything that can write files) and it will
recreate the plugin locally for your machine:

```text
build me an opencode v2 terminal plugin that copies the latest assistant response, or the whole session transcript, to my operating system clipboard.

context
- opencode v2.0.27. the built-in "/copy" command copies the entire session transcript; i want the latest assistant response instead, and i want to keep transcript copying too.
- terminal plugins live in ~/.config/opencode/plugins/<name>/tui.tsx and are loaded directly (resolve "@opencode/plugin/tui", "solid-js" and "@opentui/*" at runtime; no package.json or node_modules needed). start the file with: /** @jsxImportSource @opentui/solid */
- commands are registered natively, not as prompts: context.keymap.layer(() => ({ mode: "global", priority: 10, commands: [{ id, title, description, group, slash: { name, aliases }, run }] })). see the official cli plugin docs: https://opencode.ai/v2/docs/build/plugins/cli

what to build
- /copy-response and its alias /c: copy the newest assistant message that contains text, all text parts in their original order, joined with "\n" and trimmed. tool calls, reasoning, metadata and earlier messages are excluded. on the start screen or in an empty session show an error toast instead of copying anything.
- /copy-transcript: copy the whole transcript, exactly like the built-in /copy does.
- do not touch the built-in /copy. on this version a plugin cannot take over a slash name opencode already owns: registering "copy" shows two identical /copy entries in the autocomplete, and which one a future version dispatches is not guaranteed. use your own names and say so in the readme.
- no model calls, no prompts, no queued or cancelled work, no new chat messages. the commands must work while the agent is generating.

how to copy (use the supported mechanisms, in this order)
1. opencode's own built-in commands are dispatched through the documented plugin api: context.keymap.dispatch("messages.copy") copies the last assistant message, context.keymap.dispatch("session.copy") copies the transcript. check reachability first with context.keymap.commands() (find by id, honour a boolean or function "enabled"), let the built-in show its own toast, and do not duplicate it. these commands write with opencode's native clipboard service (wayland/x11/macos/windows) and also emit osc52, which is why they are the primary path.
2. fall back only when the built-in is unreachable, or when the newest assistant step has no text (mid-turn tool call) and the built-in would refuse: extract the newest assistant message that does have text from context.data.session.message.list(sessionID), skipping reverted messages (context.data.session.get(sessionID)?.revert?.messageID), then write with context.renderer.copyToClipboardOSC52(text). it returns false when the terminal refused; in that case show an error toast and leave the clipboard alone. never log or toast the copied text itself.

active session
- use context.ui.router.current(): { type: "session", sessionID } while a session is focused, otherwise there is nothing to copy. never reach into another session.

rules
- register the layer from setup(); no JSX, no slots.
- keep every pure helper in a separate response.ts with no opencode imports so it can be unit tested with node --test; tui.tsx imports it with a relative path (that works).
- write unit tests for: multi-part ordering, markdown preservation (headings, nested lists, links, tables, fenced code with inner backticks), newest-message selection, text-less newest steps, revert boundaries, no assistant messages, whitespace-only text, and clipboard failure (write returns false, and write throws).
- also install it: symlink or copy the folder into ~/.config/opencode/plugins/opencode-copy-response (idempotent, never overwrite unrelated plugins) and provide an uninstall script plus readme sections for install, update, uninstall, troubleshooting and platforms.

verify for real before saying it works
1. launch a real tui, open a session with a markdown answer, and confirm /copy-response, /c and /copy-transcript are in the slash autocomplete next to /copy.
2. run /copy-response and diff the clipboard byte for byte against the session's stored assistant text (read the clipboard with wl-paste -n on wayland, xclip -o -selection clipboard on x11, pbpaste on macos).
3. paste into a markdown editor and confirm headings, tables, links and fenced code blocks survived.
4. confirm the clipboard is written only on success: trigger an empty session and a terminal without osc52 support and check the previous clipboard value is still there.
5. switch sessions and confirm the active session's response is the one copied, never another session's.
6. run /copy-response while the agent is mid-turn and confirm the agent keeps generating and no message was added to the session.
```

## usage

type the command in the prompt and press enter; the command autocompletes like
any other slash command.

```
  ┃ /copy-response
  ┃  message copied to clipboard!
```

real capture from a session, copied with `/copy-response`:

````markdown
# firefox browser-control hardening — complete

both requirements are implemented, deployed, and verified with real multi-session opencode runs.

| area | result |
| --- | --- |
| ownership lease | pass |
| warm-up probe | pass |

```sh
opencode-firefox-control status
```
````

the toast tells you what happened:

| toast | meaning |
| --- | --- |
| `message copied to clipboard!` | opencode's own copy ran, formatting intact |
| `session transcript copied to clipboard!` | the transcript copy ran |
| `latest assistant response copied to the clipboard` | the fallback path copied the newest step that has text (the very newest step is a tool call with no text yet) |
| `no active session to copy the response from` | you are on the start screen |
| `no assistant response with text to copy yet` | the session has no assistant text at all |
| `the terminal refused the clipboard write; clipboard left unchanged` | osc 52 is unavailable here; your previous clipboard is intact |

## how it works

- commands are registered with `context.keymap.layer(...)` as native opencode
  commands with `slash` names. they are not prompts: nothing is sent to a model.
- `/copy-response` first asks opencode to do the job: `context.keymap.dispatch("messages.copy")`,
  the command behind `<leader>y`. it reads the stored assistant text parts of
  the session and writes with opencode's native clipboard service, which also
  emits osc 52, so it works on wayland, x11, macos and windows without any
  clipboard tool installed. reachability is checked with `context.keymap.commands()`.
- when the built-in cannot be used (not present in a future version, or the
  newest assistant step has no text yet), the plugin extracts the newest
  assistant message that has text itself, skipping reverted messages, and
  writes it with the renderer's osc 52 clipboard path. the selection and
  fallback logic live in `response.ts` with no opencode imports, and are
  covered by unit tests.
- the clipboard is only written after the text was found and extracted, so a
  failed lookup or a refused write cannot clear or replace the previous
  clipboard contents. copied text is never logged and never toasted (toasts
  only ever contain the fixed messages above).
- nothing is ever written back to the session: no message, no prompt, no
  permission, no interrupt. copying while the agent is generating does not
  touch the run.

### the `/copy` limitation, accurately

the desired end state was `/copy` copying the response. on opencode 2.0.27 that
override is not supported: a plugin can register its own slash command named
`copy`, but the autocomplete then shows two identical `/copy` entries, and which
one runs depends on keymap layer ordering rather than on anything the plugin
can pin. instead of a fragile shadow, this plugin keeps opencode's `/copy`
exactly as it is and provides `/copy-response` (and `/c`) beside it, plus
`/copy-transcript` for the built-in behaviour under a self-documenting name.
if opencode ever lets plugins replace a built-in slash command, `/copy-response`
can be renamed without touching the rest.

## supported platforms

- **linux (wayland and x11)**: works with the native clipboard path used by
  opencode itself; no `wl-copy`, `xclip` or `xsel` needed. verified on fedora
  with wayland.
- **macos and windows**: the plugin code is platform independent; the native
  clipboard write is opencode's own. the osc 52 fallback depends on the
  terminal.
- the fallback path (mid-turn copies, or a future opencode without the built-in
  command) uses osc 52, which needs a terminal that supports it. terminals
  running inside a multiplexer may consume the sequence themselves; under
  tmux, `set -g set-clipboard on` makes tmux handle it correctly.
- install.sh and uninstall.sh are posix `sh` scripts (linux, macos). on windows,
  copy `tui.tsx` and `response.ts` into your opencode plugins directory by hand.

## updating

```sh
cd ~/.config/opencode/plugins/opencode-copy-response
git pull
```

restart the tui. copied-mode installs (`./install.sh --copy`) are updated by
running `./install.sh --copy` again from the new checkout.

## uninstalling

```sh
~/.config/opencode/plugins/opencode-copy-response/uninstall.sh
```

the script removes only the plugin directory it manages; symlinked checkouts
are unlinked, not deleted. it refuses to touch anything that does not look like
this plugin. opencode's own `/copy`, your other plugins and your configuration
are untouched. restart the tui afterwards.

## troubleshooting

- **the commands are not in the slash list.** check that
  `~/.config/opencode/plugins/opencode-copy-response/tui.tsx` exists (or that
  the symlink resolves), then restart the tui. `opencode plugin list` shows
  loaded plugins.
- **nothing appears in the clipboard after a copy.** the native path needs the
  opencode tui to stay running: on wayland the clipboard is served by the
  process that wrote it, so the content is gone once the tui exits (this is how
  opencode's own copy behaves too). under tmux or a terminal without osc 52,
  the fallback path may not reach the os clipboard; the toast will say the
  terminal refused the write instead of pretending it worked.
- **the toast says the newest step is a tool call.** that is the mid-turn case:
  the agent is executing tools and has written no text in the newest step yet.
  the plugin copied the newest step that does have text; try again after the
  agent speaks, or use it anyway.
- **i want the old transcript copy.** that is `/copy` (untouched) or
  `/copy-transcript` from this plugin.

## development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test, unit tests for response.ts
npm run check       # both
```

`response.ts` holds the pure selection and fallback logic (newest text-bearing
assistant message, multi-part joining, revert boundaries, clipboard
failure handling) and has no opencode imports, which is why `node --test` can
run it directly. `tui.tsx` registers the two commands, resolves the active
session, dispatches opencode's own copy commands and falls back to osc 52.

`scripts/e2e.sh` walks the same path a user does, in a throwaway isolated
opencode environment: it imports a fixture session with representative markdown
(no model is ever called), starts a real tui under tmux, runs the commands and
diffs the clipboard byte for byte. it is linux-only and expects tmux plus a
clipboard reader (`wl-paste` or `xclip`). run it with `scripts/e2e.sh`.

### verified for real

the statements in this readme were checked against a real opencode 2.0.27 tui,
not just unit tests: exact clipboard bytes for a multi-part markdown answer,
the transcript copy, the `/c` alias, session switching, the response copy while
the agent was actively generating (agent kept running, no message added), empty
responses, the home screen, and a fault-injected clipboard failure that left
the previous clipboard intact.

## license

mit
