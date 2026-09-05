import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import "StayCleanModel.js" as Model

Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string pluginId: (manifest && manifest.id) ? String(manifest.id) : "io.github.martlets.stay-clean"
  readonly property string pluginDir: manifest && manifest.__sourceDir ? String(manifest.__sourceDir) : ""
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR")
  readonly property string statePath: runtimeDir ? runtimeDir + "/omarchy-stay-clean.lock.json" : ""
  readonly property string watchdogPath: pluginDir ? pluginDir + "/watchdog.py" : ""
  readonly property int timeoutSeconds: 2700

  property bool locked: false
  property bool busy: false
  property string phase: "idle"
  property string mode: "both"
  property var lockedDevices: []
  property int generation: 0
  property int shellPid: 0
  property double lockedAtMs: 0
  property string elapsedLabel: "0:00"
  property string lastError: ""
  property string lastEvent: "init"
  property var pendingEvals: []
  property bool pendingUnlock: false

  function logEvent(event) {
    root.lastEvent = event
    console.log("stay-clean " + event)
  }

  function statusJson() {
    return JSON.stringify({
      locked: root.locked,
      busy: root.busy,
      phase: root.phase,
      mode: root.mode,
      elapsed: root.elapsedLabel,
      devices: root.lockedDevices,
      error: root.lastError,
      lastEvent: root.lastEvent
    })
  }

  function setError(message) {
    root.lastError = String(message || "")
    if (root.lastError) logEvent("error " + root.lastError)
  }

  function writeState(locked) {
    if (!statePath || !stateFile.path) return
    var payload = Model.buildState({
      locked: locked === true,
      mode: root.mode,
      generation: root.generation,
      pid: root.shellPid,
      startedAt: new Date().toISOString(),
      devices: root.lockedDevices
    })
    stateFile.setText(JSON.stringify(payload) + "\n")
  }

  function clearState() {
    if (clearStateProc.running || !root.statePath) return
    clearStateProc.command = ["rm", "-f", "--", root.statePath]
    clearStateProc.running = true
  }

  function enqueueEval(lua) {
    if (!lua) return
    var next = root.pendingEvals.slice()
    next.push(lua)
    root.pendingEvals = next
    pumpEval()
  }

  function pumpEval() {
    if (evalProc.running) return
    if (root.pendingEvals.length === 0) {
      onEvalQueueDrained()
      return
    }
    var next = root.pendingEvals.slice()
    var lua = next.shift()
    root.pendingEvals = next
    evalProc.command = ["hyprctl", "eval", lua]
    evalProc.running = true
  }

  function setDevicesEnabled(names, enabled) {
    for (var i = 0; i < names.length; i++) {
      enqueueEval(Model.luaDeviceEnabled(names[i], enabled))
    }
    if (!evalProc.running) pumpEval()
  }

  function onEvalQueueDrained() {
    if (root.phase === "locking") finishLock()
    else if (root.phase === "unlocking") finishUnlock()
    else if (root.phase === "relock") finishRelock()
  }

  function startLock(mode) {
    if (root.locked || root.busy) return "busy"
    if (!root.runtimeDir) {
      setError("XDG_RUNTIME_DIR is missing")
      return "error"
    }

    root.mode = Model.normalizeMode(mode)
    root.busy = true
    root.phase = "locking"
    root.pendingUnlock = false
    root.lockedDevices = []
    setError("")
    logEvent("lock-start " + root.mode)
    if (!devicesProc.running) devicesProc.running = true
    return "locking"
  }

  function onDevicesJson(text) {
    var devices = Model.parseDevicesJson(text)
    if (root.phase === "relock") {
      applyRelock(devices)
      return
    }
    if (root.phase !== "locking") return

    var names = Model.lockableNames(devices, root.mode)
    if (names.length === 0) {
      root.busy = false
      root.phase = "idle"
      setError(Model.emptyLockError(root.mode, devices))
      return
    }

    root.generation += 1
    root.lockedDevices = names
    setDevicesEnabled(names, false)
  }

  function finishLock() {
    if (root.pendingUnlock) {
      logEvent("lock-cancelled")
      root.phase = "unlocking"
      setDevicesEnabled(root.lockedDevices, true)
      return
    }

    root.locked = true
    root.busy = false
    root.phase = "locked"
    root.lockedAtMs = Date.now()
    root.elapsedLabel = "0:00"
    writeState(true)
    watchdogStartTimer.restart()
    logEvent("locked " + root.lockedDevices.length + " " + root.mode)
  }

  function startUnlock(reason) {
    if (!root.locked && root.phase !== "locking") return "unlocked"
    if (root.phase === "locking") {
      root.pendingUnlock = true
      logEvent("unlock-queued " + (reason || "requested"))
      return "queued"
    }
    if (root.busy && root.phase === "unlocking") return "busy"

    root.busy = true
    root.phase = "unlocking"
    logEvent("unlock-start " + (reason || "requested"))
    setDevicesEnabled(root.lockedDevices, true)
    if (!evalProc.running && root.pendingEvals.length === 0) finishUnlock()
    return "unlocking"
  }

  function finishUnlock() {
    root.locked = false
    root.busy = false
    root.phase = "idle"
    root.lockedDevices = []
    root.pendingUnlock = false
    root.elapsedLabel = "0:00"
    clearState()
    logEvent("unlocked")
  }

  function applyRelock(devices) {
    var extra = Model.newlyLockableNames(devices, root.lockedDevices, root.mode)
    if (extra.length === 0) {
      root.phase = "locked"
      root.busy = false
      return
    }
    root.lockedDevices = root.lockedDevices.concat(extra)
    writeState(true)
    setDevicesEnabled(extra, false)
  }

  function finishRelock() {
    root.phase = "locked"
    root.busy = false
    logEvent("relocked-new-devices")
  }

  function scanForNewKeyboards() {
    if (!root.locked || root.busy || devicesProc.running) return
    root.phase = "relock"
    root.busy = true
    devicesProc.running = true
  }

  function spawnWatchdog() {
    if (!root.locked || !root.watchdogPath || !root.statePath || root.shellPid <= 1) {
      logEvent("watchdog-skip")
      return
    }
    Quickshell.execDetached([
      "python3", root.watchdogPath,
      "--pid", String(root.shellPid),
      "--state", root.statePath,
      "--generation", String(root.generation),
      "--timeout", String(root.timeoutSeconds)
    ])
    logEvent("watchdog-spawned")
  }

  function toggle() {
    if (root.locked || root.phase === "locking") return startUnlock("toggle")
    return startLock(root.mode || "both")
  }

  function recoverOrphanedLock() {
    if (!root.statePath || recoverProc.running) return
    recoverProc.running = true
  }

  function onRecoveredState(text) {
    var state = Model.parseState(text)
    if (!state || state.locked !== true) return
    logEvent("recover-orphan")
    root.lockedDevices = state.devices
    root.mode = state.mode || "both"
    root.generation = Math.max(root.generation, state.generation)
    root.phase = "unlocking"
    root.busy = true
    setDevicesEnabled(state.devices, true)
    if (!evalProc.running && root.pendingEvals.length === 0) finishUnlock()
  }

  Process {
    id: pidProc
    command: ["python3", "-c", "import os; print(os.getppid())"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var pid = parseInt(String(text || "").trim(), 10)
        if (isFinite(pid) && pid > 1) root.shellPid = pid
      }
    }
  }

  Process {
    id: devicesProc
    command: ["hyprctl", "-j", "devices"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.onDevicesJson(text)
    }
    onExited: function(exitCode) {
      if (exitCode === 0) return
      if (root.phase === "locking") {
        root.busy = false
        root.phase = "idle"
        setError("hyprctl devices failed")
      } else if (root.phase === "relock") {
        root.busy = false
        root.phase = "locked"
      }
    }
  }

  Process {
    id: evalProc
    onExited: function(exitCode) {
      if (exitCode !== 0) setError("hyprctl eval failed")
      root.pumpEval()
    }
  }

  Process {
    id: clearStateProc
  }

  Process {
    id: recoverProc
    command: ["cat", "--", root.statePath]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.onRecoveredState(text)
    }
  }

  Process {
    id: inhibitProc
    running: root.locked
    command: ["systemd-inhibit", "--what=idle:sleep", "--who=Stay Clean", "--why=Cleaning input devices", "--mode=block", "sleep", "infinity"]
  }

  FileView {
    id: stateFile
    path: root.statePath
    atomicWrites: true
    printErrors: false
  }

  Timer {
    id: watchdogStartTimer
    interval: 150
    repeat: false
    onTriggered: root.spawnWatchdog()
  }

  Timer {
    id: elapsedTimer
    interval: 1000
    repeat: true
    running: root.locked
    onTriggered: root.elapsedLabel = Model.formatElapsed(Date.now() - root.lockedAtMs)
  }

  Timer {
    id: hotplugTimer
    interval: 4000
    repeat: true
    running: root.locked && !root.busy
    onTriggered: root.scanForNewKeyboards()
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (!event || !event.name) return
      if (String(event.name) !== "configreloaded") return
      if (!root.locked || root.busy) return
      logEvent("configreloaded-reapply")
      root.phase = "relock"
      root.busy = true
      setDevicesEnabled(root.lockedDevices, false)
    }
  }

  IpcHandler {
    target: "io.github.martlets.stay-clean"

    function status(): string {
      return root.statusJson()
    }

    function lock(): string {
      return root.startLock("both")
    }

    function lockKeyboard(): string {
      return root.startLock("keyboard")
    }

    function lockTouch(): string {
      return root.startLock("touch")
    }

    function lockBoth(): string {
      return root.startLock("both")
    }

    function unlock(): string {
      return root.startUnlock("ipc")
    }

    function toggle(): string {
      return root.toggle()
    }
  }

  Component.onCompleted: {
    pidProc.running = true
    recoverOrphanedLock()
    logEvent("service-ready")
  }

  Component.onDestruction: {
    if (root.locked || root.phase === "locking" || root.phase === "unlocking") {
      var names = root.lockedDevices
      for (var i = 0; i < names.length; i++) {
        var lua = Model.luaDeviceEnabled(names[i], true)
        if (lua) Quickshell.execDetached(["hyprctl", "eval", lua])
      }
      if (root.statePath) Quickshell.execDetached(["rm", "-f", "--", root.statePath])
    }
  }
}
