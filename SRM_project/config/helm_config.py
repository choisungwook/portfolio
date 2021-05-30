import yaml

def get_springboot_helm_rootId():
    '''
        리턴: helm springboot helm project ID
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['helm']['root_Id']['springboot']

def get_common_helm():
    '''
        리턴: helm common project
    '''

    with open('config/global_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    return config['helm']['common_helm_groupId']
    