data "aws_caller_identity" "current" {}

locals {
  # provider는 profile ID가 아니라 ARN만 받는다
  guardrail_profile_arn = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:guardrail-profile/${var.guardrail_profile_id}"
}
