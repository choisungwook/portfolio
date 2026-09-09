"""Exceptions raised by the sync, build, and API layers."""


class WikiError(Exception):
  """Base class for failures the CLI reports as exit code 1."""


class ConfigError(WikiError):
  """A required setting is missing or malformed."""


class ReaderError(WikiError):
  """The reader API rejected a request or returned an unexpected shape."""


class BuildError(WikiError):
  """graphify exited with an error or wrote no wiki."""
