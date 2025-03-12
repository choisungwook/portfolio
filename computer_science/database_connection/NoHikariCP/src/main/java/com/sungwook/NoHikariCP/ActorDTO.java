package com.sungwook.NoHikariCP;

import lombok.Getter;

@Getter
public class ActorDTO {
    private final int actorId;
    private final String firstName;
    private final String lastName;

    public ActorDTO(int actorId, String firstName, String lastName) {
        this.actorId = actorId;
        this.firstName = firstName;
        this.lastName = lastName;
    }
}
