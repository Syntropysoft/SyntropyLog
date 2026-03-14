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

**Ramas auxiliares (feature, develop, etc.):** en cada push y en los PRs se ejecuta solo el workflow **CI** (lint, build, tests, benchmark con addon nativo). No se publica nada en npm. Así puedes validar que todo pase antes de integrar a `main`.

**Solo al hacer push a `main`** se ejecuta el workflow **Release** (build del addon en todas las plataformas y, si hay changesets, versionado/publicación en npm).

Releases use [Changesets](https://github.com/changesets/changesets) and GitHub Actions. **Para que la versión suba en npm, siempre tienes que hacer una de estas dos cosas:**

### Opción A: Usar el PR que crea el action

1. **Añade un changeset** al cambiar la librería: `pnpm changeset` (elige tipo de versión y describe el cambio).
2. **Push a `main`**. El workflow crea un PR **"Version Packages"** con el bump (ej. 0.9.12 → 0.9.13) y el CHANGELOG actualizado. **Todavía no publica en npm.**
3. **Mergea ese PR** en `main`. Ese merge vuelve a disparar el workflow y **ahí sí** se ejecuta `publish` y la nueva versión aparece en npm.

### Opción B: Subir la versión a mano (sin PR)

1. Con changesets ya en el repo, en local: `pnpm run version-packages`. Eso actualiza `package.json`, CHANGELOG y borra los changesets.
2. **Commit** (package.json, CHANGELOG.md, y los .changeset/*.md borrados) y **push a `main`**.
3. El workflow corre, no hay changesets que aplicar, y ejecuta **publish** → la versión sube a npm.

En ambos casos, **main** y **npm** quedan con la misma versión.

## Getting Help

If you need help with your contribution, please:
- Check existing issues and pull requests
- Review the project documentation
- Open a discussion for questions
- Join our community channels

Thank you for contributing to SyntropyLog! 🚀