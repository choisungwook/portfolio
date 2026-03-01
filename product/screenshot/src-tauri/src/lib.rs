use base64::Engine;
use std::fs;

#[tauri::command]
fn capture_full_screenshot() -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("screencapture_full.png");
    let file_path_str = file_path.to_string_lossy().to_string();

    // Use macOS screencapture command
    let output = std::process::Command::new("screencapture")
        .arg("-x") // no sound
        .arg(&file_path_str)
        .output()
        .map_err(|e| format!("Failed to execute screencapture: {}", e))?;

    if !output.status.success() {
        return Err("screencapture command failed".to_string());
    }

    // Read file and convert to base64
    let data = fs::read(&file_path).map_err(|e| format!("Failed to read screenshot: {}", e))?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

    // Clean up temp file
    let _ = fs::remove_file(&file_path);

    Ok(format!("data:image/png;base64,{}", base64_data))
}

#[tauri::command]
fn capture_region_screenshot() -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("screencapture_region.png");
    let file_path_str = file_path.to_string_lossy().to_string();

    // Use macOS screencapture with -i for interactive region selection
    let output = std::process::Command::new("screencapture")
        .arg("-i") // interactive mode
        .arg("-x") // no sound
        .arg(&file_path_str)
        .output()
        .map_err(|e| format!("Failed to execute screencapture: {}", e))?;

    if !output.status.success() {
        return Err("screencapture command failed".to_string());
    }

    // Check if user cancelled (file won't exist)
    if !file_path.exists() {
        return Err("Screenshot cancelled by user".to_string());
    }

    // Read file and convert to base64
    let data = fs::read(&file_path).map_err(|e| format!("Failed to read screenshot: {}", e))?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

    // Clean up temp file
    let _ = fs::remove_file(&file_path);

    Ok(format!("data:image/png;base64,{}", base64_data))
}

#[tauri::command]
fn save_image_to_file(base64_data: String, file_path: String) -> Result<(), String> {
    // Strip data URL prefix if present
    let raw_base64 = if let Some(pos) = base64_data.find(",") {
        &base64_data[pos + 1..]
    } else {
        &base64_data
    };

    let data = base64::engine::general_purpose::STANDARD
        .decode(raw_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    fs::write(&file_path, &data).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
fn save_edited_image(base64_data: String, file_path: String) -> Result<(), String> {
    save_image_to_file(base64_data, file_path)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            capture_full_screenshot,
            capture_region_screenshot,
            save_image_to_file,
            save_edited_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
