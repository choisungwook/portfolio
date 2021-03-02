package com.company;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class solution {

    private int score(int[] answers, int[] person){
        int answer = 0;

        for(int i=0; i<answers.length; i++){
            if(answers[i] == person[i%person.length]) answer += 1;
        }

        return  answer;
    }

    public int[] solution(int[] answers) {
        int[] person1 = {1, 2, 3, 4, 5};
        int[] person2 = {2, 1, 2, 3, 2, 4, 2, 5};
        int[] person3 = {3, 3, 1, 1, 2, 2, 4, 4, 5, 5};
        int[] answer = {};

        int[] results = new int[3];

        results[0] = score(answers, person1);
        results[1] = score(answers, person2);
        results[2] = score(answers, person3);

        List<Integer> list = new ArrayList<>();
        int max = Math.max(results[0], Math.max(results[1], results[2]));

        for(int i = 0; i<results.length; i++){
            if(results[i] == max) list.add(i+1);
        }

        answer = new int[list.size()];
        int index = 0;
        for(int r: list){
            answer[index++] = r;
        }
        return answer;
    }
}
