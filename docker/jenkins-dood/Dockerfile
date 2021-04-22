FROM jenkins/jenkins:2.263.4-lts

USER root

# install linux packages(docker ... etc)
COPY configuration.sh /root/configuration.sh
RUN chmod +x /root/configuration.sh && /root/configuration.sh

# install jenkins packages
USER jenkins
COPY plugins.txt /usr/share/jenkins/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/plugins.txt

EXPOSE 8080/tcp
EXPOSE 50000/tcp