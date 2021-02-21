FROM jenkins/jenkins:lts

USER root

# install linux packages(docker ... etc)
COPY configuration.sh /root/configuration.sh
RUN chmod +x /root/configuration.sh && /root/configuration.sh

# install jenkins packages
USER jenkins
COPY plugins.txt /usr/share/jenkins/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/plugins.txt