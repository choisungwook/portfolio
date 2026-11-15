//! Text exports of a whole project: a full storyboard in Markdown (for people
//! and AI agents), a narration script, and a shot list CSV for spreadsheets.

use crate::store::Store;
use anyhow::{Result, bail};
use serde_json::Value;
use std::fmt::Write;

fn mmss(sec: f64) -> String {
    let s = sec.round() as i64;
    format!("{:02}:{:02}", s / 60, s % 60)
}

fn s(v: &Value) -> String {
    match v {
        Value::String(x) => x.trim().to_string(),
        Value::Null => String::new(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

/// One Markdown line per non-empty field; multi-line text stays readable.
fn line(out: &mut String, label: &str, v: &Value) {
    let t = s(v);
    if !t.is_empty() && t != "[]" && t != "null" {
        let _ = writeln!(out, "- **{label}**: {}", t.replace('\n', "\n  "));
    }
}

fn cell(t: &str) -> String {
    t.replace('|', "\\|").replace('\n', " ")
}

pub fn render(store: &Store, id: i64, format: &str) -> Result<String> {
    let p = store.project_tree(id)?;
    match format {
        "markdown" => Ok(markdown(store, &p)),
        "narration" => Ok(narration(&p)),
        "csv" => Ok(csv(store, &p)),
        _ => bail!("format must be markdown, narration or csv"),
    }
}

fn markdown(store: &Store, p: &Value) -> String {
    let empty = vec![];
    let arr = |k: &str| p[k].as_array().unwrap_or(&empty);
    let mut o = String::new();
    let _ = writeln!(o, "# {}\n", s(&p["title"]));
    let _ = writeln!(
        o,
        "> Exported from akbun-storyboard. Project id {}, {} scenes, {}. Ids in parentheses identify rows: change them with the akbun-storyboard tools (scene_update id=...), not by editing this file.\n",
        p["id"], arr("scenes").len(), mmss(p["total_dur"].as_f64().unwrap_or(0.0))
    );
    o.push_str("## Plan\n\n");
    for (label, k) in [("Status", "status"), ("Genre", "genre"), ("Core message", "message"), ("Audience", "audience"), ("Intent", "intent"), ("Source summary", "source_summary"), ("Answer scene", "answer_scene"), ("Motion style", "motion_style")] {
        line(&mut o, label, &p[k]);
    }
    if p["reaction"].is_object() {
        let _ = writeln!(o, "- **Reaction**: scene {}, {}", s(&p["reaction"]["scene"]), s(&p["reaction"]["text"]));
    }
    for r in p["production"].as_array().unwrap_or(&empty) {
        let _ = writeln!(o, "- **Production rule**: {}", s(r));
    }
    o.push_str("\n## Scenes\n");
    let comments = arr("comments");
    let parts = arr("parts");
    let mut current: Option<String> = None;
    for sc in arr("scenes") {
        let part = s(&sc["part"]);
        if current.as_deref() != Some(part.as_str()) {
            let title = parts.iter().find(|x| s(&x["key"]) == part).map(|x| s(&x["title"])).unwrap_or_else(|| if part.is_empty() { "No part".into() } else { part.clone() });
            let _ = writeln!(o, "\n### {title} ({})\n", if part.is_empty() { "-" } else { &part });
            current = Some(part);
        }
        let start = sc["start"].as_f64().unwrap_or(0.0);
        let dur = sc["dur"].as_f64().unwrap_or(0.0);
        let _ = writeln!(o, "#### Scene {} · {}–{} ({}s) (id {}, {})\n", sc["number"], mmss(start), mmss(start + dur), s(&sc["dur"]), sc["id"], s(&sc["status"]));
        line(&mut o, "Screen", &sc["description"]);
        line(&mut o, "Narration", &sc["narration"]);
        let shot: Vec<String> = ["shot", "move", "source"].iter().map(|k| s(&sc[*k])).filter(|x| !x.is_empty()).collect();
        if !shot.is_empty() {
            let _ = writeln!(o, "- **Shot**: {}", shot.join(" · "));
        }
        for (label, k) in [("Move note", "move_note"), ("Overlay", "overlay"), ("Intent", "intent"), ("Voice", "voice"), ("Why ADR", "adr_reason")] {
            line(&mut o, label, &sc[k]);
        }
        let sfx: Vec<String> = sc["sfx"].as_array().unwrap_or(&empty).iter().map(s).collect();
        if !sfx.is_empty() {
            let _ = writeln!(o, "- **Sound effects**: {}", sfx.join(", "));
        }
        let beats = sc["beats"].as_array().unwrap_or(&empty);
        if !beats.is_empty() {
            o.push_str("- **Beats**:\n\n  | Time | Screen | Caption · sound |\n  |---|---|---|\n");
            for b in beats {
                let _ = writeln!(o, "  | {} | {} | {} |", cell(&s(&b[0])), cell(&s(&b[1])), cell(&s(&b[2])));
            }
            o.push('\n');
        }
        for (label, k) in [("Sketch prompt", "sketch"), ("How to record", "record"), ("AI video prompt", "ai_prompt")] {
            line(&mut o, label, &sc[k]);
        }
        if let Some(mid) = sc["media_id"].as_i64()
            && let Ok(path) = store.media_path(mid)
        {
            let _ = writeln!(o, "- **Image**: media {mid}, {}", path.display());
        }
        for c in comments.iter().filter(|c| c["scene_id"] == sc["id"] && c["resolved"] == 0) {
            let _ = writeln!(o, "- **Open comment** (id {}, {}): {}", c["id"], s(&c["author"]), s(&c["body"]).replace('\n', " "));
        }
        o.push('\n');
    }
    let music = arr("music");
    if !music.is_empty() {
        o.push_str("## Music and sound effects\n\n| Type | Key | Scenes | Track | Mood · Genre | BPM | Search keywords | Id |\n|---|---|---|---|---|---|---|---|\n");
        for m in music {
            let track = [s(&m["title"]), s(&m["url"])].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ");
            let mood = [s(&m["mood"]), s(&m["genre"])].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" · ");
            let kind = if m["type"] == "sfx" { "SFX" } else { "BGM" };
            let _ = writeln!(o, "| {kind} | {} | {}–{} | {} | {} | {} | {} | {} |", cell(&s(&m["key"])), s(&m["from_scene"]), s(&m["to_scene"]), cell(&track), cell(&mood), s(&m["bpm"]), cell(&s(&m["search_keywords"])), m["id"]);
        }
        o.push('\n');
    }
    let ideas = arr("ideas");
    if !ideas.is_empty() {
        o.push_str("## Ideas\n\n");
        for i in ideas {
            let _ = writeln!(o, "- (id {}) {}", i["id"], s(&i["body"]).replace('\n', " "));
        }
        o.push('\n');
    }
    let open: Vec<&Value> = comments.iter().filter(|c| c["scene_id"].is_null() && c["resolved"] == 0).collect();
    if !open.is_empty() {
        o.push_str("## Open project comments\n\n");
        for c in open {
            let _ = writeln!(o, "- (id {}, {}) {}", c["id"], s(&c["author"]), s(&c["body"]).replace('\n', " "));
        }
    }
    o
}

/// Just the words to record, in order with timing, for voice-over or a prompter.
fn narration(p: &Value) -> String {
    let mut o = String::new();
    let scenes = p["scenes"].as_array().cloned().unwrap_or_default();
    let _ = writeln!(o, "# {} — narration\n", s(&p["title"]));
    let _ = writeln!(o, "{} scenes, {}\n", scenes.len(), mmss(p["total_dur"].as_f64().unwrap_or(0.0)));
    for sc in &scenes {
        let start = sc["start"].as_f64().unwrap_or(0.0);
        let dur = sc["dur"].as_f64().unwrap_or(0.0);
        let text = s(&sc["narration"]);
        let chars = text.chars().filter(|c| !c.is_whitespace()).count();
        let rate = if dur > 0.0 { chars as f64 / dur } else { 0.0 };
        let _ = writeln!(o, "**Scene {}** · {}–{} · {}s{}\n", sc["number"], mmss(start), mmss(start + dur), s(&sc["dur"]),
            if rate > 7.0 { format!(" · {rate:.1} chars/s, fast") } else { String::new() });
        let _ = writeln!(o, "{}\n", if text.is_empty() { "_(no narration)_".into() } else { text });
    }
    o
}

/// Shot list for a spreadsheet. A BOM makes Excel read Korean text as UTF-8.
fn csv(store: &Store, p: &Value) -> String {
    // A leading = + - @ makes spreadsheets run the cell as a formula; a quote keeps it text.
    let q = |t: String| {
        let t = if t.starts_with(['=', '+', '-', '@']) { format!("'{t}") } else { t };
        if t.contains([',', '"', '\n']) { format!("\"{}\"", t.replace('"', "\"\"")) } else { t }
    };
    let mut o = String::from("\u{FEFF}scene,part,start,end,seconds,shot,move,source,screen,narration,voice,overlay,sfx,status,image\n");
    for sc in p["scenes"].as_array().cloned().unwrap_or_default() {
        let start = sc["start"].as_f64().unwrap_or(0.0);
        let dur = sc["dur"].as_f64().unwrap_or(0.0);
        let sfx: Vec<String> = sc["sfx"].as_array().cloned().unwrap_or_default().iter().map(s).collect();
        let image = sc["media_id"].as_i64().and_then(|m| store.media_path(m).ok()).map(|p| p.display().to_string()).unwrap_or_default();
        let row = [s(&sc["number"]), s(&sc["part"]), mmss(start), mmss(start + dur), s(&sc["dur"]), s(&sc["shot"]), s(&sc["move"]), s(&sc["source"]),
            s(&sc["description"]), s(&sc["narration"]), s(&sc["voice"]), s(&sc["overlay"]), sfx.join("; "), s(&sc["status"]), image];
        o.push_str(&row.into_iter().map(q).collect::<Vec<_>>().join(","));
        o.push('\n');
    }
    o
}

#[cfg(test)]
mod tests {
    use crate::store::{COMMENT, PROJECT, SCENE, Store};
    use serde_json::json;

    #[test]
    fn exports_carry_ids_and_escape() {
        let dir = std::env::temp_dir().join(format!("akbun-sb-render-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = Store::open(&dir).unwrap();
        let pid = s.add(&PROJECT, &json!({"title": "T"})).unwrap()["id"].as_i64().unwrap();
        let sc = s.add(&SCENE, &json!({"project_id": pid, "dur": 2, "narration": "열네 글자가 넘는 아주 긴 내레이션 문장입니다", "description": "a, \"b\""})).unwrap();
        s.add(&COMMENT, &json!({"project_id": pid, "scene_id": sc["id"], "author": "me", "body": "shorter"})).unwrap();
        let md = super::render(&s, pid, "markdown").unwrap();
        assert!(md.contains(&format!("(id {}, todo)", sc["id"])) && md.contains("**Open comment**"), "{md}");
        assert!(super::render(&s, pid, "narration").unwrap().contains("fast"));
        let csv = super::render(&s, pid, "csv").unwrap();
        assert!(csv.lines().nth(1).unwrap().contains("\"a, \"\"b\"\"\""), "{csv}");
        assert!(super::render(&s, pid, "pdf").is_err());
        s.update(&SCENE, &json!({"id": sc["id"], "narration": "=HYPERLINK(1)"})).unwrap();
        assert!(super::render(&s, pid, "csv").unwrap().contains(",'=HYPERLINK(1),"), "formula neutralized");
    }
}
