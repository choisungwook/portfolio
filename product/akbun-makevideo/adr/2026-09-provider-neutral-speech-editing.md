# Speech editing uses provider-neutral timestamped segments

## Decision

Timeline audio is mixed into a temporary mono 16 kHz 48 kbps MP3. Transcription adapters normalize OpenAI-compatible, Google Cloud Speech-to-Text and Microsoft Azure Speech responses into millisecond timestamped text before the edit model sees them.

OpenAI-compatible endpoints include direct OpenAI, LiteLLM and a custom gateway. `whisper-1` is the default because its verbose JSON exposes segment timestamps. LM Studio is not listed as a provider because its documented OpenAI-compatible API does not expose audio transcription.

Provider credentials are held in memory per provider and are never written to settings. ChatGPT subscription models and reasoning effort are discovered through Codex App Server and remain separate from metered speech APIs.

Silence removal uses ffmpeg `silencedetect`, keeps configurable padding around speech, then removes every detected range across all tracks in one command. A running analysis locks editing, checks the starting document revision before apply, supports cancellation and cleans its temporary directory.

## Reason

The timeline needs one stable segment shape and one atomic edit path regardless of the remote API. Separating subscription-backed conversation models from speech billing avoids implying that a ChatGPT plan pays for transcription API requests. Local silence detection is deterministic, inexpensive and does not upload audio.
