# 빌드 메모리 제한
* package.json
```json
"scripts": {
    "start": "set port=3300&& react-scripts --max-old-space-size=8192 start",
    "build": "react-scripts --max-old-space-size=8192 build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
```