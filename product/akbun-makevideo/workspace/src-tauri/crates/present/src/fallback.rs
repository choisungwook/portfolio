//! Which of the two playback engines runs, and why.
//!
//! Playback is the app's main path. A viewport that cannot start on somebody's
//! machine has to leave them with an editor, not with a black rectangle, so the
//! media element stack the app has always had stays — as a setting somebody can
//! choose, and as the answer when the native engine will not start.
//!
//! The choice is a pure function so the awkward half of it can be tested at
//! all. "What happens when there is no graphics device" is otherwise a question
//! answerable only on a machine that does not have one.

use serde::Serialize;

/// What the setting can say. Anything unrecognised is [`Engine::Native`],
/// because a settings file written before this existed should get the new
/// engine rather than be pinned to the old one for ever.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Engine {
    /// The compositor drawing on a native surface, with the audio clock
    /// deciding when.
    Native,
    /// Stacked `<video>` and `<audio>` elements in the page.
    MediaElement,
}

impl Engine {
    pub fn parse(setting: &str) -> Engine {
        match setting {
            "media-element" => Engine::MediaElement,
            _ => Engine::Native,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Engine::Native => "native",
            Engine::MediaElement => "media-element",
        }
    }
}

/// What the app ended up with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub engine: Engine,
    /// Why it is not the native one. `None` when nothing went wrong — including
    /// when the media element engine was simply asked for, because a preference
    /// is not a failure and putting one in here would show the user a warning
    /// about their own setting.
    pub fell_back: Option<String>,
}

impl Choice {
    pub fn native() -> Choice {
        Choice {
            engine: Engine::Native,
            fell_back: None,
        }
    }

    pub fn chosen(engine: Engine) -> Choice {
        Choice {
            engine,
            fell_back: None,
        }
    }

    pub fn fallback(reason: impl Into<String>) -> Choice {
        Choice {
            engine: Engine::MediaElement,
            fell_back: Some(reason.into()),
        }
    }
}

/// Decide, given the setting and whether the native engine actually started.
///
/// `native_start` is a `Result` and not a bool so the reason survives to the
/// page. "Playback fell back" with no reason is a bug report nobody can act on,
/// and the reasons here — no graphics adapter, no window handle, a surface
/// format nobody can draw in — are all things a user can be told.
pub fn choose(setting: &str, native_start: Result<(), String>) -> Choice {
    match Engine::parse(setting) {
        Engine::MediaElement => Choice::chosen(Engine::MediaElement),
        Engine::Native => match native_start {
            Ok(()) => Choice::native(),
            Err(reason) => Choice::fallback(reason),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_native_engine_is_the_default_and_the_answer_to_anything_unknown() {
        assert_eq!(Engine::parse("native"), Engine::Native);
        assert_eq!(Engine::parse(""), Engine::Native);
        assert_eq!(Engine::parse("auto"), Engine::Native);
        assert_eq!(Engine::parse("MEDIA-ELEMENT"), Engine::Native);
        assert_eq!(Engine::parse("media-element"), Engine::MediaElement);
    }

    #[test]
    fn a_working_native_engine_is_used_and_says_nothing() {
        let choice = choose("native", Ok(()));
        assert_eq!(choice.engine, Engine::Native);
        assert_eq!(choice.fell_back, None);
    }

    #[test]
    fn a_native_engine_that_will_not_start_falls_back_with_its_reason() {
        let choice = choose("native", Err("no graphics adapter".into()));
        assert_eq!(choice.engine, Engine::MediaElement);
        assert_eq!(choice.fell_back.as_deref(), Some("no graphics adapter"));
    }

    /// Choosing the old engine is a preference. Reporting it as a fallback
    /// would put a warning on screen about a setting the user picked.
    #[test]
    fn asking_for_media_elements_is_not_a_fallback() {
        let choice = choose("media-element", Ok(()));
        assert_eq!(choice.engine, Engine::MediaElement);
        assert_eq!(choice.fell_back, None);
    }

    /// And the native engine is not started at all when it was not asked for,
    /// so a machine with no GPU set to media elements reports nothing either.
    #[test]
    fn the_setting_wins_even_when_the_native_engine_would_have_failed() {
        let choice = choose("media-element", Err("no graphics adapter".into()));
        assert_eq!(choice.engine, Engine::MediaElement);
        assert_eq!(choice.fell_back, None);
    }

    #[test]
    fn the_setting_round_trips_through_its_own_text() {
        for engine in [Engine::Native, Engine::MediaElement] {
            assert_eq!(Engine::parse(engine.as_str()), engine);
        }
    }
}
