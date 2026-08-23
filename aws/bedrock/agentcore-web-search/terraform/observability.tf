resource "aws_cloudwatch_log_group" "gateway" {
  name              = "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${aws_bedrockagentcore_gateway.web_search.gateway_id}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_delivery_source" "gateway" {
  name         = "${var.project_name}-application-logs"
  log_type     = "APPLICATION_LOGS"
  resource_arn = aws_bedrockagentcore_gateway.web_search.gateway_arn
}

resource "aws_cloudwatch_log_delivery_destination" "gateway" {
  name          = "${var.project_name}-cloudwatch"
  output_format = "json"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.gateway.arn
  }
}

resource "aws_cloudwatch_log_delivery" "gateway" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.gateway.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.gateway.arn
}
