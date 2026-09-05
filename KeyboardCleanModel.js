// Pure helpers for Keyboard Clean. Qt-free so node can unit-test them.

var DEVICE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/

// Hyprland lists ACPI buttons, lid switches, the fcitx virtual keyboard, and
// similar non-keyboards as keyboards. None of those are being wiped, and some
// (power, sleep, privacy kill-switch) must keep working during a clean.
var NEVER_LOCK_RE = /^(hl-virtual-keyboard|power-button|sleep-button|lid-switch|video-bus|dell-privacy-driver|intel-hid-events|intel-hid-5-button-array)/

var POINTER_LISTS = ["mice", "touch", "tablets"]
var MODES = ["keyboard", "touch", "both"]

function isSafeDeviceName(name) {
  return DEVICE_NAME_RE.test(String(name || ""))
}

function isNeverLockKeyboard(name) {
  return NEVER_LOCK_RE.test(String(name || ""))
}

function normalizeMode(mode) {
  var value = String(mode || "both")
  return MODES.indexOf(value) !== -1 ? value : "both"
}

function namesFromList(list) {
  var names = []
  var seen = {}
  if (!Array.isArray(list)) return names

  for (var i = 0; i < list.length; i++) {
    var name = String(list[i] && list[i].name || "")
    if (!isSafeDeviceName(name) || seen[name]) continue
    seen[name] = true
    names.push(name)
  }

  return names
}

function pointerNameSet(devices) {
  var blocked = {}
  if (!devices || typeof devices !== "object") return blocked

  for (var i = 0; i < POINTER_LISTS.length; i++) {
    var list = devices[POINTER_LISTS[i]]
    if (!Array.isArray(list)) continue
    for (var j = 0; j < list.length; j++) {
      var name = String(list[j] && list[j].name || "")
      if (isSafeDeviceName(name)) blocked[name] = true
    }
  }

  return blocked
}

function mouseNames(devices) {
  return namesFromList(devices && devices.mice)
}

function hasUnlockPointer(devices) {
  return mouseNames(devices).length > 0
}

function parseDevicesJson(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (data && typeof data === "object" && !Array.isArray(data)) return data
  } catch (error) {
  }
  return null
}

function lockableKeyboardNames(devices) {
  if (!devices || typeof devices !== "object") return []

  var keyboards = devices.keyboards
  if (!Array.isArray(keyboards)) return []

  var blocked = pointerNameSet(devices)
  var seen = {}
  var names = []

  for (var i = 0; i < keyboards.length; i++) {
    var name = String(keyboards[i] && keyboards[i].name || "")
    if (!isSafeDeviceName(name)) continue
    if (isNeverLockKeyboard(name)) continue
    if (blocked[name]) continue
    if (seen[name]) continue
    seen[name] = true
    names.push(name)
  }

  return names
}

function lockableTouchNames(devices) {
  if (!hasUnlockPointer(devices)) return []

  var blockedMice = {}
  var mice = mouseNames(devices)
  for (var i = 0; i < mice.length; i++) blockedMice[mice[i]] = true

  var names = namesFromList(devices && devices.touch)
  var out = []
  for (var j = 0; j < names.length; j++) {
    if (!blockedMice[names[j]]) out.push(names[j])
  }
  return out
}

function uniqueConcat(groups) {
  var names = []
  var seen = {}
  for (var g = 0; g < groups.length; g++) {
    var list = groups[g] || []
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) continue
      seen[list[i]] = true
      names.push(list[i])
    }
  }
  return names
}

function lockableNames(devices, mode) {
  mode = normalizeMode(mode)
  var groups = []
  if (mode === "keyboard" || mode === "both") groups.push(lockableKeyboardNames(devices))
  if (mode === "touch" || mode === "both") groups.push(lockableTouchNames(devices))
  return uniqueConcat(groups)
}

function newlyLockableNames(devices, alreadyLocked, mode) {
  var locked = {}
  if (Array.isArray(alreadyLocked)) {
    for (var i = 0; i < alreadyLocked.length; i++) locked[String(alreadyLocked[i])] = true
  }

  var names = lockableNames(devices, mode)
  var extra = []
  for (var j = 0; j < names.length; j++) {
    if (!locked[names[j]]) extra.push(names[j])
  }
  return extra
}

function emptyLockError(mode, devices) {
  mode = normalizeMode(mode)
  if (mode === "touch") {
    if (!hasUnlockPointer(devices)) return "need a mouse or trackpad to unlock"
    return "no touchscreen found"
  }
  if (mode === "keyboard") return "no lockable keyboards found"
  return "no lockable keyboards or touchscreen found"
}

function luaDeviceEnabled(name, enabled) {
  if (!isSafeDeviceName(name)) return ""
  return 'hl.device({ name = "' + name + '", enabled = ' + (enabled ? "true" : "false") + " })"
}

function formatElapsed(ms) {
  var totalSec = Math.floor(Number(ms) / 1000)
  if (!isFinite(totalSec) || totalSec < 0) totalSec = 0
  var minutes = Math.floor(totalSec / 60)
  var seconds = totalSec % 60
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds
}

function clampTimeoutSeconds(value, fallback, min, max) {
  var timeout = Number(value)
  if (!isFinite(timeout)) timeout = Number(fallback)
  if (!isFinite(timeout)) timeout = 2700
  var lo = isFinite(Number(min)) ? Number(min) : 60
  var hi = isFinite(Number(max)) ? Number(max) : 3600
  if (timeout < lo) return lo
  if (timeout > hi) return hi
  return Math.floor(timeout)
}

function buildState(fields) {
  var source = fields && typeof fields === "object" ? fields : {}
  var devices = []
  if (Array.isArray(source.devices)) {
    for (var i = 0; i < source.devices.length; i++) {
      var name = String(source.devices[i] || "")
      if (isSafeDeviceName(name) && devices.indexOf(name) === -1) devices.push(name)
    }
  }

  return {
    version: 1,
    locked: source.locked === true,
    mode: normalizeMode(source.mode),
    generation: Math.max(0, Math.floor(Number(source.generation) || 0)),
    pid: Math.max(0, Math.floor(Number(source.pid) || 0)),
    startedAt: String(source.startedAt || ""),
    devices: devices
  }
}

function parseState(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    if (data.version !== 1) return null
    return buildState(data)
  } catch (error) {
    return null
  }
}

function modeLabel(mode) {
  mode = normalizeMode(mode)
  if (mode === "keyboard") return "Keyboard"
  if (mode === "touch") return "Touchscreen"
  return "Keyboard + Screen"
}

function modeChoices() {
  return [
    {
      value: "keyboard",
      icon: "󰌌",
      label: "Keyboard",
      description: "Lock the keys. Mouse and screen stay on."
    },
    {
      value: "touch",
      icon: "󰍹",
      label: "Touchscreen",
      description: "Lock the screen. Mouse and keys stay on."
    },
    {
      value: "both",
      icon: "󱏐",
      label: "Keyboard + Screen",
      description: "Lock keys and the touchscreen. Mouse stays on."
    }
  ]
}

function menuRows(locked, mode) {
  var rows = []
  var current = normalizeMode(mode)
  if (locked === true) {
    rows.push({
      value: "unlock",
      icon: "󰌾",
      label: "Unlock",
      description: "Stop cleaning. Keys and screen work again.",
      kind: "unlock",
      active: false
    })
  }

  var choices = modeChoices()
  for (var i = 0; i < choices.length; i++) {
    var active = locked === true && choices[i].value === current
    rows.push({
      value: choices[i].value,
      icon: choices[i].icon,
      label: choices[i].label,
      description: active ? "On now." : choices[i].description,
      kind: "mode",
      active: active
    })
  }
  return rows
}

function statusLabel(locked, mode, elapsed) {
  if (!locked) return "Off"
  return "On · " + modeLabel(mode) + " · " + String(elapsed || "0:00")
}

function tooltipFor(locked, elapsedMs, mode) {
  if (!locked) return "Clean Keyboard or Screen"
  return "Cleaning " + modeLabel(mode) + " · " + formatElapsed(elapsedMs) + " · click for Unlock"
}

if (typeof module !== "undefined") {
  module.exports = {
    DEVICE_NAME_RE: DEVICE_NAME_RE,
    MODES: MODES,
    NEVER_LOCK_RE: NEVER_LOCK_RE,
    buildState: buildState,
    clampTimeoutSeconds: clampTimeoutSeconds,
    emptyLockError: emptyLockError,
    formatElapsed: formatElapsed,
    hasUnlockPointer: hasUnlockPointer,
    isNeverLockKeyboard: isNeverLockKeyboard,
    isSafeDeviceName: isSafeDeviceName,
    lockableKeyboardNames: lockableKeyboardNames,
    lockableNames: lockableNames,
    lockableTouchNames: lockableTouchNames,
    luaDeviceEnabled: luaDeviceEnabled,
    menuRows: menuRows,
    modeChoices: modeChoices,
    modeLabel: modeLabel,
    statusLabel: statusLabel,
    mouseNames: mouseNames,
    newlyLockableNames: newlyLockableNames,
    normalizeMode: normalizeMode,
    parseDevicesJson: parseDevicesJson,
    parseState: parseState,
    pointerNameSet: pointerNameSet,
    tooltipFor: tooltipFor
  }
}
