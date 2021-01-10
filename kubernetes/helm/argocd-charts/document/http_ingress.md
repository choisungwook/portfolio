# 개요
* HTTP->HTTPS redriect ingress 설정

# 설정
* ingress
```yaml
server:
  ingress:
    enabled: true
    annotations:
      nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
      nginx.ingress.kubernetes.io/backend-protocol: "HTTP"
    # change here
    hosts:
      - "helloworld.com"
    # change here
    paths:
      - "/"
```

* deployment.yaml
```yaml
containers:
    - name: {{ .Values.server.name }}
    image: {{ default .Values.global.image.repository .Values.server.image.repository }}:{{ default .Values.global.image.tag .Values.server.image.tag }}
    imagePullPolicy: {{ default .Values.global.image.imagePullPolicy .Values.server.image.imagePullPolicy }}
    command:
    - --insecure
```

# 참고자료
* https://blog.csdn.net/weixin_37546425/article/details/105137539