import React, { useState } from 'react';

const EventPractice = () => {
    const [form, setForm] = useState({
        username: '',
        message: ''
    });
    const [username, message] = form;
    
    const onChange = e => {
        const nextForm = {
            ...form,
            [e.target.name]: e.target.value
        };
        setForm(nextForm);
    };

    const onClick = () => {
        alert(username + ": " + message);
        setForm({
            username: '',
            message: ''
        });
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
                onChange={onChange}                
            ></input>
            <input
                type="text"
                name="message"
                placeholder="Please Input ..."
                value={message}
                onChange={onChange}
                onKeyPress={onKeyPress}
            ></input>
            <button onClick={onClick}>show the username</button>
        </div>
    );
};

export default EventPractice;