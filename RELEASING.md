# Releasing and Versioning

LocalDocs Hub follows **Semantic Versioning**.

## Format

```text
MAJOR.MINOR.PATCH
```

Examples:

- `1.0.0`
- `1.2.0`
- `1.2.1`
- `1.0.0-alpha.1`
- `1.0.0-beta.2`

## What each part means

- **MAJOR**: breaking changes
- **MINOR**: backwards-compatible features
- **PATCH**: backwards-compatible fixes

Pre-release identifiers such as `alpha.1`, `beta.1`, and `rc.1` are used before a stable release.

## Source of truth

The canonical repository version lives in:

```text
VERSION
```

The repository sync script updates all runtime consumers from that version.

## Set a new version

```bash
python3 scripts/set-version.py 0.1.0-alpha.2
```

Examples:

```bash
python3 scripts/set-version.py 0.1.0-alpha.2
python3 scripts/set-version.py 0.1.0-beta.1
python3 scripts/set-version.py 0.1.0
python3 scripts/set-version.py 0.2.0
python3 scripts/set-version.py 1.0.0
```

## Check version consistency

```bash
python3 scripts/set-version.py --check
```

This validates that:

- `VERSION`
- `backend/app/__init__.py`
- `agent/main.go`
- `frontend/package.json`
- `frontend/package-lock.json`

all agree.

## Suggested release flow

1. choose the next semantic version
2. run the version sync script
3. run tests and checks
4. commit the version change
5. create a git tag for that version
6. push `main` and the tag
7. let GitHub Actions build the release assets and publish the GitHub Release

Example:

```bash
python3 scripts/set-version.py 0.1.1
python3 scripts/set-version.py --check

git checkout main
git pull origin main

git add VERSION backend/app/__init__.py agent/main.go frontend/package.json frontend/package-lock.json RELEASING.md
git commit -m "chore: release v0.1.1"
git push origin main

git tag -a v0.1.1 -m "Release v0.1.1"
git push origin v0.1.1
```

After the tag push, the `Release` GitHub Actions workflow will:

- validate that the tag matches the repository `VERSION`
- build LocalDocs agent archives for Linux, macOS, and Windows
- generate `checksums.txt`
- create or update the GitHub Release page for that tag
- upload the release assets automatically

## Release assets

Each tagged release now publishes these assets on the GitHub Releases page:

- `localdocs-darwin-amd64.tar.gz`
- `localdocs-darwin-arm64.tar.gz`
- `localdocs-linux-amd64.tar.gz`
- `localdocs-linux-arm64.tar.gz`
- `localdocs-windows-amd64.zip`
- `checksums.txt`
- `install-localdocs-agent.sh`

GitHub also provides source archives (`zip` and `tar.gz`) for the tagged commit automatically.

## Day-to-day versioning guide

- `fix:` commits usually lead to a **PATCH** bump
  - `0.1.0` → `0.1.1`
- `feat:` commits usually lead to a **MINOR** bump
  - `0.1.0` → `0.2.0`
- breaking API or incompatible behavior leads to a **MAJOR** bump
  - `0.1.0` → `1.0.0`

While LocalDocs Hub is still early-stage, pre-releases are encouraged when helpful:

- `0.1.1-alpha.1`
- `0.2.0-beta.1`
- `1.0.0-rc.1`

## Recommended simple workflow

For normal development:

1. merge work into `development`
2. fast-forward or merge tested work into `main`
3. when you want a downloadable release, bump the version on `main`
4. tag `vX.Y.Z`
5. push the tag
6. download or share binaries from the GitHub Releases page

## Later-use checklist

When you want to cut the next release later, run:

```bash
python3 scripts/set-version.py 0.1.2
python3 scripts/set-version.py --check
git add VERSION backend/app/__init__.py agent/main.go frontend/package.json frontend/package-lock.json
git commit -m "chore: release v0.1.2"
git push origin main
git tag -a v0.1.2 -m "Release v0.1.2"
git push origin v0.1.2
```

Then open:

- `Actions` → `Release` to watch the build
- `Releases` to copy notes and download assets

## Current phase

LocalDocs Hub is currently in the **alpha** phase.

That means:

- the overall direction is stable
- APIs and workflows may still evolve
- pre-release tags should be preferred over a `1.0.0` claim until compatibility expectations are stronger
