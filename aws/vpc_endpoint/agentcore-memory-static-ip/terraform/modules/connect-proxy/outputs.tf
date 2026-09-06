output "proxy_url" { value = "https://${var.proxy_domain}:443" }
output "proxy" {
  value = {
    instance_id      = aws_instance.proxy.id
    target_group_arn = aws_lb_target_group.proxy.arn
    nlb_dns_name     = aws_lb.proxy.dns_name
    addresses        = var.scheme == "internal" ? var.nlb_private_ips : { for az, eip in aws_eip.nlb : az => eip.public_ip }
  }
}
