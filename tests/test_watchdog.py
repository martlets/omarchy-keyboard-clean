#!/usr/bin/env python3
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WATCHDOG = ROOT / "watchdog.py"


class WatchdogTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.runtime = Path(self.tmpdir.name) / "runtime"
        self.runtime.mkdir()
        self.state = self.runtime / "omarchy-keyboard-clean.lock.json"
        self.hyprctl_log = Path(self.tmpdir.name) / "hyprctl.log"
        self.hyprctl = Path(self.tmpdir.name) / "hyprctl"
        self.hyprctl.write_text(
            "#!/bin/bash\nprintf '%s\\n' \"$*\" >> \"{log}\"\nexit 0\n".format(log=self.hyprctl_log)
        )
        self.hyprctl.chmod(self.hyprctl.stat().st_mode | stat.S_IEXEC)
        self.env = os.environ.copy()
        self.env["XDG_RUNTIME_DIR"] = str(self.runtime)

    def tearDown(self):
        self.tmpdir.cleanup()

    def write_state(self, **fields):
        payload = {
            "version": 1,
            "locked": True,
            "generation": 1,
            "pid": os.getpid(),
            "devices": ["at-translated-set-2-keyboard", "bad name", "hid-sdw:0:0:01fa:4245:01"],
        }
        payload.update(fields)
        self.state.write_text(json.dumps(payload))

    def run_watchdog(self, extra=None, timeout=60):
        cmd = [
            sys.executable,
            str(WATCHDOG),
            "--pid",
            str(os.getpid()),
            "--state",
            str(self.state),
            "--generation",
            "1",
            "--timeout",
            str(timeout),
            "--hyprctl",
            str(self.hyprctl),
            "--poll",
            "0.05",
        ]
        if extra:
            cmd.extend(extra)
        return subprocess.run(cmd, env=self.env, check=False, capture_output=True, text=True)

    def test_exits_when_state_missing(self):
        started = time.monotonic()
        result = self.run_watchdog()
        self.assertEqual(result.returncode, 0)
        self.assertFalse(self.hyprctl_log.exists())
        self.assertLess(time.monotonic() - started, 5)

    def test_exits_when_unlocked(self):
        self.write_state(locked=False)
        result = self.run_watchdog()
        self.assertEqual(result.returncode, 0)
        self.assertFalse(self.hyprctl_log.exists())

    def test_rejects_state_outside_runtime(self):
        outside = Path(self.tmpdir.name) / "outside.json"
        outside.write_text("{}")
        result = subprocess.run(
            [
                sys.executable,
                str(WATCHDOG),
                "--pid",
                str(os.getpid()),
                "--state",
                str(outside),
                "--generation",
                "1",
                "--hyprctl",
                str(self.hyprctl),
            ],
            env=self.env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("XDG_RUNTIME_DIR", result.stderr)

    def test_restores_when_parent_is_dead(self):
        self.write_state()
        result = subprocess.run(
            [
                sys.executable,
                str(WATCHDOG),
                "--pid",
                "999999",
                "--state",
                str(self.state),
                "--generation",
                "1",
                "--timeout",
                "60",
                "--hyprctl",
                str(self.hyprctl),
                "--poll",
                "0.05",
            ],
            env=self.env,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)
        log = self.hyprctl_log.read_text()
        self.assertIn('hl.device({ name = "at-translated-set-2-keyboard", enabled = true })', log)
        self.assertIn('hl.device({ name = "hid-sdw:0:0:01fa:4245:01", enabled = true })', log)
        self.assertNotIn("bad name", log)
        self.assertNotIn("enabled = false", log)
        self.assertFalse(self.state.exists())

    def test_ignores_generation_mismatch(self):
        self.write_state(generation=2)
        result = subprocess.run(
            [
                sys.executable,
                str(WATCHDOG),
                "--pid",
                "999999",
                "--state",
                str(self.state),
                "--generation",
                "1",
                "--hyprctl",
                str(self.hyprctl),
            ],
            env=self.env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)
        self.assertFalse(self.hyprctl_log.exists())


if __name__ == "__main__":
    unittest.main()
