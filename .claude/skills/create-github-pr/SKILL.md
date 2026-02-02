---
name: create-github-pr
description: Creates well-structured GitHub pull requests using gh CLI with clear intent-driven descriptions. Analyzes the latest commit message and code changes (git diff) to generate PR title from commit first line and detailed English body with intent and implementation details. Use when user requests "create pull request", "make a PR", "open PR", or "submit for review".
---

# GitHub Pull Request Creation Skill

Creates well-structured GitHub pull requests using gh CLI by analyzing the latest commit message and code changes to generate clear, detailed descriptions.

## When to Use This Skill

Trigger this skill when the user requests:

- "create a pull request"
- "make a PR"
- "open a pull request"
- "submit this for review"
- "create PR from my commit"

## Prerequisites

- `gh` CLI is already configured and authenticated
- Current branch has at least one commit ready for PR
- User is in a git repository

## Step-by-Step Process

### 1. Get Latest Commit Information

Retrieve the most recent commit details:

````bash
# Get commit message (subject and body)
git log -1 --pretty=format:"%s%n%b"

# Get commit hash for reference
git log -1 --pretty=format:"%H"
````

### 2. Analyze Code Changes

Analyze what actually changed in the commit:

````bash
# Get changed files with status (Added/Modified/Deleted)
git diff HEAD~1 HEAD --name-status

# Get detailed code changes (TEXT FILES ONLY - exclude binary files)
git diff HEAD~1 HEAD --diff-filter=d -- . ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.svg' ':!*.ico' ':!*.pdf' ':!*.zip' ':!*.tar' ':!*.gz' ':!*.mp4' ':!*.mov' ':!*.avi' ':!*.mp3' ':!*.wav' ':!*.ttf' ':!*.woff' ':!*.woff2' ':!*.eot' ':!*.otf' ':!*.exe' ':!*.dll' ':!*.so' ':!*.dylib' ':!*.bin' ':!*.dat'

# Get statistics of changes
git diff HEAD~1 HEAD --stat
````

### 3. Binary File Handling

**DO NOT read content of binary files.** Only use file names and status from `--name-status`.

**Common binary file extensions to exclude:**

- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.webp`, `.bmp`
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- **Archives**: `.zip`, `.tar`, `.gz`, `.rar`, `.7z`, `.bz2`
- **Media**: `.mp4`, `.mov`, `.avi`, `.mkv`, `.mp3`, `.wav`, `.flac`
- **Fonts**: `.ttf`, `.woff`, `.woff2`, `.eot`, `.otf`
- **Executables**: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.dat`
- **Databases**: `.db`, `.sqlite`, `.mdb`

**For binary files, only mention them if they are significant** (e.g., new logo, documentation PDF). Otherwise, skip them since PR's Files changed tab already shows them.

### 4. Extract PR Components

**Title**: Use the first line of the commit message as-is

**Body**: Analyze and structure based on:

- Commit message body (if exists)
- Actual code modifications (from `diff` - text files only)
- Key implementation details and logic changes

### 5. Structure the PR Body

Create the PR body in **English** following this template:

````markdown
## What This PR Does
[Extract the "why" from commit message or infer from changes - what problem does this solve? What is the high-level goal?]

## Implementation Details
[Explain based on actual code changes:]
- Key functions/classes added or modified
- Important logic changes
- Technical decisions and approaches
- Configuration or dependency updates

[Use code blocks to highlight important snippets if relevant]

## Additional Context
[Optional: from commit message body, testing notes, breaking changes, migration steps, etc.]

## Related
<!-- Leave empty - user will manually fill this in GitHub web UI -->
````

**Note**: DO NOT include a `## Changes` section that lists files. GitHub PR already displays all file changes in the "Files changed" tab.

### 6. Analysis Guidelines

When analyzing code changes, focus on:

**What to emphasize:**

- **Why** this change was made (the intent)
- **How** it was implemented (the approach)
- Key functions/classes and their purpose
- Important logic or algorithm changes
- Configuration impacts
- New dependencies and why they were added
- Breaking changes or migration requirements
- Testing strategy if significant tests were added

**What to skip:**

- File-by-file list of changes (already in PR diff)
- Listing "Added: file.py", "Modified: file.py" format
- Binary file contents
- Minor formatting or whitespace changes
- Obvious changes that are self-explanatory in diff

**Formatting in PR body:**

- Use paragraphs for explanations
- Use bullet points for lists of related items
- Include code blocks for significant snippets (max 10 lines)
- Use **bold** for emphasis on important terms

### 7. Create the Pull Request

Execute the gh CLI command:

````bash
gh pr create --title "TITLE" --body "BODY"
````

## Example Analysis Flow

### Input: Latest Commit

````bash
$ git log -1 --pretty=format:"%s%n%b"
feat: add user authentication with JWT

Implement JWT-based authentication system
- Login and logout endpoints
- Token validation middleware
- Password hashing with bcrypt
````

### Code Changes Analysis

````bash
$ git diff HEAD~1 HEAD --name-status
A       src/auth.py
A       src/middleware.py
M       src/app.py
M       requirements.txt
A       tests/test_auth.py
A       docs/api-spec.pdf
A       static/images/login-bg.png

$ git diff HEAD~1 HEAD --stat
 src/auth.py              | 45 +++++++++++++++++++++
 src/middleware.py        | 23 +++++++++++
 src/app.py               | 12 ++++--
 requirements.txt         |  2 +
 tests/test_auth.py       | 67 +++++++++++++++++++++++++++++++
 docs/api-spec.pdf        | Bin 0 -> 245678 bytes
 static/images/login-bg.png | Bin 0 -> 89234 bytes
````

### Generated PR Body

````markdown
## What This PR Does
Implements JWT-based authentication system to secure API endpoints and manage user sessions with token-based authentication.

## Implementation Details

Created a complete authentication system with the following components:

**Token-Based Authentication**
- Implemented JWT token generation with 24-hour expiration
- Created login and logout endpoints that issue and invalidate tokens
- Used bcrypt for secure password hashing before storage

**Middleware Protection**
- Added token validation middleware that runs before protected routes
- Middleware extracts JWT from Authorization header and validates signature and expiration
- Returns 401 Unauthorized if token is invalid or expired

**Key Functions**
```python
def generate_token(user_id):
    # Creates JWT with user_id claim and 24h expiration
    payload = {'user_id': user_id, 'exp': datetime.utcnow() + timedelta(hours=24)}
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def validate_token(token):
    # Verifies JWT signature and expiration
    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
```

**Integration**
- Updated main application to register authentication routes and apply middleware to protected endpoints
- Added dependencies: `PyJWT==2.8.0` for token handling and `bcrypt==4.1.2` for password hashing

## Additional Context

**Testing**
Added comprehensive test suite (67 lines) covering:
- Successful login with valid credentials
- Failed login with invalid credentials
- Token validation for valid and expired tokens
- Middleware behavior on protected routes

**Documentation**
Added API specification PDF documenting authentication endpoints

## Related
<!-- User will manually fill this in GitHub web UI -->
````

## Error Handling

Common issues and solutions:

**No commits found:**

````bash
$ git log -1
fatal: your current branch 'feature' does not have any commits yet
````

→ User needs to make at least one commit first

**gh command fails:**

````bash
$ gh pr create
error: failed to get repository
````

→ Check authentication: `gh auth status`
→ Verify remote exists: `git remote -v`

**Branch not pushed:**

````bash
$ gh pr create
error: current branch is not pushed to origin
````

→ Push branch first: `git push -u origin HEAD`

**Binary file in diff:**
If you accidentally see "Binary files differ" in output, ignore that file's content and only use the file name from `--name-status` if it's significant.

## Tips for Better Analysis

1. **Lead with Intent**: Always start with the "why" - what problem does this solve?
2. **Explain Approach**: Describe the implementation strategy and key decisions
3. **Highlight Key Code**: Include small snippets (5-10 lines) of critical logic
4. **Connect the Dots**: Explain how different pieces work together
5. **Dependencies Matter**: Always mention new dependencies and their purpose
6. **Note Breaking Changes**: Call out anything that requires migration or changes behavior
7. **Testing Context**: If significant tests added, explain what scenarios they cover
8. **Skip the Obvious**: Don't list every file change - focus on the important logic
9. **No File Lists**: Never create "Added: X, Modified: Y" style lists

## What NOT to Include

- ❌ "Added: file.py", "Modified: file.py" format lists
- ❌ Binary file contents (wastes tokens)
- ❌ Line-by-line diff walkthrough
- ❌ Whitespace or formatting-only changes
- ❌ Obvious changes visible in diff
- ❌ Auto-generated code without context
- ❌ Entire file contents

## Token Optimization

**Save tokens by:**

- ✅ Using `--name-status` for file list (lightweight)
- ✅ Excluding binary files from `git diff` with pathspec filters
- ✅ Only analyzing text-based code changes
- ✅ Focusing on logic and intent, not file lists
- ✅ Never creating file change lists
- ❌ Never reading binary file contents
- ❌ Never listing every single file change
