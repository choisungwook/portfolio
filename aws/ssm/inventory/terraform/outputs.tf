output "instance_id" {
  description = "PutInventory 대상 managed node ID"
  value       = aws_instance.managed_node.id
}

output "sync_bucket" {
  description = "Resource data sync 대상 S3 버킷"
  value       = aws_s3_bucket.inventory_sync.id
}

output "association_id" {
  description = "AWS-GatherSoftwareInventory association ID"
  value       = aws_ssm_association.gather_inventory.association_id
}
