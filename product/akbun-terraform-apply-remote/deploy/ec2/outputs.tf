output "public_ip" {
  description = "Elastic IP of the webhook server"
  value       = aws_eip.server.public_ip
}

output "webhook_url" {
  description = "Payload URL to register in the GitHub webhook settings"
  value       = "http://${aws_eip.server.public_ip}:${var.server_port}/events"
}
