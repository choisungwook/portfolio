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
