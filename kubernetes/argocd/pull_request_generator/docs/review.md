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

## Q. PR close 시 임시환경이 삭제되는지 어떻게 확인하는가?

현재 `pull-request-generator.example.yaml` 기준으로 PR close 시 임시환경은 삭제되어야 합니다. ApplicationSet은 close된 PR을 generator 결과에서 제외하고, 생성했던 `Application`을 삭제합니다. 생성된 `Application`에는 `resources-finalizer.argocd.argoproj.io`가 붙으므로 PR namespace의 workload, Service, ReferenceGrant와 prod namespace의 PR용 HTTPRoute도 같이 삭제됩니다.

PR namespace까지 삭제하려면 namespace가 Argo CD Application의 추적 대상이어야 합니다. 이 예제는 `managedNamespaceMetadata.annotations`에 namespace tracking annotation을 넣어 `pr-<PR번호>` namespace도 삭제 대상에 포함합니다. 이 설정은 PR마다 전용 namespace를 쓰는 경우에만 안전합니다.

PR close 전에 삭제 설정이 들어갔는지 확인합니다.

```bash
PR_NUMBER=123

kubectl get application "pod-chain-pr-${PR_NUMBER}" \
  -n argocd \
  -o jsonpath='{.metadata.finalizers}{"\n"}'

kubectl get namespace "pr-${PR_NUMBER}" \
  -o jsonpath='{.metadata.annotations.argocd\.argoproj\.io/tracking-id}{"\n"}'
```

확인값: `resources-finalizer.argocd.argoproj.io`, `pod-chain-pr-123:/Namespace:/pr-123`

PR close 전에 생성된 임시 리소스를 확인합니다.

```bash
kubectl get application "pod-chain-pr-${PR_NUMBER}" -n argocd
kubectl get namespace "pr-${PR_NUMBER}"
kubectl get deployment,service,referencegrant -n "pr-${PR_NUMBER}"
kubectl get httproute "app-route-pr-${PR_NUMBER}" -n prod
```

GitHub에서 PR을 close한 뒤 ApplicationSet 재조회 주기만큼 기다립니다. 이 예제는 `requeueAfterSeconds: 60`입니다.

```bash
kubectl wait \
  --for=delete application/"pod-chain-pr-${PR_NUMBER}" \
  -n argocd \
  --timeout=180s
```

PR close 후 임시 리소스가 삭제됐는지 확인합니다.

```bash
kubectl get application "pod-chain-pr-${PR_NUMBER}" -n argocd
kubectl get namespace "pr-${PR_NUMBER}"
kubectl get httproute "app-route-pr-${PR_NUMBER}" -n prod
```

확인값: 세 명령 모두 `NotFound`입니다. HTTPRoute를 켜지 않은 PR이면 close 전에도 `app-route-pr-<PR번호>`가 없을 수 있습니다.

삭제가 안 되면 ApplicationSet과 controller 로그를 확인합니다.

```bash
kubectl get applicationset pod-chain-pr-workload -n argocd -o yaml
kubectl logs -n argocd deployment/argocd-applicationset-controller --tail=120
```

`generated 0 applications`인데 namespace가 남아 있으면 namespace tracking annotation이 실제 namespace에 들어갔는지 확인합니다. 기존에 생성된 PR namespace는 설정 변경 후 한 번 더 sync되어야 annotation이 반영될 수 있습니다.
