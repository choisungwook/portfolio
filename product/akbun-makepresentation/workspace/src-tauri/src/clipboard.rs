use base64::Engine;
use clipboard_rs::{Clipboard, ClipboardContent, ClipboardContext};

const SHAPES_FORMAT: &str = "io.akbun.makepresentation.shapes";

#[tauri::command]
pub fn write_shape_clipboard(shapes: String, text: String, data_url: String) -> Result<(), String> {
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("expected PNG image")?;
    let png = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())?;
    let context = ClipboardContext::new().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    let image = ClipboardContent::Other("public.png".into(), png);
    #[cfg(not(target_os = "macos"))]
    let image = {
        use clipboard_rs::common::RustImage;
        ClipboardContent::Image(
            clipboard_rs::RustImageData::from_bytes(&png).map_err(|error| error.to_string())?,
        )
    };
    let mut contents = vec![
        image,
        ClipboardContent::Other(SHAPES_FORMAT.into(), shapes.into_bytes()),
    ];
    if !text.is_empty() {
        contents.push(ClipboardContent::Text(text));
    }
    context.set(contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_shape_clipboard() -> Result<Option<String>, String> {
    let context = ClipboardContext::new().map_err(|error| error.to_string())?;
    Ok(context
        .get_buffer(SHAPES_FORMAT)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok()))
}
