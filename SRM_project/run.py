from flaskapp import app

# run flask on localhost 
if __name__=="__main__":
    app.run(host='127.0.0.1', port=8888, debug=True)