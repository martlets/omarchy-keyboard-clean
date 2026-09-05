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
  readonly property var choices: Model.modeChoices()
  property int cursorIndex: 0

  function open() {
    root.cursorIndex = 0
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
    var count = root.choices.length
    if (count === 0) return
    root.cursorIndex = (root.cursorIndex + dy + count) % count
  }

  function activateIndex(index) {
    if (index < 0 || index >= root.choices.length) return
    var choice = root.choices[index]
    root.close()
    if (root.cleanService && typeof root.cleanService.startLock === "function")
      root.cleanService.startLock(choice.value)
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(280))
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
          text: "CLEAN"
          color: Qt.darker(root.barForeground, 1.4)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
          font.bold: true
          font.letterSpacing: 1.4
        }

        Repeater {
          model: root.choices

          CursorSurface {
            required property var modelData
            required property int index
            width: content.width
            implicitHeight: row.implicitHeight + Style.space(10)
            foreground: root.barForeground
            hasCursor: root.cursorIndex === index

            HoverHandler {
              onHoveredChanged: if (hovered) root.cursorIndex = index
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
                color: root.barForeground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
                anchors.verticalCenter: parent.verticalCenter
              }

              Column {
                width: parent.width - parent.spacing - 28
                spacing: Style.space(1)
                anchors.verticalCenter: parent.verticalCenter

                Text {
                  width: parent.width
                  text: modelData.label
                  color: root.barForeground
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.body
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
            }
          }
        }
      }
    }
  }
}
