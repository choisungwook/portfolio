---
name: suggest-git-commit-message
description: Analyzes staged files in git repository and suggests conventional commit messages based on actual code changes. Use when user asks to "generate commit message", "suggest commit for staged files", or needs help writing git commits.
---

This skill analyzes staged files in a git repository and suggests conventional commit messages based on the git diff. It reads the actual file changes, understands the context, and generates meaningful, consistent commit messages following best practices.

## When to Use This Skill

- User asks to "generate a commit message"
- User asks to "suggest a commit message for staged files"
- User requests help with git commit messages
- User says "what should I commit as?" or similar variations
- User mentions they need a commit message for their changes

## How It Works

### Step 1: Check Git Repository Status

First, check if we're in a git repository and verify there are staged files:

```bash
cd /path/to/repository
git status
```

### Step 2: Get Staged Files List

List all files in the staging area:

```bash
git diff --cached --name-only
```

### Step 3: Analyze Git Diff

Get the detailed diff of staged changes:

```bash
git diff --cached
```

For better readability, you can also use:

```bash
git diff --cached --unified=3
```

### Step 4: Generate Commit Message

Based on the diff analysis, generate a commit message following this structure:

**Conventional Commits Format:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without changing functionality
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `ci`: CI/CD configuration changes
- `chore`: Other changes that don't modify src or test files

**Guidelines:**

1. **Subject line (50 chars or less):**

- Use imperative mood ("add" not "added")
- Don't capitalize first letter
- No period at the end
- Be specific but concise

1. **Body (optional, wrap at 72 chars):**

- Explain WHAT and WHY, not HOW
- Separate from subject with a blank line
- Can include bullet points with `-` or `*`

1. **Footer (optional):**

- Reference issues: `Fixes #123` or `Closes #456`
- Breaking changes: `BREAKING CHANGE: description`

### Step 5: Present Multiple Options

Provide 2-3 commit message suggestions with different levels of detail:

1. **Concise version** - Just type and subject
2. **Standard version** - Type, scope, subject, and brief body
3. **Detailed version** - Full conventional commit with comprehensive body

## Examples

### Example 1: Single Feature Addition

**Staged files:**

```
src/components/Button.tsx
```

**Diff summary:**

- Added new `variant` prop to Button component
- Implemented primary, secondary, and danger variants
- Updated TypeScript interfaces

**Suggested commits:**

**Option 1 (Concise):**

```
feat: add button variants
```

**Option 2 (Standard):**

```
feat(button): add variant prop with multiple styles

Implement primary, secondary, and danger button variants
```

**Option 3 (Detailed):**

```
feat(button): add variant prop with multiple styles

Add support for different button visual styles through a new
variant prop. Includes three variants: primary (default),
secondary, and danger.

- Update Button component interface
- Add variant-specific styling
- Maintain backward compatibility
```

### Example 2: Bug Fix

**Staged files:**

```
src/utils/validation.ts
tests/validation.test.ts
```

**Diff summary:**

- Fixed email validation regex
- Added test cases for edge cases

**Suggested commits:**

**Option 1:**

```
fix: correct email validation regex
```

**Option 2:**

```
fix(validation): correct email validation for special characters

Fix regex pattern to properly handle plus signs and dots in email addresses
```

**Option 3:**

```
fix(validation): correct email validation for special characters

Email validation was incorrectly rejecting valid addresses containing
plus signs (+) and consecutive dots in the local part. Updated regex
pattern to comply with RFC 5322 standard.

- Fix regex pattern in validateEmail function
- Add comprehensive test cases for edge cases
- Add tests for valid special character combinations

Fixes #234
```

### Example 3: Refactoring

**Staged files:**

```
src/hooks/useAuth.ts
src/hooks/useUser.ts
```

**Suggested commits:**

**Option 1:**

```
refactor: extract user logic from auth hook
```

**Option 2:**

```
refactor(hooks): separate user state management from auth logic

Extract user-related state and logic into dedicated useUser hook
```

**Option 3:**

```
refactor(hooks): separate user state management from auth logic

Split useAuth hook into two focused hooks for better separation
of concerns. useAuth now handles only authentication flow, while
useUser manages user profile and preferences.

- Create new useUser hook for user state
- Move user-related logic from useAuth
- Update component imports
- Maintain same public API for backward compatibility
```

### Example 4: Multiple File Types

**Staged files:**

```
README.md
src/config/database.ts
package.json
```

**Suggested commits:**

**Option 1:**

```
chore: update database configuration and docs
```

**Option 2:**

```
chore: update database config, dependencies, and documentation

- Add connection pool settings
- Upgrade database driver
- Update setup instructions
```

**Option 3:**

```
chore: update database configuration and dependencies

Update database connection settings to use connection pooling
for improved performance. Upgrade database driver to latest
stable version with security fixes.

- Add connection pool configuration in database.ts
- Upgrade pg driver from 8.11.0 to 8.11.3
- Update README with new connection requirements
- Add connection pool troubleshooting guide
```

## Best Practices

### Analyzing the Diff

1. **Read the actual changes**, don't just look at file names
2. **Identify the primary purpose** of the changes
3. **Look for patterns** across multiple files
4. **Note any breaking changes** or important impacts
5. **Check for related test updates** to understand intent

### Choosing the Right Type

- If multiple types apply, choose the most significant change
- When adding a feature that also fixes a bug, use `feat`
- When refactoring includes performance improvements, use `refactor` or `perf` based on primary intent
- Configuration changes typically use `chore` or `ci`

### Scopes

- Use scopes that match the project structure (component names, modules, features)
- Keep scopes consistent within the project
- Omit scope if the change affects multiple areas broadly

### Subject Lines

- Focus on the **user-facing impact** or **developer experience**
- Be specific: "add login form validation" not "update form"
- Avoid vague terms like "fix issue" or "update code"
- Reference what changed, not file names

### Body Content

- Explain the motivation and context
- Describe what was done, not how it was implemented
- Mention any alternatives considered if relevant
- Note any dependencies or prerequisites
- Highlight any potential side effects or migrations needed

## Error Handling

### No Staged Files

If `git diff --cached` returns empty:

```
It looks like there are no staged files. Please stage your changes first using:
git add <files>

Or to stage all changes:
git add .
```

### Not a Git Repository

If not in a git repository:

```
This doesn't appear to be a git repository. Please run this command from within a git repository.
```

### Binary Files

If staged files include binary files (images, etc.):

```
Note: The staged changes include binary files (images, fonts, etc.).
The commit message will focus on text-based code changes.
```

## Advanced Features

### Interactive Mode

When appropriate, ask clarifying questions:

- "I see changes to both frontend and backend. Should this be split into separate commits?"
- "There's a breaking change in the API. Should I include a BREAKING CHANGE footer?"
- "I notice related test updates. Should I mention the test coverage in the commit?"

### Context-Aware Suggestions

Consider the project context:

- For infrastructure files (Docker, Kubernetes), use appropriate scopes
- For configuration files, explain what the configuration affects
- For dependency updates, mention version changes and reason
- For database migrations, highlight schema changes

### Multi-Commit Recommendations

If the diff shows multiple unrelated changes:

```
I notice several unrelated changes:
1. Feature addition in component A
2. Bug fix in module B
3. Documentation update

Consider splitting these into separate commits for better git history:
- git reset HEAD <files>
- git add <specific-files>
- git commit (repeat for each logical change)
```

## Output Format

Always present commit messages in markdown code blocks with clear labels:

```markdown
### Suggested Commit Messages

**Option 1: Concise**
```

type: brief description

```

**Option 2: Standard**
```

type(scope): description

Additional context in body

```

**Option 3: Detailed**
```

type(scope): description

Comprehensive explanation of what and why.

- Bullet point details
- Additional changes
- Important notes

```

Would you like me to use one of these, or would you prefer a different approach?
```

## Notes

- Always read the actual diff content, don't just rely on file names
- Consider the broader context of the repository
- Maintain consistency with existing commit history if visible
- Prioritize clarity and usefulness for future developers
- When in doubt, provide multiple options for the user to choose from
