# -*- coding: utf-8 -*-
import requests
import json

class JenkinsTriggerJob:
    '''
        젠킨스 잡 원격 트리거
    '''

    def __init__(self, folder_name, job_name, job_token):
        self.job_token = job_token
        self.folder_name = folder_name
        self.job_name = job_name
        self.host = "https://jenkins.choilab.xyz"
        self.admin = "admin"
        self.jenkins_accesstoken = "<your-token>"
    
    def trigger_job(self):
        try:
            request_url = """{}/job/{}/job/{}/build?token={}""".format(
                self.host,
                self.folder_name,
                self.job_name,
                self.job_token
            )
            auth = (self.admin, self.jenkins_accesstoken)
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            api_response = requests.get(request_url, auth=auth, headers=headers)
            print(api_response)

        except Exception as e:
            print("@@@@@@@@@@")
            print(e)
            print("@@@@@@@@@@")


if __name__=="__main__":
    jenkinscreatefolder = JenkinsTriggerJob("test2-3", "test2-3-2", "d17700b9f6bd45eeb5d62f510acb588c")

    jenkinscreatefolder.trigger_job()

    print("done")
