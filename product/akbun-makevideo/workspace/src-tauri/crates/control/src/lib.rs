use makevideo_edit::{Document, Project};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(unix)]
pub mod socket;

pub fn token(document: &Document) -> String {
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_vec(document.project())
        .unwrap()
        .hash(&mut hash);
    document.revision().hash(&mut hash);
    format!("{:016x}", hash.finish())
}

pub fn check(document: &Document, expected: &str) -> Result<(), String> {
    if token(document) != expected {
        return Err("Project changed. Read get_project again before editing.".into());
    }
    Ok(())
}

pub fn apply_edits(
    document: &mut Document,
    store: &Checkpoints,
    expected: &str,
    label: &str,
    edits: Vec<makevideo_edit::Command>,
) -> Result<String, String> {
    check(document, expected)?;
    makevideo_edit::ai_plan::preview(document.project(), edits.clone())?;
    let id = store.save(document.project(), label)?;
    document.apply_all_named("MCP edit", edits)?;
    Ok(id)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub label: String,
    pub created_ms: u128,
    pub project: Project,
}

pub struct Checkpoints(PathBuf);
impl Checkpoints {
    pub fn new(path: PathBuf) -> Self {
        Self(path)
    }
    pub fn save(&self, project: &Project, label: &str) -> Result<String, String> {
        fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?;
        let id = format!("{}-{}", now.as_nanos(), std::process::id());
        let item = Checkpoint {
            id: id.clone(),
            label: label.chars().take(200).collect(),
            created_ms: now.as_millis(),
            project: project.clone(),
        };
        atomic_write(
            &self.0.join(format!("{id}.json")),
            &serde_json::to_vec(&item).map_err(|e| e.to_string())?,
        )?;
        Ok(id)
    }
    pub fn read(&self, id: &str) -> Result<Checkpoint, String> {
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
            return Err("Invalid checkpoint ID".into());
        }
        let data = fs::read(self.0.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
        serde_json::from_slice(&data).map_err(|e| e.to_string())
    }
    pub fn list(&self) -> Result<Vec<serde_json::Value>, String> {
        if !self.0.exists() {
            return Ok(vec![]);
        }
        let mut paths = fs::read_dir(&self.0)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .collect::<Vec<_>>();
        paths.sort();
        paths.reverse();
        paths
            .into_iter()
            .take(100)
            .map(|path| {
                let item = self.read(
                    path.file_stem()
                        .unwrap()
                        .to_str()
                        .ok_or("Invalid checkpoint name")?,
                )?;
                Ok(serde_json::json!({"id":item.id,"label":item.label,"createdMs":item.created_ms}))
            })
            .collect()
    }
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Use an absolute file path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_edit::{Command, ProjectSettings};
    #[test]
    fn batch_failure_and_checkpoint_write_failure_do_not_change_the_document() {
        let temp = tempfile::tempdir().unwrap();
        let mut doc = Document::new(ProjectSettings::default());
        let before = doc.project().clone();
        let expected = token(&doc);
        let marker = Command::AddMarker {
            frame: 0,
            name: "hook".into(),
            color: "#ffffff".into(),
            id: None,
        };
        let store = Checkpoints::new(temp.path().join("history"));
        assert!(apply_edits(
            &mut doc,
            &store,
            &expected,
            "invalid",
            vec![
                marker.clone(),
                Command::RemoveClip {
                    clip_id: "missing".into()
                }
            ]
        )
        .is_err());
        assert_eq!(*doc.project(), before);
        assert!(store.list().unwrap().is_empty());
        let blocked = temp.path().join("file");
        fs::write(&blocked, "not a directory").unwrap();
        assert!(apply_edits(
            &mut doc,
            &Checkpoints::new(blocked),
            &expected,
            "failure",
            vec![marker.clone()]
        )
        .is_err());
        assert_eq!(*doc.project(), before);
        let id = apply_edits(
            &mut doc,
            &store,
            &expected,
            "success",
            vec![marker.clone(), marker],
        )
        .unwrap();
        assert_eq!(store.read(&id).unwrap().project, before);
        doc.undo().unwrap();
        assert_eq!(*doc.project(), before);
        doc.redo().unwrap();
        let revision = doc.revision();
        doc.restore_checkpoint(store.read(&id).unwrap().project)
            .unwrap();
        assert_eq!(*doc.project(), before);
        assert!(doc.revision() > revision);
        assert!(!doc.can_undo());
    }

    #[test]
    fn checkpoints_survive_reopening_and_tokens_reject_stale_edits() {
        let temp = tempfile::tempdir().unwrap();
        let mut doc = Document::new(ProjectSettings::default());
        let original = doc.project().clone();
        let before = token(&doc);
        let id = Checkpoints::new(temp.path().into())
            .save(&original, "Before cuts")
            .unwrap();
        doc.apply(Command::AddMarker {
            frame: 0,
            name: "test".into(),
            color: "#ffffff".into(),
            id: None,
        })
        .unwrap();
        assert!(check(&doc, &before).is_err());
        let store = Checkpoints::new(temp.path().into());
        assert_eq!(store.read(&id).unwrap().project, original);
        assert_eq!(store.list().unwrap().len(), 1);
        assert!(store.read("../secret").is_err());
    }
}
