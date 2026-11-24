#!/bin/sh
# Run as the signed-in desktop user, locally or over SSH.
set -eu
if [ "$#" -ne 3 ]; then
  echo "Usage: $0 installer.dmg expected-version expected-sha256" >&2
  exit 2
fi
image=$1
version=$2
expected=$3
[ "$(uname -sm)" = "Darwin arm64" ] || { echo "Apple Silicon macOS required" >&2; exit 1; }
[ "$(id -un)" = "$(stat -f %Su /dev/console)" ] || { echo "Sign in to the target Mac desktop first" >&2; exit 1; }
actual=$(shasum -a 256 "$image" | awk '{print $1}')
[ "$actual" = "$expected" ] || { echo "Installer checksum mismatch" >&2; exit 1; }

apps="$HOME/Applications"
dest="$apps/iT3.app"
mkdir -p "$apps"
stage=$(mktemp -d "$apps/.it3-install.XXXXXX")
lock="$apps/.it3-install-lock"
if ! mkdir "$lock"; then
  rmdir "$stage"
  echo "Another install may be running. Check $lock before retrying." >&2; exit 1
fi
mounted=no
backup=
cleanup() {
  if [ "$mounted" = yes ]; then hdiutil detach "$stage/volume" >/dev/null || { rmdir "$lock"; return; }; fi
  if [ -d "$stage/previous.app" ] && [ ! -e "$dest" ]; then mv "$stage/previous.app" "$dest"; fi
  if [ -d "$stage/previous.app" ]; then echo "Previous app retained in $stage" >&2; rmdir "$lock"; return; fi
  rm -rf "$stage"
  rmdir "$lock"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir "$stage/volume"
hdiutil attach -readonly -nobrowse -mountpoint "$stage/volume" "$image" >/dev/null
mounted=yes
bundle_id() { /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$1/Contents/Info.plist"; }
bundle_version() { /usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$1/Contents/Info.plist"; }
ditto "$stage/volume/iT3.app" "$stage/new.app"
[ "$(bundle_id "$stage/new.app")" = "com.pinkertond.it3" ]
[ "$(bundle_version "$stage/new.app")" = "$version" ]
codesign --verify --deep --strict "$stage/new.app"
if [ -e "$dest" ] || [ -L "$dest" ]; then
  [ ! -L "$dest" ] && [ "$(bundle_id "$dest")" = "com.pinkertond.it3" ] || {
    echo "Existing destination is a different app or a launcher shortcut: $dest" >&2; exit 1;
  }
  # macOS signature services can hold an idle bundle open through an ordinary file descriptor.
  if pgrep -f -x "$dest/Contents/MacOS/iT3" >/dev/null || [ -n "$(lsof -t -a -d txt "$dest/Contents/MacOS/iT3" 2>/dev/null)" ]; then
    echo "Quit iT3 after active work finishes, then retry." >&2; exit 1
  fi
  backups="$HOME/Library/Application Support/iT3-install-backups"
  mkdir -p "$backups"
  backup=$(mktemp -d "$backups/$(bundle_version "$dest").XXXXXX")
  mv "$dest" "$stage/previous.app"
fi
mv "$stage/new.app" "$dest"
if [ -n "$backup" ]; then mv "$stage/previous.app" "$backup/iT3.app"; echo "Previous app saved in $backup"; fi
open "$dest"
echo "Installed iT3 $version at $dest"
