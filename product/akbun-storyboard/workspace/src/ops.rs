//! The one operation registry. The web UI, the CLI and the MCP server all list
//! and call operations from here, so an agent and a person see the same surface.

use crate::store::{self, ENTITIES, Entity, Kind, Store, id_of};
use anyhow::{Result, anyhow, bail};
use base64::Engine;
use rusqlite::types::Value as Sql;
use serde_json::{Map, Value, json};
use std::path::Path;

pub struct Op {
    pub name: String,
    pub description: String,
    pub schema: Value,
}

fn op(name: &str, description: &str, props: Value, required: &[&str]) -> Op {
    Op {
        name: name.into(),
        description: description.into(),
        schema: json!({"type": "object", "properties": props, "required": required}),
    }
}

fn props(e: &Entity, with_id: bool) -> Value {
    let mut m = Map::new();
    if with_id {
        m.insert("id".into(), json!({"type": "integer", "description": format!("{} id", e.name)}));
    }
    for (name, kind, desc) in e.cols {
        let t = match kind {
            Kind::Text => json!({"type": "string", "description": desc}),
            Kind::Int => json!({"type": ["integer", "null"], "description": desc}),
            Kind::Real => json!({"type": ["number", "null"], "description": desc}),
            Kind::Json => json!({"description": desc}),
        };
        m.insert(name.to_string(), t);
    }
    if e.ordered && !with_id {
        m.insert("after_id".into(), json!({"type": "integer", "description": "Insert right after this row; default is the end"}));
    }
    Value::Object(m)
}

pub fn list() -> Vec<Op> {
    let id = json!({"id": {"type": "integer"}});
    let mut ops = vec![
        op("project_list", "List projects with scene count, total length and open comment count.", json!({}), &[]),
        op(
            "project_get",
            "Read a whole project: fields, parts, scenes (numbered, with start seconds), music, comments, ideas. Read this before editing.",
            id.clone(),
            &["id"],
        ),
        op(
            "project_import",
            "Import a storyboard.json made by the akbun-youtube-storyboard skills. Sketches in sketches/cut_NN.png next to it are attached to scenes.",
            json!({"path": {"type": "string", "description": "Absolute path to storyboard.json"}}),
            &["path"],
        ),
        op(
            "project_export",
            "Export a project in the storyboard.json shape the storyboard skills read. Without path it returns the JSON; with path it writes the file and sketches/.",
            json!({"id": {"type": "integer"}, "path": {"type": "string", "description": "Absolute output path for storyboard.json"}}),
            &["id"],
        ),
        op(
            "project_render",
            "Export a whole project as text. markdown: every scene with all fields, ids, image paths and open comments, the best way to read a full board at once. narration: the words to record, in order with timing. csv: a shot list for spreadsheets. With path the file is written; otherwise the text is returned.",
            json!({"id": {"type": "integer"}, "format": {"type": "string", "enum": ["markdown", "narration", "csv"]}, "path": {"type": "string", "description": "Absolute output file path"}}),
            &["id"],
        ),
        op(
            "project_save",
            "Save a project to a folder (project.json plus media/) with everything: comments, ideas, statuses, sound effects.",
            json!({"id": {"type": "integer"}, "path": {"type": "string", "description": "Absolute folder path"}}),
            &["id", "path"],
        ),
        op(
            "project_load",
            "Open a folder written by project_save as a new project.",
            json!({"path": {"type": "string", "description": "Absolute folder or project.json path"}}),
            &["path"],
        ),
        op("settings_get", "Show the data folder and the image folder (media_root).", json!({}), &[]),
        op(
            "settings_update",
            "Change the image folder. Existing images are moved there. Empty media_root goes back to the default.",
            json!({"media_root": {"type": "string", "description": "Absolute folder path"}}),
            &["media_root"],
        ),
        op("storage_info", "Disk use: database size, image folder size, unused images, and image size per project.", json!({}), &[]),
        op("media_gc", "Delete images that no scene or idea uses any more.", json!({}), &[]),
        op(
            "scene_move",
            "Move a scene right after another scene, or to the start when after_id is null.",
            json!({"id": {"type": "integer"}, "after_id": {"type": ["integer", "null"]}}),
            &["id"],
        ),
        op(
            "comment_list",
            "List comments of a project. Open comments are requests from the person; resolve them with comment_update resolved=1 after acting.",
            json!({"project_id": {"type": "integer"}, "open_only": {"type": "boolean"}}),
            &["project_id"],
        ),
        op(
            "idea_list",
            "List ideas. Without project_id it lists every idea; with project_id only that project's.",
            json!({"project_id": {"type": "integer"}}),
            &[],
        ),
        op(
            "media_add",
            "Add an image (sketch, iPad drawing, photo). Give path, or base64 with name. Returns a media id to set as scene.media_id or idea.media_id.",
            json!({"path": {"type": "string"}, "base64": {"type": "string"}, "name": {"type": "string"}, "project_id": {"type": "integer"}}),
            &[],
        ),
        op(
            "media_view",
            "Look at an image. MCP returns the picture itself when it is 1 MB or less, otherwise its file path to read; the CLI always returns the path.",
            id,
            &["id"],
        ),
    ];
    for e in ENTITIES {
        let req: Vec<&str> = if e.parent.is_empty() { vec![] } else { vec![e.parent] };
        ops.push(op(&format!("{}_add", e.name), &format!("Create a {}. Returns the new row.", e.name), props(e, false), &req));
        ops.push(op(
            &format!("{}_update", e.name),
            &format!("Change fields of a {}. Only the fields you pass change. Returns the row.", e.name),
            props(e, true),
            &["id"],
        ));
        ops.push(op(&format!("{}_delete", e.name), &format!("Delete a {}.", e.name), json!({"id": {"type": "integer"}}), &["id"]));
    }
    ops
}

pub fn call(s: &Store, name: &str, args: &Value) -> Result<Value> {
    let args = if args.is_null() { &json!({}) } else { args };
    let path = |k: &str| args.get(k).and_then(Value::as_str).map(Path::new);
    match name {
        "project_list" => s.project_list(),
        "project_get" => s.project_tree(id_of(args)?),
        "project_import" => s.import_skill_json(path("path").ok_or_else(|| anyhow!("path is required"))?),
        "project_export" => s.export_skill_json(id_of(args)?, path("path")),
        "project_render" => {
            let format = args.get("format").and_then(Value::as_str).unwrap_or("markdown");
            let text = crate::render::render(s, id_of(args)?, format)?;
            match path("path") {
                Some(p) => {
                    std::fs::write(p, &text)?;
                    Ok(json!({"written": p.display().to_string(), "bytes": text.len()}))
                }
                None => Ok(json!({"format": format, "text": text})),
            }
        }
        "project_save" => s.project_save(id_of(args)?, path("path").ok_or_else(|| anyhow!("path is required"))?),
        "project_load" => s.project_load(path("path").ok_or_else(|| anyhow!("path is required"))?),
        "settings_get" => s.settings(),
        "settings_update" => s.set_media_root(args.get("media_root").and_then(Value::as_str).ok_or_else(|| anyhow!("media_root is required"))?),
        "storage_info" => s.storage(),
        "media_gc" => s.media_gc(),
        "scene_move" => {
            let id = id_of(args)?;
            s.move_after(&store::SCENE, id, args.get("after_id").and_then(Value::as_i64))?;
            s.get(&store::SCENE, id)
        }
        "comment_list" => {
            let pid = args.get("project_id").map(store::num).transpose()?.ok_or_else(|| anyhow!("project_id is required"))?;
            let open = args.get("open_only").and_then(Value::as_bool).unwrap_or(false);
            let f = if open { "project_id=?1 AND resolved=0" } else { "project_id=?1" };
            Ok(json!(s.select(&store::COMMENT, f, &[Sql::Integer(pid as i64)])?))
        }
        "idea_list" => match args.get("project_id").and_then(Value::as_i64) {
            Some(pid) => Ok(json!(s.select(&store::IDEA, "project_id=?1", &[Sql::Integer(pid)])?)),
            None => Ok(json!(s.select(&store::IDEA, "1", &[])?)),
        },
        "media_add" => {
            let pid = args.get("project_id").and_then(Value::as_i64);
            if let Some(p) = path("path") {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("image");
                s.media_add(&std::fs::read(p)?, name, pid)
            } else if let Some(b) = args.get("base64").and_then(Value::as_str) {
                let b = b.split_once(";base64,").map_or(b, |x| x.1); // accept data URLs
                let bytes = base64::engine::general_purpose::STANDARD.decode(b.trim())?;
                s.media_add(&bytes, args.get("name").and_then(Value::as_str).unwrap_or("image"), pid)
            } else {
                bail!("give path or base64")
            }
        }
        "media_view" => {
            let id = id_of(args)?;
            let p = s.media_path(id)?;
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            Ok(json!({"id": id, "path": p.display().to_string(), "mime": store::mime(ext), "url": format!("/media/{id}")}))
        }
        _ => {
            let (ent, verb) = name.rsplit_once('_').ok_or_else(|| anyhow!("unknown operation {name}"))?;
            let e = ENTITIES.iter().find(|e| e.name == ent).ok_or_else(|| anyhow!("unknown operation {name}"))?;
            match verb {
                "add" => s.add(e, args),
                "update" => s.update(e, args),
                "delete" => s.delete(e, id_of(args)?),
                _ => bail!("unknown operation {name}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_listed_op_dispatches() {
        let dir = std::env::temp_dir().join(format!("akbun-sb-ops-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = Store::open(&dir).unwrap();
        for o in list() {
            let err = call(&s, &o.name, &json!({})).err().map(|e| e.to_string()).unwrap_or_default();
            assert!(!err.contains("unknown operation"), "{} is listed but not handled", o.name);
        }
        let p = call(&s, "project_add", &json!({"title": "x"})).unwrap();
        let c = call(&s, "comment_add", &json!({"project_id": p["id"], "body": "fix scene 2", "author": "me"})).unwrap();
        assert_eq!(call(&s, "comment_list", &json!({"project_id": p["id"], "open_only": true})).unwrap().as_array().unwrap().len(), 1);
        call(&s, "comment_update", &json!({"id": c["id"], "resolved": 1})).unwrap();
        assert_eq!(call(&s, "comment_list", &json!({"project_id": p["id"], "open_only": true})).unwrap(), json!([]));
        // Agents follow the docs: every operation they name must exist.
        let names: Vec<String> = list().into_iter().map(|o| o.name).collect();
        for (doc, text) in [("SKILL.md", include_str!("../skill/akbun-storyboard/SKILL.md")), ("manual.md", include_str!("../../manual.md")), ("README.md", include_str!("../../README.md"))] {
            for word in text.split(|c: char| !(c.is_ascii_lowercase() || c == '_')) {
                let verbs = ["_add", "_update", "_delete", "_get", "_list", "_import", "_export", "_save", "_load", "_move", "_view", "_gc", "_info", "_render"];
                if word.contains('_') && verbs.iter().any(|v| word.ends_with(v)) {
                    assert!(names.iter().any(|n| n == word), "{doc} mentions {word}, which is not an operation");
                }
            }
        }
        let png = base64::engine::general_purpose::STANDARD.encode([0x89, b'P', b'N', b'G', 1]);
        let m = call(&s, "media_add", &json!({"base64": format!("data:image/png;base64,{png}"), "name": "a.png"})).unwrap();
        assert!(call(&s, "media_view", &json!({"id": m["id"]})).unwrap()["path"].as_str().unwrap().ends_with(".png"));
    }
}
