# 개요
* props는 컴퍼넌트 속성을 석정
* props는 부모 컴퍼넌트에서 설정


# props값 지정
## Component(자식)
```javascript
import React from 'react';
import MyCompnonet from './MyComponent';

const App = () => {
  return <MyCompnonet name="React">리액트</MyCompnonet>
};

export default App;
```

## app.js(부모)
```javascript
import React from 'react';

const MyCompnonet = props => {
    return <div> 안녕하세요. 제 이름은 {props.name}입니다.</div>
};

export default MyCompnonet;
```

# children: app.js 태그사이의 값을 표시
```javascript
import React from 'react';

const MyCompnonet = ({name, children}) => {
    return (
        <div> 
            안녕하세요. 제 이름은 {name}입니다.
            children값은 {children}입니다.
        </div>
    )
};

export default MyCompnonet;
```

```javascript
import React from 'react';
import MyCompnonet from './MyComponent';

const App = () => {

  return <MyCompnonet name="React">rrrr</MyCompnonet>
};

export default App;

```

# destructing
```javascript
const MyCompnonet = props => {
    const {name, children} = props;

    return (
        <div> 
            안녕하세요. 제 이름은 {name}입니다.
            children값은 {children}입니다.
        </div>
    )
};
```

```
```