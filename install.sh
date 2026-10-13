#!/bin/sh
# opencode-copy-response installer.
#
# Makes the plugin available to every project by placing it in the opencode
# plugin directory. No root, no configuration file changes, and nothing that
# already exists is overwritten unless it belongs to this plugin.
#
# usage:
#   ./install.sh           symlink this checkout into the plugin directory
#   ./install.sh --copy    copy tui.tsx and response.ts instead
#   ./install.sh --help

set -eu

mode=symlink
case "${1:-}" in
  "" | --link)
    mode=symlink
    ;;
  --copy)
    mode=copy
    ;;
  -h | --help)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "unknown option: $1 (try --help)" >&2
    exit 2
    ;;
esac

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
plugins_dir="$config_dir/plugins"
target="$plugins_dir/opencode-copy-response"

is_ours() {
  [ -f "$1/tui.tsx" ] && grep -q 'local\.copy-response' "$1/tui.tsx" 2>/dev/null
}

if ! command -v opencode >/dev/null 2>&1; then
  echo "note: opencode is not on PATH; installing anyway"
fi

mkdir -p "$plugins_dir"

if [ "$mode" = symlink ]; then
  if [ -L "$target" ]; then
    current=$(readlink "$target" 2>/dev/null || true)
    if [ "$current" = "$repo_dir" ]; then
      echo "already installed: $target -> $repo_dir"
      exit 0
    fi
    echo "replacing symlink $target (was $current)"
    rm -f "$target"
  elif [ -e "$target" ]; then
    if is_ours "$target"; then
      echo "replacing copied install at $target with a symlink"
      rm -rf "$target"
    else
      echo "error: $target exists and does not look like opencode-copy-response" >&2
      echo "move it away first if you want this installer to manage that path" >&2
      exit 1
    fi
  fi
  ln -s "$repo_dir" "$target"
  echo "installed: $target -> $repo_dir"
else
  if [ -L "$target" ]; then
    rm -f "$target"
  fi
  if [ -e "$target" ] && ! is_ours "$target"; then
    echo "error: $target exists and does not look like opencode-copy-response" >&2
    echo "move it away first if you want this installer to manage that path" >&2
    exit 1
  fi
  mkdir -p "$target"
  cp "$repo_dir/tui.tsx" "$repo_dir/response.ts" "$target/"
  echo "installed (copy): $target"
fi

cat <<'EOF'

restart the opencode terminal (tui) to load the plugin, then type /copy-response.

the two new commands:
  /copy-response    copy the latest assistant response as markdown
  /copy-transcript  copy the whole session transcript
EOF
