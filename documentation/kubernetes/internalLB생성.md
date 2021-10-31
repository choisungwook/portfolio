# 개요
* public cloud에서 internal lb를 쓰기에는 돈이 아까우며,...

# 수정
```yaml
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure
           fallthrough in-addr.arpa ip6.arpa
           ttl 30
        }
        prometheus :9153
        hosts {
           127.0.0.1 host.minikube.internal
           fallthrough
        }
        hosts InternalLB.db choicloudlab.com  {
           fallthrough
        }
        forward . /etc/resolv.conf {
           max_concurrent 1000
        }
        cache 30
        loop
        reload
        loadbalance
    }
  InternalLB.db: |
    172.31.61.209 jpaschool-backend.choicloudlab.com
kind: ConfigMap

```

# coredns 재실행
```sh
```

# 참고자료
* https://stackoverflow.com/questions/37166822/is-there-a-way-to-add-arbitrary-records-to-kube-dns
* https://coredns.io/plugins/hosts/
* https://coredns.io/2017/05/08/custom-dns-entries-for-kubernetes/
* https://kubernetes.io/docs/tasks/network/customize-hosts-file-for-pods/