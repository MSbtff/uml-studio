# UML Studio repository instructions

## Code comments

- Do not add comments to source code, tests, or configuration files. Put necessary explanations in project documentation.

## Pull requests

- Use a feature branch and a pull request targeting `main` for repository changes. Direct pushes to `main` are prohibited.
- Write the pull request title and description in English.
- Merge only after the GitHub Actions CI checks pass for the latest commit in the pull request.

## Commit messages

- Use `<type>: <summary>` or `<type>(<scope>): <summary>` with a short English summary that starts with an imperative verb. Apply the same format to merge commit subjects. [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- Use `feat` for features, `fix` for bug fixes, `docs` for documentation, `refactor` for internal restructuring, and `test` for tests. Use `build`, `ci`, `perf`, `style`, or `chore` when they describe the change more accurately.
- Mark a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer.

```text
docs: explain the npm quick start
fix(ddl): preserve quoted identifiers
test(sequence): cover message dragging
```
