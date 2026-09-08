output "client_config" {
  description = "Non-secret runtime configuration. Each test pins one EIP per service."
  value = {
    region               = var.aws_region
    source_principal_arn = var.trusted_principal_arn
    role_arn             = aws_iam_role.client.arn
    memory_id            = aws_bedrockagentcore_memory.lab.id
    services = {
      for name, service in local.services : name => {
        hostname         = service.hostname
        nlb_dns_name     = aws_lb.api[name].dns_name
        target_group_arn = aws_lb_target_group.api[name].arn
        vpc_endpoint_id  = aws_vpc_endpoint.api[name].id
        eips = {
          for az in var.availability_zones : az => aws_eip.nlb["${name}-${az}"].public_ip
        }
        own_domain_url       = contains(keys(local.tls_services), name) ? "https://${var.tls_alias_domains[name]}" : null
        tls_target_group_arn = contains(keys(local.tls_services), name) ? aws_lb_target_group.tls[name].arn : null
        tls_eips = {
          for az in var.availability_zones : az => aws_eip.tls["${name}-${az}"].public_ip
          if contains(keys(local.tls_services), name)
        }
      }
    }
  }
}

output "firewall_destination_ips" {
  value = sort(concat([for eip in aws_eip.nlb : eip.public_ip], [for eip in aws_eip.tls : eip.public_ip]))
}

output "sts_alias_url" {
  description = "S05 input: own-domain URL that reaches the STS NLB but fails AWS TLS name checks."
  value       = "https://${var.sts_alias_domain}"
}
