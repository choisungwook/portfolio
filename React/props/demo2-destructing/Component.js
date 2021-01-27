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