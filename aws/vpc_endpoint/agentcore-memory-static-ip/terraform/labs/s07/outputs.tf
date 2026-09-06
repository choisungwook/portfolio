output "lab" { value = merge(module.services.lab, { proxy_url = module.proxy.proxy_url, proxy = module.proxy.proxy }) }
