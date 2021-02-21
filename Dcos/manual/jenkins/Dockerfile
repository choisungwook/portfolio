FROM jenkins/jenkins:lts

USER root

# install linux packages(docker ... etc)
COPY configuration.sh /configuration.sh
RUN chmod +x /configuration.sh && /configuration.sh

# install jenkins packages
USER jenkins
COPY plugins.txt /usr/share/jenkins/plugins.txt
RUN jenkins-plugin-cli --plugin-file plugins.txt