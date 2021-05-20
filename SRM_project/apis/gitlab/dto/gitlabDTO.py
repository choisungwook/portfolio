class CreateGroupRequestDto:
    '''
        gitlab Group 생성요청 dto
    '''
    
    def __init__(self, name, path):
        self.name = name
        self.path = path
        self.visibility = 'private'

class CreateGroupResponseDto:
    '''
        gitlab Group 생성요청 dto
    '''
    
    def __init__(self, group_id, group_url):
        self.group_id = group_id
        self.group_url = group_url

class CreateAppRequestDto:
    '''
        gitlab project fork 생성요청 dto
        flask입장에서는 APP 생성
    '''

    def __init__(self, src_projectId, dst_groupId):
        '''
            파라미터
                src_projectId: 포크할 대상 gitlab Project ID
                dst_groupId: gitlab Group ID
        '''
        self.src = src_projectId
        self.dst = dst_groupId
        