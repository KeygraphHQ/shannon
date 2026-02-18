---
description: Create a PR to main branch using conventional commit style for the title
---

Create a pull request from the current branch to the `main` branch.

## Arguments

The user may provide issue numbers that this PR fixes: `$ARGUMENTS`

- If provided (e.g., `123` or `123,456`), use these issue numbers
- If not provided, check the branch name for issue numbers (e.g., `fix/123-bug` or `issue-456-feature` → extract `123` or `456`)
- If no issues are found, omit the "Closes" section

## Steps

First, analyze the current branch to understand what changes have been made:
1. Run `git log --oneline -10` to see recent commit history and understand commit style
2. Run `git log main..HEAD --oneline` to see all commits on this branch that will be included in the PR
3. Run `git diff main...HEAD --stat` to see a summary of file changes
4. Run `git branch --show-current` to get the branch name for issue detection (if no explicit issues provided)

Then generate a PR title that:
- Follows conventional commit format (e.g., `fix:`, `feat:`, `chore:`, `refactor:`)
- Is concise and accurately describes the changes
- Matches the style of recent commits in the repository

Generate a PR body with:
- A `## Summary` section with 1-3 bullet points describing the changes
- A `Closes #X` line for each issue number (if any were provided or detected from branch name)

Finally, create the PR using the gh CLI:
```
gh pr create --base main --title "<generated title>" --body "$(cat <<'EOF'
## Summary
<bullet points>

Closes #<issue1>
Closes #<issue2>
EOF
)"
```

Note: Omit the "Closes" lines entirely if no issues are associated with this PR.

IMPORTANT:
- Do NOT include any Claude Code attribution in the PR
- Keep the summary concise (1-3 bullet points maximum)
- Use the conventional commit prefix that best matches the changes (fix, feat, chore, refactor, docs, etc.)
- The `Closes #X` syntax will automatically close the referenced issues when the PR is merged
