# 개요
* ansible playbook role 스켈레톤 코드

# 이미지
* centos 7

# 설정
* Vagrantfile IP 수정
```yaml
DEMO_IP = "192.168.219.88"
ANSIBLE_SERVERIP = "192.168.219.89"
```
* ansible playbook hosts수정
```yaml
---
- name: configure ansible hosts
  hosts: localhost
  gather_facts: no
  
  tasks:
    - name: create hosts and configuration
      copy:
        dest: /home/vagrant/hosts
        content: |
          [demo]
          192.168.219.88
```

# 실행
```sh
vagrant sh
```

# 삭제
```sh
vagrant destroy --force
```