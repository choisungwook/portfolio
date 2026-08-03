"""Exception types shared across the package."""


class AgentK8sError(Exception):
  """Base for every error the CLI reports to the user without a traceback."""


class ConfigError(AgentK8sError):
  """The project config file is missing or invalid."""


class KnowledgeError(AgentK8sError):
  """The knowledge directory cannot be read or written."""


class BackendError(AgentK8sError):
  """An agent backend failed to run or returned an error."""


class ResponseParseError(AgentK8sError):
  """A backend response did not contain the expected JSON document."""
