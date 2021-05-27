# reference: https://github.com/noahmorrison/chevron
import chevron

r = chevron.render('Hello, {{ mustache }}!', {'mustache': 'World'})
print(r) # print Hello, World

'''
import chevron

with open('file.mustache', 'r') as f:
    chevron.render(f, {'mustache': 'World'})
'''
