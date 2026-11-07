output "guardrail_id" {
  value = aws_bedrock_guardrail.handson.guardrail_id
}

output "guardrail_version" {
  value = aws_bedrock_guardrail_version.handson.version
}

# LiteLLM과 scripts가 읽는 .runtime.env 내용
output "runtime_env" {
  value = <<-EOT
    AWS_REGION=${var.aws_region}
    GUARDRAIL_ID=${aws_bedrock_guardrail.handson.guardrail_id}
    GUARDRAIL_VERSION=${aws_bedrock_guardrail_version.handson.version}
    GUARDRAIL_ARN=${aws_bedrock_guardrail.handson.guardrail_arn}
  EOT
}

output "pii_pitfall_demo_id" {
  value = one(aws_bedrock_guardrail.pii_action_only[*].guardrail_id)
}

output "trail_bucket" {
  value = one(aws_s3_bucket.trail[*].id)
}
