class UserCreateDto:
    '''
        사용자생성 dto
    '''
    
    def __init__(self, email, password, confirm_password):
        self.email = email
        self.password = password
        self.confirm_password = confirm_password


class UserCreateResponseDto:
    '''
        사용자생성 성공 후 응답 dto
    '''
    
    def __init__(self, id, email):
        self.id = id
        self.email = email

