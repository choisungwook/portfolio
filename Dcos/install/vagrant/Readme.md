# 개요
* dcos 설치 vagrantfile

# 준비
* dcos_generate_config.sh 다운로드
* virtualbox 설치: dcos 노드
* vagrant 설치: 인프라 구성 스크립트

# 설정
## bootstrap role
* 설정파일: ansible_workspace/roles/bootstrap/tasks/main.yml
* bootstrap_ip/port, master_ip, dns_ip
```yaml
- name: Add line to a ip-detect file
  copy:
    dest: /tmp/genconf/ip-detect
    content: |
      bootstrap_url: http://<bootstrap_ip>:<your port>
      cluster_name: dcos
      exhibitor_storage_backend: static
      master_discovery: static
      ip_detect_public_filename: genconf/config.yaml
      master_list:
      - <master ip>
      resolvers:
      - <dns ip>
```

# 인프라 구성
* 설정 후 vagrant up
```powershell
vagrant up
```
* vagrant 스크립트 성공적으로 실행 후 각 vm 재부팅(설정적용)
* sestatus 확인

# 설치
## bootstrap
* dcos_generate_config.sh 실행
```sh
cd /home/vagrant
sudo bash dcos_generate_config.sh
```

![](imgs/run_dcos_generate_config.png)

![](imgs/run_dcos_generate_config_result.png.png)

* your-port를 외부에 접속할 포트로 변경(예: 8888)
```sh
sudo docker run -d -p <your-port>:80 -v $PWD/genconf/serve:/usr/share/nginx/html:ro nginx
```

## master
```sh
mkdir /tmp/dcos && cd /tmp/dcos
curl -O http://<bootstrap-ip>:<your_port>/dcos_install.sh
sudo bash dcos_install.sh master
sudo bash dcos_install.sh master
```

## agent
```sh
mkdir /tmp/dcos && cd /tmp/dcos
curl -O http://<bootstrap-ip>:<your_port>/dcos_install.sh
sudo bash dcos_install.sh slave
sudo bash dcos_install.sh slave
```

# 설치 확인
* master-ip:8181

# 참고자료
* [1] 설치 공식문서: https://docs.d2iq.com/mesosphere/dcos/2.2/installing/production/deploying-dcos/installation/#configure-your-cluster
* [2] 설치git wiki: https://github.com/amitpandit09/DCOS-setup-on-ubuntu/wiki/Configure-bootstrap-node
* [3] 공식문서 troubleshooting: https://docs.d2iq.com/mesosphere/dcos/2.0/installing/troubleshooting/#gen-resolvconf
* [4] 설치 git: https://gist.github.com/cantbewong/38a4f5dc8c78b17c9ca8881e00310498