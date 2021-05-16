'''
    flask user와 gitlab user둘다 생성해야 성공
'''
from app import app
from apis.gitlab.service import GitlabImpl
from apis.gitlab.dto.UserCreateDto import UserCreateDto

def test_createUser():
    gitlabAPI = GitlabImpl()

    test_name = "test1@test.com"
    test_username = "test1@test.com"
    test_email = "test1@test.com"

    userCreateDto = UserCreateDto(test_name, test_username, test_email)

    gitlabAPI.createUser(userCreateDto)

