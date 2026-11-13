# 메모리 리소스 하나에 내장 전략 4개를 붙인다.
# namespace는 모두 /actor/{actorId}/ 아래에 두어 namespacePath 하나로 한 사용자의 장기 메모리를 모두 조회한다.
resource "aws_bedrockagentcore_memory" "chat" {
  name                  = "chat_memory_handson"
  description           = "Ollama 채팅 백엔드가 쓰는 단기, 장기 메모리"
  event_expiry_duration = var.event_expiry_days
}

resource "aws_bedrockagentcore_memory_strategy" "semantic" {
  name                = "facts"
  memory_id           = aws_bedrockagentcore_memory.chat.id
  type                = "SEMANTIC"
  description         = "대화에서 사실 정보를 뽑는다"
  namespace_templates = ["/actor/{actorId}/facts/"]
}

resource "aws_bedrockagentcore_memory_strategy" "preference" {
  name                = "preferences"
  memory_id           = aws_bedrockagentcore_memory.chat.id
  type                = "USER_PREFERENCE"
  description         = "사용자 선호를 뽑는다"
  namespace_templates = ["/actor/{actorId}/preferences/"]

  depends_on = [aws_bedrockagentcore_memory_strategy.semantic]
}

resource "aws_bedrockagentcore_memory_strategy" "summary" {
  name                = "summaries"
  memory_id           = aws_bedrockagentcore_memory.chat.id
  type                = "SUMMARIZATION"
  description         = "채팅창(session)마다 요약을 만든다"
  namespace_templates = ["/actor/{actorId}/summaries/{sessionId}/"]

  depends_on = [aws_bedrockagentcore_memory_strategy.preference]
}

resource "aws_bedrockagentcore_memory_strategy" "episodic" {
  name                = "episodes"
  memory_id           = aws_bedrockagentcore_memory.chat.id
  type                = "EPISODIC"
  description         = "완결된 작업 흐름을 episode로 기록하고 actor 단위로 reflection을 만든다"
  namespace_templates = ["/actor/{actorId}/episodes/"]

  reflection_configuration {
    namespace_templates = ["/actor/{actorId}/"]
  }

  depends_on = [aws_bedrockagentcore_memory_strategy.summary]
}
