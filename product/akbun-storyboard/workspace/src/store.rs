//! SQLite storage. Every surface (web, CLI, MCP) goes through these functions.

use anyhow::{Context, Result, anyhow, bail};
use rusqlite::{Connection, params, params_from_iter, types::Value as Sql};
use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Text,
    Int,
    Real,
    Json,
}
use Kind::*;

/// A table the generic add/update/delete ops work on.
pub struct Entity {
    pub name: &'static str,
    pub table: &'static str,
    /// Column that must be given on add (the owner), or "" for none.
    pub parent: &'static str,
    /// True when rows are ordered by a `pos` column.
    pub ordered: bool,
    pub cols: &'static [(&'static str, Kind, &'static str)],
}

pub const PROJECT: Entity = Entity {
    name: "project",
    table: "projects",
    parent: "",
    ordered: false,
    cols: &[
        ("title", Text, "Working title"),
        ("genre", Text, "Genre id, e.g. it-handson"),
        ("message", Text, "Core message in one sentence"),
        ("audience", Text, "Who watches"),
        ("intent", Text, "Why the video is structured this way"),
        ("source_summary", Text, "Summary of the source idea or post"),
        ("motion_style", Text, "English style sentence for motion graphic scenes"),
        ("production", Json, "Array of shared production rules"),
        ("answer_scene", Int, "Scene number where the hook's promise is shown"),
        ("reaction", Json, "{scene, text}: the element that makes viewers respond"),
        ("status", Text, "draft | ready | recording | editing | published"),
    ],
};

pub const PART: Entity = Entity {
    name: "part",
    table: "parts",
    parent: "project_id",
    ordered: true,
    cols: &[
        ("project_id", Int, "Owner project"),
        ("key", Text, "Short id scenes refer to, e.g. hook"),
        ("title", Text, "Part title"),
    ],
};

pub const SCENE: Entity = Entity {
    name: "scene",
    table: "scenes",
    parent: "project_id",
    ordered: true,
    cols: &[
        ("project_id", Int, "Owner project"),
        ("part", Text, "Part key"),
        ("dur", Real, "Length in seconds"),
        ("shot", Text, "Shot id, e.g. screen-zoom"),
        ("move", Text, "Camera move id, e.g. punch-in"),
        ("move_note", Text, "Numbers for the move, e.g. 100->140%, 0.3s"),
        ("source", Text, "screen recording | filming | motion graphic | photo"),
        ("sketch", Text, "English description used to draw the sketch"),
        ("description", Text, "What is on screen"),
        ("intent", Text, "Why the scene is drawn this way"),
        ("narration", Text, "Script spoken in this scene"),
        ("voice", Text, "live | adr | none"),
        ("adr_reason", Text, "Why the voice is recorded afterwards"),
        ("overlay", Text, "Captions or motion graphics laid on top"),
        ("sfx", Json, "Array of sound effect descriptions"),
        ("beats", Json, "Array of [time, screen, caption/sound]"),
        ("record", Text, "How to record it"),
        ("ai_prompt", Text, "English prompt for AI video generation"),
        ("media_id", Int, "Image shown on the card (sketch or photo)"),
        ("status", Text, "todo | sketched | recorded | done"),
    ],
};

pub const MUSIC: Entity = Entity {
    name: "music",
    table: "music",
    parent: "project_id",
    ordered: true,
    cols: &[
        ("project_id", Int, "Owner project"),
        ("type", Text, "bgm (background music) | sfx (sound effect)"),
        ("key", Text, "Short id, e.g. bgm1 or whoosh"),
        ("from_scene", Int, "First scene number (inclusive)"),
        ("to_scene", Int, "Last scene number (inclusive)"),
        ("title", Text, "Chosen track title"),
        ("url", Text, "Where the track lives"),
        ("mood", Text, "Mood in a word or two"),
        ("genre", Text, "Music genre"),
        ("bpm", Real, "Tempo"),
        ("instruments", Text, "Lead instruments"),
        ("energy", Text, "How energy changes across the range"),
        ("search_keywords", Text, "English keywords for a music library"),
        ("generation_prompt", Text, "English prompt for music generation"),
        ("note", Text, "Free note"),
    ],
};

pub const IDEA: Entity = Entity {
    name: "idea",
    table: "ideas",
    parent: "",
    ordered: false,
    cols: &[
        ("project_id", Int, "Project it belongs to, or null for the inbox"),
        ("body", Text, "The idea"),
        ("tags", Text, "Comma separated tags"),
        ("media_id", Int, "Attached image"),
    ],
};

pub const COMMENT: Entity = Entity {
    name: "comment",
    table: "comments",
    parent: "project_id",
    ordered: false,
    cols: &[
        ("project_id", Int, "Owner project"),
        ("scene_id", Int, "Scene the comment is on, or null for the project"),
        ("author", Text, "Who wrote it: me, claude, codex, gemini ..."),
        ("body", Text, "Comment text"),
        ("resolved", Int, "1 when handled"),
    ],
};

pub const ENTITIES: [&Entity; 6] = [&PROJECT, &PART, &SCENE, &MUSIC, &IDEA, &COMMENT];

const SCHEMA: &str = r#"
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS media(id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT NOT NULL DEFAULT '', ext TEXT NOT NULL DEFAULT 'png', bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled', genre TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', intent TEXT NOT NULL DEFAULT '', source_summary TEXT NOT NULL DEFAULT '', motion_style TEXT NOT NULL DEFAULT '', production TEXT NOT NULL DEFAULT '[]', answer_scene INTEGER, reaction TEXT NOT NULL DEFAULT 'null', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS parts(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, pos REAL NOT NULL DEFAULT 0, key TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS scenes(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, pos REAL NOT NULL DEFAULT 0, part TEXT NOT NULL DEFAULT '', dur REAL NOT NULL DEFAULT 5, shot TEXT NOT NULL DEFAULT '', move TEXT NOT NULL DEFAULT '', move_note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', sketch TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', intent TEXT NOT NULL DEFAULT '', narration TEXT NOT NULL DEFAULT '', voice TEXT NOT NULL DEFAULT 'none', adr_reason TEXT NOT NULL DEFAULT '', overlay TEXT NOT NULL DEFAULT '', sfx TEXT NOT NULL DEFAULT '[]', beats TEXT NOT NULL DEFAULT '[]', record TEXT NOT NULL DEFAULT '', ai_prompt TEXT NOT NULL DEFAULT '', media_id INTEGER REFERENCES media(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'todo');
CREATE TABLE IF NOT EXISTS music(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, pos REAL NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'bgm', key TEXT NOT NULL DEFAULT '', from_scene INTEGER, to_scene INTEGER, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '', bpm REAL, instruments TEXT NOT NULL DEFAULT '', energy TEXT NOT NULL DEFAULT '', search_keywords TEXT NOT NULL DEFAULT '', generation_prompt TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ideas(id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, body TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', media_id INTEGER REFERENCES media(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, scene_id INTEGER REFERENCES scenes(id) ON DELETE CASCADE, author TEXT NOT NULL DEFAULT 'me', body TEXT NOT NULL DEFAULT '', resolved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rev(n INTEGER NOT NULL);
INSERT INTO rev SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM rev);
"#;

pub struct Store {
    pub conn: Connection,
    pub dir: PathBuf,
}

impl Store {
    pub fn open(dir: &Path) -> Result<Store> {
        std::fs::create_dir_all(dir)?;
        let dir = &std::fs::canonicalize(dir)?; // absolute paths in settings and messages
        let conn = Connection::open(dir.join("storyboard.db"))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(SCHEMA)?;
        // Every write bumps rev so open browsers notice changes made by the CLI or MCP.
        for t in ["projects", "parts", "scenes", "music", "ideas", "comments", "media", "settings"] {
            for ev in ["INSERT", "UPDATE", "DELETE"] {
                conn.execute_batch(&format!(
                    "CREATE TRIGGER IF NOT EXISTS rev_{t}_{ev} AFTER {ev} ON {t} BEGIN UPDATE rev SET n=n+1; END;"
                ))?;
            }
        }
        Ok(Store { conn, dir: dir.to_path_buf() })
    }

    pub fn rev(&self) -> Result<i64> {
        Ok(self.conn.query_row("SELECT n FROM rev", [], |r| r.get(0))?)
    }

    fn col_kind(e: &Entity, name: &str) -> Option<Kind> {
        e.cols.iter().find(|c| c.0 == name).map(|c| c.1)
    }

    fn to_sql(kind: Kind, v: &Value) -> Result<Sql> {
        Ok(match (kind, v) {
            // Text and JSON columns are NOT NULL; only numbers and references may be empty.
            (Text, Value::Null) => Sql::Text(String::new()),
            (_, Value::Null) if kind != Json => Sql::Null,
            (Json, v) => Sql::Text(v.to_string()),
            (Text, Value::String(s)) => Sql::Text(s.clone()),
            (Text, v) => Sql::Text(v.to_string()),
            (Int, Value::Bool(b)) => Sql::Integer(*b as i64),
            (Int, v) => Sql::Integer(num(v)? as i64),
            (Real, v) => Sql::Real(num(v)?),
        })
    }

    /// One row as a JSON object, with JSON columns parsed back.
    pub fn get(&self, e: &Entity, id: i64) -> Result<Value> {
        self.select(e, "id=?1", &[Sql::Integer(id)])?
            .pop()
            .ok_or_else(|| anyhow!("{} {id} not found", e.name))
    }

    pub fn select(&self, e: &Entity, filter: &str, args: &[Sql]) -> Result<Vec<Value>> {
        let order = if e.ordered { "pos, id" } else { "id" };
        let sql = format!("SELECT * FROM {} WHERE {filter} ORDER BY {order}", e.table);
        let mut st = self.conn.prepare(&sql)?;
        let names: Vec<String> = st.column_names().map(|s| s.to_string()).collect();
        let rows = st.query_map(params_from_iter(args.iter()), |r| {
            let mut m = Map::new();
            for (i, n) in names.iter().enumerate() {
                let v: Sql = r.get(i)?;
                let j = match v {
                    Sql::Null => Value::Null,
                    Sql::Integer(x) => json!(x),
                    // 7.0 -> 7 so exports match hand-written storyboard.json
                    Sql::Real(x) if x.fract() == 0.0 && x.abs() < 1e15 => json!(x as i64),
                    Sql::Real(x) => json!(x),
                    Sql::Text(s) if Self::col_kind(e, n) == Some(Json) => {
                        serde_json::from_str(&s).unwrap_or(Value::String(s))
                    }
                    Sql::Text(s) => Value::String(s),
                    Sql::Blob(_) => Value::Null,
                };
                m.insert(n.clone(), j);
            }
            Ok(Value::Object(m))
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn add(&self, e: &Entity, args: &Value) -> Result<Value> {
        let obj = args.as_object().ok_or_else(|| anyhow!("arguments must be an object"))?;
        if !e.parent.is_empty() && obj.get(e.parent).is_none_or(Value::is_null) {
            bail!("{} is required", e.parent);
        }
        let (mut cols, mut vals) = (vec![], vec![]);
        for (k, v) in obj {
            if let Some(kind) = Self::col_kind(e, k) {
                cols.push(k.clone());
                vals.push(Self::to_sql(kind, v)?);
            }
        }
        if e.ordered {
            let parent = obj.get(e.parent).map(num).transpose()?.unwrap_or(0.0) as i64;
            let pos: f64 = self.conn.query_row(
                &format!("SELECT COALESCE(MAX(pos),0)+1 FROM {} WHERE {}=?1", e.table, e.parent),
                [parent],
                |r| r.get(0),
            )?;
            cols.push("pos".into());
            vals.push(Sql::Real(pos));
        }
        let sql = if cols.is_empty() {
            format!("INSERT INTO {} DEFAULT VALUES", e.table)
        } else {
            let marks = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
            format!("INSERT INTO {} ({}) VALUES ({marks})", e.table, cols.join(","))
        };
        self.conn.execute(&sql, params_from_iter(vals.iter()))?;
        let id = self.conn.last_insert_rowid();
        if let Some(after) = obj.get("after_id").and_then(Value::as_i64) {
            self.move_after(e, id, Some(after))?;
        }
        self.get(e, id)
    }

    pub fn update(&self, e: &Entity, args: &Value) -> Result<Value> {
        let id = id_of(args)?;
        let obj = args.as_object().unwrap();
        let old_media = if obj.contains_key("media_id") { self.media_of(e, id) } else { None };
        let mut sets = vec![];
        let mut vals = vec![];
        for (k, v) in obj {
            if k == e.parent && !e.parent.is_empty() {
                continue; // moving rows between projects is not supported
            }
            if let Some(kind) = Self::col_kind(e, k) {
                vals.push(Self::to_sql(kind, v)?);
                sets.push(format!("{k}=?{}", vals.len()));
            }
        }
        if e.table == "projects" {
            sets.push("updated_at=CURRENT_TIMESTAMP".into());
        }
        if !sets.is_empty() {
            vals.push(Sql::Integer(id));
            let sql = format!("UPDATE {} SET {} WHERE id=?{}", e.table, sets.join(","), vals.len());
            if self.conn.execute(&sql, params_from_iter(vals.iter()))? == 0 {
                bail!("{} {id} not found", e.name);
            }
        }
        if let Some(m) = old_media {
            self.drop_media_if_unused(m)?; // a replaced picture should not keep using disk
        }
        self.get(e, id)
    }

    fn media_of(&self, e: &Entity, id: i64) -> Option<i64> {
        if !Self::col_kind(e, "media_id").is_some() {
            return None;
        }
        self.conn.query_row(&format!("SELECT media_id FROM {} WHERE id=?1", e.table), [id], |r| r.get(0)).ok().flatten()
    }

    pub fn delete(&self, e: &Entity, id: i64) -> Result<Value> {
        let media: Vec<i64> = if e.table == "projects" {
            let mut st = self.conn.prepare(
                "SELECT id FROM media WHERE project_id=?1 UNION SELECT media_id FROM scenes WHERE project_id=?1 AND media_id IS NOT NULL",
            )?;
            st.query_map([id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?
        } else {
            self.media_of(e, id).into_iter().collect()
        };
        let n = self.conn.execute(&format!("DELETE FROM {} WHERE id=?1", e.table), [id])?;
        if n == 0 {
            bail!("{} {id} not found", e.name);
        }
        for m in media {
            self.drop_media_if_unused(m)?;
        }
        Ok(json!({"deleted": id}))
    }

    /// Put row `id` right after `after` (or first when None) and renumber pos.
    pub fn move_after(&self, e: &Entity, id: i64, after: Option<i64>) -> Result<()> {
        let parent: i64 = self.conn.query_row(
            &format!("SELECT {} FROM {} WHERE id=?1", e.parent, e.table),
            [id],
            |r| r.get(0),
        )?;
        let mut st = self
            .conn
            .prepare(&format!("SELECT id FROM {} WHERE {}=?1 AND id<>?2 ORDER BY pos, id", e.table, e.parent))?;
        let mut ids: Vec<i64> = st.query_map([parent, id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        let at = match after {
            None => 0,
            Some(a) => ids.iter().position(|x| *x == a).map(|i| i + 1).unwrap_or(ids.len()),
        };
        ids.insert(at, id);
        for (i, x) in ids.iter().enumerate() {
            self.conn
                .execute(&format!("UPDATE {} SET pos=?1 WHERE id=?2", e.table), params![i as f64 + 1.0, x])?;
        }
        Ok(())
    }

    // ---------- media ----------

    /// Folder holding image files: the `media_root` setting, or `<data>/media`.
    pub fn media_dir(&self) -> PathBuf {
        self.conn
            .query_row("SELECT value FROM settings WHERE key='media_root'", [], |r| r.get::<_, String>(0))
            .ok()
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| self.dir.join("media"))
    }

    pub fn media_path(&self, id: i64) -> Result<PathBuf> {
        let ext: String = self
            .conn
            .query_row("SELECT ext FROM media WHERE id=?1", [id], |r| r.get(0))
            .context("media not found")?;
        Ok(self.media_dir().join(format!("{id}.{ext}")))
    }

    pub fn media_add(&self, bytes: &[u8], name: &str, project_id: Option<i64>) -> Result<Value> {
        let ext = image_ext(name, bytes)?;
        let dir = self.media_dir();
        std::fs::create_dir_all(&dir)?;
        self.conn.execute(
            "INSERT INTO media(project_id, name, ext, bytes) VALUES (?1, ?2, ?3, ?4)",
            params![project_id, name, ext, bytes.len() as i64],
        )?;
        let id = self.conn.last_insert_rowid();
        std::fs::write(dir.join(format!("{id}.{ext}")), bytes)?;
        Ok(json!({"id": id, "url": format!("/media/{id}"), "name": name, "bytes": bytes.len()}))
    }

    fn drop_media_if_unused(&self, id: i64) -> Result<bool> {
        let refs: i64 = self.conn.query_row(
            "SELECT (SELECT COUNT(*) FROM scenes WHERE media_id=?1) + (SELECT COUNT(*) FROM ideas WHERE media_id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if refs > 0 {
            return Ok(false);
        }
        if let Ok(p) = self.media_path(id) {
            let _ = std::fs::remove_file(p);
        }
        self.conn.execute("DELETE FROM media WHERE id=?1", [id])?;
        Ok(true)
    }

    /// Delete images no scene or idea uses, older than a minute (fresh uploads
    /// are briefly unattached between media_add and the update that uses them).
    pub fn media_gc(&self) -> Result<Value> {
        let mut st = self.conn.prepare(
            "SELECT id, bytes FROM media WHERE id NOT IN (SELECT media_id FROM scenes WHERE media_id IS NOT NULL)
               AND id NOT IN (SELECT media_id FROM ideas WHERE media_id IS NOT NULL)
               AND created_at < datetime('now', '-1 minute')",
        )?;
        let rows: Vec<(i64, i64)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
        let mut freed = 0;
        for (id, b) in &rows {
            if self.drop_media_if_unused(*id)? {
                freed += b;
            }
        }
        Ok(json!({"deleted": rows.len(), "freed_bytes": freed}))
    }

    pub fn settings(&self) -> Result<Value> {
        let default = self.dir.join("media");
        Ok(json!({"data_dir": self.dir.display().to_string(), "media_root": self.media_dir().display().to_string(),
            "default_media_root": default.display().to_string()}))
    }

    /// Change where images live and move the existing files there. An empty
    /// value goes back to `<data>/media`.
    pub fn set_media_root(&self, root: &str) -> Result<Value> {
        let new = if root.trim().is_empty() { self.dir.join("media") } else { PathBuf::from(root.trim()) };
        if !new.is_absolute() {
            bail!("media_root must be an absolute path");
        }
        let old = self.media_dir();
        std::fs::create_dir_all(&new)?;
        if new != old {
            let mut st = self.conn.prepare("SELECT id, ext FROM media")?;
            let files: Vec<String> = st.query_map([], |r| Ok(format!("{}.{}", r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?.collect::<rusqlite::Result<_>>()?;
            // Image files are named by id, so another folder's 1.png would be overwritten.
            if let Some(f) = files.iter().find(|f| new.join(f).exists()) {
                bail!("{} already has a file named {f}; choose an empty folder", new.display());
            }
            for f in files {
                let (from, to) = (old.join(&f), new.join(&f));
                if from.exists() && std::fs::rename(&from, &to).is_err() {
                    std::fs::copy(&from, &to)?; // across volumes rename fails
                    std::fs::remove_file(&from)?;
                }
            }
        }
        self.conn.execute(
            "INSERT INTO settings(key, value) VALUES ('media_root', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [if root.trim().is_empty() { String::new() } else { new.display().to_string() }],
        )?;
        self.settings()
    }

    /// Disk use: database files, image folder, and images per project.
    pub fn storage(&self) -> Result<Value> {
        let size = |p: PathBuf| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        let db = ["storyboard.db", "storyboard.db-wal", "storyboard.db-shm"].iter().map(|f| size(self.dir.join(f))).sum::<u64>();
        let (count, bytes): (i64, i64) = self.conn.query_row("SELECT COUNT(*), COALESCE(SUM(bytes),0) FROM media", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let (ucount, ubytes): (i64, i64) = self.conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(bytes),0) FROM media WHERE id NOT IN (SELECT media_id FROM scenes WHERE media_id IS NOT NULL)
               AND id NOT IN (SELECT media_id FROM ideas WHERE media_id IS NOT NULL)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok(json!({"data_dir": self.dir.display().to_string(), "db_bytes": db, "media_root": self.media_dir().display().to_string(),
            "media_count": count, "media_bytes": bytes, "unused_count": ucount, "unused_bytes": ubytes, "projects": self.project_list()?}))
    }

    // ---------- whole project ----------

    /// A project with everything it owns, scenes numbered and timed.
    pub fn project_tree(&self, id: i64) -> Result<Value> {
        let mut p = self.get(&PROJECT, id)?;
        let pid = [Sql::Integer(id)];
        let mut start = 0.0;
        let mut scenes = self.select(&SCENE, "project_id=?1", &pid)?;
        for (i, s) in scenes.iter_mut().enumerate() {
            let dur = s["dur"].as_f64().unwrap_or(0.0);
            s["number"] = json!(i + 1);
            s["start"] = json!(start);
            start += dur;
        }
        p["total_dur"] = json!(start);
        p["parts"] = json!(self.select(&PART, "project_id=?1", &pid)?);
        p["scenes"] = json!(scenes);
        p["music"] = json!(self.select(&MUSIC, "project_id=?1", &pid)?);
        p["comments"] = json!(self.select(&COMMENT, "project_id=?1", &pid)?);
        p["ideas"] = json!(self.select(&IDEA, "project_id=?1", &pid)?);
        let mut st = self.conn.prepare(
            "SELECT id, name, bytes FROM media WHERE project_id=?1 OR id IN (SELECT media_id FROM scenes WHERE project_id=?1)
               OR id IN (SELECT media_id FROM ideas WHERE project_id=?1) ORDER BY id",
        )?;
        let media: Vec<Value> = st
            .query_map([id], |r| Ok(json!({"id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "bytes": r.get::<_, i64>(2)?})))?
            .collect::<rusqlite::Result<_>>()?;
        p["media_bytes"] = json!(media.iter().map(|m| m["bytes"].as_i64().unwrap_or(0)).sum::<i64>());
        p["media"] = json!(media);
        Ok(p)
    }

    pub fn project_list(&self) -> Result<Value> {
        let mut st = self.conn.prepare(
            "SELECT p.id, p.title, p.status, p.updated_at,
               (SELECT COUNT(*) FROM scenes s WHERE s.project_id=p.id),
               (SELECT COALESCE(SUM(dur),0) FROM scenes s WHERE s.project_id=p.id),
               (SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id AND c.resolved=0),
               (SELECT COUNT(*) || ',' || COALESCE(SUM(bytes),0) FROM media m WHERE m.project_id=p.id
                  OR m.id IN (SELECT media_id FROM scenes s WHERE s.project_id=p.id))
             FROM projects p ORDER BY p.updated_at DESC, p.id DESC",
        )?;
        let rows = st.query_map([], |r| {
            let m: String = r.get(7)?;
            let media = m.split_once(',').map(|(a, b)| (a.parse::<i64>().unwrap_or(0), b.parse::<i64>().unwrap_or(0))).unwrap_or((0, 0));
            Ok(json!({"id": r.get::<_, i64>(0)?, "title": r.get::<_, String>(1)?, "status": r.get::<_, String>(2)?,
                "updated_at": r.get::<_, String>(3)?, "scene_count": r.get::<_, i64>(4)?,
                "total_dur": r.get::<_, f64>(5)?, "open_comments": r.get::<_, i64>(6)?,
                "media_count": media.0, "media_bytes": media.1}))
        })?;
        Ok(json!(rows.collect::<rusqlite::Result<Vec<_>>>()?))
    }

    /// Import a storyboard.json written by the akbun-youtube-storyboard skills.
    /// Sketches are picked up from `sketches/cut_NN.png` next to the file.
    pub fn import_skill_json(&self, path: &Path) -> Result<Value> {
        let text = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let d: Value = serde_json::from_str(&text)?;
        let dir = path.parent().unwrap_or(Path::new("."));
        let mut written = vec![];
        self.conn.execute_batch("BEGIN")?;
        let r = (|| -> Result<i64> {
            let mut p = d.clone();
            p["answer_scene"] = d["answer_cut"].clone();
            if let Some(r) = d.get("reaction").filter(|r| r.is_object()) {
                p["reaction"] = json!({"scene": r["cut"], "text": r["text"]});
            }
            let pid = self.add(&PROJECT, &p)?["id"].as_i64().unwrap();
            for part in d["parts"].as_array().into_iter().flatten() {
                self.add(&PART, &json!({"project_id": pid, "key": part["id"], "title": part["title"]}))?;
            }
            for m in d["music"].as_array().into_iter().flatten() {
                let mut m = m.clone();
                m["project_id"] = json!(pid);
                m["key"] = m["id"].take();
                m["from_scene"] = m["from_cut"].clone();
                m["to_scene"] = m["to_cut"].clone();
                self.add(&MUSIC, &m)?;
            }
            for (i, c) in d["cuts"].as_array().into_iter().flatten().enumerate() {
                let mut c = c.clone();
                c["project_id"] = json!(pid);
                c["description"] = c["desc"].clone();
                let sketch = dir.join("sketches").join(format!("cut_{:02}.png", i + 1));
                if let Ok(bytes) = std::fs::read(&sketch) {
                    let m = self.media_add(&bytes, &format!("cut_{:02}.png", i + 1), Some(pid))?["id"].clone();
                    written.push(self.media_path(m.as_i64().unwrap())?);
                    c["media_id"] = m;
                }
                self.add(&SCENE, &c)?;
            }
            Ok(pid)
        })();
        let pid = self.finish_tx(r, &written)?;
        let t = self.project_tree(pid)?;
        Ok(json!({"id": pid, "title": t["title"], "scenes": t["scenes"].as_array().map_or(0, Vec::len)}))
    }

    /// Export back to the skill's storyboard.json shape. When `out` is a path,
    /// write it there with images under `sketches/`.
    pub fn export_skill_json(&self, id: i64, out: Option<&Path>) -> Result<Value> {
        let t = self.project_tree(id)?;
        let pick = |src: &Value, keys: &[&str]| {
            let mut m = Map::new();
            for k in keys {
                let v = &src[*k];
                let empty = v.is_null() || v == "" || v.as_array().is_some_and(Vec::is_empty);
                if !empty {
                    m.insert(k.to_string(), v.clone());
                }
            }
            m
        };
        let mut d = pick(
            &t,
            &["title", "genre", "message", "audience", "intent", "source_summary", "motion_style", "production"],
        );
        if !t["answer_scene"].is_null() {
            d.insert("answer_cut".into(), t["answer_scene"].clone());
        }
        if t["reaction"].is_object() {
            d.insert("reaction".into(), json!({"cut": t["reaction"]["scene"], "text": t["reaction"]["text"]}));
        }
        let parts: Vec<Value> =
            t["parts"].as_array().unwrap().iter().map(|p| json!({"id": p["key"], "title": p["title"]})).collect();
        d.insert("parts".into(), json!(parts));
        let music: Vec<Value> = t["music"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|m| m["type"] != "sfx") // the skill format has no sound effect list
            .map(|m| {
                let mut o = pick(m, &["mood", "genre", "bpm", "instruments", "energy", "search_keywords", "generation_prompt", "title", "url", "note"]);
                o.insert("id".into(), m["key"].clone());
                o.insert("from_cut".into(), m["from_scene"].clone());
                o.insert("to_cut".into(), m["to_scene"].clone());
                Value::Object(o)
            })
            .collect();
        d.insert("music".into(), json!(music));
        let mut cuts = vec![];
        for s in t["scenes"].as_array().unwrap() {
            let mut c = pick(
                s,
                &["part", "dur", "shot", "move", "move_note", "source", "sketch", "intent", "voice", "adr_reason", "overlay", "sfx", "beats", "record", "ai_prompt"],
            );
            c.insert("desc".into(), s["description"].clone());
            c.insert("narration".into(), s["narration"].clone());
            cuts.push(Value::Object(c));
            if let (Some(out), Some(mid)) = (out, s["media_id"].as_i64()) {
                let src = self.media_path(mid)?;
                let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
                let dir = out.parent().unwrap_or(Path::new(".")).join("sketches");
                std::fs::create_dir_all(&dir)?;
                std::fs::copy(&src, dir.join(format!("cut_{:02}.{ext}", s["number"].as_u64().unwrap())))?;
            }
        }
        d.insert("cuts".into(), json!(cuts));
        let d = Value::Object(d);
        if let Some(out) = out {
            std::fs::write(out, serde_json::to_string_pretty(&d)?)?;
            return Ok(json!({"written": out.display().to_string(), "cuts": cuts.len()}));
        }
        Ok(d)
    }
}

impl Store {
    /// A project as files: project.json with everything (comments, ideas,
    /// statuses, sound effects) and every image it uses under media/.
    pub fn project_bundle(&self, id: i64) -> Result<Vec<(String, Vec<u8>)>> {
        let mut t = self.project_tree(id)?;
        let mut files = Map::new();
        let mut out = vec![];
        for m in t["media"].as_array().cloned().unwrap_or_default() {
            let mid = m["id"].as_i64().unwrap();
            let src = self.media_path(mid)?;
            let name = src.file_name().unwrap().to_string_lossy().to_string();
            out.push((format!("media/{name}"), std::fs::read(&src).with_context(|| format!("read {}", src.display()))?));
            files.insert(mid.to_string(), json!(name));
        }
        t["media_files"] = Value::Object(files);
        t["format"] = json!("akbun-storyboard/1");
        out.insert(0, ("project.json".into(), serde_json::to_vec_pretty(&t)?));
        Ok(out)
    }

    /// Zip of project_bundle. Images are stored, not deflated: png and jpg are
    /// already compressed, so deflating them only costs time.
    pub fn project_zip(&self, id: i64) -> Result<Vec<u8>> {
        use zip::write::SimpleFileOptions;
        let mut z = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, bytes) in self.project_bundle(id)? {
            let method = if name.ends_with(".json") { zip::CompressionMethod::Deflated } else { zip::CompressionMethod::Stored };
            z.start_file(name, SimpleFileOptions::default().compression_method(method))?;
            std::io::Write::write_all(&mut z, &bytes)?;
        }
        Ok(z.finish()?.into_inner())
    }

    /// Save to `<name>.zip`, or to a folder for any other path.
    pub fn project_save(&self, id: i64, path: &Path) -> Result<Value> {
        if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip")) {
            let bytes = self.project_zip(id)?;
            std::fs::write(path, &bytes)?;
            return Ok(json!({"written": path.display().to_string(), "bytes": bytes.len()}));
        }
        for (name, bytes) in self.project_bundle(id)? {
            let f = path.join(&name);
            std::fs::create_dir_all(f.parent().unwrap())?;
            std::fs::write(f, bytes)?;
        }
        Ok(json!({"written": path.join("project.json").display().to_string()}))
    }

    /// Open a project zip, folder or project.json as a new project.
    pub fn project_load(&self, path: &Path) -> Result<Value> {
        if path.is_file() && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip")) {
            return self.project_load_zip(&std::fs::read(path)?);
        }
        let file = if path.is_dir() { path.join("project.json") } else { path.to_path_buf() };
        let dir = file.parent().unwrap_or(Path::new(".")).to_path_buf();
        let json = std::fs::read(&file).with_context(|| format!("read {}", file.display()))?;
        self.project_unbundle(&json, |name| Ok(std::fs::read(dir.join("media").join(name))?))
    }

    pub fn project_load_zip(&self, bytes: &[u8]) -> Result<Value> {
        let z = std::cell::RefCell::new(zip::ZipArchive::new(std::io::Cursor::new(bytes)).context("not a zip file")?);
        let read = |name: &str| -> Result<Vec<u8>> {
            let mut z = z.borrow_mut();
            let mut f = z.by_name(name).with_context(|| format!("{name} missing from the zip"))?;
            let mut v = vec![];
            std::io::Read::read_to_end(&mut f, &mut v)?;
            Ok(v)
        };
        let json = read("project.json")?;
        // Entries are looked up by exact name and never extracted, so a crafted path cannot escape.
        self.project_unbundle(&json, |name| read(&format!("media/{name}")))
    }

    fn project_unbundle(&self, json: &[u8], media_file: impl Fn(&str) -> Result<Vec<u8>>) -> Result<Value> {
        let t: Value = serde_json::from_slice(json).context("project.json is not valid JSON")?;
        if t["format"] != "akbun-storyboard/1" {
            bail!("not an akbun-storyboard project (use project_import for the skills' storyboard.json)");
        }
        let written = std::cell::RefCell::new(vec![]);
        self.conn.execute_batch("BEGIN")?;
        let r = (|| -> Result<i64> {
            let mut media = std::collections::HashMap::new();
            let mut map_media = |old: &Value, pid: i64| -> Result<Value> {
                let Some(o) = old.as_i64() else { return Ok(Value::Null) };
                if let Some(n) = media.get(&o) {
                    return Ok(json!(n));
                }
                let Some(name) = t["media_files"][o.to_string()].as_str() else { return Ok(Value::Null) };
                // Only the file name counts; "../x" in a hand-edited project.json reads nothing outside media/.
                let name = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or_default();
                let n = self.media_add(&media_file(name)?, name, Some(pid))?["id"].as_i64().unwrap();
                written.borrow_mut().push(self.media_path(n)?);
                media.insert(o, n);
                Ok(json!(n))
            };
            let strip = |v: &Value| {
                let mut v = v.clone();
                if let Some(o) = v.as_object_mut() {
                    o.remove("id");
                }
                v
            };
            let pid = self.add(&PROJECT, &strip(&t))?["id"].as_i64().unwrap();
            for x in t["parts"].as_array().into_iter().flatten() {
                let mut x = strip(x);
                x["project_id"] = json!(pid);
                self.add(&PART, &x)?;
            }
            let mut scenes = std::collections::HashMap::new();
            for x in t["scenes"].as_array().into_iter().flatten() {
                let mut n = strip(x);
                n["project_id"] = json!(pid);
                n["media_id"] = map_media(&x["media_id"], pid)?;
                scenes.insert(x["id"].as_i64().unwrap_or(0), self.add(&SCENE, &n)?["id"].clone());
            }
            for x in t["music"].as_array().into_iter().flatten() {
                let mut x = strip(x);
                x["project_id"] = json!(pid);
                self.add(&MUSIC, &x)?;
            }
            for x in t["ideas"].as_array().into_iter().flatten() {
                let mut n = strip(x);
                n["project_id"] = json!(pid);
                n["media_id"] = map_media(&x["media_id"], pid)?;
                self.add(&IDEA, &n)?;
            }
            for x in t["comments"].as_array().into_iter().flatten() {
                let mut n = strip(x);
                n["project_id"] = json!(pid);
                n["scene_id"] = x["scene_id"].as_i64().and_then(|s| scenes.get(&s).cloned()).unwrap_or(Value::Null);
                self.add(&COMMENT, &n)?;
            }
            Ok(pid)
        })();
        self.finish_tx(r, &written.into_inner()).map(|pid| json!({"id": pid, "title": t["title"]}))
    }

    /// Commit, or roll back and delete the image files written meanwhile:
    /// rolled-back rows would otherwise leave files nothing points to.
    fn finish_tx(&self, r: Result<i64>, written: &[PathBuf]) -> Result<i64> {
        match r {
            Ok(pid) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(pid)
            }
            Err(e) => {
                self.conn.execute_batch("ROLLBACK")?;
                for f in written {
                    let _ = std::fs::remove_file(f);
                }
                Err(e)
            }
        }
    }
}

pub fn num(v: &Value) -> Result<f64> {
    match v {
        Value::Number(n) => Ok(n.as_f64().unwrap()),
        Value::String(s) => s.trim().parse().map_err(|_| anyhow!("not a number: {s}")),
        _ => bail!("not a number: {v}"),
    }
}

pub fn id_of(args: &Value) -> Result<i64> {
    args.get("id").map(num).transpose()?.map(|x| x as i64).ok_or_else(|| anyhow!("id is required"))
}

/// Only images are accepted; the extension comes from the magic bytes, so a
/// renamed file cannot smuggle another type into the media folder.
fn image_ext(name: &str, b: &[u8]) -> Result<&'static str> {
    Ok(if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if b.starts_with(b"GIF8") {
        "gif"
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        "webp"
    } else if b.len() > 12 && &b[4..8] == b"ftyp" && (&b[8..12] == b"heic" || &b[8..12] == b"heix" || &b[8..12] == b"mif1") {
        "heic"
    } else {
        bail!("{name}: only png, jpg, gif, webp and heic images are supported")
    })
}

pub fn mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> (Store, PathBuf) {
        let dir = std::env::temp_dir().join(format!("akbun-sb-test-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_dir_all(&dir);
        (Store::open(&dir).unwrap(), dir)
    }

    #[test]
    fn crud_order_and_rev() {
        let (s, _) = tmp();
        let r0 = s.rev().unwrap();
        let p = s.add(&PROJECT, &json!({"title": "t"})).unwrap();
        let pid = p["id"].as_i64().unwrap();
        let a = s.add(&SCENE, &json!({"project_id": pid, "narration": "a", "dur": 3})).unwrap();
        let b = s.add(&SCENE, &json!({"project_id": pid, "narration": "b", "dur": "2.5"})).unwrap();
        let c = s.add(&SCENE, &json!({"project_id": pid, "narration": "c", "after_id": a["id"]})).unwrap();
        let t = s.project_tree(pid).unwrap();
        let order: Vec<&str> = t["scenes"].as_array().unwrap().iter().map(|x| x["narration"].as_str().unwrap()).collect();
        assert_eq!(order, ["a", "c", "b"]);
        assert_eq!(t["scenes"][2]["start"], json!(8.0));
        assert!(s.rev().unwrap() > r0);
        s.update(&SCENE, &json!({"id": b["id"], "beats": [["0–1초", "x", ""]]})).unwrap();
        assert_eq!(s.get(&SCENE, b["id"].as_i64().unwrap()).unwrap()["beats"][0][1], "x");
        assert!(s.add(&SCENE, &json!({"narration": "orphan"})).is_err());
        s.delete(&PROJECT, pid).unwrap();
        assert!(s.get(&SCENE, c["id"].as_i64().unwrap()).is_err(), "cascade");
    }

    #[test]
    fn replaced_and_deleted_images_leave_disk() {
        let (s, _) = tmp();
        let png = [0x89, b'P', b'N', b'G', 0];
        let pid = s.add(&PROJECT, &json!({})).unwrap()["id"].as_i64().unwrap();
        let a = s.media_add(&png, "a.png", Some(pid)).unwrap()["id"].as_i64().unwrap();
        let b = s.media_add(&png, "b.png", Some(pid)).unwrap()["id"].as_i64().unwrap();
        let sc = s.add(&SCENE, &json!({"project_id": pid, "media_id": a})).unwrap()["id"].as_i64().unwrap();
        let pa = s.media_path(a).unwrap();
        s.update(&SCENE, &json!({"id": sc, "media_id": b})).unwrap();
        assert!(!pa.exists() && s.media_path(a).is_err(), "replaced image removed");
        let pb = s.media_path(b).unwrap();
        s.delete(&PROJECT, pid).unwrap();
        assert!(!pb.exists(), "project delete removes its images");
    }

    #[test]
    fn save_load_and_media_root() {
        let (s, dir) = tmp();
        let png = [0x89, b'P', b'N', b'G', 0];
        let pid = s.add(&PROJECT, &json!({"title": "keep"})).unwrap()["id"].as_i64().unwrap();
        let m = s.media_add(&png, "a.png", Some(pid)).unwrap()["id"].clone();
        let sc = s.add(&SCENE, &json!({"project_id": pid, "media_id": m, "status": "done"})).unwrap()["id"].clone();
        s.add(&COMMENT, &json!({"project_id": pid, "scene_id": sc, "body": "hi"})).unwrap();
        s.add(&MUSIC, &json!({"project_id": pid, "type": "sfx", "key": "whoosh"})).unwrap();
        assert_eq!(s.export_skill_json(pid, None).unwrap()["music"], json!([]), "sfx not in skill export");
        s.project_save(pid, &dir.join("saved")).unwrap();
        let n = s.project_load(&dir.join("saved")).unwrap()["id"].as_i64().unwrap();
        let t = s.project_tree(n).unwrap();
        assert_eq!((t["title"].as_str(), t["scenes"][0]["status"].as_str()), (Some("keep"), Some("done")));
        assert_eq!(t["comments"][0]["scene_id"], t["scenes"][0]["id"]);
        assert_eq!(t["music"][0]["type"], "sfx");
        assert_eq!(t["media_bytes"], 5);
        let z = s.project_zip(pid).unwrap();
        let zi = s.project_load_zip(&z).unwrap()["id"].as_i64().unwrap();
        let zt = s.project_tree(zi).unwrap();
        assert!(s.media_path(zt["scenes"][0]["media_id"].as_i64().unwrap()).unwrap().exists(), "zip carries images");
        assert_eq!(zt["comments"][0]["scene_id"], zt["scenes"][0]["id"]);
        assert!(s.project_load_zip(b"not a zip").is_err());
        let busy = dir.join("busy");
        std::fs::create_dir_all(&busy).unwrap();
        std::fs::write(busy.join(s.media_path(1).unwrap().file_name().unwrap()), b"keep me").unwrap();
        assert!(s.set_media_root(busy.to_str().unwrap()).is_err(), "never overwrite files in the target folder");
        assert_eq!(std::fs::read(busy.join("1.png")).unwrap(), b"keep me");
        let root = dir.join("elsewhere");
        s.set_media_root(root.to_str().unwrap()).unwrap();
        assert!(s.media_path(t["scenes"][0]["media_id"].as_i64().unwrap()).unwrap().starts_with(&root));
        assert!(s.media_path(t["scenes"][0]["media_id"].as_i64().unwrap()).unwrap().exists(), "files moved");
    }

    #[test]
    fn rejects_non_images() {
        let (s, _) = tmp();
        assert!(s.media_add(b"#!/bin/sh", "x.png", None).is_err());
        assert_eq!(s.media_add(&[0x89, b'P', b'N', b'G', 0, 0], "x", None).unwrap()["id"], 1);
    }

    #[test]
    fn skill_json_round_trip() {
        let (s, dir) = tmp();
        let src = json!({
            "title": "T", "genre": "it-handson", "message": "M", "audience": "A", "intent": "I",
            "source_summary": "S", "answer_cut": 2, "reaction": {"cut": 1, "text": "R"},
            "parts": [{"id": "hook", "title": "Hook"}, {"id": "wrap", "title": "Wrap"}],
            "music": [{"id": "bgm1", "from_cut": 1, "to_cut": 2, "mood": "calm", "genre": "lofi", "bpm": 80,
              "instruments": "piano", "energy": "low", "search_keywords": "k", "generation_prompt": "g"}],
            "cuts": [
              {"part": "hook", "dur": 7, "shot": "screen-zoom", "move": "punch-in", "source": "화면 녹화", "sketch": "s", "desc": "d1", "intent": "i", "narration": "n", "voice": "adr", "adr_reason": "r", "beats": [["0–7초", "x", ""]]},
              {"part": "wrap", "dur": 3, "shot": "title-card", "move": "hold", "source": "모션그래픽", "sketch": "s", "desc": "d2", "intent": "i", "narration": "", "voice": "none"}
            ]
        });
        let input = dir.join("in").join("storyboard.json");
        std::fs::create_dir_all(input.parent().unwrap().join("sketches")).unwrap();
        std::fs::write(&input, src.to_string()).unwrap();
        std::fs::write(input.parent().unwrap().join("sketches/cut_01.png"), [0x89, b'P', b'N', b'G']).unwrap();
        let before = std::fs::read_dir(s.media_dir()).map(|d| d.count()).unwrap_or(0);
        let bad = dir.join("bad").join("storyboard.json");
        std::fs::create_dir_all(bad.parent().unwrap().join("sketches")).unwrap();
        std::fs::write(bad.parent().unwrap().join("sketches/cut_01.png"), [0x89, b'P', b'N', b'G']).unwrap();
        std::fs::write(&bad, json!({"cuts": [{"dur": 1}, {"dur": "x"}]}).to_string()).unwrap();
        assert!(s.import_skill_json(&bad).is_err());
        assert_eq!(std::fs::read_dir(s.media_dir()).map(|d| d.count()).unwrap_or(0), before, "failed import leaves no files");
        let r = s.import_skill_json(&input).unwrap();
        let pid = r["id"].as_i64().unwrap();
        assert_eq!(r["scenes"], 2);
        assert!(s.project_tree(pid).unwrap()["scenes"][0]["media_id"].is_i64());
        let out = s.export_skill_json(pid, None).unwrap();
        assert_eq!(out, src, "export must match the skill format exactly");
        let file = dir.join("out").join("storyboard.json");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        s.export_skill_json(pid, Some(&file)).unwrap();
        assert!(dir.join("out/sketches/cut_01.png").exists());
    }
}
