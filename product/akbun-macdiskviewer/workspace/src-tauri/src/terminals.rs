use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(30);

const TERMINAL_HINTS: &[&str] = &[
    "terminal",
    "iterm",
    "ghostty",
    "wezterm",
    "kitty",
    "alacritty",
    "warp",
    "hyper",
    "tabby",
    "rio",
    "contour",
    "waveterm",
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub name: String,
    pub bundle_id: Option<String>,
    pub app_path: String,
}

#[derive(Default)]
struct TerminalCache {
    detected_at: Option<Instant>,
    terminals: Vec<Terminal>,
}

impl TerminalCache {
    fn get(&self, now: Instant) -> Option<Vec<Terminal>> {
        let age = now.checked_duration_since(self.detected_at?)?;
        (age < CACHE_TTL).then(|| self.terminals.clone())
    }

    fn replace(&mut self, now: Instant, terminals: Vec<Terminal>) {
        self.detected_at = Some(now);
        self.terminals = terminals;
    }
}

static TERMINAL_CACHE: OnceLock<Mutex<TerminalCache>> = OnceLock::new();

pub fn detect() -> Vec<Terminal> {
    let now = Instant::now();
    let cache = TERMINAL_CACHE.get_or_init(|| Mutex::new(TerminalCache::default()));
    let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(terminals) = cache.get(now) {
        return terminals;
    }
    let terminals = detect_uncached();
    cache.replace(now, terminals.clone());
    terminals
}

fn detect_uncached() -> Vec<Terminal> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    let mut applications = Vec::new();
    for root in roots {
        application_bundles(&root, 0, &mut applications);
    }
    let mut terminals = applications
        .into_iter()
        .filter_map(read_terminal)
        .collect::<Vec<_>>();
    terminals.sort_by_key(|terminal| terminal.name.to_lowercase());
    terminals.dedup_by(|left, right| left.app_path == right.app_path);
    terminals
}

pub fn open_terminal(app_path: &str, target: &Path) -> Result<(), String> {
    let terminal = detect()
        .into_iter()
        .find(|terminal| terminal.app_path == app_path)
        .ok_or_else(|| "terminal is not installed".to_string())?;
    Command::new("/usr/bin/open")
        .args(terminal_arguments(&terminal, target))
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn application_bundles(root: &Path, depth: u8, output: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.extension().is_some_and(|extension| extension == "app") {
            output.push(path);
        } else {
            application_bundles(&path, depth + 1, output);
        }
    }
}

fn read_terminal(app_path: PathBuf) -> Option<Terminal> {
    let output = Command::new("/usr/bin/plutil")
        .args(["-convert", "json", "-o", "-"])
        .arg(app_path.join("Contents/Info.plist"))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let info: Value = serde_json::from_slice(&output.stdout).ok()?;
    if !is_terminal_application(&info, &app_path) {
        return None;
    }
    let fallback = app_path.file_stem()?.to_string_lossy().into_owned();
    Some(Terminal {
        name: string_value(&info, "CFBundleDisplayName")
            .or_else(|| string_value(&info, "CFBundleName"))
            .unwrap_or(fallback),
        bundle_id: string_value(&info, "CFBundleIdentifier"),
        app_path: app_path.to_string_lossy().into_owned(),
    })
}

fn is_terminal_application(info: &Value, app_path: &Path) -> bool {
    let name = string_value(info, "CFBundleDisplayName")
        .or_else(|| string_value(info, "CFBundleName"))
        .or_else(|| {
            app_path
                .file_stem()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_default();
    let bundle = string_value(info, "CFBundleIdentifier").unwrap_or_default();
    let schemes = nested_string_values(info, "CFBundleURLTypes", "CFBundleURLSchemes");
    let document_types = nested_string_values(info, "CFBundleDocumentTypes", "LSItemContentTypes");
    let identity = format!("{name} {bundle}").to_lowercase();
    let handles_shell_files = document_types.iter().any(|value| {
        matches!(
            value.as_str(),
            "public.shell-script" | "public.unix-executable"
        )
    });
    has_terminal_hint(&identity)
        || schemes
            .iter()
            .any(|scheme| has_terminal_hint(&scheme.to_lowercase()))
        || (handles_shell_files && has_shell_name(&name))
}

fn has_terminal_hint(value: &str) -> bool {
    TERMINAL_HINTS.iter().any(|hint| value.contains(hint))
}

fn has_shell_name(value: &str) -> bool {
    value
        .to_lowercase()
        .split(|character: char| !character.is_ascii_alphanumeric())
        .any(|word| matches!(word, "console" | "shell" | "command"))
}

fn terminal_arguments(terminal: &Terminal, directory: &Path) -> Vec<String> {
    let identity = format!(
        "{} {}",
        terminal.name,
        terminal.bundle_id.as_deref().unwrap_or_default()
    )
    .to_lowercase();
    let app = terminal.app_path.clone();
    let directory = directory.to_string_lossy().into_owned();
    if identity.contains("ghostty") {
        return vec![
            "-a".into(),
            app,
            "--args".into(),
            format!("--working-directory={directory}"),
        ];
    }
    if identity.contains("wezterm") {
        return vec![
            "-a".into(),
            app,
            "--args".into(),
            "start".into(),
            "--cwd".into(),
            directory,
        ];
    }
    if identity.contains("kitty") {
        return vec![
            "-a".into(),
            app,
            "--args".into(),
            "--directory".into(),
            directory,
        ];
    }
    if identity.contains("alacritty") {
        return vec![
            "-a".into(),
            app,
            "--args".into(),
            "--working-directory".into(),
            directory,
        ];
    }
    vec!["-a".into(), app, directory]
}

fn string_value(info: &Value, key: &str) -> Option<String> {
    info.get(key)?.as_str().map(ToOwned::to_owned)
}

fn nested_string_values(info: &Value, outer: &str, inner: &str) -> Vec<String> {
    info.get(outer)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|entry| {
            entry
                .get(inner)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_terminals_from_bundle_metadata() {
        assert!(is_terminal_application(
            &json!({"CFBundleName": "Ghostty", "CFBundleIdentifier": "com.mitchellh.ghostty"}),
            Path::new("/Applications/Ghostty.app"),
        ));
        assert!(is_terminal_application(
            &json!({"CFBundleName": "New Console", "CFBundleDocumentTypes": [{"LSItemContentTypes": ["public.shell-script"]}]}),
            Path::new("/Applications/New Console.app"),
        ));
        assert!(!is_terminal_application(
            &json!({"CFBundleName": "Notes", "CFBundleIdentifier": "com.apple.Notes"}),
            Path::new("/System/Applications/Notes.app"),
        ));
        assert!(!is_terminal_application(
            &json!({"CFBundleName": "Insta360 Wave Controller", "CFBundleIdentifier": "com.insta360.Wavecontroller"}),
            Path::new("/Applications/Insta360 Wave Controller.app"),
        ));
    }

    #[test]
    fn creates_working_directory_arguments() {
        let ghostty = Terminal {
            name: "Ghostty".into(),
            bundle_id: Some("com.mitchellh.ghostty".into()),
            app_path: "/Applications/Ghostty.app".into(),
        };
        assert_eq!(
            terminal_arguments(&ghostty, Path::new("/tmp/work")),
            [
                "-a",
                "/Applications/Ghostty.app",
                "--args",
                "--working-directory=/tmp/work"
            ],
        );
        let unknown = Terminal {
            name: "akbun-terminal".into(),
            bundle_id: None,
            app_path: "/Applications/akbun-terminal.app".into(),
        };
        assert_eq!(
            terminal_arguments(&unknown, Path::new("/tmp/work")),
            ["-a", "/Applications/akbun-terminal.app", "/tmp/work"],
        );
    }

    #[test]
    fn terminal_cache_expires_after_thirty_seconds() {
        let detected_at = Instant::now();
        let terminal = Terminal {
            name: "Ghostty".into(),
            bundle_id: None,
            app_path: "/Applications/Ghostty.app".into(),
        };
        let mut cache = TerminalCache::default();
        cache.replace(detected_at, vec![terminal]);

        assert_eq!(
            cache
                .get(detected_at + Duration::from_secs(29))
                .unwrap()
                .len(),
            1,
        );
        assert!(cache
            .get(detected_at + Duration::from_secs(30))
            .is_none());
    }
}
