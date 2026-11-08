use super::*;

pub(crate) struct OpenAiCompatible {
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
            .text("timestamp_granularities[]", "segment")
            .text("timestamp_granularities[]", "word");
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

    fn parse_words(&self, body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
        parse_openai_words(body, chunk_offset_ms)
    }
}

pub(crate) struct GoogleSpeech;

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

pub(crate) struct AzureSpeech;

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

pub(crate) fn adapter(provider: &str) -> Result<Box<dyn TranscriptionAdapter>, String> {
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

pub(crate) fn openai_language(language: &str) -> String {
    language
        .trim()
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

pub(crate) fn locale_language(language: &str) -> String {
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
