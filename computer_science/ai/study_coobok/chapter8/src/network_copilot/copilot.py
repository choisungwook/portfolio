from dataclasses import dataclass, field

from openai import OpenAI

from .config import Settings
from .context import ContextBundle, build_context
from .data import NetworkKnowledge
from .intent import detect_intent

SYSTEM_PROMPT = (
  "You are an expert network engineering assistant familiar with multi-vendor "
  "networking gear. Use the provided device, topology, template, and impact "
  "context to give specific, actionable answers. Cite the relevant context. "
  "If context is missing, say so instead of guessing."
)


@dataclass
class TurnRecord:
  user: str
  intent: str
  device: str | None
  context: str
  response: str


@dataclass
class NetworkCopilot:
  settings: Settings
  knowledge: NetworkKnowledge
  history: list[TurnRecord] = field(default_factory=list)
  _client: OpenAI = field(init=False)

  def __post_init__(self) -> None:
    self._client = OpenAI(api_key=self.settings.api_key)

  @classmethod
  def bootstrap(cls) -> "NetworkCopilot":
    settings = Settings.from_env()
    knowledge = NetworkKnowledge.load(settings.data_dir)
    return cls(settings=settings, knowledge=knowledge)

  def ask(self, message: str) -> TurnRecord:
    intent = detect_intent(message)
    bundle = build_context(message, intent, self.knowledge)
    answer = self._call_openai(message, intent, bundle)
    record = TurnRecord(
      user=message,
      intent=intent,
      device=bundle.device,
      context=bundle.to_prompt(),
      response=answer,
    )
    self.history.append(record)
    return record

  def _call_openai(self, message: str, intent: str, bundle: ContextBundle) -> str:
    user_prompt = (
      f"Network Context:\n{bundle.to_prompt()}\n\n"
      f"User intent: {intent}\n"
      f"User message: {message}\n\n"
      "Provide guidance grounded in the context above."
    )
    response = self._client.chat.completions.create(
      model=self.settings.model,
      messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
      ],
      max_tokens=500,
      temperature=0.1,
    )
    return response.choices[0].message.content or ""
