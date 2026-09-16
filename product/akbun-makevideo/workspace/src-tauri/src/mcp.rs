use crate::{
    ai_edit, ai_workflow,
    commands::{self, AppState},
};
use makevideo_control::{check, token, Checkpoints};
use makevideo_edit::{Command, Document, Project};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Listener, Manager};

#[derive(Default)]
pub struct Runtime {
    render: Mutex<Value>,
}

fn text<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing {key}"))
}
fn file(args: &Value) -> Result<PathBuf, String> {
    let path = PathBuf::from(text(args, "path")?);
    if !path.is_absolute() {
        return Err("Use an absolute path".into());
    }
    Ok(path)
}
fn checkpoints(app: &AppHandle) -> Result<Checkpoints, String> {
    Ok(Checkpoints::new(
        app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("mcp-checkpoints"),
    ))
}
fn state_value(doc: &Document) -> Value {
    json!({"document": doc.state(), "stateToken": token(doc)})
}
fn changed(app: &AppHandle, doc: &Document, checkpoint: String) -> Value {
    let value = json!({"document":doc.state(), "stateToken":token(doc), "checkpointId":checkpoint});
    let _ = app.emit("mcp:changed", &value);
    value
}

pub fn setup(app: &AppHandle) {
    app.manage(Runtime::default());
    let handle = app.clone();
    app.listen("render:done", move |event| {
        if let Ok(value) = serde_json::from_str(event.payload()) {
            *handle.state::<Runtime>().render.lock().unwrap() = value;
        }
    });
    #[cfg(unix)]
    {
        let result = makevideo_control::socket::default_path()
            .and_then(|p| makevideo_control::socket::bind(&p));
        match result {
            Ok(listener) => {
                let handle = app.clone();
                makevideo_control::socket::serve(listener, move |request| {
                    dispatch(&handle, request)
                });
            }
            Err(error) => eprintln!("MCP local connection unavailable: {error}"),
        }
    }
}

fn dispatch(app: &AppHandle, request: Value) -> Result<Value, String> {
    let method = text(&request, "method")?;
    let args = &request["args"];
    let state = app.state::<AppState>();
    match method {
        "get_project" => Ok(state_value(&state.document.lock().unwrap())),
        "list_projects" => Ok(json!(commands::list_projects(app.clone(), state))),
        "list_checkpoints" => Ok(json!(checkpoints(app)?.list()?)),
        "create_checkpoint" => {
            let doc = state.document.lock().unwrap();
            Ok(
                json!({"checkpointId":checkpoints(app)?.save(doc.project(), text(args,"label")?)?, "stateToken":token(&doc)}),
            )
        }
        "get_library" => ai_workflow::ai_load_library(app.clone()),
        "sample_asset" => tauri::async_runtime::block_on(ai_workflow::ai_sample_asset(
            app.clone(),
            state,
            app.state(),
            text(args, "assetId")?.into(),
            args["startMs"].as_u64().unwrap_or(0),
            args["endMs"].as_u64().ok_or("Missing endMs")?,
        )),
        "render_status" => Ok(
            json!({"running":state.render.lock().unwrap().is_some(),"result":*app.state::<Runtime>().render.lock().unwrap()}),
        ),
        "cancel_render" => {
            commands::cancel_render(state);
            Ok(json!({"cancelRequested":true}))
        }
        "export_video" => {
            let path = file(args)?;
            if path.exists() {
                return Err("Choose a new export path; existing files are not overwritten.".into());
            }
            let snapshot = {
                let doc = state.document.lock().unwrap();
                check(&doc, text(args, "stateToken")?)?;
                (doc.project().clone(), doc.revision())
            };
            *app.state::<Runtime>().render.lock().unwrap() = Value::Null;
            commands::render_snapshot(
                app.clone(),
                state,
                app.state(),
                path.to_string_lossy().into(),
                text(args, "preset")?.into(),
                snapshot,
            )?;
            Ok(
                json!({"started":true,"path":path,"next":"Poll render_status until result.ok is true."}),
            )
        }
        _ => mutate(app, method, args),
    }
}

fn mutate(app: &AppHandle, method: &str, args: &Value) -> Result<Value, String> {
    ai_edit::ensure_editable(&app.state())?;
    let state = app.state::<AppState>();
    let store = checkpoints(app)?;
    let incoming: Option<Project> = match method {
        "open_project" => Some(
            serde_json::from_slice(&std::fs::read(file(args)?).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?,
        ),
        "restore_checkpoint" => Some(store.read(text(args, "checkpointId")?)?.project),
        "new_project" => Some(Project::new(
            serde_json::from_value(args["settings"].clone()).map_err(|e| e.to_string())?,
        )),
        _ => None,
    };
    let assets = if method == "import_media" {
        let paths: Vec<String> =
            serde_json::from_value(args["paths"].clone()).map_err(|e| e.to_string())?;
        if paths.is_empty()
            || paths.len() > 100
            || paths.iter().any(|p| !PathBuf::from(p).is_absolute())
        {
            return Err("Use 1–100 absolute media paths".into());
        }
        let assets = commands::import_assets(app.clone(), app.state(), paths.clone());
        if assets.len() != paths.len() {
            return Err(
                "One or more paths are missing or unsupported; nothing was imported".into(),
            );
        }
        Some(assets)
    } else {
        None
    };
    let mut doc = state.document.lock().unwrap();
    check(&doc, text(args, "stateToken")?)?;
    match method {
        "preview_edits" => {
            let edits: Vec<Command> =
                serde_json::from_value(args["commands"].clone()).map_err(|e| e.to_string())?;
            Ok(json!({"document":makevideo_edit::ai_plan::preview(doc.project(), edits)?}))
        }
        "apply_edits" => {
            let edits: Vec<Command> =
                serde_json::from_value(args["commands"].clone()).map_err(|e| e.to_string())?;
            let id = makevideo_control::apply_edits(
                &mut doc,
                &store,
                text(args, "stateToken")?,
                text(args, "label")?,
                edits,
            )?;
            Ok(changed(app, &doc, id))
        }
        "import_media" => {
            let id = store.save(doc.project(), "Before MCP media import")?;
            doc.apply(Command::AddAssets {
                assets: assets.unwrap(),
            })?;
            Ok(changed(app, &doc, id))
        }
        "open_project" | "new_project" | "restore_checkpoint" => {
            let project = incoming.unwrap();
            project.validate()?;
            let id = store.save(doc.project(), &format!("Before {method}"))?;
            for asset in &project.assets {
                commands::allow_asset_file(app, &asset.path);
            }
            doc.restore_checkpoint(project)?;
            let result = json!({"document":doc.state(),"stateToken":token(&doc),"checkpointId":id});
            let path = if method == "open_project" {
                args["path"].clone()
            } else {
                Value::Null
            };
            let _ = app.emit(
                "mcp:opened",
                json!({"path":path,"document":doc.state(),"saved":method == "open_project"}),
            );
            Ok(result)
        }
        "undo" => {
            let id = store.save(doc.project(), "Before MCP undo")?;
            doc.undo()?;
            Ok(changed(app, &doc, id))
        }
        "redo" => {
            let id = store.save(doc.project(), "Before MCP redo")?;
            doc.redo()?;
            Ok(changed(app, &doc, id))
        }
        "save_project" => {
            let path = file(args)?;
            if path.extension().is_none_or(|e| e != "akbunvideo") {
                return Err("Use an .akbunvideo project path".into());
            }
            if path.exists() {
                let previous: Project =
                    serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                        .map_err(|e| format!("Existing file is not a project: {e}"))?;
                store.save(&previous, "Disk project before MCP save")?;
            }
            let id = store.save(doc.project(), "Before MCP save")?;
            makevideo_control::atomic_write(
                &path,
                &serde_json::to_vec_pretty(doc.project()).map_err(|e| e.to_string())?,
            )?;
            let _ = app.emit("mcp:saved", json!({"path":path,"revision":doc.revision()}));
            Ok(json!({"path":path,"checkpointId":id,"stateToken":token(&doc)}))
        }
        _ => Err(format!("Unknown tool: {method}")),
    }
}
