import yaml

def get_GitlabAccessToken():
    '''
        gitlab accesstoekn 설정
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['accesstoken']

def get_GitlabInitPassword():
    '''
        gitlab 사용자 초기 비밀번호
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['user_initpassword']

def get_gitlabURI():
    '''
        gitlab URI
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['gitlabDomain']

def get_default_memberexpires_data():
    '''
        gitlab 프로젝트 또는 group에 멤버 추가할 때, 
        default 만료날짜
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['group_member_default_expires']

def get_pythonappId():
    '''
        리턴: 파이썬 애플리케이션을 생성하기 위한 python project ID
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['root_appId']['python']

def get_springbootappId():
    '''
        리턴: 파이썬 애플리케이션을 생성하기 위한 python project ID
    '''
    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['gitlab']['root_appId']['springboot']

def get_jenkins_accessToken():
    '''
        리턴: gitlab admin access_token
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['jenkins']['access_token']
    