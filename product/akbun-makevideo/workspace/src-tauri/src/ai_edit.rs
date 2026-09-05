use crate::commands::{find_tool, AppState, Settings};
use base64::Engine;
use makevideo_analysis::{
    deduplicate_segments, parse_azure, parse_google, parse_openai, parse_silence, plan_chunks,
    TimeRange, TimedText,
};
use makevideo_edit::{
    Command as Edit, FrameRange, RationalTime, TextStyle, TrackKind, VisualContent, VisualTransform,
};
use reqwest::{multipart, Client, RequestBuilder};
use serde::Serialize;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const CANCELLED: &str = "ai_edit_cancelled";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEditResult {
    pub captions: Vec<TimedText>,
    pub silence_ranges: Vec<TimeRange>,
    pub removed_duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEditStatus {
    pub id: u64,
    pub kind: String,
    pub stage: String,
    pub progress: f32,
    pub message: String,
    pub result: Option<AiEditResult>,
}

impl Default for AiEditStatus {
    fn default() -> Self {
        AiEditStatus {
            id: 0,
            kind: String::new(),
            stage: "idle".into(),
            progress: 0.0,
            message: String::new(),
            result: None,
        }
    }
}

impl AiEditStatus {
    fn active(&self) -> bool {
        matches!(
            self.stage.as_str(),
            "queued" | "preprocessing" | "transcribing" | "analyzing" | "generating" | "applying"
        )
    }
}

#[derive(Default)]
struct RuntimeState {
    status: AiEditStatus,
    cancel: Option<Arc<AtomicBool>>,
}

pub struct AiEditRuntime {
    state: Arc<Mutex<RuntimeState>>,
    credentials: Mutex<HashMap<String, String>>,
    next_id: AtomicU64,
}

impl Default for AiEditRuntime {
    fn default() -> Self {
        AiEditRuntime {
            state: Arc::new(Mutex::new(RuntimeState::default())),
            credentials: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(0),
        }
    }
}

pub fn ensure_editable(runtime: &AiEditRuntime) -> Result<(), String> {
    if runtime.state.lock().unwrap().status.active() {
        return Err("wait for the AI edit to finish or cancel it first".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub present: bool,
}

#[tauri::command]
pub fn ai_edit_set_credential(
    runtime: State<'_, AiEditRuntime>,
    provider: String,
    credential: String,
) -> Result<CredentialStatus, String> {
    let provider = provider.trim().to_string();
    adapter(&provider)?;
    let credential = credential.trim().to_string();
    let present = !credential.is_empty();
    let mut credentials = runtime.credentials.lock().unwrap();
    if present {
        credentials.insert(provider, credential);
    } else {
        credentials.remove(&provider);
    }
    Ok(CredentialStatus { present })
}

#[tauri::command]
pub fn ai_edit_credential_status(
    runtime: State<'_, AiEditRuntime>,
    provider: String,
) -> CredentialStatus {
    CredentialStatus {
        present: runtime.credentials.lock().unwrap().contains_key(provider.trim()),
    }
}

#[tauri::command]
pub fn ai_edit_status(runtime: State<'_, AiEditRuntime>) -> AiEditStatus {
    runtime.state.lock().unwrap().status.clone()
}

#[tauri::command]
pub fn ai_edit_cancel(app: AppHandle, runtime: State<'_, AiEditRuntime>) -> AiEditStatus {
    let status = {
        let mut state = runtime.state.lock().unwrap();
        if let Some(cancel) = state.cancel.as_ref() {
            cancel.store(true, Ordering::SeqCst);
            state.status.message = "Cancelling…".into();
        }
        state.status.clone()
    };
    let _ = app.emit("ai-edit:status", &status);
    status
}

#[tauri::command]
pub fn ai_edit_start_captions(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AiEditRuntime>,
) -> Result<AiEditStatus, String> {
    let settings = state.settings.lock().unwrap().clone();
    let ffmpeg = find_tool(&app, "ffmpeg", &settings.ffmpeg_dir)
        .ok_or("ffmpeg is required to extract speech audio")?;
    if state.render.lock().unwrap().is_some() {
        return Err("wait for the active render to finish before generating captions".into());
    }
    let credential = runtime
        .credentials
        .lock()
        .unwrap()
        .get(&settings.transcription_provider)
        .cloned();
    let (status, cancel) = begin_job(&runtime, "captions")?;
    let locked = state.document.lock().unwrap();
    let project = locked.project().clone();
    let revision = locked.revision();
    drop(locked);
    let document = state.document.clone();
    let shared = runtime.state.clone();
    let worker_app = app.clone();
    let id = status.id;
    let _ = app.emit("ai-edit:status", &status);
    std::thread::spawn(move || {
        let result = run_caption_job(
            &worker_app,
            &shared,
            id,
            &cancel,
            &ffmpeg,
            &settings,
            credential.as_deref(),
            project,
            revision,
            document,
        );
        finish_job(&worker_app, &shared, id, result);
    });
    Ok(status)
}

#[tauri::command]
pub fn ai_edit_start_silence_removal(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AiEditRuntime>,
) -> Result<AiEditStatus, String> {
    let settings = state.settings.lock().unwrap().clone();
    let ffmpeg = find_tool(&app, "ffmpeg", &settings.ffmpeg_dir)
        .ok_or("ffmpeg is required to analyze silence")?;
    if state.render.lock().unwrap().is_some() {
        return Err("wait for the active render to finish before removing silence".into());
    }
    let (status, cancel) = begin_job(&runtime, "silence")?;
    let document = state.document.clone();
    let locked = state.document.lock().unwrap();
    let project = locked.project().clone();
    let revision = locked.revision();
    drop(locked);
    let shared = runtime.state.clone();
    let worker_app = app.clone();
    let id = status.id;
    let _ = app.emit("ai-edit:status", &status);
    std::thread::spawn(move || {
        let result = run_silence_job(
            &worker_app,
            &shared,
            id,
            &cancel,
            &ffmpeg,
            &settings,
            project,
            revision,
            document,
        );
        finish_job(&worker_app, &shared, id, result);
    });
    Ok(status)
}

fn begin_job(
    runtime: &AiEditRuntime,
    kind: &str,
) -> Result<(AiEditStatus, Arc<AtomicBool>), String> {
    let mut state = runtime.state.lock().unwrap();
    if state.status.active() {
        return Err("another AI edit is already running".into());
    }
    let id = runtime.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let cancel = Arc::new(AtomicBool::new(false));
    state.status = AiEditStatus {
        id,
        kind: kind.into(),
        stage: "queued".into(),
        progress: 0.0,
        message: "Queued".into(),
        result: None,
    };
    state.cancel = Some(cancel.clone());
    Ok((state.status.clone(), cancel))
}

fn report(
    app: &AppHandle,
    shared: &Arc<Mutex<RuntimeState>>,
    id: u64,
    stage: &str,
    progress: f32,
    message: impl Into<String>,
) {
    let status = {
        let mut state = shared.lock().unwrap();
        if state.status.id != id {
            return;
        }
        state.status.stage = stage.into();
        state.status.progress = progress.clamp(0.0, 1.0);
        state.status.message = message.into();
        state.status.clone()
    };
    let _ = app.emit("ai-edit:status", status);
}

fn finish_job(
    app: &AppHandle,
    shared: &Arc<Mutex<RuntimeState>>,
    id: u64,
    result: Result<AiEditResult, String>,
) {
    let status = {
        let mut state = shared.lock().unwrap();
        if state.status.id != id {
            return;
        }
        match result {
            Ok(result) => {
                state.status.stage = "done".into();
                state.status.progress = 1.0;
                state.status.message = if state.status.kind == "captions" {
                    format!("Inserted {} captions", result.captions.len())
                } else {
                    format!(
                        "Removed {:.1} seconds",
                        result.removed_duration_ms as f64 / 1000.0
                    )
                };
                state.status.result = Some(result);
            }
            Err(error) if error == CANCELLED => {
                state.status.stage = "cancelled".into();
                state.status.message = "Cancelled".into();
            }
            Err(error) => {
                state.status.stage = "failed".into();
                state.status.message = error;
            }
        }
        state.cancel = None;
        state.status.clone()
    };
    let _ = app.emit("ai-edit:status", status);
}

fn cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        Err(CANCELLED.into())
    } else {
        Ok(())
    }
}

fn extract_analysis_audio(
    ffmpeg: &str,
    project: &makevideo_edit::Project,
    output: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let output = output.to_string_lossy().to_string();
    let args = makevideo_render::ffmpeg::analysis_audio_args(project, &output)
        .ok_or("the timeline has no audible audio")?;
    run_process(ffmpeg, args, cancel).map(|_| ())
}

fn silence_log(
    ffmpeg: &str,
    input: &Path,
    settings: &Settings,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let args = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-i".into(),
        input.to_string_lossy().to_string(),
        "-af".into(),
        format!(
            "silencedetect=noise={}dB:d={:.3}",
            settings.silence_threshold_db,
            settings.silence_min_duration_ms as f64 / 1000.0
        ),
        "-f".into(),
        "null".into(),
        "-".into(),
    ];
    run_process(ffmpeg, args, cancel)
}

fn run_process(program: &str, args: Vec<String>, cancel: &AtomicBool) -> Result<String, String> {
    cancelled(cancel)?;
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    let stdout = child.stdout.take().map(read_pipe);
    let stderr = child.stderr.take().map(read_pipe);
    let status = loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            if let Some(reader) = stdout {
                let _ = reader.join();
            }
            if let Some(reader) = stderr {
                let _ = reader.join();
            }
            return Err(CANCELLED.into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(error) => return Err(format!("cannot wait for ffmpeg: {error}")),
        }
    };
    let mut output = stdout
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    output.extend(
        stderr
            .and_then(|reader| reader.join().ok())
            .unwrap_or_default(),
    );
    let output = String::from_utf8_lossy(&output).to_string();
    if !status.success() {
        return Err(format!(
            "ffmpeg failed: {}",
            output.lines().last().unwrap_or("unknown error")
        ));
    }
    Ok(output)
}

fn read_pipe(mut pipe: impl Read + Send + 'static) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = pipe.read_to_end(&mut bytes);
        bytes
    })
}

trait TranscriptionAdapter {
    fn name(&self) -> &'static str;
    fn maximum_chunk_ms(&self) -> u64;
    fn request(
        &self,
        client: &Client,
        audio: Vec<u8>,
        settings: &Settings,
        credential: Option<&str>,
    ) -> Result<RequestBuilder, String>;
    fn parse(&self, body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String>;
}

struct OpenAiCompatible {
    credential_required: bool,
    label: &'static str,
}

impl TranscriptionAdapter for OpenAiCompatible {
    fn name(&self) -> &'static str {
        self.label
    }

    fn maximum_chunk_ms(&self) -> u64 {
        3_000_000
    }

    fn request(
        &self,
        client: &Client,
        audio: Vec<u8>,
        settings: &Settings,
        credential: Option<&str>,
    ) -> Result<RequestBuilder, String> {
        if self.credential_required && credential.is_none() {
            return Err(format!("{} needs a session credential", self.name()));
        }
        let endpoint = settings.transcription_endpoint.trim().trim_end_matches('/');
        if endpoint.is_empty() {
            return Err("the transcription endpoint is empty".into());
        }
        let url = if endpoint.ends_with("/audio/transcriptions") {
            endpoint.to_string()
        } else {
            format!("{endpoint}/audio/transcriptions")
        };
        let file = multipart::Part::bytes(audio)
            .file_name("analysis.mp3")
            .mime_str("audio/mpeg")
            .map_err(|error| error.to_string())?;
        let mut form = multipart::Form::new()
            .part("file", file)
            .text("model", settings.transcription_model.clone())
            .text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "segment");
        let language = openai_language(&settings.transcription_language);
        if !language.is_empty() {
            form = form.text("language", language);
        }
        let mut request = client.post(url).multipart(form);
        if let Some(secret) = credential {
            request = request.bearer_auth(secret);
        }
        Ok(request)
    }

    fn parse(&self, body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
        parse_openai(body, chunk_offset_ms)
    }
}

struct GoogleSpeech;

impl TranscriptionAdapter for GoogleSpeech {
    fn name(&self) -> &'static str {
        "Google Cloud Speech-to-Text"
    }

    fn maximum_chunk_ms(&self) -> u64 {
        55_000
    }

    fn request(
        &self,
        client: &Client,
        audio: Vec<u8>,
        settings: &Settings,
        credential: Option<&str>,
    ) -> Result<RequestBuilder, String> {
        let credential = credential.ok_or("Google needs an OAuth bearer token for this session")?;
        let endpoint = settings.transcription_endpoint.trim().trim_end_matches('/');
        if endpoint.contains("PROJECT_ID") || !endpoint.contains("/recognizers/") {
            return Err("replace PROJECT_ID in the Google recognizer endpoint".into());
        }
        let url = if endpoint.ends_with(":recognize") {
            endpoint.to_string()
        } else {
            format!("{endpoint}:recognize")
        };
        let locale = locale_language(&settings.transcription_language);
        let body = json!({
            "config": {
                "autoDecodingConfig": {},
                "languageCodes": [locale],
                "model": settings.transcription_model,
                "features": {
                    "enableAutomaticPunctuation": true,
                    "enableWordTimeOffsets": true
                }
            },
            "content": base64::engine::general_purpose::STANDARD.encode(audio)
        });
        Ok(client.post(url).bearer_auth(credential).json(&body))
    }

    fn parse(&self, body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
        parse_google(body, chunk_offset_ms)
    }
}

struct AzureSpeech;

impl TranscriptionAdapter for AzureSpeech {
    fn name(&self) -> &'static str {
        "Microsoft Azure Speech"
    }

    fn maximum_chunk_ms(&self) -> u64 {
        6_000_000
    }

    fn request(
        &self,
        client: &Client,
        audio: Vec<u8>,
        settings: &Settings,
        credential: Option<&str>,
    ) -> Result<RequestBuilder, String> {
        let credential = credential.ok_or("Azure Speech needs a resource key for this session")?;
        let endpoint = settings.transcription_endpoint.trim().trim_end_matches('/');
        if endpoint.contains("YOUR_RESOURCE") || endpoint.is_empty() {
            return Err("replace YOUR_RESOURCE in the Azure Speech endpoint".into());
        }
        let url = if endpoint.contains("transcriptions:transcribe") {
            endpoint.to_string()
        } else {
            format!("{endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15")
        };
        let file = multipart::Part::bytes(audio)
            .file_name("analysis.mp3")
            .mime_str("audio/mpeg")
            .map_err(|error| error.to_string())?;
        let definition = json!({
            "locales": [locale_language(&settings.transcription_language)]
        });
        let form = multipart::Form::new()
            .part("audio", file)
            .text("definition", definition.to_string());
        Ok(client
            .post(url)
            .header("Ocp-Apim-Subscription-Key", credential)
            .multipart(form))
    }

    fn parse(&self, body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
        parse_azure(body, chunk_offset_ms)
    }
}

fn adapter(provider: &str) -> Result<Box<dyn TranscriptionAdapter>, String> {
    match provider {
        "openai" => Ok(Box::new(OpenAiCompatible {
            credential_required: true,
            label: "OpenAI transcription",
        })),
        "litellm" => Ok(Box::new(OpenAiCompatible {
            credential_required: false,
            label: "LiteLLM",
        })),
        "custom" => Ok(Box::new(OpenAiCompatible {
            credential_required: false,
            label: "OpenAI-compatible endpoint",
        })),
        "google" => Ok(Box::new(GoogleSpeech)),
        "azure" => Ok(Box::new(AzureSpeech)),
        _ => Err("choose a supported transcription provider".into()),
    }
}

fn openai_language(language: &str) -> String {
    language
        .trim()
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn locale_language(language: &str) -> String {
    let language = language.trim();
    if language.contains(['-', '_']) {
        return language.replace('_', "-");
    }
    match language.to_ascii_lowercase().as_str() {
        "ko" => "ko-KR",
        "ja" => "ja-JP",
        "zh" => "zh-CN",
        "es" => "es-ES",
        "fr" => "fr-FR",
        "de" => "de-DE",
        _ => "en-US",
    }
    .into()
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(900))
        .user_agent("akbun-makevideo")
        .build()
        .map_err(|error| format!("cannot create the transcription client: {error}"))
}

async fn cancellable<F, T>(future: F, cancel: &AtomicBool) -> Result<T, String>
where
    F: Future<Output = T>,
{
    tokio::pin!(future);
    loop {
        tokio::select! {
            value = &mut future => return Ok(value),
            _ = tokio::time::sleep(Duration::from_millis(50)) => cancelled(cancel)?,
        }
    }
}

fn send_request(request: RequestBuilder, cancel: &AtomicBool) -> Result<String, String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("cannot start the transcription runtime: {error}"))?;
    runtime.block_on(async {
        let response = cancellable(request.send(), cancel)
            .await?
            .map_err(|error| format!("transcription request failed: {error}"))?;
        let status = response.status();
        let body = cancellable(response.text(), cancel)
            .await?
            .map_err(|error| format!("cannot read the transcription response: {error}"))?;
        if !status.is_success() {
            let detail = body.chars().take(800).collect::<String>();
            return Err(format!("transcription returned {status}: {detail}"));
        }
        Ok(body)
    })
}

#[allow(clippy::too_many_arguments)]
fn run_caption_job(
    app: &AppHandle,
    shared: &Arc<Mutex<RuntimeState>>,
    id: u64,
    cancel: &AtomicBool,
    ffmpeg: &str,
    settings: &Settings,
    credential: Option<&str>,
    project: makevideo_edit::Project,
    revision: u64,
    document: Arc<Mutex<makevideo_edit::Document>>,
) -> Result<AiEditResult, String> {
    let adapter = adapter(&settings.transcription_provider)?;
    let total_ms = project.duration().to_millis().max(0) as u64;
    if total_ms == 0 {
        return Err("the timeline is empty".into());
    }
    let temp = tempfile::Builder::new()
        .prefix("akbun-makevideo-ai-")
        .tempdir()
        .map_err(|error| format!("cannot create a temporary audio folder: {error}"))?;
    let audio_path = temp.path().join("analysis.mp3");
    report(
        app,
        shared,
        id,
        "preprocessing",
        0.08,
        "Extracting mono 16 kHz MP3",
    );
    extract_analysis_audio(ffmpeg, &project, &audio_path, cancel)?;
    report(
        app,
        shared,
        id,
        "analyzing",
        0.18,
        "Finding quiet chunk boundaries",
    );
    let log = silence_log(ffmpeg, &audio_path, settings, cancel)?;
    let silence = parse_silence(
        &log,
        total_ms,
        settings.silence_min_duration_ms,
        settings.silence_padding_ms,
    );
    let chunks = plan_chunks(total_ms, adapter.maximum_chunk_ms(), 500, &silence);
    let http = client()?;
    let mut captions = Vec::new();
    for (index, chunk) in chunks.iter().enumerate() {
        cancelled(cancel)?;
        let progress = 0.25 + 0.55 * index as f32 / chunks.len().max(1) as f32;
        report(
            app,
            shared,
            id,
            "transcribing",
            progress,
            format!(
                "Transcribing chunk {} of {} with {}",
                index + 1,
                chunks.len(),
                adapter.name()
            ),
        );
        let chunk_path = if chunks.len() == 1 {
            audio_path.clone()
        } else {
            let path = temp.path().join(format!("chunk-{index}.mp3"));
            let args = makevideo_render::ffmpeg::analysis_chunk_args(
                &audio_path.to_string_lossy(),
                chunk.start_ms,
                chunk.duration_ms(),
                &path.to_string_lossy(),
            );
            run_process(ffmpeg, args, cancel)?;
            path
        };
        let bytes = std::fs::read(&chunk_path)
            .map_err(|error| format!("cannot read temporary speech audio: {error}"))?;
        let body = send_request(adapter.request(&http, bytes, settings, credential)?, cancel)?;
        captions.extend(adapter.parse(&body, chunk.start_ms)?);
    }
    let captions = deduplicate_segments(captions);
    cancelled(cancel)?;
    report(
        app,
        shared,
        id,
        "generating",
        0.86,
        "Building subtitle edit commands",
    );
    report(
        app,
        shared,
        id,
        "applying",
        0.94,
        "Inserting captions on S1",
    );
    cancelled(cancel)?;
    apply_captions(&document, revision, id, &captions)?;
    Ok(AiEditResult {
        captions,
        silence_ranges: Vec::new(),
        removed_duration_ms: 0,
    })
}

#[allow(clippy::too_many_arguments)]
fn run_silence_job(
    app: &AppHandle,
    shared: &Arc<Mutex<RuntimeState>>,
    id: u64,
    cancel: &AtomicBool,
    ffmpeg: &str,
    settings: &Settings,
    project: makevideo_edit::Project,
    revision: u64,
    document: Arc<Mutex<makevideo_edit::Document>>,
) -> Result<AiEditResult, String> {
    let total_ms = project.duration().to_millis().max(0) as u64;
    if total_ms == 0 {
        return Err("the timeline is empty".into());
    }
    let temp = tempfile::Builder::new()
        .prefix("akbun-makevideo-ai-")
        .tempdir()
        .map_err(|error| format!("cannot create a temporary audio folder: {error}"))?;
    let audio_path = temp.path().join("analysis.mp3");
    report(
        app,
        shared,
        id,
        "preprocessing",
        0.12,
        "Extracting mono 16 kHz MP3",
    );
    extract_analysis_audio(ffmpeg, &project, &audio_path, cancel)?;
    report(
        app,
        shared,
        id,
        "analyzing",
        0.52,
        "Detecting silence with ffmpeg",
    );
    let log = silence_log(ffmpeg, &audio_path, settings, cancel)?;
    let ranges = parse_silence(
        &log,
        total_ms,
        settings.silence_min_duration_ms,
        settings.silence_padding_ms,
    );
    cancelled(cancel)?;
    report(
        app,
        shared,
        id,
        "generating",
        0.78,
        "Building ripple-delete ranges",
    );
    let removed_duration_ms = ranges.iter().map(|range| range.duration_ms()).sum();
    if !ranges.is_empty() {
        report(
            app,
            shared,
            id,
            "applying",
            0.9,
            "Removing silence across every track",
        );
        cancelled(cancel)?;
        apply_silence_ranges(&document, revision, &ranges)?;
    }
    Ok(AiEditResult {
        captions: Vec::new(),
        silence_ranges: ranges,
        removed_duration_ms,
    })
}

fn apply_captions(
    document: &Arc<Mutex<makevideo_edit::Document>>,
    revision: u64,
    job_id: u64,
    captions: &[TimedText],
) -> Result<(), String> {
    let mut document = document.lock().unwrap();
    if document.revision() != revision {
        return Err(
            "the timeline changed while captions were being generated; no edit was applied".into(),
        );
    }
    let rate = document.project().rate();
    let existing = document
        .project()
        .tracks
        .iter()
        .find(|track| track.kind == TrackKind::Subtitle);
    let mut used = document
        .project()
        .tracks
        .iter()
        .flat_map(|track| {
            std::iter::once(track.id.clone())
                .chain(track.visual_items.iter().map(|item| item.id.clone()))
        })
        .collect::<HashSet<_>>();
    let track_id = existing
        .map(|track| track.id.clone())
        .unwrap_or_else(|| unique_id("ai-subtitles", &mut used));
    let old_items = existing
        .map(|track| {
            track
                .visual_items
                .iter()
                .map(|item| item.id.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut commands = Vec::new();
    if existing.is_none() {
        commands.push(Edit::AddTrack {
            track_kind: TrackKind::Subtitle,
            id: Some(track_id.clone()),
        });
    }
    let mut last_end = 0;
    for (index, caption) in captions.iter().enumerate() {
        let mut start = RationalTime::from_millis(caption.start_ms as i64, rate).value();
        let end = RationalTime::from_millis(caption.end_ms as i64, rate).value();
        start = start.max(last_end);
        if end <= start {
            continue;
        }
        last_end = end;
        commands.push(Edit::AddVisualItem {
            track_id: track_id.clone(),
            content: VisualContent::Text {
                text: caption.text.clone(),
                style: TextStyle::default(),
            },
            start,
            duration: end - start,
            transform: VisualTransform {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
                rotation: 0.0,
                opacity: 1.0,
            },
            z_index: 0,
            id: Some(unique_id(
                &format!("ai-caption-{job_id}-{index}"),
                &mut used,
            )),
        });
    }
    for item_id in old_items {
        commands.push(Edit::RemoveVisualItem { item_id });
    }
    if commands.is_empty() {
        return Err("the transcription contained no usable caption ranges".into());
    }
    document.apply_all_named("Generate captions", commands)
}

fn unique_id(base: &str, used: &mut HashSet<String>) -> String {
    if used.insert(base.into()) {
        return base.into();
    }
    let mut suffix = 2;
    loop {
        let candidate = format!("{base}-{suffix}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        suffix += 1;
    }
}

fn apply_silence_ranges(
    document: &Arc<Mutex<makevideo_edit::Document>>,
    revision: u64,
    ranges: &[TimeRange],
) -> Result<(), String> {
    let mut document = document.lock().unwrap();
    if document.revision() != revision {
        return Err(
            "the timeline changed while silence was being analyzed; no edit was applied".into(),
        );
    }
    let rate = document.project().rate();
    let ranges = ranges
        .iter()
        .filter_map(|range| {
            let start = RationalTime::from_millis(range.start_ms as i64, rate).value();
            let end = RationalTime::from_millis(range.end_ms as i64, rate).value();
            (end > start).then_some(FrameRange { start, end })
        })
        .collect::<Vec<_>>();
    if ranges.is_empty() {
        return Ok(());
    }
    document.apply(Edit::RemoveRanges { ranges })
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_edit::{Document, ProjectSettings};

    #[test]
    fn provider_languages_are_normalized_for_each_api_family() {
        assert_eq!(openai_language("ko-KR"), "ko");
        assert_eq!(locale_language("ko"), "ko-KR");
        assert_eq!(locale_language("ja_JP"), "ja-JP");
    }

    #[test]
    fn lm_studio_is_not_claimed_as_a_transcription_provider() {
        assert!(adapter("lmstudio").is_err());
        assert!(adapter("litellm").is_ok());
    }

    #[test]
    fn a_job_locks_edits_and_rejects_parallel_work() {
        let runtime = AiEditRuntime::default();
        let (_, cancel) = begin_job(&runtime, "captions").unwrap();
        assert!(ensure_editable(&runtime).is_err());
        assert!(begin_job(&runtime, "silence").is_err());
        cancel.store(true, Ordering::SeqCst);
        assert_eq!(cancelled(&cancel), Err(CANCELLED.into()));
    }

    #[test]
    fn captions_land_as_one_named_undo_step() {
        let document = Arc::new(Mutex::new(Document::new(ProjectSettings::default())));
        apply_captions(
            &document,
            0,
            7,
            &[TimedText {
                start_ms: 1_000,
                end_ms: 2_000,
                text: "hello".into(),
            }],
        )
        .unwrap();
        let mut document = document.lock().unwrap();
        let state = document.state();
        assert_eq!(state.undo_label, "Generate captions");
        let subtitles = state
            .project
            .tracks
            .iter()
            .find(|track| track.kind == TrackKind::Subtitle)
            .unwrap();
        assert_eq!(subtitles.visual_items.len(), 1);
        assert_eq!(subtitles.visual_items[0].start, 30);
        document.undo().unwrap();
        assert!(document
            .project()
            .tracks
            .iter()
            .all(|track| track.kind != TrackKind::Subtitle));
    }
}
