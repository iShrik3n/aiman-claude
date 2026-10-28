#!/usr/bin/env bash
# Update an existing aiman installation from GitHub Releases (Linux / macOS).
#
#   curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/update.sh | bash
#
# Your data lives in AIMAN_HOME (manager.db, backups) and is never touched.
#
# Environment:
#   AIMAN_APP_DIR   install directory   (default: ~/.aiman/app)
#   AIMAN_VERSION   version to install  (default: latest; e.g. 1.9.0)
#   AIMAN_REPO      owner/repo          (default: spacewalkingninja/aiman)
#   AIMAN_NO_RESTART=1  do not restart the service after updating
set -euo pipefail

REPO="${AIMAN_REPO:-spacewalkingninja/aiman}"
APP_DIR="${AIMAN_APP_DIR:-$HOME/.aiman/app}"
WANT="${AIMAN_VERSION:-latest}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# If run from a checkout, update that checkout instead of ~/.aiman/app.
if [ -f package.json ] && grep -q '"name": *"aiman"' package.json 2>/dev/null; then
  APP_DIR="$(pwd)"
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "aiman install not found at: $APP_DIR" >&2
  echo "Set AIMAN_APP_DIR to the directory that contains package.json." >&2
  exit 1
fi

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v tar >/dev/null || { echo "tar is required" >&2; exit 1; }

if [ "$WANT" = "latest" ]; then
  REL_URL="https://api.github.com/repos/$REPO/releases/latest"
else
  REL_URL="https://api.github.com/repos/$REPO/releases/tags/v${WANT#v}"
fi

say "Looking up $WANT release of $REPO"
JSON="$(curl -fsSL "$REL_URL")"
TAG="$(printf '%s' "$JSON" | grep -oE '"tag_name": *"[^"]+"' | head -1 | grep -oE 'v[0-9][^"]*' || true)"
URL="$(printf '%s' "$JSON" | grep -oE '"browser_download_url": *"[^"]+\.tar\.gz"' | head -1 | grep -oE 'https://[^"]+' || true)"
if [ -z "$TAG" ] || [ -z "$URL" ]; then
  echo "Could not resolve a release tarball (tag=${TAG:-none})." >&2
  exit 1
fi

CUR="$(grep -m1 '"version"' "$APP_DIR/package.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo '?')"
say "Updating aiman $CUR -> $TAG in $APP_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP/aiman.tgz"
tar -xzf "$TMP/aiman.tgz" -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'aiman-*' | head -1)"
if [ -z "$SRC" ]; then
  echo "Unexpected archive layout." >&2
  exit 1
fi

# Overlay the release files. Data (AIMAN_HOME) is separate and untouched.
cp -a "$SRC/." "$APP_DIR/"

say "Installed $TAG ($(grep -m1 '"version"' "$APP_DIR/package.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'))"

if [ "${AIMAN_NO_RESTART:-0}" = "1" ]; then
  echo "Skipping restart (AIMAN_NO_RESTART=1)."
  exit 0
fi

restart_service() {
  for unit in aiman opencode-manager; do
    # Prefer a direct unit-file check (more reliable than list-unit-files when
    # aiman is running as a manual process).
    if [ -f "/etc/systemd/system/${unit}.service" ] ||
       systemctl list-unit-files 2>/dev/null | grep -q "^${unit}\.service"; then
      say "Restarting ${unit}.service"
      # `restart` also starts an inactive unit.
      if ! sudo -n systemctl restart "$unit" 2>/dev/null; then
        sudo systemctl restart "$unit" || systemctl restart "$unit" || true
      fi
      return 0
    fi
    if [ -f "$HOME/.config/systemd/user/${unit}.service" ] ||
       systemctl --user list-unit-files 2>/dev/null | grep -q "^${unit}\.service"; then
      say "Restarting user ${unit}.service"
      systemctl --user restart "$unit" || true
      return 0
    fi
  done
  return 1
}

if [ "$(uname -s)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.aiman.manager.plist"
  if [ -f "$PLIST" ]; then
    say "Reloading launch agent"
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST" || true
    exit 0
  fi
fi

if restart_service; then
  exit 0
fi

PIDS="$(pgrep -f 'aiman/app/bin/aiman\.mjs' 2>/dev/null | tr '\n' ' ' || true)"
if [ -n "${PIDS// /}" ]; then
  say "aiman is running as a manual process (PID: ${PIDS})."
  say "Stop it and start aiman again (or install it as a service) to use the new version."
else
  say "Updated. Restart aiman yourself (e.g. run 'aiman', or restart your process manager)."
fi
exit 0
