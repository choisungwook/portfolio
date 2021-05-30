import yaml

def get_springboot_helm_rootId():
    '''
        리턴: jenkins admin access_token
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['helm']['root_Id']['springboot']
