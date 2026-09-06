use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct Profile {
    pub directory: PathBuf,
    base: PathBuf,
    id: String,
    source: Mutex<Option<String>>,
    _lease: File,
}

fn open_lock(path: &Path) -> Result<File, String> {
    File::options()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|error| error.to_string())
}

fn path_key(path: &Path) -> Result<String, String> {
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    Ok(format!(
        "{:x}",
        Sha256::digest(canonical.as_os_str().as_encoded_bytes())
    ))
}

impl Profile {
    pub fn open(base: &Path, document: Option<&Path>) -> Result<Self, String> {
        fs::create_dir_all(base.join("documents")).map_err(|error| error.to_string())?;
        fs::create_dir_all(base.join("profiles")).map_err(|error| error.to_string())?;
        let catalog = open_lock(&base.join("profiles.lock"))?;
        catalog.lock().map_err(|error| error.to_string())?;
        let document_key = document.map(path_key).transpose()?;
        let link = document_key
            .as_ref()
            .map(|key| base.join("documents").join(key));
        let existing = link
            .as_ref()
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|id| Uuid::parse_str(id.trim()).ok().map(|id| id.to_string()));
        let mut id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
        let mut directory = base.join("profiles").join(&id);
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let mut lease = open_lock(&directory.join("instance.lock"))?;
        match lease.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => {
                id = Uuid::new_v4().to_string();
                let isolated = base.join("profiles").join(&id);
                fs::create_dir_all(&isolated).map_err(|error| error.to_string())?;
                copy_profile(&directory, &isolated)?;
                directory = isolated;
                lease = open_lock(&directory.join("instance.lock"))?;
                lease.try_lock().map_err(|error| error.to_string())?;
            }
            Err(error) => return Err(error.to_string()),
        }
        if let Some(link) = link {
            if !link.exists() {
                fs::write(link, &id).map_err(|error| error.to_string())?;
            }
        }
        Ok(Self {
            directory,
            base: base.into(),
            id,
            source: Mutex::new(document_key),
            _lease: lease,
        })
    }

    pub fn remember_saved_document(&self, path: &Path) -> Result<(), String> {
        let mut source = self.source.lock().map_err(|error| error.to_string())?;
        let catalog = open_lock(&self.base.join("profiles.lock"))?;
        catalog.lock().map_err(|error| error.to_string())?;
        let link = self.base.join("documents").join(path_key(path)?);
        let previous = source.clone();
        let next = path_key(path)?;
        if previous.as_deref() == Some(next.as_str()) {
            return write_link(&link, &self.id);
        }
        if let Some(previous) = previous {
            let old_link = self.base.join("documents").join(previous);
            if fs::read_to_string(&old_link).ok().as_deref() == Some(&self.id) {
                let preserved_id = Uuid::new_v4().to_string();
                copy_profile(
                    &self.directory,
                    &self.base.join("profiles").join(&preserved_id),
                )?;
                write_link(&old_link, &preserved_id)?;
            }
        }
        write_link(&link, &self.id)?;
        *source = Some(next);
        Ok(())
    }
}

fn write_link(path: &Path, id: &str) -> Result<(), String> {
    let temporary = path.with_extension(Uuid::new_v4().to_string());
    fs::write(&temporary, id).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn copy_profile(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        let name_text = name.to_string_lossy();
        if name_text == "instance.lock" || name_text == "runtime" || name_text.ends_with(".tmp") {
            continue;
        }
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_dir() {
            copy_profile(&entry.path(), &target.join(name))?;
        } else if kind.is_file() {
            fs::copy(entry.path(), target.join(name)).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn documents_and_duplicate_openings_have_separate_profiles() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let a = root.join("a.pptx");
        let b = root.join("b.pptx");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let first = Profile::open(&root, Some(&a)).unwrap();
        fs::write(first.directory.join("settings.json"), "first").unwrap();
        let second = Profile::open(&root, Some(&b)).unwrap();
        let duplicate = Profile::open(&root, Some(&a)).unwrap();
        assert_ne!(first.directory, second.directory);
        assert_ne!(first.directory, duplicate.directory);
        let original = first.directory.clone();
        drop(first);
        let reopened = Profile::open(&root, Some(&a)).unwrap();
        assert_eq!(reopened.directory, original);
        assert_eq!(
            fs::read_to_string(reopened.directory.join("settings.json")).unwrap(),
            "first"
        );
        drop((second, duplicate, reopened));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_new_document_keeps_its_profile_after_first_save() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let profile = Profile::open(&root, None).unwrap();
        let path = root.join("new.pptx");
        fs::write(&path, "deck").unwrap();
        profile.remember_saved_document(&path).unwrap();
        let directory = profile.directory.clone();
        drop(profile);
        let reopened = Profile::open(&root, Some(&path)).unwrap();
        assert_eq!(reopened.directory, directory);
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_as_preserves_original_settings_and_moves_active_history_to_new_document() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let a = root.join("a.pptx");
        let b = root.join("b.pptx");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let profile = Profile::open(&root, Some(&a)).unwrap();
        fs::write(profile.directory.join("settings.json"), "original").unwrap();
        profile.remember_saved_document(&b).unwrap();
        fs::write(profile.directory.join("settings.json"), "changed").unwrap();
        let active_directory = profile.directory.clone();
        drop(profile);
        let original = Profile::open(&root, Some(&a)).unwrap();
        let saved_as = Profile::open(&root, Some(&b)).unwrap();
        assert_ne!(original.directory, saved_as.directory);
        assert_eq!(saved_as.directory, active_directory);
        assert_eq!(
            fs::read_to_string(original.directory.join("settings.json")).unwrap(),
            "original"
        );
        assert_eq!(
            fs::read_to_string(saved_as.directory.join("settings.json")).unwrap(),
            "changed"
        );
        drop((original, saved_as));
        fs::remove_dir_all(root).unwrap();
    }
}
