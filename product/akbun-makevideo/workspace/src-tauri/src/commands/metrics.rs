use super::*;

pub(crate) fn process_tree_rss_bytes(output: &str, root: u32) -> u64 {
    let rows: Vec<(u32, u32, u64)> = output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some((
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
            ))
        })
        .collect();
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut rss = HashMap::new();
    for (pid, parent, kib) in rows {
        children.entry(parent).or_default().push(pid);
        rss.insert(pid, kib);
    }
    let mut pending = vec![root];
    let mut found = HashSet::new();
    while let Some(pid) = pending.pop() {
        if !found.insert(pid) {
            continue;
        }
        if let Some(next) = children.get(&pid) {
            pending.extend(next);
        }
    }
    found
        .iter()
        .filter_map(|pid| rss.get(pid))
        .sum::<u64>()
        .saturating_mul(1024)
}

/// Resident memory for the app and its webview/helper children. The quality
/// harness samples the whole process tree because decoder memory does not live
/// solely in the Rust process.
#[tauri::command]
pub fn process_memory_bytes() -> Result<u64, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,ppid=,rss="])
        .output()
        .map_err(|error| format!("cannot read process memory: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(process_tree_rss_bytes(
        &String::from_utf8_lossy(&output.stdout),
        std::process::id(),
    ))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub memory_bytes: u64,
    pub cpu_percent: f64,
}

pub(crate) fn process_metrics_rows(output: &str) -> Result<Vec<(u32, u32, u64, f64)>, String> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let mut fields = line.split_whitespace();
            let pid = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let parent = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let rss_kib = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let cpu_percent = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            if fields.next().is_some() {
                return Err(format!("cannot parse process metrics row: {line:?}"));
            }
            Ok((pid, parent, rss_kib, cpu_percent))
        })
        .collect()
}

/// Process-tree metrics include WebView and ffmpeg children, which hold most
/// preview memory and CPU outside the Rust process itself.
#[tauri::command]
pub async fn process_metrics() -> Result<ProcessMetrics, String> {
    blocking(read_process_metrics).await?
}

pub(crate) fn read_process_metrics() -> Result<ProcessMetrics, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,ppid=,rss=,pcpu="])
        .output()
        .map_err(|error| format!("cannot read process metrics: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let rows = process_metrics_rows(&String::from_utf8_lossy(&output.stdout))?;
    let root = std::process::id();
    if !rows.iter().any(|(pid, _, _, _)| *pid == root) {
        return Err(format!(
            "cannot find current process {root} in process metrics"
        ));
    }
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut values = HashMap::new();
    for (pid, parent, rss_kib, cpu_percent) in rows {
        children.entry(parent).or_default().push(pid);
        values.insert(pid, (rss_kib, cpu_percent));
    }
    let mut pending = vec![root];
    let mut found = HashSet::new();
    while let Some(pid) = pending.pop() {
        if !found.insert(pid) {
            continue;
        }
        if let Some(next) = children.get(&pid) {
            pending.extend(next);
        }
    }
    let (rss_kib, cpu_percent) = found.into_iter().fold((0, 0.0), |total, pid| {
        let Some((rss, cpu)) = values.get(&pid) else {
            return total;
        };
        (total.0 + rss, total.1 + cpu)
    });
    Ok(ProcessMetrics {
        memory_bytes: rss_kib.saturating_mul(1024),
        cpu_percent,
    })
}

#[tauri::command]
pub fn read_error_log(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let settings = state.settings.lock().unwrap().clone();
    crate::store::recent_error_log(&app, &settings, 200)
}

#[tauri::command]
pub fn save_quality_report(path: String, report: serde_json::Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path}: {error}"))
}
