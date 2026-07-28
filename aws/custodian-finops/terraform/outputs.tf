output "tagged_instance_id" {
  description = "Instance that carries Owner and Environment. Policies should leave it alone."
  value       = aws_instance.tagged.id
}

output "untagged_instance_id" {
  description = "Instance the tag policy marks and later stops."
  value       = aws_instance.untagged.id
}

output "orphan_volume_id" {
  description = "Detached volume the orphan policy finds."
  value       = aws_ebs_volume.orphan.id
}

output "db_instance_id" {
  description = "RDS instance with no Owner tag."
  value       = try(aws_db_instance.main[0].id, null)
}

output "custodian_policy_arn" {
  description = "IAM policy holding the permissions the lab policies need."
  value       = aws_iam_policy.custodian.arn
}
