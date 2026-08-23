locals {
  domain_filter = merge(
    length(var.included_domains) > 0 ? { include = var.included_domains } : {},
    length(var.excluded_domains) > 0 ? { exclude = var.excluded_domains } : {}
  )
  parameter_values = length(local.domain_filter) > 0 ? { domainFilter = local.domain_filter } : {}
  target_configuration = {
    mcp = {
      connector = {
        source = {
          connectorId = "web-search"
          version     = var.connector_version
        }
        configurations = [
          {
            name            = "WebSearch"
            parameterValues = local.parameter_values
          }
        ]
      }
    }
  }
}

resource "terraform_data" "web_search_target" {
  input = {
    gateway_id           = aws_bedrockagentcore_gateway.web_search.gateway_id
    region               = var.aws_region
    target_name          = "web-search-tool"
    target_configuration = jsonencode(local.target_configuration)
  }

  provisioner "local-exec" {
    command = "${path.module}/../.venv/bin/python ${path.module}/scripts/sync_web_search_target.py"

    environment = {
      GATEWAY_ID           = self.input.gateway_id
      AWS_REGION           = self.input.region
      TARGET_NAME          = self.input.target_name
      TARGET_CONFIGURATION = self.input.target_configuration
    }
  }

  provisioner "local-exec" {
    when    = destroy
    command = "${path.module}/../.venv/bin/python ${path.module}/scripts/delete_web_search_target.py"

    environment = {
      GATEWAY_ID  = self.input.gateway_id
      AWS_REGION  = self.input.region
      TARGET_NAME = self.input.target_name
    }
  }

  depends_on = [aws_iam_role_policy.gateway]
}
