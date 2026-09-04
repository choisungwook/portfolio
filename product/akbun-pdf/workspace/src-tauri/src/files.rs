use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|directory| !directory.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .ok_or_else(|| "저장할 파일 이름이 없습니다.".to_string())?;
    let temporary = temporary_path(parent, file_name)?;
    let result = write_and_replace(&temporary, path, bytes);
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(parent: &Path, file_name: &std::ffi::OsStr) -> Result<PathBuf, String> {
    for attempt in 0..100_u32 {
        let candidate = parent.join(format!(
            ".{}.akbun-{}-{attempt}.tmp",
            file_name.to_string_lossy(),
            std::process::id(),
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("임시 저장 파일을 만들 수 없습니다.".into())
}

fn write_and_replace(temporary: &Path, target: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    replace(temporary, target)
}

#[cfg(not(windows))]
fn replace(temporary: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temporary, target).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn replace(temporary: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        REPLACEFILE_WRITE_THROUGH,
    };

    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>()
    };
    let temporary_wide = wide(temporary);
    let target_wide = wide(target);
    let success = unsafe {
        if target.exists() {
            ReplaceFileW(
                target_wide.as_ptr(),
                temporary_wide.as_ptr(),
                std::ptr::null(),
                REPLACEFILE_WRITE_THROUGH,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } else {
            MoveFileExW(
                temporary_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
    };
    if success == 0 {
        return Err(format!("파일 교체에 실패했습니다: {}", unsafe {
            GetLastError()
        }));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_existing_file_without_leaving_temporary_data() {
        let directory = std::env::temp_dir().join(format!("akbun-pdf-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let target = directory.join("document.pdf");
        fs::write(&target, b"original").unwrap();
        atomic_write(&target, b"saved").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"saved");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_file(target).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn failed_replacement_keeps_the_original_target() {
        let directory =
            std::env::temp_dir().join(format!("akbun-pdf-failure-{}", std::process::id()));
        let target = directory.join("document.pdf");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("original"), b"original").unwrap();
        assert!(atomic_write(&target, b"saved").is_err());
        assert_eq!(fs::read(target.join("original")).unwrap(), b"original");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_file(target.join("original")).unwrap();
        fs::remove_dir(target).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
