# 기본 inventory 수집. 콘솔 Inventory > Setup Inventory와 같은 State Manager association이다.
resource "aws_ssm_association" "gather_inventory" {
  name                = "AWS-GatherSoftwareInventory"
  association_name    = "${var.project_name}-gather"
  schedule_expression = var.inventory_schedule

  targets {
    key    = "InstanceIds"
    values = [aws_instance.managed_node.id]
  }

  parameters = {
    applications                = "Enabled"
    awsComponents               = "Enabled"
    networkConfig               = "Enabled"
    instanceDetailedInformation = "Enabled"
    services                    = "Enabled"
    files                       = ""
    windowsUpdates              = "Disabled"
    windowsRoles                = "Disabled"
    windowsRegistry             = ""
    customInventory             = "Enabled"
  }
}

resource "aws_ssm_resource_data_sync" "inventory" {
  name = "${var.project_name}-sync"

  s3_destination {
    bucket_name = aws_s3_bucket.inventory_sync.id
    region      = var.aws_region
    sync_format = "JsonSerDe"
    prefix      = "inventory"
  }

  depends_on = [aws_s3_bucket_policy.inventory_sync]
}
