variable "aws_region" {
  description = "guardrail을 만들 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "default_tags의 Project 값과 guardrail 이름"
  type        = string
  default     = "guardrails-handson"
}

variable "guardrail_profile_id" {
  description = "Standard tier가 쓰는 cross-region guardrail profile. 리전을 바꾸면 함께 바꾼다"
  type        = string
  default     = "apac.guardrail.v1:0"
}

variable "blocked_words" {
  description = "word filter에 등록할 금지어. 시나리오 2의 버전 고정 실습에서 항목을 추가한다"
  type        = list(string)
  default     = ["PROJECT-ORION", "사내비밀코드"]
}

variable "create_pii_pitfall_demo" {
  description = "PII 항목에 action만 적은 비교용 guardrail을 만든다(시나리오 2)"
  type        = bool
  default     = false
}

variable "enable_guardrail_data_events" {
  description = "ApplyGuardrail 데이터 이벤트를 S3에 기록하는 CloudTrail trail을 만든다. 판정 근거(assessments)가 S3 로그로 남으므로 기본은 끈다. 데이터 이벤트 10만 건당 0.10 USD"
  type        = bool
  default     = false
}
