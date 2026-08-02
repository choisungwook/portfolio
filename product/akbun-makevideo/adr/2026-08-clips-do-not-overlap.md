# A track holds one clip at a time; a drop pushes right

## Decision

Two clips can never overlap on the same track. A clip dropped or dragged onto occupied time moves to the first position at or after the requested one where it fits. Layering is done by putting clips on different tracks, which is what the four video tracks are for.

## Reason

Two pictures in the same place at the same instant is a question the timeline cannot answer, and every answer to it is a feature: crossfade, take the upper one, take the longer one. None of them belong in a first version, and allowing the overlap without answering it would mean a render that quietly picks one.

Pushing right is what every editor does with a plain drop, so it needs no explanation to a user. It is also easy to reason about: the search walks the occupied spans until nothing collides, and terminates because the candidate position only ever increases.

The rejected alternative was to overwrite — trim or delete whatever was underneath. It is the other common behaviour and it is destructive, which is a bad default for an editor with no undo yet.

The consequence to remember: a drop does not always land where the pointer was. Dropping three files at once lays them end to end from the drop point for the same reason, which is usually what was wanted anyway.
