# reference: https://www.geeksforgeeks.org/how-to-get-file-extension-in-python/

import pathlib 
  
# function to return the file extension 
file_extension = pathlib.Path('my_file.txt').suffix 
print("File Extension: ", file_extension)