import Testing

@testable import AkbunTerminalCore

/// The tab arrangement has no window in it, so the rule that decides what is on
/// screen after a close is checked here rather than by clicking.
struct TerminalTabsTests {
  @Test func tabsBelongToOneWorkspaceAtATime() {
    var tabs = TerminalTabs()
    tabs.add(session: 1, to: 10)
    tabs.add(session: 2, to: 20)

    #expect(tabs.tabs(in: 10).compactMap(\.session) == [1])
    #expect(tabs.tabs(in: 20).compactMap(\.session) == [2])
    // Each workspace remembers its own tab, so switching back does not reset it.
    #expect(tabs.activeSession(in: 10) == 1)
    #expect(tabs.activeSession(in: 20) == 2)
    #expect(tabs.workspace(of: 2) == 20)
    #expect(tabs.allSessions.sorted() == [1, 2])
  }

  @Test func closingTheActiveTabShowsWhateverTakesItsPlace() {
    var tabs = TerminalTabs()
    [1, 2, 3].forEach { tabs.add(session: UInt32($0), to: 10) }
    #expect(tabs.activeSession(in: 10) == 3)

    tabs.select(.shell(session: 2), in: 10)
    tabs.close(.shell(session: 2), in: 10)
    #expect(tabs.activeSession(in: 10) == 3)

    // The rightmost tab has nothing after it, so the strip falls back leftwards.
    tabs.close(.shell(session: 3), in: 10)
    #expect(tabs.activeSession(in: 10) == 1)

    tabs.close(.shell(session: 1), in: 10)
    #expect(tabs.tabs(in: 10).isEmpty)
    #expect(tabs.active(in: 10) == nil)
  }

  @Test func closingAnInactiveTabLeavesTheActiveOneAlone() {
    var tabs = TerminalTabs()
    [1, 2].forEach { tabs.add(session: UInt32($0), to: 10) }
    tabs.close(.shell(session: 1), in: 10)
    #expect(tabs.activeSession(in: 10) == 2)
  }

  @Test func documentsShareTheStripWithShells() {
    var tabs = TerminalTabs()
    tabs.add(session: 1, to: 10)
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)

    #expect(tabs.tabs(in: 10).map(\.content) == [.shell(session: 1), .document(path: "/p/README.md")])
    #expect(tabs.active(in: 10) == .document(path: "/p/README.md"))
    // A document is not a session, so shutdown has nothing to close for it.
    #expect(tabs.allSessions == [1])
    #expect(tabs.activeSession(in: 10) == nil)
  }

  @Test func openingAnOpenDocumentMovesToItInsteadOfDuplicatingIt() {
    var tabs = TerminalTabs()
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)
    tabs.add(session: 1, to: 10)
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)

    #expect(tabs.tabs(in: 10).count == 2)
    #expect(tabs.active(in: 10) == .document(path: "/p/README.md"))
  }

  @Test func theSameDocumentInTwoWorkspacesIsTwoTabs() {
    var tabs = TerminalTabs()
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)
    tabs.add(document: "/p/README.md", title: "README.md", to: 20)

    // Closing one leaves the other alone: the path alone cannot say which
    // workspace was meant, so the caller says.
    tabs.close(.document(path: "/p/README.md"), in: 20)
    #expect(tabs.tabs(in: 10).count == 1)
    #expect(tabs.tabs(in: 20).isEmpty)
  }

  @Test func aDeletedWorkspaceTakesItsTabsAndNamesItsShells() {
    var tabs = TerminalTabs()
    tabs.add(session: 1, to: 10)
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)
    tabs.add(session: 2, to: 20)

    // The sessions come back because the core still has to be told to end them.
    #expect(tabs.removeWorkspace(10) == [1])
    #expect(tabs.tabs(in: 10).isEmpty)
    #expect(tabs.active(in: 10) == nil)
    #expect(tabs.tabs(in: 20).count == 1)
    #expect(tabs.removeWorkspace(999).isEmpty)
  }

  @Test func shellsAreNumberedWithoutCountingDocuments() {
    var tabs = TerminalTabs()
    tabs.add(session: 1, to: 10)
    tabs.add(document: "/p/README.md", title: "README.md", to: 10)
    tabs.add(session: 2, to: 10)

    #expect(tabs.tabs(in: 10).map(\.title) == ["Shell 1", "README.md", "Shell 2"])
  }
}
