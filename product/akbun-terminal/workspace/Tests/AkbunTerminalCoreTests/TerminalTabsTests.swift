import Testing

@testable import AkbunTerminalCore

/// The tab arrangement has no window in it, so the rule that decides what is on
/// screen after a close is checked here rather than by clicking.
struct TerminalTabsTests {
  @Test func tabsBelongToOneWorkspaceAtATime() {
    var tabs = TerminalTabs()
    tabs.add(session: 1, to: 10)
    tabs.add(session: 2, to: 20)

    #expect(tabs.tabs(in: 10).map(\.session) == [1])
    #expect(tabs.tabs(in: 20).map(\.session) == [2])
    // Each workspace remembers its own tab, so switching back does not reset it.
    #expect(tabs.activeSession(in: 10) == 1)
    #expect(tabs.activeSession(in: 20) == 2)
    #expect(tabs.workspace(of: 2) == 20)
    #expect(tabs.allSessions.sorted() == [1, 2])
  }

  @Test func closingTheActiveTabShowsWhateverTakesItsPlace() {
    var tabs = TerminalTabs()
    [1, 2, 3].forEach { tabs.add(session: $0, to: 10) }
    #expect(tabs.activeSession(in: 10) == 3)

    tabs.select(session: 2, in: 10)
    tabs.close(session: 2)
    #expect(tabs.activeSession(in: 10) == 3)

    // The rightmost tab has nothing after it, so the strip falls back leftwards.
    tabs.close(session: 3)
    #expect(tabs.activeSession(in: 10) == 1)

    tabs.close(session: 1)
    #expect(tabs.tabs(in: 10).isEmpty)
    #expect(tabs.activeSession(in: 10) == nil)
  }

  @Test func closingAnInactiveTabLeavesTheActiveOneAlone() {
    var tabs = TerminalTabs()
    [1, 2].forEach { tabs.add(session: $0, to: 10) }
    tabs.close(session: 1)
    #expect(tabs.activeSession(in: 10) == 2)
  }
}
