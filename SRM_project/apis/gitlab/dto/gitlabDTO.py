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

    def __init__(self, app_type, app_name, project_id):
        '''
            파라미터
                id: python, springboot ...
                app_name: 생성할 앱 이름
                project_name: 앱을 생성할 프로젝트 이름
                nemspace_id: gitlab ServiceProject primary key
        '''
        self.id = app_type
        self.name = app_name
        self.path = app_name
        self.namespace_id = project_id
