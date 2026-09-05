import QtQuick
import qs.Commons
import qs.Ui
import "KeyboardCleanModel.js" as Model

Panel {
  id: root
  moduleName: "io.github.martlets.keyboard-clean"
  ipcTarget: "io.github.martlets.keyboard-clean"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property var cleanService: hostWidget && hostWidget.cleanService
    ? hostWidget.cleanService
    : (bar && bar.shell && bar.shell.serviceFor
      ? bar.shell.serviceFor(root.moduleName)
      : null)
  readonly property bool locked: cleanService ? cleanService.locked === true : false
  readonly property string mode: cleanService && cleanService.mode ? cleanService.mode : "both"
  readonly property string elapsedLabel: cleanService && cleanService.elapsedLabel ? cleanService.elapsedLabel : "0:00"
  readonly property var rows: Model.menuRows(root.locked, root.mode)
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  property int cursorIndex: 0
  property bool cursorActive: false

  function open() {
    root.cursorIndex = 0
    root.cursorActive = false
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function moveCursor(dy) {
    var count = root.rows.length
    if (count === 0) return
    if (!root.cursorActive) {
      root.cursorActive = true
      root.cursorIndex = dy < 0 ? count - 1 : 0
      return
    }
    root.cursorIndex = (root.cursorIndex + dy + count) % count
  }

  function activateIndex(index) {
    if (index < 0 || index >= root.rows.length) return
    var row = root.rows[index]
    root.close()
    if (!root.cleanService) return
    if (row.value === "unlock" || (row.active === true && row.kind === "mode")) {
      if (typeof root.cleanService.startUnlock === "function")
        root.cleanService.startUnlock("menu")
      return
    }
    if (typeof root.cleanService.startLock === "function")
      root.cleanService.startLock(row.value)
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: root.activateIndex(root.cursorIndex)

      Column {
        id: content
        width: parent.width
        spacing: Style.space(4)

        Text {
          width: parent.width
          text: Model.statusLabel(root.locked, root.mode, root.elapsedLabel).toUpperCase()
          color: root.locked ? root.urgent : Qt.darker(root.barForeground, 1.4)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
          font.bold: true
          font.letterSpacing: 1.2
        }

        Repeater {
          model: root.rows

          CursorSurface {
            required property var modelData
            required property int index
            width: content.width
            implicitHeight: row.implicitHeight + Style.space(10)
            foreground: root.barForeground
            hasCursor: root.cursorActive && root.cursorIndex === index
            current: modelData.active === true

            HoverHandler {
              onHoveredChanged: {
                if (!hovered) return
                root.cursorActive = true
                root.cursorIndex = index
              }
            }

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.activateIndex(index)
            }

            Row {
              id: row
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(8)
              anchors.rightMargin: Style.space(8)
              spacing: Style.space(10)

              Text {
                text: modelData.icon
                color: modelData.kind === "unlock" ? root.urgent : root.barForeground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
                anchors.verticalCenter: parent.verticalCenter
              }

              Column {
                width: parent.width - parent.spacing - 28 - (onBadge.visible ? onBadge.width : 0)
                spacing: Style.space(1)
                anchors.verticalCenter: parent.verticalCenter

                Text {
                  width: parent.width
                  text: modelData.label
                  color: modelData.kind === "unlock" ? root.urgent : root.barForeground
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.body
                  font.bold: modelData.kind === "unlock" || modelData.active === true
                  elide: Text.ElideRight
                }

                Text {
                  width: parent.width
                  text: modelData.description
                  color: Qt.darker(root.barForeground, 1.45)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }

              Text {
                id: onBadge
                visible: modelData.active === true
                text: "ON"
                color: root.urgent
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.1
                anchors.verticalCenter: parent.verticalCenter
              }
            }
          }
        }
      }
    }
  }
}
