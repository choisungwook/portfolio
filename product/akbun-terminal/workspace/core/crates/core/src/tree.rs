use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_FILE: &str = "projects.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TreeState {
    pub schema_version: u32,
    pub projects: Vec<Project>,
}

impl Default for TreeState {
    fn default() -> Self {
        Self {
            schema_version: STATE_SCHEMA_VERSION,
            projects: Vec::new(),
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
        next.projects.push(Project {
            id: next_project_id(&next),
            name,
            path: path.filter(|value| !value.is_empty()),
            workspaces: Vec::new(),
        });
        self.commit(next)
    }

    pub fn create_workspace(&mut self, project: u64, name: String) -> Result<TreeState, String> {
        let name = required_name(name, "workspace")?;
        let id = next_workspace_id(&self.state);
        let mut next = self.state.clone();
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

fn next_project_id(state: &TreeState) -> u64 {
    state
        .projects
        .iter()
        .map(|project| project.id)
        .max()
        .unwrap_or(0)
        + 1
}

fn next_workspace_id(state: &TreeState) -> u64 {
    state
        .projects
        .iter()
        .flat_map(|project| project.workspaces.iter())
        .map(|workspace| workspace.id)
        .max()
        .unwrap_or(0)
        + 1
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
