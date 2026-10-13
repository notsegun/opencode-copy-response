#!/usr/bin/env bash
# End-to-end check for opencode-copy-response against a real opencode tui.
#
# Runs inside a throwaway isolated environment (its own XDG dirs, service port
# and tmux socket), imports fixture sessions with representative markdown over
# the documented session import endpoint (no model is ever called), starts a
# real tui under tmux, runs the commands and diffs the clipboard byte for byte.
#
# linux only. needs: opencode v2, python3, tmux, and a clipboard reader
# (wl-paste on wayland, xclip on x11). the plugin under test is this checkout.
set -euo pipefail

PORT="${E2E_PORT:-49733}"
SOCKET="opencode-copy-response-e2e"
SLEEP="${E2E_SLEEP:-12}"

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/opencode-copy-response-e2e.XXXXXX")
export XDG_CONFIG_HOME="$tmp/config"
export XDG_DATA_HOME="$tmp/data"
export XDG_STATE_HOME="$tmp/state"
export XDG_CACHE_HOME="$tmp/cache"
work="$tmp/work"
mkdir -p "$XDG_CONFIG_HOME/opencode/plugins" "$work"

clip_read() {
  if command -v wl-paste >/dev/null 2>&1 && [ -n "${WAYLAND_DISPLAY:-}" ]; then
    wl-paste -n
  elif command -v xclip >/dev/null 2>&1; then
    xclip -o -selection clipboard
  else
    echo "no clipboard reader found (wl-paste or xclip)" >&2
    exit 2
  fi
}

failures=0
check() {
  local label="$1"
  local ok="$2"
  if [ "$ok" = "1" ]; then
    echo "PASS  $label"
  else
    echo "FAIL  $label"
    failures=$((failures + 1))
  fi
}

cleanup() {
  tmux -L "$SOCKET" kill-server >/dev/null 2>&1 || true
  opencode service stop >/dev/null 2>&1 || true
  if [ "$failures" = "0" ] && [ -z "${E2E_KEEP:-}" ]; then
    rm -rf "$tmp"
  else
    echo "kept for inspection: $tmp"
  fi
}
trap cleanup EXIT

echo "# isolated environment: $tmp (service port $PORT)"
ln -sfn "$repo_dir" "$XDG_CONFIG_HOME/opencode/plugins/opencode-copy-response"
printf '{\n  "$schema": "https://opencode.ai/config.json"\n}\n' > "$XDG_CONFIG_HOME/opencode/opencode.json"

(cd "$work" && opencode service set port "$PORT" >/dev/null)
echo "# starting isolated service"
(cd "$work" && opencode api get /api/info >/dev/null)

echo "# importing fixture sessions"
python3 "$repo_dir/scripts/fixture.py" "$work" "$tmp" "$tmp/expected.txt"

echo "# starting the tui under tmux"
tmux -L "$SOCKET" new-session -d -s e2e -x 150 -y 45
tmux -L "$SOCKET" send-keys -t e2e "cd $work && opencode --session ses_e2e0000000000000000000001" Enter
sleep "$SLEEP"

panel() { tmux -L "$SOCKET" capture-pane -t e2e -p; }

echo "# checking slash autocomplete"
tmux -L "$SOCKET" send-keys -t e2e '/copy'
sleep 2
panel > "$tmp/autocomplete.txt"
check "autocomplete lists /copy (built-in transcript copy)" "$(grep -c '/copy  *Copy session transcript' "$tmp/autocomplete.txt" >/dev/null && echo 1 || echo 0)"
check "autocomplete lists /copy-response" "$(grep -q '/copy-response' "$tmp/autocomplete.txt" && echo 1 || echo 0)"
check "autocomplete lists /copy-transcript" "$(grep -q '/copy-transcript' "$tmp/autocomplete.txt" && echo 1 || echo 0)"
check "autocomplete lists /c" "$(grep -q '/c  *Copy the newest' "$tmp/autocomplete.txt" && echo 1 || echo 0)"

clear_input() { tmux -L "$SOCKET" send-keys -t e2e BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace BSpace; }

echo "# /copy-response must copy the response byte for byte"
clear_input
tmux -L "$SOCKET" send-keys -t e2e '/copy-response'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 3
clip_read > "$tmp/clipboard.txt"
if cmp -s "$tmp/expected.txt" "$tmp/clipboard.txt"; then check "/copy-response clipboard matches" 1; else check "/copy-response clipboard matches (got $(wc -c < "$tmp/clipboard.txt") bytes)" 0; fi

echo "# /copy-transcript must copy the whole transcript"
tmux -L "$SOCKET" send-keys -t e2e '/copy-transcript'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 3
clip_read > "$tmp/transcript.txt"
check "transcript contains the user message" "$(grep -q '## User' "$tmp/transcript.txt" && echo 1 || echo 0)"
check "transcript contains the older assistant answer" "$(grep -q 'an older answer' "$tmp/transcript.txt" && echo 1 || echo 0)"

echo "# a text-less newest step must fall back to the newest step with text"
tmux -L "$SOCKET" send-keys -t e2e '/sessions'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 2
tmux -L "$SOCKET" send-keys -t e2e 'e2e textless'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 4
tmux -L "$SOCKET" send-keys -t e2e '/copy-response'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 3
panel | grep -q 'assistant response copied to the clipboard' && check "textless step uses the fallback and reports it" 1 || check "textless step uses the fallback and reports it" 0

echo "# an empty session must report an error and keep the clipboard"
tmux -L "$SOCKET" send-keys -t e2e '/sessions'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 2
tmux -L "$SOCKET" send-keys -t e2e 'e2e blank'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 4
clip_read > "$tmp/before-empty.txt"
tmux -L "$SOCKET" send-keys -t e2e '/copy-response'
sleep 2
tmux -L "$SOCKET" send-keys -t e2e Enter
sleep 3
panel | grep -q 'no assistant response with text' && check "empty session reports an error" 1 || check "empty session reports an error" 0
clip_read > "$tmp/after-empty.txt"
cmp -s "$tmp/before-empty.txt" "$tmp/after-empty.txt" && check "clipboard kept on the empty session" 1 || check "clipboard kept on the empty session" 0

echo
if [ "$failures" = "0" ]; then
  echo "all checks passed"
else
  echo "$failures check(s) failed"
  exit 1
fi
