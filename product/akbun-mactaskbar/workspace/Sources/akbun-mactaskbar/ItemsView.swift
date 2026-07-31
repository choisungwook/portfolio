import MacTaskbarCore
import SwiftUI

/// The item list window. It doubles as the way in when the control icon cannot
/// be drawn, so every action the icon offers is also here.
struct ItemsView: View {
  @Bindable var model: ItemsModel

  var body: some View {
    VStack(spacing: 0) {
      controls
      Divider()
      if !model.isTrusted {
        notice(
          "Accessibility permission is needed to read the bar",
          detail: "macOS exposes other apps' status items only through the accessibility API.",
          action: ("Open Settings", model.requestTrust)
        )
      } else if model.controlIsHidden {
        notice(
          "The control icon is behind the camera housing",
          detail:
            "macOS puts a new status item in the leftmost slot, and this bar has no room left. "
            + "Use \(model.hotkey.label) or this window to cycle sections. "
            + "To get the icon back, free up room to the right of the housing and drag it there with Command held.",
          action: nil
        )
      }
      list
    }
    .frame(minWidth: 460, minHeight: 520)
  }

  private var controls: some View {
    VStack(spacing: 10) {
      HStack {
        Button(action: model.cycle) {
          Text("Section: \(model.section.rawValue)")
            .frame(maxWidth: .infinity)
        }
        .keyboardShortcut(.space, modifiers: [])

        Button("Rescan") {
          Task { await model.rescan() }
        }
        .disabled(model.isScanning)
      }

      HStack {
        Text("Fold back after")
        Picker("", selection: $model.autoCollapseSeconds) {
          Text("never").tag(0.0)
          Text("5s").tag(5.0)
          Text("15s").tag(15.0)
          Text("60s").tag(60.0)
        }
        .labelsHidden()
        .frame(width: 90)

        Spacer()

        Text("Shortcut")
        Picker("", selection: $model.hotkey) {
          ForEach(Hotkey.choices) { choice in
            Text(choice.label).tag(choice)
          }
        }
        .labelsHidden()
        .frame(width: 90)
        .help("Cycles sections from anywhere. Pick another if it clashes with an app you use.")
      }

      TextField("Filter by app or label", text: $model.query)
        .textFieldStyle(.roundedBorder)
    }
    .padding(12)
  }

  private var list: some View {
    List(model.filtered) { item in
      HStack {
        Text(item.label == item.app ? item.app : "\(item.app) — \(item.label)")
          .foregroundStyle(item.visible ? .primary : .secondary)
        Spacer()
        Text(item.visible ? "x \(Int(item.x))" : "off screen")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    }
    .overlay {
      if model.isScanning && model.items.isEmpty {
        ProgressView("Scanning…")
      }
    }
    .safeAreaInset(edge: .bottom) {
      Text("\(model.filtered.count) of \(model.items.count) items, \(model.hiddenCount) off screen")
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(6)
    }
  }

  private func notice(
    _ title: String,
    detail: String,
    action: (title: String, run: () -> Void)?
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Label(title, systemImage: "exclamationmark.triangle")
        .font(.headline)
      Text(detail)
        .font(.callout)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      if let action {
        Button(action.title, action: action.run)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(.quaternary)
  }
}
