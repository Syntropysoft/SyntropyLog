*# Contributing to BeaconLog

We welcome contributions to BeaconLog! Here's how you can help:

## Reporting Bugs

If you find a bug, please open an issue on our GitHub repository. When reporting a bug, please include:

* A clear and concise description of the bug.
* Steps to reproduce the behavior.
* Expected behavior.
* Actual behavior.
* Any relevant error messages or stack traces.
* Your operating system and BeaconLog version.

## Suggesting Enhancements

We're always looking for ways to improve BeaconLog. If you have an idea for a new feature or an enhancement to an existing one, please open an issue on our GitHub repository. When suggesting an enhancement, please include:

* A clear and concise description of the enhancement.
* Why you think this enhancement would be valuable.
* Any potential use cases or examples.

## Contributing Code

We welcome code contributions! To contribute code, please follow these steps:

1. **Fork the repository:** Click the "Fork" button on the top right of our GitHub repository page.
2. **Clone your forked repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/beaconlog.git
   cd beaconlog
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
   npm test
   ```
7. **Format your code:** Ensure your code adheres to the project's formatting standards (e.g., using Prettier).
   ```bash
   npm run format # O el comando de formato que uses
   ```
8. **Commit your changes:** Write clear and concise commit messages.
   ```bash
   git commit -m "feat: Add new feature"
   ```
   or
   ```bash
   git commit -m "fix: Fix a bug"
   ```