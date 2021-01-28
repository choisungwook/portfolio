import React, { Component } from 'react';

class EventPractice extends Component {
    state = {
        username: '',
        message: ''
    }
    
    handleChange = (e) => {
        this.setState({
            [e.target.name]: e.target.value
        });
    }

    handleClick = () => {
        alert(this.state.username + ":" + this.state.message);
        this.setState({
            username: '',
            message: ''
        });
    }

    handleKeyPass = (e) => {
        if(e.key === "Enter"){
            this.handleClick();
        }
    }

    render() {
        return (
            <div>
                <h1>event practice</h1>
                <input 
                    type="text"
                    name="username"
                    placeholder="username"
                    value={this.state.username}
                    onChange={this.handleChange}                    
                ></input>
                <input
                    type="text"
                    name="message"
                    placeholder="msg"
                    value={this.state.message}
                    onChange={this.handleChange}
                    onKeyPress={this.handleKeyPass}
                ></input>
                <button onClick={this.handleClick}>click me</button>
            </div>
        );
    }
};

export default EventPractice;