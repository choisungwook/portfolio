// example 1
interface Person {
  name: string;
  age: number;
  email?: string;
}

const john: Person = { name: 'John', age: 25 };

// example 2
type Point = {
  x: number;
  y: number;
}

function caculateDistance(p1: Point, p2: Point) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

const point1: Point = { x: 0, y: 0};
const point2: Point = { x: 3, y: 4};

console.log(caculateDistance(point1, point2));

// example 3
type Result = 'success' | 'error';

function processData(data: any): Result {
  return 'success'
}

const result = processData({});
console.log(`process result: ${result}`);
