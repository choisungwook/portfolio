from flask import Flask
from apis import api_v1

app = Flask(__name__)
app.register_blueprint(api_v1)
