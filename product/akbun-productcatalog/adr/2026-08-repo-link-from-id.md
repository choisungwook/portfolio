# The repository link is derived from the id

## Decision

Build each card's repository link as `repoBase` plus the product id, instead of storing a full URL per entry. An entry that lives somewhere else may set `repo` and override it.

## Reason

Every product in this repository is a directory named after itself under `product/`, so the URL is a function of the id and storing it twenty times only creates twenty chances to mistype it. It also makes an entry four short fields, which is what keeps adding a product a one-minute edit rather than a copy-paste of a long tree URL.

Moving the repository, renaming the branch or changing the path then edits one line at the top of the document rather than every row. The override exists because one product already links to a subdirectory rather than its own root, and a rule with no escape hatch gets worked around by hand instead.
