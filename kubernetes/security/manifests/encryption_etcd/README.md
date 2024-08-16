# 개요
* etcd 암호화

# 적용방법

## kubernetes api server 설정

* 32길이를 갖는 키를 생성

```sh
openssl rand -base64 32
```

* control-plane 노드에서 encyrption 설정파일 생성

```sh
cat <<EOF > /etc/kubernetes/pki/EncryptionConfiguration.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources:
  - secrets
  providers:
  - secretbox:
      keys:
      - name: key1
        # input your openssl random key
        secret: OVN/X/TIT2uqBd/p9l5PXYSVQm47/mfSDfUQtXn/A4s=
  - identity: {}
EOF
```

```sh
# 파일 생성확인
ls /etc/kubernetes/pki/EncryptionConfiguration.yaml
```

## kube-api에 encyrption 설정 추가

```sh
$ vi /etc/kubernetes/manifests/kube-apiserver.yaml
apiVersion: v1
kind: Pod
metadata:
  ...
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-apiserver
    - --advertise-address=172.18.0.4
    - --encryption-provider-config=/etc/kubernetes/pki/EncryptionConfiguration.yaml
    ...
```

## 쿠버네티스 secrets 생성

```sh
kubectl apply -f ./secret.yaml
```

```sh
kubectl get secrets -A -o json | kubectl replace -f -
```
