import yaml
import os

def get_jenkins_accessToken():
    '''
        리턴: jenkins admin access_token
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['jenkins']['access_token']

def get_jenkins_host():
    '''
        리턴: jenkins host주소
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['jenkins']['host']

def get_jenkins_admin():
    '''
        리턴: jenkins admin 계정
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['jenkins']['admin_user']

def get_jenkins_jobtemplate_name():
    '''
        리턴: jenkins job 생성 템플릿
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)
    
    return os.path.join('config', config['jenkins']['createjob']['job_template'])
