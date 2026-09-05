# A dissolve is a clip-boundary object

## Decision

A transition is stored separately from clips and names a track plus touching `from` and `to` clips. Clips remain non-overlapping. The first implementation supports dissolve only, and its duration must fit inside both adjacent clips.

The transition interval is the final duration of the outgoing clip. Only that interval opens a second decoder for the incoming source. Available source frames before the incoming in-point are used as pre-roll; missing handles hold the first source frame.

## Reason

Keeping clips unchanged preserves the no-overlap timeline invariant and makes transition deletion lossless. A bounded synthetic placement gives preview and export the same source frames and opacity ramps without keeping two decoders alive outside the transition.
