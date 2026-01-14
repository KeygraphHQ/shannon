# Contributing to Shannon

Thank you for your interest in contributing to Shannon! While we're not currently accepting external code contributions (PRs), we welcome bug reports, feature requests, and community engagement.

## How You Can Help

### 🐛 Report Bugs

Found a bug? Please open a [GitHub Issue](https://github.com/KeygraphHQ/shannon/issues) with:

1. **Description**: Clear description of the bug
2. **Steps to Reproduce**: How to trigger the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Node.js version, Docker version
6. **Logs**: Relevant error messages or logs (sanitized of secrets!)

### 💡 Request Features

Have an idea? Open a [Discussion](https://github.com/KeygraphHQ/shannon/discussions) with:

1. **Use Case**: What problem does this solve?
2. **Proposed Solution**: How should it work?
3. **Alternatives Considered**: Other approaches you've thought about
4. **Impact**: How many users would benefit?

### 📖 Improve Documentation

Notice something unclear in the docs? Open an issue describing:
- Which documentation needs improvement
- What's confusing or missing
- Suggested improvements

### 🧪 Test & Validate

Help us improve by:
- Testing on different environments
- Trying edge cases
- Comparing results with manual pentesting
- Reporting false positives/negatives

### 💬 Community Support

Help other users by:
- Answering questions on [Discord](https://discord.gg/KAqzSHHpRt)
- Sharing your Shannon reports (sanitized!)
- Writing blog posts or tutorials

## Code of Conduct

### Our Pledge

We pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior includes:**
- Trolling, insulting/derogatory comments, personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Community leaders are responsible for clarifying and enforcing standards of acceptable behavior and will take appropriate action in response to any instances of unacceptable behavior.

## Development Setup

If you want to run Shannon locally for testing:

```bash
# Clone the repository
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm start "https://example.com" "/path/to/code" --pipeline-testing
```

## Testing Guidelines

When testing your changes:

1. **Unit Tests**: Add tests for new security features
2. **Integration Tests**: Test with real vulnerable applications
3. **Manual Testing**: Verify against OWASP Juice Shop or crAPI

## Security Considerations

When contributing:

1. **Never commit secrets** - Use environment variables
2. **Validate all inputs** - Especially URLs and user data
3. **Follow SSRF protections** - Block internal/metadata endpoints
4. **Test edge cases** - Null values, empty arrays, malformed data

## Questions?

- **Discord**: [Join our server](https://discord.gg/KAqzSHHpRt)
- **Discussions**: [GitHub Discussions](https://github.com/KeygraphHQ/shannon/discussions)
- **Email**: shannon@keygraph.io

---

Thank you for helping make Shannon better! 🛡️
