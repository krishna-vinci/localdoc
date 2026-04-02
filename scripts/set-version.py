#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "VERSION"

SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def replace_in_file(path: Path, pattern: str, replacement: str) -> None:
    current = read_text(path)
    updated, count = re.subn(pattern, replacement, current, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"Could not update version in {path}")
    write_text(path, updated)


def load_version() -> str:
    return read_text(VERSION_FILE).strip()


def validate(version: str) -> None:
    if not SEMVER_RE.fullmatch(version):
        raise SystemExit(
            "Version must follow Semantic Versioning, for example: 1.0.0, 1.2.3-alpha.1, 2.0.0+build.5"
        )


def sync(version: str) -> None:
    validate(version)
    write_text(VERSION_FILE, f"{version}\n")

    replace_in_file(
        ROOT / "backend/app/__init__.py",
        r'^__version__ = ".*"$',
        f'__version__ = "{version}"',
    )

    replace_in_file(
        ROOT / "agent/main.go",
        r'^var agentVersion = ".*"$',
        f'var agentVersion = "{version}"',
    )

    package_json_path = ROOT / "frontend/package.json"
    package_json = json.loads(read_text(package_json_path))
    package_json["version"] = version
    write_text(package_json_path, json.dumps(package_json, indent=2) + "\n")

    package_lock_path = ROOT / "frontend/package-lock.json"
    package_lock = json.loads(read_text(package_lock_path))
    package_lock["version"] = version
    if "packages" in package_lock and "" in package_lock["packages"]:
        package_lock["packages"][""]["version"] = version
    write_text(package_lock_path, json.dumps(package_lock, indent=2) + "\n")


def check() -> None:
    version = load_version()
    validate(version)

    mismatches: list[str] = []
    backend_version = re.search(r'^__version__ = "(.*)"$', read_text(ROOT / "backend/app/__init__.py"), re.MULTILINE)
    agent_version = re.search(r'^var agentVersion = "(.*)"$', read_text(ROOT / "agent/main.go"), re.MULTILINE)
    frontend_package = json.loads(read_text(ROOT / "frontend/package.json"))
    frontend_lock = json.loads(read_text(ROOT / "frontend/package-lock.json"))

    if backend_version is None or backend_version.group(1) != version:
        mismatches.append("backend/app/__init__.py")
    if agent_version is None or agent_version.group(1) != version:
        mismatches.append("agent/main.go")
    if frontend_package.get("version") != version:
        mismatches.append("frontend/package.json")
    if frontend_lock.get("version") != version:
        mismatches.append("frontend/package-lock.json")
    if frontend_lock.get("packages", {}).get("", {}).get("version") != version:
        mismatches.append("frontend/package-lock.json packages['']")

    if mismatches:
        raise SystemExit("Version mismatch found in: " + ", ".join(mismatches))


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[1] == "--check":
        check()
        print(load_version())
        return 0
    if len(argv) != 2:
        print("Usage: scripts/set-version.py <semver> | --check", file=sys.stderr)
        return 1
    sync(argv[1])
    print(argv[1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
