import pytest
from app import app
from apis.gitlab.service import GitlabImpl

def test_get_gitlabusers():
    '''
        gitlab 계정조회하는 함수실행 테스트
    '''
    gitlabAPI = GitlabImpl()
    response = gitlabAPI.getUsers()

    print(response)
