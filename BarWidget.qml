import QtQuick
import qs.Ui
import qs.Commons
import "KeyboardCleanModel.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.martlets.keyboard-clean"

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
    if (root.locked) return
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function togglePanel() {
    if (root.locked) {
      root.close()
      return
    }
    if (panelLoader.item) panelLoader.item.toggle()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onLockedChanged: if (locked) root.close()

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
    text: "󰠨"
    active: root.locked
    dimmed: !root.locked
    useActiveColor: false
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: root.locked
      ? "Unlock " + Model.modeLabel(root.mode) + " · locked " + root.elapsedLabel
      : "Clean Keyboard or Screen"
    onPressed: function() {
      if (root.locked) {
        root.close()
        if (root.cleanService && typeof root.cleanService.startUnlock === "function")
          root.cleanService.startUnlock("bar")
        return
      }
      root.togglePanel()
    }
  }
}
