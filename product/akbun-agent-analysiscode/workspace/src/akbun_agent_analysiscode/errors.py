"""Exception types shared across the package."""


class AgentError(Exception):
  """Base for every error the CLI reports to the user without a traceback."""


class ConfigError(AgentError):
  """The project config file is missing or invalid."""


class KnowledgeError(AgentError):
  """The knowledge directory cannot be read or written."""


class BackendError(AgentError):
  """An agent backend failed to run or returned an error."""


class ResponseParseError(AgentError):
  """A backend response did not contain the expected JSON document."""
