# Kubernetes Deployment Standards

## When to Reference This File

- When referencing this file in GitHub pull requests, use this file for code review only when there are code changes.
- If a file appears to be a Kubernetes YAML file, check whether it complies with these guidelines.

## General Guidelines

### Resource Configuration

- Container's Resource limits must be explicitly specified. Requests are optional but recommended. However, if requests are not specified, a warning message should be displayed to set requests.
- Service ports should be clearly named according to protocol (e.g., http, https, grpc)
- Ingress resources must use TLS, and HTTP requests should be redirected to HTTPS
- All containers must have readiness and liveness probes configured

```yaml
spec:
  containers:
  - name: example
    image: example
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
    readinessProbe:
      httpGet:
        path: /actuator/health/readiness
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 3
      timeoutSeconds: 1
      failureThreshold: 1
    livenessProbe:
      httpGet:
        path: /actuator/health/liveness
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 1
```

### Container Security

- Containers should run as non-root users. If running as root, display a warning message. (runAsNonRoot: true)
- Read-only root filesystem is recommended when possible. If not read-only, display a warning message. (readOnlyRootFilesystem: true)
- Privilege escalation should be set to false. If privilege escalation is allowed, display a warning message. (allowPrivilegeEscalation: false)
- Remove all capabilities and explicitly add only necessary ones
- below is the example of a compliant container security context:

```yaml
spec:
  containers:
  - name: nginx
    image: nginx
    securityContext:
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
```
