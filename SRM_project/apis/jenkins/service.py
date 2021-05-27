# -*- coding: utf-8 -*-
import requests
from config.jenkins_config import get_jenkins_accessToken, get_jenkins_host, get_jenkins_admin
import json
from logger.log import log

class JenkinsCreateFolder:
    '''
        젠킨스 폴더 생성
            프로젝트가 생성 될 때
    '''

    def __init__(self, project_name):
        self.folder_name = project_name
        self.jenkins_accesstoken = get_jenkins_accessToken()
        self.host = get_jenkins_host()
        self.admin = get_jenkins_admin()
    
    def create(self):
        response = {
            'status': False
        }

        try:
            create_folderjson = {
                "name": self.folder_name,
                "mode": "com.cloudbees.hudson.plugins.folder.Folder",
                "from": "",
                "Submit": "OK"
            }            
            request_url = """{}/createItem?name={}&mode=com.cloudbees.hudson.plugins.folder.Folder&from=&json={}&Submit=OK""".format(
                self.host,
                self.folder_name,                
                json.dumps(create_folderjson, ensure_ascii=False)
            )
            auth = (self.admin, self.jenkins_accesstoken)
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            
            api_response = requests.post(request_url, auth=auth, headers=headers)

            if api_response.ok:
                response['status'] = True

        except Exception as e:
            log.error("[316] create jenkins folder: {}".format(e))

        return response
            