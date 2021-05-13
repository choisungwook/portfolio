from apis import api_v1
from flask import render_template
from logger.log import log

@api_v1.route('/auth/signup')
def login():
    """
        회원가입 페이지
    """    
    return render_template('signup.html')