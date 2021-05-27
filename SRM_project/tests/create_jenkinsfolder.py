# -*- coding: utf-8 -*-
import requests
import json

class JenkinsCreateFolder:
    '''
        젠킨스 폴더 생성
            프로젝트가 생성 될 때
    '''

    def __init__(self, project_name):
        self.folder_name = project_name
        self.jenkins_accesstoken = "1192f220a80306dbe4a07fe4d9d133dc2f"
        self.host = "https://choilab.com/jenkins1"
        self.admin = "admin"
    
    def create(self):
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
            
            print(request_url)
            api_response = requests.post(request_url, auth=auth, headers=headers)
            print(api_response)

        except Exception as e:
            print("@@@@@@@@@@")
            print(e)
            print("@@@@@@@@@@")


if __name__=="__main__":
    test_project_name = "hihihi"
    jenkinscreatefolder = JenkinsCreateFolder(test_project_name)

    jenkinscreatefolder.create()

    print("done")
