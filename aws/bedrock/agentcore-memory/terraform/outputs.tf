output "memory_id" {
  value = aws_bedrockagentcore_memory.chat.id
}

# backend와 scripts가 읽는 .runtime.env 내용
output "runtime_env" {
  value = <<-EOT
    AWS_REGION=${var.aws_region}
    MEMORY_ID=${aws_bedrockagentcore_memory.chat.id}
    STRATEGY_FACTS=${aws_bedrockagentcore_memory_strategy.semantic.memory_strategy_id}
    STRATEGY_PREFERENCES=${aws_bedrockagentcore_memory_strategy.preference.memory_strategy_id}
    STRATEGY_SUMMARIES=${aws_bedrockagentcore_memory_strategy.summary.memory_strategy_id}
    STRATEGY_EPISODES=${aws_bedrockagentcore_memory_strategy.episodic.memory_strategy_id}
  EOT
}
