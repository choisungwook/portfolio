# Cloud Map 이름 하나에 replica 수만큼 A 레코드가 달린다. 수집기는 이 이름으로 replica를 하나씩 찾는다.
resource "aws_service_discovery_private_dns_namespace" "litellm" {
  name = local.namespace
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "litellm" {
  name = "litellm"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.litellm.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

resource "aws_service_discovery_service" "db" {
  name = "db"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.litellm.id

    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}
