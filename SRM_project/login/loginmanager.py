from flask_login import LoginManager

login_manager = LoginManager()
login_manager.login_view = '/api/v1/auth/signup'
