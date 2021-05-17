from apis.auth.models import User


class UserCreateDto:
    '''
        회원가입에 사용하는 DTO
    '''
    def __init__(self, name, username, email, password=None):
        self.name = name
        self.username = username
        self.email = email
        self.password = password

    def __repr__(self):
        return "name: {}, username: {}, email: {}, password: {}".format(self.name, self.username, self.email, self.password)