FROM jenkins/jenkins:lts

USER root

# install linux packages(docker ... etc)
COPY configuration.sh $HOME/configuration.sh
RUN chmod +x $HOME/configuration.sh && $HOME/configuration.sh

# install jenkins packages
USER jenkins
COPY plugins.txt $HOME/plugins.txt
RUN jenkins-plugin-cli --plugin-file $HOME/plugins.txt