//! MCP server over stdio: newline-delimited JSON-RPC 2.0, tools only.

use crate::{ops, store::Store};
use anyhow::Result;
use base64::Engine;
use serde_json::{Value, json};
use std::io::{BufRead, Write};

pub const INSTRUCTIONS: &str = "akbun-storyboard holds video storyboards: projects split into parts and scenes, \
plus background music, ideas and comments. Read a project with project_get before editing it. \
Open comments (comment_list open_only=true) are the person's requests: act on them, then set resolved=1 and \
reply with comment_add author=<your agent name>. Scenes are ordered; use after_id on scene_add and scene_move. \
Attach a sketch or photo with media_add then scene_update media_id. The person sees every change live in the web UI.";

pub fn run(store: &Store) -> Result<()> {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(store, &msg),
            Err(e) => Some(json!({"jsonrpc": "2.0", "id": null, "error": {"code": -32700, "message": e.to_string()}})),
        };
        if let Some(r) = reply {
            writeln!(out, "{r}")?;
            out.flush()?;
        }
    }
    Ok(())
}

fn handle(store: &Store, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone(); // notifications have no id and get no reply
    let params = &msg["params"];
    let result = match msg["method"].as_str().unwrap_or("") {
        "initialize" => json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "akbun-storyboard", "version": env!("CARGO_PKG_VERSION")},
            "instructions": INSTRUCTIONS,
        }),
        "ping" => json!({}),
        "tools/list" => json!({"tools": ops::list().into_iter().map(|o| json!({
            "name": o.name, "description": o.description, "inputSchema": o.schema
        })).collect::<Vec<_>>()}),
        "tools/call" => tool_call(store, params["name"].as_str().unwrap_or(""), &params["arguments"]),
        m => {
            return Some(json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": format!("method not found: {m}")}}));
        }
    };
    Some(json!({"jsonrpc": "2.0", "id": id, "result": result}))
}

fn tool_call(store: &Store, name: &str, args: &Value) -> Value {
    match ops::call(store, name, args) {
        // ponytail: big images are not resized (that needs an image crate); the
        // client gets the path instead and reads the file itself.
        Ok(v) if name == "media_view" && std::fs::metadata(v["path"].as_str().unwrap_or("")).is_ok_and(|m| m.len() <= 1 << 20) => {
            let data = std::fs::read(v["path"].as_str().unwrap_or("")).unwrap_or_default();
            json!({"content": [
                {"type": "image", "data": base64::engine::general_purpose::STANDARD.encode(data), "mimeType": v["mime"]},
                {"type": "text", "text": v.to_string()}
            ]})
        }
        Ok(v) if name == "project_render" && v["text"].is_string() => json!({"content": [{"type": "text", "text": v["text"]}]}),
        Ok(v) => json!({"content": [{"type": "text", "text": serde_json::to_string_pretty(&v).unwrap()}]}),
        Err(e) => json!({"content": [{"type": "text", "text": e.to_string()}], "isError": true}),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn protocol() {
        let dir = std::env::temp_dir().join(format!("akbun-sb-mcp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = crate::store::Store::open(&dir).unwrap();
        let init = super::handle(&s, &json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}})).unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26", "echo the client's version");
        assert!(init["result"]["instructions"].as_str().unwrap().contains("comment"));
        assert!(super::handle(&s, &json!({"jsonrpc": "2.0", "method": "notifications/initialized"})).is_none(), "no reply to notifications");
        assert_eq!(super::handle(&s, &json!({"jsonrpc": "2.0", "id": 2, "method": "nope"})).unwrap()["error"]["code"], -32601);
        let call = |name: &str, args: serde_json::Value| super::handle(&s, &json!({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": name, "arguments": args}})).unwrap()["result"].clone();
        assert_eq!(call("scene_update", json!({"id": 99}))["isError"], true, "tool errors are results, not protocol errors");
        call("project_add", json!({"title": "M"}));
        let md = call("project_render", json!({"id": 1}));
        assert!(md["content"][0]["text"].as_str().unwrap().starts_with("# M"), "render text is returned raw");
    }
}
