FROM ubuntu:22.04

RUN apt-get update && apt-get install -y telnetd xinetd

COPY telnet.conf /etc/xinetd.d/telnet

RUN echo 'root:password' | chpasswd

EXPOSE 23

CMD ["/usr/sbin/xinetd", "-stayalive", "-dontfork"]
