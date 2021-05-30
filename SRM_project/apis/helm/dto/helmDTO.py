class CreateHelmRequestDto:
    '''
        helm fork request DTO
    '''

    def __init__(self, app_id, app_name, project_id):
        '''
            파라미터
                id: python, springboot ...
                app_name: 생성할 앱 이름
                project_name: 앱을 생성할 프로젝트 이름
                nemspace_id: helm group_id
        '''
        self.id = app_id
        self.name = app_name
        self.path = app_name
        self.namespace_id = project_id
