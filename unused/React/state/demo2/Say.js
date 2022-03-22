import React, {useState} from 'react';

const Say = () => {
    const [message, setMessage] = useState('');
    const onClickEnter = () => setMessage('hello');
    const onClickLeave = () => setMessage('good bye');

    return (
        <div>
            <button onClick={onClickEnter}>enter</button>
            <button onClick={onClickLeave}>exit</button>
            <h1>{message}</h1>
        </div>
    );
};

export default Say;