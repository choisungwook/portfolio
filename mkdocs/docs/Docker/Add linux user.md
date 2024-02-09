## 개요
* 이 문서는 Dockerfie에서 리눅스 유저를 추가하는 방법을 설명합니다.

## Dockerfile

```dockerfile
# Variables
ARG USERNAME=ansible
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create the user
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && apt-get update \
    && apt-get install -y sudo \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME


USER $USERNAME
```
