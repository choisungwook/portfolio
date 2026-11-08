resource "aws_bedrock_guardrail" "handson" {
  name                      = var.project_name
  description               = "Bedrock Guardrails hands-on: content, topic, word, PII, grounding"
  blocked_input_messaging   = "요청이 정책에 의해 차단되었습니다."
  blocked_outputs_messaging = "응답이 정책에 의해 차단되었습니다."

  # Standard tier는 cross-region 추론이 필요하다
  cross_region_config {
    guardrail_profile_identifier = local.guardrail_profile_arn
  }

  content_policy_config {
    tier_config = [{ tier_name = "STANDARD" }]

    dynamic "filters_config" {
      for_each = ["HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT"]
      content {
        type            = filters_config.value
        input_strength  = "HIGH"
        output_strength = "HIGH"
      }
    }

    # prompt attack은 입력에만 적용된다
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE"
    }
  }

  topic_policy_config {
    tier_config = [{ tier_name = "STANDARD" }]

    topics_config {
      name       = "investment-advice"
      type       = "DENY"
      definition = "특정 주식, 코인 등 금융 상품의 매수나 매도를 추천하거나 투자 시점을 조언하는 내용"
      examples = [
        "삼성전자 지금 사도 돼?",
        "비트코인 언제 팔아야 해?",
        "다음 달에 오를 종목 추천해줘",
        "Which stock should I buy this week?",
      ]
    }
  }

  word_policy_config {
    dynamic "words_config" {
      for_each = var.blocked_words
      content {
        text = words_config.value
      }
    }

    managed_word_lists_config {
      type = "PROFANITY"
    }
  }

  # action만 적으면 ANONYMIZE가 입력에 적용되지 않으므로 방향별 action을 함께 적는다
  sensitive_information_policy_config {
    dynamic "pii_entities_config" {
      for_each = {
        EMAIL                    = "ANONYMIZE"
        PHONE                    = "ANONYMIZE"
        CREDIT_DEBIT_CARD_NUMBER = "BLOCK"
      }
      content {
        type          = pii_entities_config.key
        action        = pii_entities_config.value
        input_action  = pii_entities_config.value
        output_action = pii_entities_config.value
      }
    }

    regexes_config {
      name          = "korean-rrn"
      description   = "주민등록번호"
      pattern       = "\\d{6}-[1-4]\\d{6}"
      action        = "BLOCK"
      input_action  = "BLOCK"
      output_action = "BLOCK"
    }
  }

  contextual_grounding_policy_config {
    filters_config {
      type      = "GROUNDING"
      threshold = 0.7
    }
    filters_config {
      type      = "RELEVANCE"
      threshold = 0.5
    }
  }
}

# 버전은 발행 시점 정책의 스냅숏이다. guardrail을 고쳐도 이 버전은 바뀌지 않는다
resource "aws_bedrock_guardrail_version" "handson" {
  guardrail_arn = aws_bedrock_guardrail.handson.guardrail_arn
  description   = "hands-on"
  skip_destroy  = true
}

# 시나리오 2 비교용. EMAIL에 action만 적는다
resource "aws_bedrock_guardrail" "pii_action_only" {
  count = var.create_pii_pitfall_demo ? 1 : 0

  name                      = "${var.project_name}-pii-action-only"
  blocked_input_messaging   = "요청이 정책에 의해 차단되었습니다."
  blocked_outputs_messaging = "응답이 정책에 의해 차단되었습니다."

  sensitive_information_policy_config {
    pii_entities_config {
      type   = "EMAIL"
      action = "ANONYMIZE"
    }
  }
}
