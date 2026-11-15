# Contributing to Inlay

Thanks for helping. The product brief in `docs/BRIEF.md` is the source of truth;
`docs/PLAN.md` shows what is in progress and `docs/ARCHITECTURE.md` how the
parts fit together.

## Developer Certificate of Origin (DCO)

Every commit must be signed off, certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/):

```
git commit -s
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer. CI rejects
commits without it. Use your real name and a reachable email.

## Commits

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, …).
- Small vertical slices; never commit with a failing build or tests.
- Source files carry `SPDX-License-Identifier: Apache-2.0` in the first lines.

## Dependencies

Shipped code may only depend on MIT, BSD, Apache-2.0, ISC or Unlicense
licensed software (OFL 1.1 is accepted for font files). GPL, AGPL and LGPL dependencies are
rejected anywhere in the tree by `pnpm licenses:check`. Run `pnpm notices`
after changing dependencies to refresh `THIRD_PARTY_NOTICES.md`.

## Building and testing

The README lists the commands (`pnpm check`, `pnpm test`, `pnpm mac:test`).
`docs/TESTING.md` explains what each test layer proves, how to add a fixture
and the rules for writing tests. `docs/CHECKLIST.md` has the list to tick
before a commit and before a push. A bug in saving or rendering gets a fixture
first, then the fix.

## Security

Do not open a public issue for a vulnerability. `SECURITY.md` says how to
report one privately and what counts.

## Where things are decided

`docs/BRIEF.md` is the product owner's and is not edited in pull requests;
propose a change in `docs/BRIEF-AMENDMENTS.md`. A non-obvious technical choice
gets a short entry in `docs/DECISIONS.md` in the same pull request.

## License

By contributing you agree that your contributions are licensed under the
Apache License, Version 2.0 (see `LICENSE`). Forks must follow `TRADEMARKS.md`.
