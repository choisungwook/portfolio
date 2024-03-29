```java
package com.company;

import java.util.stream.IntStream;


class Solution {
    public static class QuickSork{

        public void sort(int[] array, int left, int right){
            int mid = array.length/2;

            if(left > right){
                sort(array, left, mid-1);
                sort(array, mid+1, right);
            }
        }
    }

    public int[] solution(int[] array, int[][] commands) {
        int[] answer = new int[commands.length];
        int idx = 0;

        for(int[] command : commands){
            int[] sliced = IntStream.rangeClosed(command[0]-1, command[1]-1)
                    .map(i -> array[i])
                    .sorted()
                    .toArray();

            answer[idx++] = sliced[command[2]-1];
        }

        return answer;
    }
}
```
```