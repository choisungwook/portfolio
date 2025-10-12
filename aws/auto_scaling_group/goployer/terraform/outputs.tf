
output "arm_ami_id" {
  value = data.aws_ami.amazon_linux_2023_arm64.id
}


output "subnet_ids" {
  value = data.aws_subnets.public.ids
}
