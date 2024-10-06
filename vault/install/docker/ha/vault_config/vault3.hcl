storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault3"

  retry_join {
    leader_api_addr = "http://vault1:8200"
  }

  retry_join {
    leader_api_addr = "http://vault2:8200"
  }
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr = "http://vault3:8200"
cluster_addr = "http://vault3:8201"

disable_mlock = true

ui = true

log_level = "info"
