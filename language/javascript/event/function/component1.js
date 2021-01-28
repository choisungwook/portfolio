import React, { useState } from 'react';

const EventPractice = () => {
    const [username, setUserName] = useState('');
    const [message, setMessage] = useState('');
    const onChangeUsername = e => setUserName(e.target.value);
    const onChangeMessage = e => setMessage(e.target.value);
    const onClick = () => {
        alert(username + ": " + message);
        setUserName('');
        setMessage('');
    };
    const onKeyPress = e => {
        if (e.key === 'Enter'){
            onClick();
        }
    };
    return (
        <div>
            <h1>event practice</h1>
            <input
                type="text"
                name="username"
                placeholder="username"
                value={username}
                onChange={onChangeUsername}                
            ></input>
            <input
                type="text"
                name="message"
                placeholder="Please Input ..."
                value={message}
                onChange={onChangeMessage}
                onKeyPress={onKeyPress}
            ></input>
            <button onClick={onClick}>show the username</button>
        </div>
    );
};

export default EventPractice;