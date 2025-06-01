## 개요

* EKS 1.33

## 실습환경

* [EKS 1.33](./terraform/)


## 업데이트 내용

### sidec


```sh
kubectl get pod sidecar-with-init-container -o json | jq '{
  initContainers: [.status.initContainerStatuses[] | {
    name: .name,
    exitCode: .state.terminated.exitCode,
    reason: .state.terminated.reason,
    startedAt: .state.terminated.startedAt,
    finishedAt: .state.terminated.finishedAt
  }],
  mainContainers: [.status.containerStatuses[] | {
    name: .name,
    exitCode: .state.terminated.exitCode,
    reason: .state.terminated.reason,
    startedAt: .state.terminated.startedAt,
    finishedAt: .state.terminated.finishedAt
  }]
}'
```


```sh
kubectl get pod sidecar-with-init-container -oyaml | yq '{
  initContainers: (.status.initContainerStatuses[]? | {
    name: .name,
    status: (
      select(.state.running)    .state.running.startedAt    |= "Running" | .startedAt = .state.running.startedAt | del(.state)
      | select(.state.terminated) .state.terminated.finishedAt |= "Terminated" | .startedAt = .state.terminated.startedAt | .finishedAt = .state.terminated.finishedAt | .exitCode = .state.terminated.exitCode | .reason = .state.terminated.reason | del(.state)
      | .status // "Unknown"
    ),
    startedAt: (.state.running.startedAt // .state.terminated.startedAt // null),
    finishedAt: (.state.terminated.finishedAt // null),
    exitCode: (.state.terminated.exitCode // null),
    reason: (.state.terminated.reason // null)
  }),
  mainContainers: (.status.containerStatuses[]? | {
    name: .name,
    status: (
      select(.state.running)    .state.running.startedAt    |= "Running" | .startedAt = .state.running.startedAt | del(.state)
      | select(.state.terminated) .state.terminated.finishedAt |= "Terminated" | .startedAt = .state.terminated.startedAt | .finishedAt = .state.terminated.finishedAt | .exitCode = .state.terminated.exitCode | .reason = .state.terminated.reason | del(.state)
      | .status // "Unknown"
    ),
    startedAt: (.state.running.startedAt // .state.terminated.startedAt // null),
    finishedAt: (.state.terminated.finishedAt // null),
    exitCode: (.state.terminated.exitCode // null),
    reason: (.state.terminated.reason // null)
  })
}'
```


```sh
kubectl get pod sidecar-with-init-container -o custom-columns="POD:.metadata.name,INIT_SIDECAR_STARTED_AT:.status.initContainerStatuses[?(@.name=='sidecar')].state.terminated.startedAt,INIT_SIDECAR_FINISHED_AT:.status.initContainerStatuses[?(@.name=='sidecar')].state.terminated.finishedAt,MAIN_NGINX_STARTED_AT:.status.containerStatuses[?(@.name=='nginx')].state.terminated.startedAt,MAIN_NGINX_FINISHED_AT:.status.containerStatuses[?(@.name=='nginx')].state.terminated.finishedAt"
```


```sh
kubectl get pod sidecar-with-init-container -oyaml | \
yq e '{
  "pod": .metadata.name,
  "sidecar_times": (
    .status.initContainerStatuses[] | select(.name == "sidecar") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  ),
  "nginx_times": (
    .status.containerStatuses[] | select(.name == "nginx") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  )
}' -
```

### 시나리오 conatiners에 sidecar 정의


```sh
kubectl get pod sidecar-in-containers -oyaml | \
yq e '{
  "pod": .metadata.name,
  "sidecar_times": (
    .status.containerStatuses[] | select(.name == "sidecar") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  ),
  "nginx_times": (
    .status.containerStatuses[] | select(.name == "nginx") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  )
}' -
```

watch kubectl get pod sidecar-in-containers -oyaml | \
yq e '{
  "pod": .metadata.name,
  "sidecar_times": (
    .status.containerStatuses[] | select(.name == "sidecar") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  ),
  "nginx_times": (
    .status.containerStatuses[] | select(.name == "nginx") | .state.terminated |
    {"started_at": .startedAt, "finished_at": .finishedAt}
  )
}' -


```sh
kubectl edit pod {pod이름} \
  --subresource resize
```
