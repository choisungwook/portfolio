# Auto corrects part of the way

## Decision

Auto is one Auto Fix button plus five buttons — Brightness, Contrast, Light & Shadow, Color, Vivid — that each set only their own sliders. Level is not among them: it runs as Auto Level inside level mode, where the angle is only previewed until OK, because a turn changes the frame and the crop and deserves a look before it is kept. Each measures the photo as the current edit shows it with its own sliders at zero, so the buttons build on each other in any order. Corrections stop short of the target: brightness moves three quarters of the way to middle gray and stops before the brightest percent clips, white balance removes half of a measured cast, contrast and vibrance are capped.

Level searches ±10° for the angle at which edge energy collects into single rows and columns. It acts only when that peak is at least 1.4 times the median over all angles; measured, a sea horizon gives 2.4 and hills or a tree give 1.1 to 1.2. Otherwise it says it left the photo alone.

## Reason

A full correction erases what the photographer saw: a sunset turned neutral, a night shot turned to day. Partial steps keep the mood while fixing what is plainly off, and leave room to push further with the slider.

Separate buttons let a beginner learn what each fix does by pressing one at a time. A level step that guesses on curved shapes is worse than none, because a wrong tilt is more visible than a slight one; the first version, an edge-direction histogram, turned hills by ten degrees, which is why the refusal threshold exists.
