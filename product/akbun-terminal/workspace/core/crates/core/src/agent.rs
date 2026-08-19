//! Judging what the CLI agent in a workspace is doing.
//!
//! Two layers, because neither answers on its own. The process list says which
//! agent is running at all; only the screen distinguishes "still working" from
//! "waiting for an answer" from "finished". Both halves are needed, and the
//! second one is where the guessing is, so the phrases it looks for are data
//! rather than code: one JSON file per agent in a directory the user can add to.
//! Agents reword their own output every release, and nobody should have to
//! rebuild this app to follow a wording change.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;

use crate::tree::WorkspaceStatus;

/// The rules for one agent. The phrase lists are optional, so a file can start
/// with the one phrase its author is sure about; `processes` is not, because it
/// is what decides whether the rule is consulted.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Rule {
    pub name: String,
    /// Process names that mean this agent is present. Matched against the whole
    /// process tree under the shell, not just the shell itself.
    ///
    /// This is the one list a rule cannot leave out. It is what decides whether
    /// the rule applies at all, so a file without it never colours anything;
    /// phrases alone would be matched in every workspace, including the ones
    /// running no agent.
    pub processes: Vec<String>,
    /// On screen while the agent is waiting for the user to answer.
    #[serde(default)]
    pub asking: Vec<String>,
    /// On screen while the agent is working.
    #[serde(default)]
    pub running: Vec<String>,
    /// On screen once it has stopped working and is idle again.
    #[serde(default)]
    pub done: Vec<String>,
}

/// The files this build ships. They are written into the rules directory the
/// first time it is used, so the shipped rules are also the worked example for
/// anyone adding a fourth agent.
const BUILT_IN: [(&str, &str); 3] = [
    ("claude.json", include_str!("../rules/claude.json")),
    ("codex.json", include_str!("../rules/codex.json")),
    ("gemini.json", include_str!("../rules/gemini.json")),
];

/// Reads every rule file in `directory`, seeding it with the shipped ones when
/// it holds none. A file that will not parse is skipped rather than fatal: one
/// bad edit should cost that agent's colours, not the app's start.
pub fn load(directory: &str) -> Result<Vec<Rule>, String> {
    let directory = PathBuf::from(directory);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut rules = read_rules(&directory)?;
    if rules.is_empty() {
        for (name, body) in BUILT_IN {
            fs::write(directory.join(name), body).map_err(|error| error.to_string())?;
        }
        rules = read_rules(&directory)?;
    }
    Ok(rules)
}

fn read_rules(directory: &Path) -> Result<Vec<Rule>, String> {
    let mut files: Vec<PathBuf> = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|suffix| suffix == "json"))
        .collect();
    files.sort();
    Ok(files
        .iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .filter_map(|body| serde_json::from_str::<Rule>(&body).ok())
        .collect())
}

/// One workspace's judgement, given the rules, the process names running under
/// its shells and what those shells have on screen.
///
/// Red beats orange: a person who has not answered blocks everything, while a
/// running agent needs nothing from anyone. Green is a transition rather than a
/// state on screen — it means work that was running has stopped and nobody has
/// looked yet — so it is only reachable from running or asking, and it is what
/// `clear` takes away once the workspace is opened.
pub fn judge(
    rules: &[Rule],
    processes: &[String],
    screen: &str,
    previous: WorkspaceStatus,
) -> WorkspaceStatus {
    let active: Vec<&Rule> = rules
        .iter()
        .filter(|rule| rule.processes.iter().any(|name| processes.contains(name)))
        .collect();

    if active.iter().any(|rule| matches(&rule.asking, screen)) {
        return WorkspaceStatus::NeedsAttention;
    }
    if active.iter().any(|rule| matches(&rule.running, screen)) {
        return WorkspaceStatus::Running;
    }
    let was_working = matches!(
        previous,
        WorkspaceStatus::Running | WorkspaceStatus::NeedsAttention
    );
    if was_working {
        // Either the agent said it is idle again or it left altogether. Without
        // one of those two the previous state is held, because a running marker
        // can be missing for the single frame an agent takes to redraw itself.
        let finished = active.iter().any(|rule| matches(&rule.done, screen)) || active.is_empty();
        return if finished {
            WorkspaceStatus::Completed
        } else {
            previous
        };
    }
    if previous == WorkspaceStatus::Completed {
        return WorkspaceStatus::Completed;
    }
    WorkspaceStatus::Idle
}

fn matches(phrases: &[String], screen: &str) -> bool {
    phrases.iter().any(|phrase| screen.contains(phrase.as_str()))
}

/// Every process name in the tree under `root`, including `root` itself.
///
/// An agent is rarely the shell's own child: it is started through a version
/// manager, a wrapper script or another terminal multiplexer, so only the whole
/// subtree answers the question.
// ponytail: one `ps` per detection tick, walked in memory. A libproc call per
// process would be cheaper if the tick ever gets faster than a second.
pub fn descendant_names(root: u32, snapshot: &[(u32, u32, String)]) -> Vec<String> {
    let mut children: HashMap<u32, Vec<usize>> = HashMap::new();
    let mut named: HashMap<u32, &str> = HashMap::new();
    for (index, (pid, parent, name)) in snapshot.iter().enumerate() {
        children.entry(*parent).or_default().push(index);
        named.insert(*pid, name.as_str());
    }
    let mut names = Vec::new();
    let mut pending = vec![root];
    while let Some(pid) = pending.pop() {
        if let Some(name) = named.get(&pid) {
            names.push(name.to_string());
        }
        for index in children.get(&pid).into_iter().flatten() {
            pending.push(snapshot[*index].0);
        }
    }
    names
}

/// pid, parent pid and command name for every process on the machine.
pub fn process_snapshot() -> Vec<(u32, u32, String)> {
    let Ok(output) = Command::new("ps").args(["-axo", "pid=,ppid=,comm="]).output() else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_process_line)
        .collect()
}

fn parse_process_line(line: &str) -> Option<(u32, u32, String)> {
    let mut fields = line.split_whitespace();
    let pid = fields.next()?.parse().ok()?;
    let parent = fields.next()?.parse().ok()?;
    // `comm` is a path when the binary was launched by one, and the last
    // component is the name a rule file would be written against.
    let command = fields.next()?.rsplit('/').next()?.to_string();
    Some((pid, parent, command))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> Vec<Rule> {
        vec![Rule {
            name: "Test Agent".to_string(),
            processes: vec!["agent".to_string()],
            asking: vec!["Do you want to".to_string()],
            running: vec!["esc to interrupt".to_string()],
            done: vec!["? for shortcuts".to_string()],
        }]
    }

    fn running() -> Vec<String> {
        vec!["zsh".to_string(), "agent".to_string()]
    }

    #[test]
    fn no_agent_in_the_tree_means_no_colour() {
        let status = judge(
            &rules(),
            &["zsh".to_string()],
            "esc to interrupt",
            WorkspaceStatus::Idle,
        );
        assert_eq!(status, WorkspaceStatus::Idle);
    }

    #[test]
    fn asking_wins_over_running() {
        // Both phrases are on screen at once, which is the normal case: the
        // agent keeps its status line while it puts a question above it.
        let screen = "Do you want to proceed?\nesc to interrupt";
        let status = judge(&rules(), &running(), screen, WorkspaceStatus::Running);
        assert_eq!(status, WorkspaceStatus::NeedsAttention);
    }

    #[test]
    fn finishing_is_a_transition_out_of_work() {
        let idle = "? for shortcuts";
        // Nothing was running, so an idle prompt is not something to report.
        assert_eq!(
            judge(&rules(), &running(), idle, WorkspaceStatus::Idle),
            WorkspaceStatus::Idle
        );
        // After work, the same screen is the finish.
        assert_eq!(
            judge(&rules(), &running(), idle, WorkspaceStatus::Running),
            WorkspaceStatus::Completed
        );
        // And it stays until somebody looks.
        assert_eq!(
            judge(&rules(), &running(), idle, WorkspaceStatus::Completed),
            WorkspaceStatus::Completed
        );
    }

    #[test]
    fn a_missing_marker_for_one_frame_does_not_finish_the_work() {
        let redrawing = "";
        assert_eq!(
            judge(&rules(), &running(), redrawing, WorkspaceStatus::Running),
            WorkspaceStatus::Running
        );
        // The agent leaving is a finish even without the idle phrase.
        assert_eq!(
            judge(
                &rules(),
                &["zsh".to_string()],
                redrawing,
                WorkspaceStatus::Running
            ),
            WorkspaceStatus::Completed
        );
    }

    #[test]
    fn walks_the_tree_rather_than_the_direct_child() {
        let snapshot = vec![
            (1, 0, "launchd".to_string()),
            (10, 1, "zsh".to_string()),
            (11, 10, "mise".to_string()),
            (12, 11, "agent".to_string()),
            (20, 1, "other".to_string()),
        ];
        let names = descendant_names(10, &snapshot);
        assert!(names.contains(&"agent".to_string()), "{names:?}");
        assert!(!names.contains(&"other".to_string()), "{names:?}");
    }

    #[test]
    fn reads_a_rule_file_and_seeds_the_shipped_ones() {
        let directory = std::env::temp_dir().join(format!(
            "akbun-terminal-rules-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
        ));
        let path = directory.to_string_lossy().to_string();
        let seeded = load(&path).unwrap();
        assert_eq!(seeded.len(), BUILT_IN.len());

        fs::write(directory.join("mine.json"), r#"{"name":"Mine","processes":["mine"]}"#).unwrap();
        let extended = load(&path).unwrap();
        assert_eq!(extended.len(), BUILT_IN.len() + 1);
        assert!(extended.iter().any(|rule| rule.name == "Mine"));

        // A file that will not parse costs its own agent and nothing else, and
        // one without the list that decides when it applies does not parse.
        fs::write(directory.join("broken.json"), "{").unwrap();
        fs::write(directory.join("no-process.json"), r#"{"name":"X","done":["idle"]}"#).unwrap();
        assert_eq!(load(&path).unwrap().len(), BUILT_IN.len() + 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reads_a_process_line_the_way_ps_prints_it() {
        assert_eq!(
            parse_process_line("  501  1 /usr/bin/zsh"),
            Some((501, 1, "zsh".to_string()))
        );
        assert_eq!(parse_process_line(""), None);
    }
}
