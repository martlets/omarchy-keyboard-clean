# Keyboard Clean

An Omarchy bar control that locks the keyboard, the touchscreen, or both
so you can wipe them without typing or tapping garbage. Click the spray
icon, pick a mode, clean, click again to unlock. The mouse and trackpad
stay available the whole time.

It is the same job as KeyboardCleanTool on a Mac, with a Stay Awake-style
bar control and a small menu for which surface you want frozen.

## Install

Plugins run unsandboxed inside `omarchy-shell`. Read this repo first, then:

```bash
omarchy plugin add https://github.com/martlets/omarchy-keyboard-clean.git --enable
```

That places a spray icon in the center of the bar. To sit it next to Stay
Awake:

```bash
omarchy bar move io.github.martlets.keyboard-clean --after omarchy.indicators
```

## Use

- Click the icon and choose **Keyboard**, **Touchscreen**, or **Keyboard + Screen**.
- Wipe that surface. Frozen keys and taps are not delivered to apps or to
  Hyprland binds.
- Click the icon again to unlock.
- Tooltip reads `Clean Keyboard or Screen`, then `Unlock … · locked M:SS`.

There is deliberately no keyboard shortcut to unlock. The pointer is the
way out. The touchscreen is only locked when a mouse or trackpad is still
there to get you out.

From a terminal or bind you already have:

```bash
omarchy-shell io.github.martlets.keyboard-clean toggle
omarchy-shell io.github.martlets.keyboard-clean status
omarchy-shell io.github.martlets.keyboard-clean lockKeyboard
omarchy-shell io.github.martlets.keyboard-clean lockTouch
omarchy-shell io.github.martlets.keyboard-clean lockBoth
omarchy-shell io.github.martlets.keyboard-clean unlock
```

## What it will not do

- It does not write Hyprland config. Device disables are runtime `hyprctl eval`
  calls and vanish on compositor restart.
- It does not persist across reboot, logout, or a dead `omarchy-shell`.
- It does not disable mice, touchpads, the power or sleep buttons, the
  privacy kill-switch, or the fcitx virtual keyboard.
- It does not need sudo, install hooks, or a cloned first-party plugin.
- It inhibits idle/sleep only while locked, then drops the inhibitor.

If `omarchy-shell` crashes while a surface is locked, a tiny restore-only
watchdog in `XDG_RUNTIME_DIR` turns the devices back on. A 45-minute timer
does the same if you forget it is on.

## Remove

```bash
omarchy plugin remove io.github.martlets.keyboard-clean
```

If a lock was active, click the icon (or run `unlock`) before removing the
plugin so the current session restores immediately. A leftover runtime lock
file is cleared on the next service start, on watchdog timeout, or at logout.

## Develop

```bash
omarchy plugin validate .
node tests/test_model.js
python3 tests/test_watchdog.py
```
