import AppKit
import AkbunTerminalCore

@MainActor
final class GeneralSettingsWindowController: NSWindowController {
  var onChange: ((Double) -> Void)?
  private let slider = NSSlider()
  private let value = NSTextField(labelWithString: "")

  init(percent: Double) {
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 460, height: 220),
      styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "General"
    super.init(window: window)

    let title = NSTextField(labelWithString: "Panel size")
    title.font = .boldSystemFont(ofSize: 13)
    let detail = NSTextField(wrappingLabelWithString:
      "Adjust the project sidebar, file and Git panels, and tab bar.\n⌘ + / − changes only terminal and document content.")
    detail.textColor = .secondaryLabelColor
    slider.minValue = PanelSize.minimum
    slider.maxValue = PanelSize.maximum
    slider.doubleValue = percent
    slider.isContinuous = true
    slider.target = self
    slider.action = #selector(changeSize)
    slider.setAccessibilityLabel("Panel size")
    value.stringValue = "\(Int(percent))%"
    value.alignment = .right
    value.widthAnchor.constraint(equalToConstant: 48).isActive = true
    let sizeRow = NSStackView(views: [slider, value])
    sizeRow.spacing = 12
    let restore = NSButton(title: "Restore Default", target: self, action: #selector(restoreDefault))
    let done = NSButton(title: "Done", target: self, action: #selector(done))
    done.keyEquivalent = "\r"
    let buttons = NSStackView(views: [restore, NSView(), done])
    let stack = NSStackView(views: [title, detail, sizeRow, buttons])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 16
    stack.translatesAutoresizingMaskIntoConstraints = false
    window.contentView?.addSubview(stack)
    guard let content = window.contentView else { return }
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
      stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
      detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
      sizeRow.widthAnchor.constraint(equalTo: stack.widthAnchor),
      buttons.widthAnchor.constraint(equalTo: stack.widthAnchor),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  @objc private func changeSize() {
    let percent = slider.doubleValue.rounded()
    value.stringValue = "\(Int(percent))%"
    onChange?(percent)
  }

  @objc private func restoreDefault() {
    slider.doubleValue = 100
    changeSize()
  }

  @objc private func done() {
    guard let window else { return }
    window.sheetParent?.endSheet(window)
  }
}
