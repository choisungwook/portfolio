output "cluster_name" {
  description = "ECS cluster name, used when creating the service in the console"
  value       = aws_ecs_cluster.this.name
}

output "task_definition_family" {
  description = "Fargate task definition family to select in the console"
  value       = aws_ecs_task_definition.web.family
}

output "ec2_task_definition_family" {
  description = "EC2 launch type task definition family to select in the console"
  value       = aws_ecs_task_definition.web_ec2.family
}

output "container_instance_public_ip" {
  description = "Public IP of the container instance, used to reach the EC2 launch type task"
  value       = aws_instance.container_instance.public_ip
}

output "subnet_ids" {
  description = "Default VPC subnets to select in the service network settings"
  value       = data.aws_subnets.default.ids
}

output "security_group_id" {
  description = "Security group to attach to the service"
  value       = aws_security_group.web.id
}
