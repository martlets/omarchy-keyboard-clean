#!/usr/bin/env python3
"""Restore keyboards if omarchy-shell dies, times out, or forgets the lock.

This process is restore-only. It never disables a device. Device names are
checked against the same conservative pattern the QML model uses before they
are handed to hyprctl as argv (no shell). The state file must live in
XDG_RUNTIME_DIR so a leftover lock cannot survive logout or reboot.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
import time
from pathlib import Path

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$")
MIN_TIMEOUT = 60
MAX_TIMEOUT = 3600
DEFAULT_TIMEOUT = 2700


def detach_from_parent() -> None:
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    try:
        if os.getpgrp() != os.getpid():
            os.setsid()
    except OSError:
        pass


def runtime_dir() -> Path:
    raw = os.environ.get("XDG_RUNTIME_DIR") or ""
    if not raw:
        raise SystemExit("watchdog: XDG_RUNTIME_DIR is not set")
    path = Path(raw).resolve()
    if not path.is_dir():
        raise SystemExit(f"watchdog: XDG_RUNTIME_DIR is not a directory: {path}")
    return path


def resolve_state_path(raw: str, runtime: Path) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise SystemExit("watchdog: state path must be absolute")
    resolved = path.resolve()
    runtime_s = str(runtime) + os.sep
    if resolved != runtime and not str(resolved).startswith(runtime_s):
        raise SystemExit("watchdog: state path must be inside XDG_RUNTIME_DIR")
    return resolved


def pid_alive(pid: int) -> bool:
    if pid <= 1:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def load_state(path: Path) -> dict | None:
    try:
        if path.is_symlink():
            return None
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    if not isinstance(data, dict) or data.get("version") != 1:
        return None
    return data


def safe_names(devices) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    if not isinstance(devices, list):
        return names
    for item in devices:
        name = str(item or "")
        if not SAFE_NAME.fullmatch(name) or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def lua_enable(name: str) -> str:
    return f'hl.device({{ name = "{name}", enabled = true }})'


def restore(names: list[str], hyprctl: str) -> int:
    failures = 0
    for name in names:
        try:
            completed = __import__("subprocess").run(
                [hyprctl, "eval", lua_enable(name)],
                check=False,
                stdout=__import__("subprocess").DEVNULL,
                stderr=__import__("subprocess").DEVNULL,
            )
        except OSError:
            failures += 1
            continue
        if completed.returncode != 0:
            failures += 1
    return failures


def unlink_state(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    except OSError:
        pass


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--generation", type=int, required=True)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--hyprctl", default="hyprctl")
    parser.add_argument("--poll", type=float, default=0.5)
    return parser.parse_args(argv)


def clamp_timeout(value: int) -> int:
    if value < MIN_TIMEOUT:
        return MIN_TIMEOUT
    if value > MAX_TIMEOUT:
        return MAX_TIMEOUT
    return value


def should_restore(state: dict | None, generation: int) -> tuple[bool, list[str]]:
    if state is None:
        return False, []
    if int(state.get("generation") or 0) != generation:
        return False, []
    if state.get("locked") is not True:
        return False, []
    return True, safe_names(state.get("devices"))


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    detach_from_parent()

    runtime = runtime_dir()
    state_path = resolve_state_path(args.state, runtime)
    timeout = clamp_timeout(args.timeout)
    deadline = time.monotonic() + timeout
    poll = args.poll if args.poll > 0.1 else 0.5
    grace_deadline = time.monotonic() + 3
    seen_state = False

    while time.monotonic() < deadline:
        state = load_state(state_path)
        if state is None:
            if not seen_state and time.monotonic() < grace_deadline:
                time.sleep(poll)
                continue
            return 0
        seen_state = True
        restore_now, names = should_restore(state, args.generation)
        if not restore_now:
            return 0
        if not pid_alive(args.pid):
            restore(names, args.hyprctl)
            unlink_state(state_path)
            return 0
        time.sleep(poll)

    state = load_state(state_path)
    restore_now, names = should_restore(state, args.generation)
    if restore_now:
        restore(names, args.hyprctl)
        unlink_state(state_path)
    return 0


if __name__ == "__main__":
    sys.exit(run())
