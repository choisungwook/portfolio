//! The C surface the shell links against.
//!
//! Deliberately five functions wide. Everything interesting is decided in the
//! core and travels as JSON, so this layer never grows a signature per feature
//! and there is no generated binding to keep in sync. The header the shell reads
//! is `Sources/CAkbunTerminalCore/include/akbun_terminal.h`; it is written by
//! hand because five declarations are cheaper to review than a generator step.
//!
//! One ownership rule, and it is the whole rule: every `char *` handed out here
//! was allocated by Rust and must come back to `akbun_core_string_free`. The
//! caller frees nothing itself and keeps no pointer past the free.

use std::ffi::{CString, c_char};

use akbun_terminal_core::App;

/// Creates the core. Returns null only if the allocation fails.
#[no_mangle]
pub extern "C" fn akbun_core_new() -> *mut App {
    Box::into_raw(Box::new(App::new()))
}

/// Ends every shell and frees the core. Passing null is allowed and does nothing.
#[no_mangle]
pub unsafe extern "C" fn akbun_core_free(core: *mut App) {
    if core.is_null() {
        return;
    }
    let core = Box::from_raw(core);
    core.shutdown();
}

/// Runs one command. `request` is a null terminated protocol envelope; the reply
/// is a newly allocated protocol response the caller frees.
#[no_mangle]
pub unsafe extern "C" fn akbun_core_dispatch(
    core: *mut App,
    request: *const c_char,
) -> *mut c_char {
    let Some(core) = core.as_ref() else {
        return to_c(r#"{"type":"error","message":"core handle is null"}"#);
    };
    let Ok(request) = std::ffi::CStr::from_ptr(request).to_str() else {
        return to_c(r#"{"type":"error","message":"request is not utf8"}"#);
    };
    to_c(&core.dispatch(request))
}

/// The next queued event, or null when the queue is empty. The caller frees a
/// non-null result.
#[no_mangle]
pub unsafe extern "C" fn akbun_core_poll_event(core: *mut App) -> *mut c_char {
    let Some(core) = core.as_ref() else {
        return std::ptr::null_mut();
    };
    match core.poll_event() {
        Some(event) => to_c(&event),
        None => std::ptr::null_mut(),
    }
}

/// Frees a string this library returned. Passing null is allowed.
#[no_mangle]
pub unsafe extern "C" fn akbun_core_string_free(text: *mut c_char) {
    if text.is_null() {
        return;
    }
    drop(CString::from_raw(text));
}

fn to_c(text: &str) -> *mut c_char {
    // An interior nul cannot come from serde_json, so the fallback is only here
    // to keep the signature infallible.
    CString::new(text)
        .unwrap_or_else(|_| CString::new(r#"{"type":"error","message":"reply held a nul byte"}"#).unwrap())
        .into_raw()
}
