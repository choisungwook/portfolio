use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OpenFlags, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

const SORT_SIZE: &str = "size_bytes";
const SORT_MODIFIED: &str = "modified_ms";
const SORT_NAME: &str = "name COLLATE NOCASE";

#[derive(Clone, Debug, Deserialize)]
#[serde(default)]
pub struct CatalogQuery {
    pub path: String,
    pub scope: String,
    pub search: String,
    pub sort: String,
    pub direction: String,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
}

impl Default for CatalogQuery {
    fn default() -> Self {
        Self {
            path: "/".into(),
            scope: "children".into(),
            search: String::new(),
            sort: "size".into(),
            direction: "desc".into(),
            page: 0,
            page_size: 100,
        }
    }
}

impl CatalogQuery {
    fn normalize(mut self) -> Self {
        if self.path.is_empty() || !self.path.starts_with('/') {
            self.path = "/".into();
        }
        if self.scope != "all" {
            self.scope = "children".into();
        }
        self.search = self.search.trim().chars().take(200).collect();
        if !matches!(self.sort.as_str(), "size" | "modified" | "name") {
            self.sort = "size".into();
        }
        if self.direction != "asc" {
            self.direction = "desc".into();
        }
        self.page = self.page.max(0);
        self.page_size = self.page_size.clamp(25, 500);
        self
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct CatalogEntry {
    pub path: String,
    pub parent_path: Option<String>,
    pub name: String,
    pub kind: String,
    pub size_bytes: i64,
    pub logical_bytes: i64,
    pub modified_ms: i64,
    pub descendants: i64,
}

#[derive(Serialize)]
pub struct CatalogResult {
    pub rows: Vec<CatalogEntry>,
    pub count: i64,
    pub query: CatalogQueryResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogQueryResult {
    pub path: String,
    pub scope: String,
    pub search: String,
    pub sort: String,
    pub direction: String,
    pub page: i64,
    pub page_size: i64,
}

impl From<&CatalogQuery> for CatalogQueryResult {
    fn from(query: &CatalogQuery) -> Self {
        Self {
            path: query.path.clone(),
            scope: query.scope.clone(),
            search: query.search.clone(),
            sort: query.sort.clone(),
            direction: query.direction.clone(),
            page: query.page,
            page_size: query.page_size,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanIssue {
    pub path: String,
    pub code: String,
}

pub fn metadata(database_path: &Path) -> Result<Option<Value>, String> {
    if !database_path.exists() {
        return Ok(None);
    }
    let database = open_read_only(database_path)?;
    let mut output = Map::new();
    let mut statement = database
        .prepare("SELECT key, value FROM metadata")
        .map_err(error_text)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(error_text)?;
    for row in rows {
        let (key, value) = row.map_err(error_text)?;
        output.insert(key, Value::String(value));
    }
    let root = database
    .query_row(
      "SELECT path, parent_path, name, kind, size_bytes, logical_bytes, modified_ms, descendants
       FROM entries WHERE parent_path IS NULL",
      [],
      entry_from_row,
    )
    .map_err(error_text)?;
    output.insert(
        "root".into(),
        serde_json::to_value(root).map_err(error_text)?,
    );
    Ok(Some(Value::Object(output)))
}

pub fn query(database_path: &Path, input: CatalogQuery) -> Result<CatalogResult, String> {
    let query = input.normalize();
    if !database_path.exists() {
        return Ok(CatalogResult {
            rows: Vec::new(),
            count: 0,
            query: (&query).into(),
        });
    }
    let database = open_read_only(database_path)?;
    let mut where_parts = Vec::new();
    let mut values = Vec::<SqlValue>::new();
    if query.scope == "children" {
        where_parts.push("parent_path = ?");
        values.push(SqlValue::Text(query.path.clone()));
    } else if query.path != "/" {
        where_parts.push("path LIKE ? ESCAPE '\\'");
        values.push(SqlValue::Text(format!("{}/%", escape_like(&query.path))));
    } else {
        where_parts.push("parent_path IS NOT NULL");
    }
    if !query.search.is_empty() {
        where_parts.push("name LIKE ? ESCAPE '\\' COLLATE NOCASE");
        values.push(SqlValue::Text(format!("%{}%", escape_like(&query.search))));
    }
    let clause = format!("WHERE {}", where_parts.join(" AND "));
    let count: i64 = database
        .query_row(
            &format!("SELECT COUNT(*) FROM entries {clause}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )
        .map_err(error_text)?;
    let sort_column = match query.sort.as_str() {
        "modified" => SORT_MODIFIED,
        "name" => SORT_NAME,
        _ => SORT_SIZE,
    };
    let direction = if query.direction == "asc" {
        "ASC"
    } else {
        "DESC"
    };
    let sql = format!(
        "SELECT path, parent_path, name, kind, size_bytes, logical_bytes, modified_ms, descendants
     FROM entries {clause}
     ORDER BY {sort_column} {direction}, name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?"
    );
    values.push(SqlValue::Integer(query.page_size));
    values.push(SqlValue::Integer(query.page * query.page_size));
    let mut statement = database.prepare(&sql).map_err(error_text)?;
    let rows = statement
        .query_map(params_from_iter(values.iter()), entry_from_row)
        .map_err(error_text)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error_text)?;
    Ok(CatalogResult {
        rows,
        count,
        query: (&query).into(),
    })
}

pub fn issues(database_path: &Path, limit: i64) -> Result<Vec<ScanIssue>, String> {
    if !database_path.exists() {
        return Ok(Vec::new());
    }
    let database = open_read_only(database_path)?;
    let mut statement = database
        .prepare("SELECT path, code FROM issues LIMIT ?")
        .map_err(error_text)?;
    statement
        .query_map([limit.clamp(1, 500)], |row| {
            Ok(ScanIssue {
                path: row.get(0)?,
                code: row.get(1)?,
            })
        })
        .map_err(error_text)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error_text)
}

pub fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn open_read_only(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(error_text)
}

fn entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CatalogEntry> {
    Ok(CatalogEntry {
        path: row.get(0)?,
        parent_path: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        size_bytes: row.get(4)?,
        logical_bytes: row.get(5)?,
        modified_ms: row.get(6)?,
        descendants: row.get(7)?,
    })
}

fn error_text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use serde_json::json;
    use tempfile::tempdir;

    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let directory = tempdir().unwrap();
        let path = directory.path().join("catalog.sqlite");
        let database = Connection::open(&path).unwrap();
        database
            .execute_batch(
                "CREATE TABLE entries (
          path TEXT PRIMARY KEY, parent_path TEXT, name TEXT NOT NULL, kind TEXT NOT NULL,
          size_bytes INTEGER NOT NULL, logical_bytes INTEGER NOT NULL,
          modified_ms INTEGER NOT NULL, descendants INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE issues (path TEXT NOT NULL, code TEXT NOT NULL);
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            )
            .unwrap();
        let rows = [
            ("/", None, "/", "directory", 100, 100, 100, 4),
            ("/work", Some("/"), "work", "directory", 90, 90, 200, 3),
            ("/work/old", Some("/work"), "old", "file", 10, 10, 100, 0),
            ("/work/new", Some("/work"), "new", "file", 30, 30, 300, 0),
            (
                "/work/100%_done",
                Some("/work"),
                "100%_done",
                "file",
                20,
                20,
                200,
                0,
            ),
        ];
        for row in rows {
            database
                .execute(
                    "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    params![row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7],
                )
                .unwrap();
        }
        database
            .execute("INSERT INTO metadata VALUES ('rootPath', '/')", [])
            .unwrap();
        database
            .execute("INSERT INTO issues VALUES ('/private', 'OS_13')", [])
            .unwrap();
        drop(database);
        (directory, path)
    }

    #[test]
    fn sorts_and_searches_catalog_rows() {
        let (_directory, path) = fixture();
        let sorted = query(
            &path,
            CatalogQuery {
                path: "/work".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            sorted
                .rows
                .iter()
                .map(|row| row.name.as_str())
                .collect::<Vec<_>>(),
            ["new", "100%_done", "old"]
        );
        let searched = query(
            &path,
            CatalogQuery {
                path: "/work".into(),
                search: "100%_".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(searched.rows.len(), 1);
        assert_eq!(searched.rows[0].name, "100%_done");
    }

    #[test]
    fn rejects_untrusted_query_options() {
        let query = CatalogQuery {
            path: "relative".into(),
            sort: "DROP TABLE entries".into(),
            direction: "sideways".into(),
            page: -1,
            page_size: 50_000,
            ..Default::default()
        }
        .normalize();
        assert_eq!(query.path, "/");
        assert_eq!(query.sort, "size");
        assert_eq!(query.direction, "desc");
        assert_eq!(query.page, 0);
        assert_eq!(query.page_size, 500);
    }

    #[test]
    fn reads_metadata_and_issues() {
        let (_directory, path) = fixture();
        let metadata = metadata(&path).unwrap().unwrap();
        assert_eq!(metadata["rootPath"], json!("/"));
        assert_eq!(metadata["root"]["descendants"], json!(4));
        let issues = issues(&path, 100).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, "OS_13");
    }
}
