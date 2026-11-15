//! HTTP server for the web UI. Static files are compiled into the binary.

use crate::{ops, store::{self, Store}};
use anyhow::{Result, anyhow};
use serde_json::{Value, json};
use std::hash::{BuildHasher, Hasher};
use std::io::Read;
use tiny_http::{Header, Method, Request, Response, Server};

const INDEX: &str = include_str!("../web/index.html");
const APP_JS: &str = include_str!("../web/app.js");
const STYLE: &str = include_str!("../web/style.css");

pub fn run(store: &Store, host: &str, port: u16, open: bool) -> Result<()> {
    let server = Server::http((host, port)).map_err(|e| anyhow!("bind {host}:{port}: {e}"))?;
    let lan = !matches!(host, "127.0.0.1" | "localhost" | "::1");
    // LAN mode (opening the board on an iPad) has no login, so a random token
    // in the first URL gates every request.
    let token = lan.then(random_token);
    let url = match &token {
        Some(t) => format!("http://{}:{port}/?t={t}", lan_ip().unwrap_or_else(|| host.into())),
        None => format!("http://127.0.0.1:{port}/"),
    };
    eprintln!("akbun-storyboard {} serving {url}", env!("CARGO_PKG_VERSION"));
    eprintln!("data: {}", store.dir.display());
    if open {
        open_browser(&url);
    }
    serve_loop(store, &server, token.as_deref());
    Ok(())
}

// ponytail: one request at a time; plenty for one person and a few agents.
fn serve_loop(store: &Store, server: &Server, token: Option<&str>) {
    for mut req in server.incoming_requests() {
        let r = handle(store, &mut req, token);
        let mut resp = Response::from_data(r.body).with_status_code(r.status);
        resp.add_header(Header::from_bytes("Content-Type", r.ctype).unwrap());
        resp.add_header(Header::from_bytes("Cache-Control", "no-store").unwrap());
        if let Some(c) = r.cookie {
            resp.add_header(Header::from_bytes("Set-Cookie", c).unwrap());
        }
        let _ = req.respond(resp);
    }
}

struct Reply {
    status: u16,
    ctype: &'static str,
    body: Vec<u8>,
    cookie: Option<String>,
}

fn reply(status: u16, ctype: &'static str, body: impl Into<Vec<u8>>) -> Reply {
    Reply { status, ctype, body: body.into(), cookie: None }
}

fn json_reply(r: Result<Value>) -> Reply {
    match r {
        Ok(v) => reply(200, "application/json", v.to_string()),
        Err(e) => reply(400, "application/json", json!({"error": e.to_string()}).to_string()),
    }
}

fn header(r: &Request, name: &str) -> Option<String> {
    r.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str().to_string())
}

fn query<'a>(url: &'a str, key: &str) -> Option<&'a str> {
    url.split_once('?')?.1.split('&').find_map(|kv| kv.strip_prefix(key)?.strip_prefix('='))
}

fn handle(store: &Store, req: &mut Request, token: Option<&str>) -> Reply {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let method = req.method().clone();
    let mut cookie = None;
    match token {
        Some(t) => {
            let ok = header(req, "Cookie").is_some_and(|c| c.split(';').any(|kv| kv.trim() == format!("sbt={t}")));
            if query(&url, "t") == Some(t) {
                cookie = Some(format!("sbt={t}; Path=/; HttpOnly; SameSite=Strict"));
            } else if !ok {
                return reply(403, "text/plain", "open the URL printed by `akbun-storyboard serve`");
            }
        }
        None => {
            // Loopback mode: refuse other Host names so a DNS rebinding page cannot reach the API.
            let h = header(req, "Host").unwrap_or_default();
            if !(h.starts_with("127.0.0.1") || h.starts_with("localhost") || h.starts_with("[::1]")) {
                return reply(403, "text/plain", "bad host");
            }
        }
    }
    let mut r = match (&method, path.as_str()) {
        (Method::Get, "/" | "/index.html") => reply(200, "text/html; charset=utf-8", INDEX),
        (Method::Get, "/app.js") => reply(200, "text/javascript; charset=utf-8", APP_JS),
        (Method::Get, "/style.css") => reply(200, "text/css; charset=utf-8", STYLE),
        (Method::Get, "/api/rev") => json_reply(store.rev().map(|n| json!({"rev": n}))),
        (Method::Get, "/api/ops") => json_reply(Ok(json!(ops::list().into_iter().map(|o| json!({
            "name": o.name, "description": o.description, "inputSchema": o.schema
        })).collect::<Vec<_>>()))),
        (Method::Get, p) if p.starts_with("/media/") => media(store, &p[7..]),
        (Method::Post, p) if p.starts_with("/api/") => {
            // A custom header forces a CORS preflight we never answer, so other sites cannot POST here.
            if header(req, "X-Storyboard").is_none() {
                return reply(403, "text/plain", "missing X-Storyboard header");
            }
            let mut body = vec![];
            if req.as_reader().take(64 << 20).read_to_end(&mut body).is_err() {
                return reply(400, "text/plain", "bad body");
            }
            post(store, p, &url, &body)
        }
        _ => reply(404, "text/plain", "not found"),
    };
    r.cookie = cookie;
    r
}

fn post(store: &Store, path: &str, url: &str, body: &[u8]) -> Reply {
    if let Some(name) = path.strip_prefix("/api/op/") {
        let args = if body.is_empty() { Ok(json!({})) } else { serde_json::from_slice(body) };
        return json_reply(args.map_err(Into::into).and_then(|a| ops::call(store, name, &a)));
    }
    if path == "/api/media" {
        let name = query(url, "name").map(pct_decode).unwrap_or_else(|| "image".into());
        let pid = query(url, "project_id").and_then(|v| v.parse().ok());
        return json_reply(store.media_add(body, &name, pid));
    }
    reply(404, "text/plain", "not found")
}

fn media(store: &Store, id: &str) -> Reply {
    let Ok(id) = id.parse::<i64>() else { return reply(404, "text/plain", "not found") };
    match store.media_path(id).and_then(|p| Ok((std::fs::read(&p)?, p))) {
        Ok((bytes, p)) => reply(200, store::mime(p.extension().and_then(|e| e.to_str()).unwrap_or("")), bytes),
        Err(_) => reply(404, "text/plain", "not found"),
    }
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = vec![];
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(x) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(x);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn random_token() -> String {
    // RandomState is seeded from the OS per process; two hashers give 128 bits.
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let part = || {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(t);
        h.finish()
    };
    format!("{:016x}{:016x}", part(), part())
}

/// The address other devices on the network can reach. No packet is sent.
fn lan_ip() -> Option<String> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn open_browser(url: &str) {
    let (cmd, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![url])
    } else if cfg!(windows) {
        ("cmd", vec!["/c", "start", "", url])
    } else {
        ("xdg-open", vec![url])
    };
    let _ = std::process::Command::new(cmd).args(args).spawn();
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};

    /// Real server on a free port with a throwaway data folder; returns its address.
    fn start(token: Option<&'static str>) -> String {
        let dir = std::env::temp_dir().join(format!("akbun-sb-web-{}-{}", std::process::id(), token.unwrap_or("local")));
        let _ = std::fs::remove_dir_all(&dir);
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let addr = server.server_addr().to_ip().unwrap().to_string();
        std::thread::spawn(move || super::serve_loop(&crate::store::Store::open(&dir).unwrap(), &server, token));
        addr
    }

    /// Minimal HTTP/1.1 client: returns (status, headers+body as text).
    fn req(addr: &str, method: &str, path: &str, headers: &[&str], body: &[u8]) -> (u16, String) {
        let mut s = std::net::TcpStream::connect(addr).unwrap();
        let mut head = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n", body.len());
        for h in headers {
            head += &format!("{h}\r\n");
        }
        s.write_all(format!("{head}\r\n").as_bytes()).unwrap();
        s.write_all(body).unwrap();
        let mut out = vec![];
        s.read_to_end(&mut out).unwrap();
        let text = String::from_utf8_lossy(&out).to_string();
        (text[9..12].parse().unwrap(), text)
    }

    #[test]
    fn local_mode_guards_and_api() {
        let a = start(None);
        let host = "Host: 127.0.0.1";
        assert_eq!(req(&a, "GET", "/", &[host], b"").0, 200);
        assert_eq!(req(&a, "GET", "/api/rev", &["Host: evil.example"], b"").0, 403, "DNS rebinding host refused");
        assert_eq!(req(&a, "POST", "/api/op/project_list", &[host], b"").0, 403, "POST without X-Storyboard refused");
        let ok = [host, "X-Storyboard: 1"];
        let (st, body) = req(&a, "POST", "/api/op/project_add", &ok, br#"{"title":"web"}"#);
        assert!(st == 200 && body.contains("\"title\":\"web\""), "{body}");
        assert_eq!(req(&a, "POST", "/api/op/no_such_op", &ok, b"{}").0, 400);
        assert_eq!(req(&a, "POST", "/api/media?name=x.png", &ok, b"#!/bin/sh").0, 400, "non-image upload refused");
        let (st, body) = req(&a, "POST", "/api/media?name=%EC%8A%A4.png&project_id=1", &ok, &[0x89, b'P', b'N', b'G', 0]);
        assert!(st == 200 && body.contains("스.png"), "{body}");
        assert_eq!(req(&a, "GET", "/media/1", &[host], b"").0, 200);
    }

    #[test]
    fn lan_mode_needs_token() {
        let a = start(Some("tok123"));
        assert_eq!(req(&a, "GET", "/", &["Host: 192.168.0.2"], b"").0, 403);
        let (st, body) = req(&a, "GET", "/?t=tok123", &["Host: 192.168.0.2"], b"");
        assert!(st == 200 && body.contains("Set-Cookie: sbt=tok123"), "{body}");
        assert_eq!(req(&a, "GET", "/api/rev", &["Host: 192.168.0.2", "Cookie: sbt=tok123"], b"").0, 200);
        assert_eq!(req(&a, "GET", "/api/rev", &["Host: 192.168.0.2", "Cookie: sbt=wrong"], b"").0, 403);
    }

    #[test]
    fn decode_and_query() {
        assert_eq!(super::pct_decode("%EC%8A%A4%EC%BC%80%EC%B9%98.png"), "스케치.png");
        assert_eq!(super::pct_decode("a+b%2"), "a b%2");
        assert_eq!(super::query("/x?name=a&t=1", "t"), Some("1"));
    }
}
