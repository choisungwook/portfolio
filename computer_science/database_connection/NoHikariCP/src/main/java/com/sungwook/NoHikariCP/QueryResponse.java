package com.sungwook.NoHikariCP;

import lombok.Getter;

import java.util.List;

@Getter
public class QueryResponse {
    private final List<ActorDTO> actors;

    public QueryResponse(List<ActorDTO> actors) {
        this.actors = actors;
    }
}
