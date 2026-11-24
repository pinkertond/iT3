# iT3 for macOS

iT3 is the Apple Silicon macOS fork of T3 Code. The development checkout runs with live UI reload. The other Mac runs a standalone Electron app from `~/Applications/iT3.app` and needs neither Node nor a source checkout. Its bundle identifier is `com.pinkertond.it3`. Packaged builds default to `~/.it3` for the local server and `~/Library/Application Support/iT3` for the desktop profile. Pair with an existing T3 environment to use the same projects and threads on both Macs.

## Source and versions

- Work on the `it3` branch of `pinkertond/iT3`. The fork's `main` mirrors `pingdotgg/t3code:main`.
- `IT3_VERSION` identifies an installer. Use the upstream version followed by a fork revision, for example `0.1.11-it3.1`, then `0.1.11-it3.2`. Increment the revision for every new binary, including rebuilds you distribute.
- An annotated tag named `it3-<version>` identifies the exact source commit. The packaged About dialog includes the version and abbreviated Git commit. Record the DMG's SHA-256 alongside the installer to identify its exact bytes.
- Development builds can have newer edits than the installed release. Use the same tag on both machines when exact parity matters.

## Bring in upstream changes

From a clean checkout with `origin` pointing to the fork and `upstream` pointing to the original project:

```sh
git fetch origin
git fetch upstream main --no-tags
git merge-base --is-ancestor origin/main upstream/main && git push origin refs/remotes/upstream/main:refs/heads/main
git switch it3
git pull --ff-only origin it3
git merge upstream/main
```

Review changes to the app identity, profile location, updater, installer, and Node and pnpm pins. Resolve conflicts and test the app. Mirroring `main` alone does not deploy anything. Keep installer tags immutable. The fork's `it3-*` tag prefix avoids triggering the upstream stable publishing workflow.

## Build and tag a release

Use an Apple Silicon Mac with Xcode Command Line Tools, Rust, Vite+, and the Node and pnpm versions pinned in the root package.json. Build from a separate clean checkout or Git worktree when the live development app is running. Install dependencies with `pnpm install --frozen-lockfile`. The build script also recognizes the development checkout's project-local Node toolchain.

1. Update `IT3_VERSION` on `it3`, commit the intended source, and run the affected tests and commit checks.
2. In the clean release checkout, build the installer and calculate its checksum:

```sh
scripts/build-it3-mac.sh
version=$(cat IT3_VERSION)
image="release/iT3-$version-arm64.dmg"
shasum -a 256 "$image" > "$image.sha256"
```

3. Install and verify that candidate on the target Mac. After verification, tag the commit used for the build and push the branch and tag:

```sh
git tag -a "it3-$version" -m "iT3 $version"
git push origin it3 "refs/tags/it3-$version"
```

Retain the exact DMG and checksum together. Source tags are sufficient to rebuild from the same code, but independently generated DMGs can have different checksums.

## Install or update over SSH

Use the SSH account of the signed-in desktop user. For an update, finish active work and quit the packaged iT3 app on the target. In the release checkout, set `target` to the SSH alias for that Mac and run:

```sh
target=your-mac-alias
version=$(cat IT3_VERSION)
image="iT3-$version-arm64.dmg"
sha=$(shasum -a 256 "release/$image" | awk '{print $1}')
ssh "$target" 'mkdir -p "$HOME/Downloads/iT3-releases"'
scp "release/$image" scripts/install-it3-mac.sh "$target:Downloads/iT3-releases/"
ssh "$target" "cd Downloads/iT3-releases && sh install-it3-mac.sh '$image' '$version' '$sha'"
```

The installer checks the architecture, checksum, bundle ID, version, and code signature, then opens iT3. Before replacing a prior copy, it saves the bundle under `~/Library/Application Support/iT3-install-backups/`. Signing for this two-Mac workflow is local ad-hoc signing. Public distribution through Gatekeeper requires a Developer ID signature and notarization. Packaged iT3 uses manual updates.

Verify the installed version and running app on the target:

```sh
/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$HOME/Applications/iT3.app/Contents/Info.plist"
lsappinfo find bundleid=com.pinkertond.it3
```

For a two-Mac recovery check, open the same host environment from the second Mac. In a disposable Git project, interrupt a worker after an intended file and an undeclared file are written, before it checkpoints. Use the second client to inspect the attempt, confirm both paths and assign another chat. Verify the original host and the second client see the same accepted result.

For rollback, quit iT3, move the current bundle aside, and restore the previous bundle from the backup directory. Back up the stopped environment before any upgrade that migrates its database. Restoring a bundle alone cannot undo a data migration.
