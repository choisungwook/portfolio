const birthYear = [1975, 1997, 2002, 1995, 1985];
const ages = [];

// 고차함수를 활용하지 않는 경우
for(let i=0; i<birthYear.length; i++) {
  let age = 2024 - birthYear[i];
  ages.push(age);
}

console.log(ages)

// 고차함수를 활용한 경우
const ages2 = birthYear.map(function(year){
  return 2024 - year;
})

console.log(ages2)
