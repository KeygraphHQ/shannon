---
description: Create a PR to main branch using conventional commit style for the title
---

Create a pull request from the current branch to the `main` branch.

First, analyze the current branch to understand what changes have been made:
1. Run `git log --oneline -10` to see recent commit history and understand commit style
2. Run `git log main..HEAD --oneline` to see all commits on this branch that will be included in the PR
3. Run `git diff main...HEAD --stat` to see a summary of file changes

Then generate a PR title that:
- Follows conventional commit format (e.g., `fix:`, `feat:`, `chore:`, `refactor:`)
- Is concise and accurately describes the changes
- Matches the style of recent commits in the repository

Generate a PR body with:
- A `## Summary` section with 1-3 bullet points describing the changes

Finally, create the PR using the gh CLI:
```
gh pr create --base main --title "<generated title>" --body "$(cat <<'EOF'
## Summary
<bullet points>
EOF
)"
```

IMPORTANT:
- Do NOT include any Claude Code attribution in the PR
- Keep the summary concise (1-3 bullet points maximum)
- Use the conventional commit prefix that best matches the changes (fix, feat, chore, refactor, docs, etc.)
