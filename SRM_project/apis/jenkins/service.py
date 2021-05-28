# -*- coding: utf-8 -*-
import requests
from config.jenkins_config import get_jenkins_accessToken, get_jenkins_host, get_jenkins_admin, get_jenkins_jobtemplate_name
import json
from logger.log import log
import chevron
import uuid

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
            
class JenkinsCreateJob:
    '''
        젠킨스 잡 생성
    '''

    def __init__(self, job_name, folder_name, git_repo_url):
        self.jenkins_accesstoken = get_jenkins_accessToken()
        self.host = get_jenkins_host()
        self.admin = get_jenkins_admin()

        self.job_name = job_name
        self.folder_name = folder_name
        self.git_repo_url = git_repo_url

    def createJobWithFolder(self):
        '''
            폴더 안에 젠킨스 잡 생성
        '''
        result = {
            "status": False,
            "data": {
                "token": None
            }
        }

        if not self.folder_name:
            log.error("[Error 317] pelase Input folder node")
            return result

        try:
            post_data = ""
            token = self.create_randomtoken()
            request_url = "{}/job/{}/createItem?name={}".format(
                self.host,
                self.folder_name,
                self.job_name
            )
            headers = {"Content-Type": "text/xml"}
            auth = (self.admin, self.jenkins_accesstoken)

            with open(get_jenkins_jobtemplate_name(), "r", encoding="utf-8") as f:
                post_data = chevron.render(f.readline(), {
                    "gitrepo": self.git_repo_url,
                    "barnch": "master", # gitlab default
                    "trigger_token": token # token for remote trigger jenkins job
                })
            
            api_response = requests.post(request_url, auth=auth, data=post_data, headers=headers)

            if api_response.ok:
                result['status'] = True
                result['data']['token'] = token
                log.debug("create jenkins job success")
            else:
                log.debug("create jenkins failed: {}".format(api_response.json()))
        except Exception as e:
            log.error("[318] failed to create jenkins job: {}".format(e))

        return result
    
    def create_randomtoken(self):
        '''
        랜덤 UUID 생성
        '''
        return uuid.uuid4().__str__().replace("-", "")
