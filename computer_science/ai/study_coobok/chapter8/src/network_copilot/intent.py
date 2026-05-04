CONFIG_KEYWORDS = ("configure", "create", "setup", "set up")
TROUBLE_KEYWORDS = ("problem", "troubleshoot", "down", "not working", "issue")
EXPLAIN_KEYWORDS = ("explain", "what is", "how does", "why")


def detect_intent(message: str) -> str:
  msg = message.lower()
  if any(k in msg for k in CONFIG_KEYWORDS):
    return "configuration"
  if any(k in msg for k in TROUBLE_KEYWORDS):
    return "troubleshooting"
  if any(k in msg for k in EXPLAIN_KEYWORDS):
    return "explanation"
  return "general"
