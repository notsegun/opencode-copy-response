#!/bin/sh
# opencode-copy-response uninstaller.
#
# Removes only what install.sh placed in the opencode plugin directory, and
# only when it is actually this plugin. Symlinked checkouts are unlinked, never
# deleted; copied installs are removed; anything else is left untouched.
#
# usage: ./uninstall.sh

set -eu

config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
target="$config_dir/plugins/opencode-copy-response"

if [ -L "$target" ]; then
  rm -f "$target"
  echo "removed symlink: $target"
elif [ -d "$target" ]; then
  if grep -q 'local\.copy-response' "$target/tui.tsx" 2>/dev/null; then
    rm -rf "$target"
    echo "removed copied plugin: $target"
  else
    echo "error: $target does not look like opencode-copy-response; leaving it alone" >&2
    exit 1
  fi
elif [ -e "$target" ]; then
  echo "error: $target is not a file this uninstaller manages; leaving it alone" >&2
  exit 1
else
  echo "not installed: $target does not exist"
  exit 0
fi

echo
echo "restart the opencode terminal (tui) to unload the plugin."
echo "opencode's own /copy and everything else are untouched."
