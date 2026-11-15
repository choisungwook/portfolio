mod mcp;
mod ops;
mod render;
mod store;
mod web;

use anyhow::{Result, bail};
use serde_json::{Map, Value};
use std::path::PathBuf;

const SKILL: &str = include_str!("../skill/akbun-storyboard/SKILL.md");

const USAGE: &str = "akbun-storyboard - video storyboards for people and AI agents

usage:
  akbun-storyboard serve [--port 4780] [--host 127.0.0.1] [--open]   web UI
  akbun-storyboard mcp                                             MCP server on stdio
  akbun-storyboard ops                                             list operations as JSON
  akbun-storyboard <operation> [JSON | key=value ...]              run one operation
  akbun-storyboard skill                                           print the agent skill
  akbun-storyboard --version

examples:
  akbun-storyboard project_import path=/abs/storyboard-output/demo/storyboard.json
  akbun-storyboard project_get id=1
  akbun-storyboard scene_update id=3 narration=\"New line\" dur=4.5
  akbun-storyboard comment_add '{\"project_id\":1,\"scene_id\":3,\"author\":\"codex\",\"body\":\"done\"}'

data: --data <dir>, or AKBUN_STORYBOARD_DATA, default ~/.akbun-storyboard";

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let mut data = std::env::var_os("AKBUN_STORYBOARD_DATA").map(PathBuf::from);
    if let Some(i) = args.iter().position(|a| a == "--data") {
        if i + 1 >= args.len() {
            bail!("--data needs a directory");
        }
        data = Some(PathBuf::from(args.remove(i + 1)));
        args.remove(i);
    }
    let data = data.unwrap_or_else(|| home().join(".akbun-storyboard"));
    let Some(cmd) = args.first().cloned() else {
        println!("{USAGE}");
        return Ok(());
    };
    match cmd.as_str() {
        "-h" | "--help" | "help" => println!("{USAGE}"),
        "-V" | "--version" => println!("akbun-storyboard {}", env!("CARGO_PKG_VERSION")),
        "skill" => print!("{SKILL}"),
        "ops" => {
            let list: Vec<Value> = ops::list()
                .into_iter()
                .map(|o| serde_json::json!({"name": o.name, "description": o.description, "inputSchema": o.schema}))
                .collect();
            println!("{}", serde_json::to_string_pretty(&list)?);
        }
        "serve" => {
            let flag = |n: &str| args.iter().position(|a| a == n).and_then(|i| args.get(i + 1)).cloned();
            let port = flag("--port").map(|p| p.parse()).transpose()?.unwrap_or(4780);
            let host = flag("--host").unwrap_or_else(|| "127.0.0.1".into());
            web::run(&store::Store::open(&data)?, &host, port, args.iter().any(|a| a == "--open"))?;
        }
        "mcp" => mcp::run(&store::Store::open(&data)?)?,
        op => {
            if !ops::list().iter().any(|o| o.name == op) {
                bail!("unknown command {op}\n\n{USAGE}");
            }
            let input = parse_args(&args[1..])?;
            let out = ops::call(&store::Store::open(&data)?, op, &input)?;
            match out.get("text").and_then(Value::as_str) {
                Some(text) if op == "project_render" => print!("{text}"), // raw, so `> file.md` works
                _ => println!("{}", serde_json::to_string_pretty(&out)?),
            }
        }
    }
    Ok(())
}

/// `{"a":1}`, `-` (JSON on stdin) or `key=value` pairs. Values that parse as
/// JSON (numbers, null, arrays) are used as such; anything else is a string.
fn parse_args(rest: &[String]) -> Result<Value> {
    match rest {
        [] => Ok(Value::Object(Map::new())),
        [one] if one == "-" => Ok(serde_json::from_reader(std::io::stdin())?),
        [one] if one.trim_start().starts_with('{') => Ok(serde_json::from_str(one)?),
        pairs => {
            let mut m = Map::new();
            for p in pairs {
                let Some((k, v)) = p.split_once('=') else { bail!("expected key=value, got {p}") };
                m.insert(k.into(), serde_json::from_str(v).unwrap_or_else(|_| Value::String(v.into())));
            }
            Ok(Value::Object(m))
        }
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #[test]
    fn key_value_args() {
        let v = super::parse_args(&["id=3".into(), "narration=hi there".into(), "media_id=null".into()]).unwrap();
        assert_eq!(v, serde_json::json!({"id": 3, "narration": "hi there", "media_id": null}));
    }
}
