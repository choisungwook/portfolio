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
