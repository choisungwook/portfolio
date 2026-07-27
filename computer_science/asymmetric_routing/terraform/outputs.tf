output "forward_path" {
  description = "Which forward path this apply built."
  value       = var.forward_path
}

output "session_manager" {
  description = "Commands that open a shell on each lab host."
  value = {
    client = "aws ssm start-session --target ${aws_instance.client.id} --region ${var.aws_region}"
    probe  = "aws ssm start-session --target ${aws_instance.probe.id} --region ${var.aws_region}"
    server = "aws ssm start-session --target ${aws_instance.server.id} --region ${var.aws_region}"
  }
}

output "addresses" {
  description = "Private addresses used in the hands-on steps."
  value = {
    client_eth0 = aws_instance.client.private_ip
    client_eth1 = aws_network_interface.client_secondary.private_ip
    probe       = aws_instance.probe.private_ip
    server      = aws_instance.server.private_ip
  }
}

output "private_nat_gateway_ip" {
  description = "Source address the server sees when forward_path is pnat."
  value       = var.forward_path == "pnat" ? aws_nat_gateway.private[0].private_ip : null
}
