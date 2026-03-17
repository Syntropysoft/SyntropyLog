# Contributing to SyntropyLog

We welcome contributions to SyntropyLog! Here's how you can help:

## Reporting Bugs

If you find a bug, please open an issue on our GitHub repository. When reporting a bug, please include:

* A clear and concise description of the bug.
* Steps to reproduce the behavior.
* Expected behavior.
* Actual behavior.
* Any relevant error messages or stack traces.
* Your operating system and SyntropyLog version.

## Suggesting Enhancements

We're always looking for ways to improve SyntropyLog. If you have an idea for a new feature or an enhancement to an existing one, please open an issue on our GitHub repository. When suggesting an enhancement, please include:

* A clear and concise description of the enhancement.
* Why you think this enhancement would be valuable.
* Any potential use cases or examples.

## Contributing Code

We welcome code contributions! To contribute code, please follow these steps:

1. **Fork the repository:** Click the "Fork" button on the top right of our GitHub repository page.
2. **Clone your forked repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/syntropylog.git
   cd syntropylog
   ```
3. **Create a new branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b bugfix/your-bug-fix-name
   ```
4. **Make your changes:** Implement your feature or bug fix.
5. **Write tests:** Ensure your changes are covered by appropriate tests.
6. **Run tests:** Make sure all existing tests pass.
   ```bash
   pnpm run test:coverage
   ```
7. **Format your code:** Ensure your code adheres to the project's formatting standards.
8. **Commit your changes:** Write clear and concise commit messages.
   ```bash
   git commit -m "feat: Add new feature"
   ```
   or
   ```bash
   git commit -m "fix: Fix a bug"
   ```
9. **Push your changes:** Push your branch to your forked repository.
   ```bash
   git push origin feature/your-feature-name
   ```
10. **Create a Pull Request:** Go to your forked repository on GitHub and create a pull request to the main repository.

## Development Guidelines

### Code Style
- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused (Single Responsibility Principle)

### Testing
- Write unit tests for new features
- Ensure test coverage remains above 90%
- Test both success and error scenarios
- Use descriptive test names

### Architecture
- Follow SOLID principles
- Maintain hexagonal architecture
- Keep the core library broker-agnostic
- Implement adapters externally

### Documentation
- Update README files for examples
- Add inline documentation for complex logic
- Keep API documentation current
- Include usage examples

## Release process (maintainers)

Detailed guide: [docs/PREPARAR_PUBLICACION.md](docs/PREPARAR_PUBLICACION.md) (Spanish).

**Feature and develop branches:** On every push and on PRs, only the **CI** workflow runs (lint, build, tests, benchmark with native addon). Nothing is published to npm. This lets you validate everything before merging into `main`.

**Only when pushing to `main`** does the **Release** workflow run (build the addon on all platforms and, if there are changesets, versioning/publishing to npm).

Releases use [Changesets](https://github.com/changesets/changesets) and GitHub Actions. **To have a new version published to npm, you must do one of the following:**

### Option A: Use the PR created by the action

1. **Add a changeset** when changing the library: `pnpm changeset` (choose version bump type and describe the change).
2. **Push to `main`**. The workflow creates a **"Version Packages"** PR with the version bump (e.g. 0.9.12 → 0.9.13) and updated CHANGELOG. **Nothing is published to npm yet.**
3. **Merge that PR** into `main`. That merge triggers the workflow again and **then** `publish` runs and the new version appears on npm.

### Option B: Bump the version manually (no PR)

1. With changesets already in the repo, run locally: `pnpm run version-packages`. This updates `package.json`, CHANGELOG, and removes the consumed changesets.
2. **Commit** (package.json, CHANGELOG.md, and the removed .changeset/*.md files) and **push to `main`**.
3. The workflow runs, there are no changesets to apply, and it runs **publish** → the new version is published to npm.

In both cases, **main** and **npm** end up with the same version.

## Repository size and what not to commit

The repo should stay small so clones are fast. The following are in `.gitignore` and **must not** be committed:

- `node_modules/`, `dist/`, `coverage/`
- `assets/` (images; the README uses an external logo URL)
- `docs/`, `.cursor/`, `.turbo`

**If `assets/` or `coverage/` are already tracked**, remove them from Git (files stay on disk, only tracking is removed). Check first with `git ls-files assets/ coverage/`; if that lists files, run:

```bash
git rm -r --cached assets/
git rm -r --cached coverage/
git commit -m "chore: stop tracking assets and coverage"
```

If the path is not tracked, `git rm --cached` will report "did not match any file(s)" — that’s expected; nothing to do.

The clone size (~36 MB) is mostly **Git history** (old copies of heavy files). To reduce it you would need to rewrite history (e.g. `git filter-repo` or BFG to remove `assets/` from the past). That changes commit hashes and requires a force-push; only do it if the team agrees.

## Getting Help

If you need help with your contribution, please:
- Check existing issues and pull requests
- Review the project documentation
- Open a discussion for questions
- Join our community channels

Thank you for contributing to SyntropyLog! 🚀