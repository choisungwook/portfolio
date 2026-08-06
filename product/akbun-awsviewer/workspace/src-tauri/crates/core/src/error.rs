use serde::Serialize;

/// Errors crossing the IPC boundary. Serialized as `{ kind, message }` so the
/// page can switch on `kind` — `login_required` renders a login prompt instead
/// of the raw AWS error text.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoreError {
    LoginRequired { message: String },
    NoSso { message: String },
    MissingRegion { message: String },
    Cancelled { message: String },
    Aws { message: String },
    Io { message: String },
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (kind, message) = match self {
            CoreError::LoginRequired { message } => ("login required", message),
            CoreError::NoSso { message } => ("no sso configuration", message),
            CoreError::MissingRegion { message } => ("missing region", message),
            CoreError::Cancelled { message } => ("cancelled", message),
            CoreError::Aws { message } => ("aws", message),
            CoreError::Io { message } => ("io", message),
        };
        write!(f, "{kind}: {message}")
    }
}

impl std::error::Error for CoreError {}

/// Flattens an SDK error chain into one readable line. The SDK's own Display
/// stops at "service error"; the context wrapper walks the sources where the
/// actual AWS error code and message live.
pub fn aws_error<E>(err: E) -> CoreError
where
    E: std::error::Error + Send + Sync + 'static,
{
    CoreError::Aws {
        message: format!(
            "{}",
            aws_smithy_types::error::display::DisplayErrorContext(&err)
        ),
    }
}
