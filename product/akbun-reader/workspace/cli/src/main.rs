mod api;
mod auth;
mod export;
mod import;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use reqwest::Method;
use serde_json::{Value, json};
use std::path::PathBuf;

#[derive(Parser)]
#[command(version, about = "개인 읽기 보관함 CLI")]
struct Args {
  #[arg(long, default_value = "https://reader.akbun.com", global = true)]
  server: String,
  #[arg(long, global = true)]
  json: bool,
  #[command(subcommand)]
  command: Command,
}
#[derive(Subcommand)]
enum Command {
  Auth {
    #[command(subcommand)]
    command: Auth,
  },
  List {
    #[arg(long, default_value = "inbox")]
    location: String,
    #[arg(long, default_value_t = 0)]
    offset: u64,
    #[arg(long, default_value = "")]
    tag: String,
  },
  Save {
    url: String,
    #[arg(long)]
    title: Option<String>,
    #[arg(long)]
    tag: Vec<String>,
  },
  Tag {
    id: uuid::Uuid,
    tags: Vec<String>,
  },
  Open {
    id: uuid::Uuid,
  },
  Archive {
    id: uuid::Uuid,
  },
  Export {
    #[arg(long)]
    vault: PathBuf,
  },
  Import {
    csv: PathBuf,
    #[arg(long)]
    bodies: PathBuf,
    #[arg(long)]
    mapping: Option<PathBuf>,
  },
}
#[derive(Subcommand)]
enum Auth {
  Login,
  Logout,
  Status,
}

fn run(args: &Args) -> Result<Value> {
  let base = api::base_url(&args.server)?;
  if let Command::Auth { command } = &args.command {
    match command {
      Auth::Login => {
        auth::login(base)?;
        return Ok(json!({"authenticated":true}));
      }
      Auth::Logout => {
        auth::entry(&base)?.delete_credential()?;
        return Ok(json!({"local_credential_removed":true}));
      }
      Auth::Status => {}
    }
  }
  let api = api::Api::new(base, auth::token(&api::base_url(&args.server)?)?)?;
  match &args.command {
    Command::Auth { .. } => api.call(Method::GET, "me", None),
    Command::List {
      location,
      offset,
      tag,
    } => {
      let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("location", location)
        .append_pair("offset", &offset.to_string())
        .append_pair("tag", tag)
        .finish();
      api.call(Method::GET, &format!("documents?{query}"), None)
    }
    Command::Save { url, title, tag } => {
      let mut body = json!({"url":url,"tags":tag});
      if let Some(title) = title {
        body["title"] = json!(title);
      }
      api.call(Method::POST, "documents", Some(&body))
    }
    Command::Tag { id, tags } => {
      let path = format!("documents/{id}");
      let current = api.call(Method::GET, &path, None)?;
      let mut names: Vec<String> = serde_json::from_value(current["tags"].clone())?;
      for tag in tags {
        if !names.contains(tag) {
          names.push(tag.clone());
        }
      }
      api.call(
        Method::PATCH,
        &path,
        Some(&json!({"version":current["version"], "tags":names})),
      )
    }
    Command::Archive { id } => {
      let path = format!("documents/{id}");
      let current = api.call(Method::GET, &path, None)?;
      api.call(
        Method::PATCH,
        &path,
        Some(&json!({"version":current["version"], "location":"archive"})),
      )
    }
    Command::Open { id } => {
      let current = api.call(Method::GET, &format!("documents/{id}"), None)?;
      let url = url::Url::parse(current["normalized_url"].as_str().context("URL 누락")?)?;
      anyhow::ensure!(
        ["http", "https"].contains(&url.scheme())
          && url.username().is_empty()
          && url.password().is_none(),
        "HTTP(S) URL만 열 수 있습니다."
      );
      webbrowser::open(url.as_str())?;
      Ok(json!({"opened":url.as_str()}))
    }
    Command::Export { vault } => export::run(&api, vault),
    Command::Import {
      csv,
      bodies,
      mapping,
    } => import::run(&api, csv, bodies, mapping.as_deref()),
  }
}

fn clean(value: &str) -> String {
  value
    .chars()
    .map(|c| if c.is_control() { ' ' } else { c })
    .collect()
}
fn human(value: &Value) {
  if let Some(documents) = value["documents"].as_array() {
    println!("ID\t위치\t제목");
    for doc in documents {
      println!(
        "{}\t{}\t{}",
        clean(doc["id"].as_str().unwrap_or("")),
        clean(doc["location"].as_str().unwrap_or("")),
        clean(doc["title"].as_str().unwrap_or(""))
      );
    }
    println!("다음 offset: {}", value["next_offset"]);
  } else {
    println!("{}", serde_json::to_string_pretty(value).unwrap());
  }
}
fn main() {
  let args = Args::parse();
  match run(&args) {
    Ok(value) => {
      if args.json {
        println!("{value}");
      } else {
        human(&value);
      }
    }
    Err(error) => {
      eprintln!("{}", clean(&format!("{error:#}")));
      std::process::exit(1);
    }
  }
}
