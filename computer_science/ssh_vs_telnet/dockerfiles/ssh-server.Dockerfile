FROM ubuntu:22.04

RUN apt-get update && apt-get install -y vim openssh-server

RUN mkdir /var/run/sshd \
  && chmod 755 /run/sshd

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
