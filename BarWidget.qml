import QtQuick
import qs.Ui
import qs.Commons

BarWidget {
  id: root
  moduleName: "io.github.martlets.keyboard-clean"

  readonly property var cleanService: bar && bar.shell && bar.shell.serviceFor
    ? bar.shell.serviceFor(root.moduleName)
    : null
  readonly property bool locked: cleanService ? cleanService.locked === true : false
  readonly property string elapsedLabel: cleanService && cleanService.elapsedLabel ? cleanService.elapsedLabel : "0:00"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰌐"
    active: root.locked
    dimmed: !root.locked
    useActiveColor: false
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: root.locked
      ? "Unlock Keyboard · locked " + root.elapsedLabel
      : "Lock Keyboard to Clean"
    onPressed: function() {
      if (root.cleanService && typeof root.cleanService.toggle === "function")
        root.cleanService.toggle()
    }
  }
}
