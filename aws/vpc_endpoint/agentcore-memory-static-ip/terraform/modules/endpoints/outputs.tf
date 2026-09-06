output "security_group_id" { value = aws_security_group.endpoint.id }
output "services" {
  description = "Per service: AWS hostname to keep in URL/SNI/Host, VPCE ID and DNS URL, ENI private IPs per AZ."
  value = {
    for key, service in local.services : key => {
      hostname     = service.hostname
      endpoint_id  = aws_vpc_endpoint.api[key].id
      endpoint_url = "https://${aws_vpc_endpoint.api[key].dns_entry[0].dns_name}"
      private_ips = {
        for az in keys(var.subnets) : az => data.aws_network_interface.endpoint["${key}-${az}"].private_ip
      }
    }
  }
}
