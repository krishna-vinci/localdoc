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
6. publish release notes

Example:

```bash
python3 scripts/set-version.py 0.1.0-alpha.2
git add VERSION backend agent frontend RELEASING.md
git commit -m "Release 0.1.0-alpha.2"
git tag v0.1.0-alpha.2
```

## Current phase

LocalDocs Hub is currently in the **alpha** phase.

That means:

- the overall direction is stable
- APIs and workflows may still evolve
- pre-release tags should be preferred over a `1.0.0` claim until compatibility expectations are stronger
