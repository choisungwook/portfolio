resource "random_id" "artifact_bucket_endfix" {
  byte_length = 4

  keepers = {
    project_name = var.project_name
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${var.project_name}-artifacts-${random_id.artifact_bucket_endfix.hex}"
  force_destroy = var.force_destroy_artifact_bucket
}

data "aws_kms_alias" "s3" {
  name = "alias/aws/s3"
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_alias.s3.target_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_object" "chapter5_data" {
  for_each = local.chapter5_data_files

  bucket = aws_s3_bucket.artifacts.id
  key    = "${var.s3files_prefix}data/chapter5/${each.value}"
  source = "${local.chapter5_data_dir}/${each.value}"
  etag   = filemd5("${local.chapter5_data_dir}/${each.value}")
}

resource "aws_s3_object" "notebooks" {
  for_each = local.notebook_files

  bucket = aws_s3_bucket.artifacts.id
  key    = "${var.s3files_prefix}notebooks/${each.value}"
  source = "${local.notebook_dir}/${each.value}"
  etag   = filemd5("${local.notebook_dir}/${each.value}")
}

resource "aws_s3_object" "model_assets_keep" {
  bucket  = aws_s3_bucket.artifacts.id
  key     = "${var.s3files_prefix}model-assets/.keep"
  content = ""
}

resource "aws_security_group" "s3files_mount_target" {
  name        = "${var.eks_cluster_name}-s3files-mount-target"
  description = "Allow EKS nodes to mount S3 Files over NFS"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "s3files_mount_target_nfs" {
  security_group_id = aws_security_group.s3files_mount_target.id
  cidr_ipv4         = data.aws_vpc.default.cidr_block
  from_port         = 2049
  ip_protocol       = "tcp"
  to_port           = 2049
}

resource "aws_vpc_security_group_egress_rule" "s3files_mount_target_all" {
  security_group_id = aws_security_group.s3files_mount_target.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_s3files_file_system" "artifacts" {
  bucket                = aws_s3_bucket.artifacts.arn
  prefix                = var.s3files_prefix
  role_arn              = aws_iam_role.s3files_bucket_access.arn
  accept_bucket_warning = true

  depends_on = [
    aws_iam_role_policy.s3files_bucket_access,
    aws_s3_bucket_public_access_block.artifacts,
    aws_s3_bucket_server_side_encryption_configuration.artifacts,
    aws_s3_bucket_versioning.artifacts,
  ]
}

resource "aws_s3files_access_point" "artifacts" {
  file_system_id = aws_s3files_file_system.artifacts.id

  posix_user {
    gid = var.s3files_access_point_gid
    uid = var.s3files_access_point_uid
  }
}

resource "aws_s3files_access_point" "model_assets" {
  file_system_id = aws_s3files_file_system.artifacts.id

  root_directory {
    path = var.s3files_model_assets_path

    creation_permissions {
      owner_gid   = var.s3files_access_point_gid
      owner_uid   = var.s3files_access_point_uid
      permissions = var.s3files_model_assets_permissions
    }
  }

  posix_user {
    gid = var.s3files_access_point_gid
    uid = var.s3files_access_point_uid
  }
}

resource "aws_s3files_mount_target" "artifacts" {
  for_each = toset(data.aws_subnets.default.ids)

  file_system_id = aws_s3files_file_system.artifacts.id
  security_groups = [
    aws_security_group.s3files_mount_target.id,
  ]
  subnet_id = each.value
}
