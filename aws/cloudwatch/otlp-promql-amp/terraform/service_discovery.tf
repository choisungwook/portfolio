# Cloud Map 이름 하나에 app task 수만큼 A 레코드가 달린다. 수집기는 이 이름으로 replica를 하나씩 찾는다.
resource "aws_service_discovery_private_dns_namespace" "this" {
  name = local.namespace
  vpc  = data.aws_vpc.default.id
}

resource "aws_service_discovery_service" "app" {
  name = "app"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}
