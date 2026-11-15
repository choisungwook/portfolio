use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_FILE: &str = "projects.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TreeState {
    pub schema_version: u32,
    pub projects: Vec<Project>,
    /// The chosen terminal theme, absent while it is the system appearance.
    /// Optional and skipped when empty, so a state file written by a build
    /// without themes still reads here and the wire shape does not change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    /// The keys a person moved off their defaults, by command id. Only the
    /// changed ones are stored, so a default this build changes later reaches
    /// everyone who never touched it. Skipped when empty for the same reason
    /// the theme is: a file written before this existed still reads.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub shortcuts: BTreeMap<String, String>,
    /// The highest id handed out so far, projects and workspaces together.
    ///
    /// Ids used to be the largest one in the tree plus one, which reuses the id
    /// of whatever was deleted last. Nothing in the file minded, but the running
    /// app keeps a status and a set of open tabs per workspace id, so a new
    /// workspace would inherit the colour and the tabs of the one it replaced.
    /// Skipped while it is zero, so a file written before this existed still
    /// reads and an empty tree still writes the same bytes.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub next_id: u64,
}

fn is_zero(value: &u64) -> bool {
    *value == 0
}

impl Default for TreeState {
    fn default() -> Self {
        Self {
            schema_version: STATE_SCHEMA_VERSION,
            projects: Vec::new(),
            theme: None,
            shortcuts: BTreeMap::new(),
            next_id: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub id: u64,
    pub name: String,
    pub path: Option<String>,
    pub workspaces: Vec<Workspace>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: u64,
    pub name: String,
    pub status: WorkspaceStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceStatus {
    Idle,
    Running,
    NeedsAttention,
    Completed,
    Failed,
}

#[derive(Default)]
pub struct TreeStore {
    directory: Option<PathBuf>,
    state: TreeState,
}

impl TreeStore {
    pub fn load(&mut self, directory: &str) -> Result<TreeState, String> {
        let directory = PathBuf::from(directory);
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let path = directory.join(STATE_FILE);
        let state = if path.exists() {
            let json = fs::read_to_string(&path).map_err(|error| error.to_string())?;
            let state: TreeState =
                serde_json::from_str(&json).map_err(|error| error.to_string())?;
            if state.schema_version != STATE_SCHEMA_VERSION {
                return Err(format!(
                    "unsupported state schema {}, this build reads {}",
                    state.schema_version, STATE_SCHEMA_VERSION
                ));
            }
            state
        } else {
            TreeState::default()
        };
        self.directory = Some(directory);
        self.state = state.clone();
        Ok(state)
    }

    pub fn create_project(
        &mut self,
        name: String,
        path: Option<String>,
    ) -> Result<TreeState, String> {
        let name = required_name(name, "project")?;
        let mut next = self.state.clone();
        let id = take_id(&mut next);
        next.projects.push(Project {
            id,
            name,
            path: path.filter(|value| !value.is_empty()),
            workspaces: Vec::new(),
        });
        self.commit(next)
    }

    pub fn create_workspace(&mut self, project: u64, name: String) -> Result<TreeState, String> {
        let name = required_name(name, "workspace")?;
        let mut next = self.state.clone();
        let id = take_id(&mut next);
        let Some(project) = next.projects.iter_mut().find(|item| item.id == project) else {
            return Err(format!("no project {project}"));
        };
        project.workspaces.push(Workspace {
            id,
            name,
            status: WorkspaceStatus::Idle,
        });
        self.commit(next)
    }

    pub fn rename_project(&mut self, project: u64, name: String) -> Result<TreeState, String> {
        let name = required_name(name, "project")?;
        let mut next = self.state.clone();
        let Some(found) = next.projects.iter_mut().find(|item| item.id == project) else {
            return Err(format!("no project {project}"));
        };
        found.name = name;
        self.commit(next)
    }

    /// Removes a project and the workspaces under it. The folder on disk is not
    /// touched: this tree is a list of places to open, and a list forgetting a
    /// place has never meant deleting it.
    pub fn delete_project(&mut self, project: u64) -> Result<TreeState, String> {
        let mut next = self.state.clone();
        let before = next.projects.len();
        next.projects.retain(|item| item.id != project);
        if next.projects.len() == before {
            return Err(format!("no project {project}"));
        }
        self.commit(next)
    }

    pub fn rename_workspace(&mut self, workspace: u64, name: String) -> Result<TreeState, String> {
        let name = required_name(name, "workspace")?;
        let mut next = self.state.clone();
        let Some(found) = next
            .projects
            .iter_mut()
            .flat_map(|project| project.workspaces.iter_mut())
            .find(|item| item.id == workspace)
        else {
            return Err(format!("no workspace {workspace}"));
        };
        found.name = name;
        self.commit(next)
    }

    pub fn delete_workspace(&mut self, workspace: u64) -> Result<TreeState, String> {
        let mut next = self.state.clone();
        let mut removed = false;
        for project in next.projects.iter_mut() {
            let before = project.workspaces.len();
            project.workspaces.retain(|item| item.id != workspace);
            removed = removed || project.workspaces.len() != before;
        }
        if !removed {
            return Err(format!("no workspace {workspace}"));
        }
        self.commit(next)
    }

    pub fn set_theme(&mut self, name: String) -> Result<TreeState, String> {
        if !crate::theme::exists(&name) {
            return Err(format!("no theme named {name}"));
        }
        let mut next = self.state.clone();
        next.theme = (name != crate::theme::SYSTEM).then_some(name);
        self.commit(next)
    }

    /// Puts a key on a command, or restores its default when `key` is empty.
    /// The rule about which keys may be put where is in `shortcuts`; this is
    /// only the part that saves the answer.
    pub fn set_shortcut(&mut self, command: &str, key: &str) -> Result<TreeState, String> {
        let shortcuts = crate::shortcuts::set(&self.state.shortcuts, command, key)?;
        let mut next = self.state.clone();
        next.shortcuts = shortcuts;
        self.commit(next)
    }

    pub fn reset_shortcuts(&mut self) -> Result<TreeState, String> {
        let mut next = self.state.clone();
        next.shortcuts = BTreeMap::new();
        self.commit(next)
    }

    pub fn shortcuts(&self) -> Vec<crate::shortcuts::Shortcut> {
        crate::shortcuts::all(&self.state.shortcuts)
    }

    fn commit(&mut self, next: TreeState) -> Result<TreeState, String> {
        let Some(directory) = &self.directory else {
            return Err("project state has not been loaded".to_string());
        };
        write_state(directory, &next)?;
        self.state = next.clone();
        Ok(next)
    }
}

fn required_name(name: String, kind: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(format!("{kind} name is empty"));
    }
    Ok(name.to_string())
}

/// The next id, and never one that has been used before. The high water mark is
/// raised to whatever is already in the tree first, so a file written by a build
/// without one is still safe to add to.
fn take_id(state: &mut TreeState) -> u64 {
    let highest = state
        .projects
        .iter()
        .map(|project| project.id)
        .chain(
            state
                .projects
                .iter()
                .flat_map(|project| project.workspaces.iter())
                .map(|workspace| workspace.id),
        )
        .max()
        .unwrap_or(0);
    state.next_id = state.next_id.max(highest) + 1;
    state.next_id
}

fn write_state(directory: &Path, state: &TreeState) -> Result<(), String> {
    let path = directory.join(STATE_FILE);
    let temporary = directory.join(format!("{STATE_FILE}.tmp"));
    let json = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(&temporary, format!("{json}\n")).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "akbun-terminal-tree-{}-{unique}",
            std::process::id()
        ))
    }

    #[test]
    fn saves_and_restores_the_two_level_tree() {
        let directory = test_directory();
        let path = directory.to_string_lossy().to_string();
        let mut store = TreeStore::default();
        store.load(&path).unwrap();
        let state = store
            .create_project("Demo".to_string(), Some("/tmp/demo".to_string()))
            .unwrap();
        let state = store
            .create_workspace(state.projects[0].id, "Server".to_string())
            .unwrap();

        let restored = TreeStore::default().load(&path).unwrap();
        assert_eq!(restored, state);
        assert_eq!(restored.schema_version, STATE_SCHEMA_VERSION);
        assert_eq!(
            restored.projects[0].workspaces[0].status,
            WorkspaceStatus::Idle
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn remembers_the_theme_and_refuses_one_it_does_not_have() {
        let directory = test_directory();
        let path = directory.to_string_lossy().to_string();
        let mut store = TreeStore::default();
        store.load(&path).unwrap();
        assert_eq!(store.set_theme("Nord".to_string()).unwrap().theme.as_deref(), Some("Nord"));
        assert_eq!(TreeStore::default().load(&path).unwrap().theme.as_deref(), Some("Nord"));
        // Back to the system appearance, which is stored as nothing at all.
        assert_eq!(store.set_theme(crate::theme::SYSTEM.to_string()).unwrap().theme, None);
        assert!(store.set_theme("Nope".to_string()).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn remembers_a_changed_shortcut_and_forgets_it_again() {
        let directory = test_directory();
        let path = directory.to_string_lossy().to_string();
        let mut store = TreeStore::default();
        store.load(&path).unwrap();

        store.set_shortcut("save", "cmd+shift+s").unwrap();
        let restored = TreeStore::default().load(&path).unwrap();
        assert_eq!(restored.shortcuts.get("save").map(String::as_str), Some("cmd+shift+s"));
        // Only what changed is written, so a default this build changes later
        // still reaches anyone who never touched that row.
        assert_eq!(restored.shortcuts.len(), 1);

        assert!(store.set_shortcut("save", "cmd+w").is_err());
        assert!(store.set_shortcut("nope", "cmd+k").is_err());

        store.set_shortcut("save", "").unwrap();
        assert!(TreeStore::default().load(&path).unwrap().shortcuts.is_empty());

        store.set_shortcut("find", "cmd+alt+f").unwrap();
        assert!(store.reset_shortcuts().unwrap().shortcuts.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn renames_and_deletes_both_levels() {
        let directory = test_directory();
        let path = directory.to_string_lossy().to_string();
        let mut store = TreeStore::default();
        store.load(&path).unwrap();
        let state = store.create_project("Demo".to_string(), None).unwrap();
        let project = state.projects[0].id;
        let state = store.create_workspace(project, "Server".to_string()).unwrap();
        let workspace = state.projects[0].workspaces[0].id;

        let state = store.rename_project(project, "Renamed".to_string()).unwrap();
        assert_eq!(state.projects[0].name, "Renamed");
        let state = store.rename_workspace(workspace, "Web".to_string()).unwrap();
        assert_eq!(state.projects[0].workspaces[0].name, "Web");
        assert!(store.rename_workspace(workspace, "  ".to_string()).is_err());

        let state = store.delete_workspace(workspace).unwrap();
        assert!(state.projects[0].workspaces.is_empty());
        assert!(store.delete_workspace(workspace).is_err());
        let state = store.delete_project(project).unwrap();
        assert!(state.projects.is_empty());
        assert!(store.delete_project(project).is_err());
        assert_eq!(TreeStore::default().load(&path).unwrap().projects.len(), 0);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_id_is_never_handed_out_twice() {
        // The running app keys open tabs and agent colours by these numbers, so
        // a reused id shows the deleted workspace's state on a new one.
        let directory = test_directory();
        let path = directory.to_string_lossy().to_string();
        let mut store = TreeStore::default();
        store.load(&path).unwrap();
        let state = store.create_project("Demo".to_string(), None).unwrap();
        let project = state.projects[0].id;
        let state = store.create_workspace(project, "First".to_string()).unwrap();
        let first = state.projects[0].workspaces[0].id;
        store.delete_workspace(first).unwrap();
        let state = store.create_workspace(project, "Second".to_string()).unwrap();
        assert_ne!(state.projects[0].workspaces[0].id, first);

        // And across a restart, where the tree no longer remembers the deleted one.
        let mut restarted = TreeStore::default();
        let state = restarted.load(&path).unwrap();
        let highest = state.projects[0].workspaces[0].id;
        restarted.delete_workspace(highest).unwrap();
        let state = restarted.create_workspace(project, "Third".to_string()).unwrap();
        assert!(state.projects[0].workspaces[0].id > highest);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_load_does_not_initialize_the_store() {
        let directory = test_directory();
        fs::write(&directory, "not a directory").unwrap();
        let mut store = TreeStore::default();
        assert!(store.load(directory.to_str().unwrap()).is_err());
        assert!(store
            .create_project("Demo".to_string(), None)
            .unwrap_err()
            .contains("not been loaded"));
        fs::remove_file(directory).unwrap();
    }
}
