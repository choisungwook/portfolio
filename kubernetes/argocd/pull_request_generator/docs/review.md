# 리뷰 메모

## Q. waypoint, HTTPRoute가 적용되었다는 것은 어떻게 확인하는가?

`namespace=pr-123` 응답만으로는 최종 응답 Pod만 확인한 것입니다. waypoint와 `HTTPRoute` 적용 여부는 Service가 waypoint에 붙었는지, route가 Accepted 되었는지, 실제 waypoint proxy config에 route가 내려갔는지로 확인합니다.

1. Service가 waypoint에 붙었는지 확인합니다.

```bash
kubectl get service app-service -n prod -o yaml
kubectl get service app-service -n pr-123 -o yaml
```

확인값: `status.conditions`에 `type: istio.io/WaypointBound`, `status: "True"`

2. `HTTPRoute`가 parent Service에 붙었는지 확인합니다.

```bash
kubectl get httproute app-route-pr-123 -n prod -o yaml
```

확인값: `Accepted=True`, `ResolvedRefs=True`, `ResolvedWaypoints=True`

3. route가 실제 waypoint proxy에 내려갔는지 확인합니다.

```bash
WAYPOINT_POD=$(kubectl get pod -n istio-waypoint \
  -l gateway.networking.k8s.io/gateway-name=waypoint \
  -o jsonpath='{.items[0].metadata.name}')

istioctl proxy-config routes "${WAYPOINT_POD}" \
  -n istio-waypoint \
  --name 'inbound-vip|8080|http|app-service.prod.svc.cluster.local' \
  -o json
```

확인값: `prod.app-route-pr-123.0`은 `app-service.pr-123.svc.cluster.local`, `prod.app-route-pr-123.1`은 `app-service.prod.svc.cluster.local`

4. 최종 호출 결과를 확인합니다.

```bash
kubectl exec -n client curl-client -- \
  curl -sS http://app-service.prod.svc.cluster.local:8080/work \
| jq '{service, namespace}'

kubectl exec -n client curl-client -- \
  curl -sS \
    --cookie 'pod-chain-pr=123' \
    http://app-service.prod.svc.cluster.local:8080/work \
| jq '{service, namespace}'
```

확인값: 쿠키 없으면 waypoint fallback으로 `namespace=prod`, 쿠키가 있으면 header match로 `namespace=pr-123`
