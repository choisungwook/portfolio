resource "aws_elasticache_subnet_group" "this" {
  name       = var.project_name
  subnet_ids = sort(data.aws_subnets.default.ids)
}

locals {
  auth_token_enabled = contains(["auth_overlap", "auth_required"], var.migration_phase)
  rbac_enabled       = contains(["rbac_overlap", "iam_required"], var.migration_phase)
  auth_token_update_strategy = {
    unauthenticated = null
    auth_overlap    = "ROTATE"
    auth_required   = "SET"
    rbac_overlap    = "DELETE"
    iam_required    = "DELETE"
  }[var.migration_phase]
}

resource "aws_elasticache_user" "password" {
  count = local.rbac_enabled ? 1 : 0

  user_id       = "${substr(var.project_name, 0, 30)}-password"
  user_name     = "default"
  access_string = "on ~* +@all"
  engine        = "valkey"

  authentication_mode {
    type      = "password"
    passwords = [var.elasticache_auth_token]
  }
}

resource "aws_elasticache_user" "iam" {
  count = local.rbac_enabled ? 1 : 0

  user_id       = var.iam_user_name
  user_name     = var.iam_user_name
  access_string = "on ~* +@all"
  engine        = "valkey"

  authentication_mode {
    type = "iam"
  }
}

resource "aws_elasticache_user_group" "this" {
  count = local.rbac_enabled ? 1 : 0

  engine        = "valkey"
  user_group_id = "${var.project_name}-users"
  user_ids = var.migration_phase == "iam_required" ? [
    aws_elasticache_user.iam[0].user_id,
    ] : [
    aws_elasticache_user.password[0].user_id,
    aws_elasticache_user.iam[0].user_id,
  ]
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.project_name
  description          = "Valkey AUTH and TLS required lab"

  engine             = "valkey"
  node_type          = var.cache_node_type
  num_cache_clusters = 1
  port               = 6379

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.elasticache.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  auth_token                 = local.auth_token_enabled ? var.elasticache_auth_token : null
  auth_token_update_strategy = local.auth_token_update_strategy
  user_group_ids             = local.rbac_enabled ? [aws_elasticache_user_group.this[0].id] : []
  auto_minor_version_upgrade = true
  automatic_failover_enabled = false
  snapshot_retention_limit   = 0
  apply_immediately          = true

  tags = {
    Name = var.project_name
  }

  lifecycle {
    precondition {
      condition     = var.migration_phase == "unauthenticated" || var.elasticache_auth_token != null
      error_message = "Set elasticache_auth_token for every migration phase except unauthenticated."
    }
  }
}
