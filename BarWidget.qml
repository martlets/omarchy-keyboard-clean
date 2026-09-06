import QtQuick
import qs.Ui
import qs.Commons
import "StayCleanModel.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.martlets.stay-clean"

  readonly property var cleanService: bar && bar.shell && bar.shell.serviceFor
    ? bar.shell.serviceFor(root.moduleName)
    : null
  readonly property bool locked: cleanService ? cleanService.locked === true : false
  readonly property string elapsedLabel: cleanService && cleanService.elapsedLabel ? cleanService.elapsedLabel : "0:00"
  readonly property string mode: cleanService && cleanService.mode ? cleanService.mode : "both"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  property double lastLeftClickMs: 0

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󱏐"
    active: root.locked
    dimmed: !root.locked
    useActiveColor: true
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: root.locked
      ? "Cleaning " + Model.modeLabel(root.mode) + " · " + root.elapsedLabel
      : "Stay Clean"
    interactive: false
  }

  // Own the slot's clicks. A double-click on empty bar center toggles
  // bar transparency; this MouseArea must not let those events through.
  MouseArea {
    anchors.fill: button
    acceptedButtons: Qt.LeftButton
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onEntered: if (root.bar) root.bar.showTooltip(button, button.tooltipText)
    onExited: if (root.bar) root.bar.hideTooltip(button)
    onClicked: {
      var now = Date.now()
      if (now - root.lastLeftClickMs < 350) return
      root.lastLeftClickMs = now
      Qt.callLater(root.togglePanel)
    }
    onDoubleClicked: function(mouse) { mouse.accepted = true }
  }
}
