# Colors as variables with a Style Settings block

## Decision

Expose every color a user is likely to change as a `--akbun-*` variable at the top of `theme.css`, and declare the same variables in a Style Settings block so the plugin offers them as color pickers and sliders. A test asserts that each block entry has a CSS default and that the defaults match.

## Reason

Editing a hex value in one block is the least a user can be asked to do, and it works without any plugin. Style Settings is the common way theme users adjust colors inside Obsidian, and it works by writing the same variable names, so both paths change one thing. The test exists because the block and the CSS are the same fact written twice, and a drift shows the user a default that is not what they see.
