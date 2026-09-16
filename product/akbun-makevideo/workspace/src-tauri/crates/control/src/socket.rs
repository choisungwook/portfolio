use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    os::unix::{
        fs::{DirBuilderExt, FileTypeExt, PermissionsExt},
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

pub const MAX_MESSAGE: u64 = 16 * 1024 * 1024;

pub fn bind(path: &Path) -> Result<UnixListener, String> {
    let dir = path.parent().ok_or("Missing socket directory")?;
    let mut builder = fs::DirBuilder::new();
    builder
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .map_err(|e| e.to_string())?;
    if fs::symlink_metadata(dir)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Socket directory cannot be a symlink".into());
    }
    if fs::metadata(dir)
        .map_err(|e| e.to_string())?
        .permissions()
        .mode()
        & 0o077
        != 0
    {
        return Err("Use a private socket directory with mode 0700".into());
    }
    if path.exists() {
        if !fs::symlink_metadata(path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_socket()
        {
            return Err("Socket path is occupied by a non-socket file".into());
        }
        match UnixStream::connect(path) {
            Ok(_) => return Err("Another editor already owns the MCP socket".into()),
            Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {}
            Err(error) => return Err(error.to_string()),
        }
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    let listener = UnixListener::bind(path).map_err(|e| e.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    Ok(listener)
}

pub fn serve(
    listener: UnixListener,
    handler: impl Fn(Value) -> Result<Value, String> + Send + Sync + 'static,
) {
    let handler = Arc::new(handler);
    std::thread::spawn(move || {
        for mut stream in listener.incoming().flatten() {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
            let result = (|| {
                let mut reader = BufReader::new((&stream).take(MAX_MESSAGE + 1));
                let mut line = Vec::new();
                reader
                    .read_until(b'\n', &mut line)
                    .map_err(|e| e.to_string())?;
                if line.len() as u64 > MAX_MESSAGE || line.last() != Some(&b'\n') {
                    return Err("Invalid or oversized request".into());
                }
                handler(serde_json::from_slice(&line).map_err(|e| e.to_string())?)
            })();
            let response = match result {
                Ok(value) => json!({"result":value}),
                Err(error) => json!({"error":error}),
            };
            let _ = writeln!(stream, "{}", response);
        }
    });
}

pub fn default_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("AKBUN_MAKEVIDEO_SOCKET") {
        return Ok(PathBuf::from(path));
    }
    let home = std::env::var_os("HOME").ok_or("HOME is unavailable")?;
    Ok(PathBuf::from(home).join(".akbun-makevideo/control.sock"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn existing_shared_directories_and_regular_files_are_not_changed() {
        let root = tempfile::tempdir().unwrap();
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o755)).unwrap();
        assert!(bind(&root.path().join("socket")).is_err());
        assert_eq!(
            fs::metadata(root.path()).unwrap().permissions().mode() & 0o777,
            0o755
        );
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let path = root.path().join("socket");
        fs::write(&path, "keep").unwrap();
        assert!(bind(&path).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "keep");
    }
}
