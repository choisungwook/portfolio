//! What each capture mode asks of the screencapture binary.

/// The three ways to start a capture. The system draws every selection UI, so
/// a mode is only a different set of screencapture flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureMode {
    Area,
    Window,
    Fullscreen,
}

impl CaptureMode {
    pub const ALL: [CaptureMode; 3] = [Self::Area, Self::Window, Self::Fullscreen];

    /// The id used for the tray menu item.
    pub fn id(self) -> &'static str {
        match self {
            Self::Area => "capture-area",
            Self::Window => "capture-window",
            Self::Fullscreen => "capture-fullscreen",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|mode| mode.id() == id)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Area => "Capture Area",
            Self::Window => "Capture Window",
            Self::Fullscreen => "Capture Fullscreen",
        }
    }

    /// Flags passed before the output path. -x silences the shutter in every
    /// mode.
    ///
    /// - Area: -i interactive, -s drag selection only.
    /// - Window: -i interactive, -w window selection only. Esc cancels.
    /// - Fullscreen: -m the main display only. Without it screencapture wants
    ///   one output path per display and the app hands it one.
    pub fn args(self) -> &'static [&'static str] {
        match self {
            Self::Area => &["-i", "-s", "-x"],
            Self::Window => &["-i", "-w", "-x"],
            Self::Fullscreen => &["-m", "-x"],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_round_trip() {
        for mode in CaptureMode::ALL {
            assert_eq!(CaptureMode::from_id(mode.id()), Some(mode));
        }
        assert_eq!(CaptureMode::from_id("settings"), None);
    }

    #[test]
    fn every_mode_is_silent() {
        for mode in CaptureMode::ALL {
            assert!(mode.args().contains(&"-x"), "{mode:?}");
        }
    }

    // Fullscreen must not wait for a click, the other two must.
    #[test]
    fn only_fullscreen_is_non_interactive() {
        assert!(!CaptureMode::Fullscreen.args().contains(&"-i"));
        assert!(CaptureMode::Area.args().contains(&"-i"));
        assert!(CaptureMode::Window.args().contains(&"-i"));
    }
}
