const obj = {name: undefined, age: undefined};
const {age: theAge=10, name: myname='abc'} = obj;

console.log({theAge, myname});