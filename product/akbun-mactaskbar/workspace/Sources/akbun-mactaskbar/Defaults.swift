import Foundation
import MacTaskbarCore

/// The handful of things worth remembering between launches.
@MainActor
enum Defaults {
  private static let store = UserDefaults.standard

  private enum Key {
    static let section = "section"
    static let autoCollapseSeconds = "autoCollapseSeconds"
  }

  /// Reopening in the section the user left means the bar looks the same after a
  /// restart as it did before one.
  static var section: Section {
    get { Section(rawValue: store.string(forKey: Key.section) ?? "") ?? .collapsed }
    set { store.set(newValue.rawValue, forKey: Key.section) }
  }

  /// Seconds before a revealed section folds itself back up. Zero turns it off.
  static var autoCollapseSeconds: TimeInterval {
    get {
      guard store.object(forKey: Key.autoCollapseSeconds) != nil else { return 15 }
      return store.double(forKey: Key.autoCollapseSeconds)
    }
    set { store.set(newValue, forKey: Key.autoCollapseSeconds) }
  }
}
