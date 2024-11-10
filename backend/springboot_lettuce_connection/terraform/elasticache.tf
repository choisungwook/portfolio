resource "aws_elasticache_subnet_group" "redis" {
  name       = "redis-subnet-group"
  subnet_ids = module.vpc.private_subnets_ids

  tags = {
    Name = "redis-subnet-group"
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "redis-sg"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "redis-cluster"
  description          = "test for Redis Cluster"

  engine                     = "redis"
  node_type                  = "cache.t4g.small"
  parameter_group_name       = "default.redis7.cluster.on"
  engine_version             = "7.1"
  automatic_failover_enabled = true

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  port                    = 6379
  num_node_groups         = 1
  replicas_per_node_group = 1

  tags = {
    Name = "redis-cluster"
  }
}
