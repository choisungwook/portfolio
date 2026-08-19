//! The round trip the shell makes: handshake, spawn, type, read back, close.
//!
//! It runs against a real shell under a real pty, because the parts that break
//! are the pty and the process lifetime, not the JSON.

use std::time::{Duration, Instant};

use akbun_terminal_core::App;

fn dispatch(app: &App, command: &str) -> String {
    app.dispatch(&format!(r#"{{"v":1,"command":{command}}}"#))
}

/// Collects output events until `needle` shows up or the deadline passes.
fn wait_for_output(app: &App, needle: &str) -> String {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut seen = String::new();
    while Instant::now() < deadline {
        match app.poll_event() {
            Some(event) => {
                seen.push_str(&decode_output(&event));
                if seen.contains(needle) {
                    return seen;
                }
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
    seen
}

/// Pulls the byte array out of an output event and reads it as text. Terminal
/// output is not guaranteed to be valid utf8, so this is lossy on purpose.
fn decode_output(event: &str) -> String {
    let value: serde_json::Value = serde_json::from_str(event).expect("event should be json");
    if value["type"] != "output" {
        return String::new();
    }
    let bytes: Vec<u8> = value["bytes"]
        .as_array()
        .expect("output carries a byte array")
        .iter()
        .map(|byte| byte.as_u64().expect("byte") as u8)
        .collect();
    String::from_utf8_lossy(&bytes).to_string()
}

#[test]
fn answers_the_handshake_with_its_protocol_version() {
    let app = App::new();
    let response = dispatch(&app, r#"{"type":"hello"}"#);
    assert_eq!(
        response,
        format!(
            r#"{{"type":"hello","protocol":{}}}"#,
            akbun_terminal_core::PROTOCOL_VERSION
        )
    );
}

#[test]
fn typing_into_a_session_comes_back_as_output() {
    let app = App::new();

    let spawned = dispatch(&app, r#"{"type":"spawn","cwd":"","cols":80,"rows":24}"#);
    let session: serde_json::Value = serde_json::from_str(&spawned).expect("json");
    assert_eq!(session["type"], "spawned", "{spawned}");
    let id = session["session"].as_u64().expect("session id");

    // The marker is unlikely to appear in a profile banner, so finding it proves
    // the write reached the shell rather than the shell just having started.
    let typed: Vec<u8> = b"echo akbun-round-trip-ok\n".to_vec();
    let write = dispatch(
        &app,
        &format!(r#"{{"type":"write","session":{id},"bytes":{typed:?}}}"#),
    );
    assert_eq!(write, r#"{"type":"ok"}"#);

    let seen = wait_for_output(&app, "akbun-round-trip-ok");
    assert!(seen.contains("akbun-round-trip-ok"), "output was: {seen}");

    assert_eq!(dispatch(&app, &format!(r#"{{"type":"resize","session":{id},"cols":100,"rows":30}}"#)), r#"{"type":"ok"}"#);
    assert_eq!(dispatch(&app, &format!(r#"{{"type":"close","session":{id}}}"#)), r#"{"type":"ok"}"#);
    assert_eq!(app.session_count(), 0);
}

#[test]
fn a_command_for_a_gone_session_is_an_error_not_a_panic() {
    let app = App::new();
    let response = dispatch(&app, r#"{"type":"close","session":404}"#);
    assert!(response.contains("no session 404"), "{response}");
}

#[test]
fn shutdown_leaves_no_session_behind() {
    let app = App::new();
    dispatch(&app, r#"{"type":"spawn","cwd":"","cols":80,"rows":24}"#);
    dispatch(&app, r#"{"type":"spawn","cwd":"","cols":80,"rows":24}"#);
    assert_eq!(app.session_count(), 2);
    app.shutdown();
    assert_eq!(app.session_count(), 0);
}
