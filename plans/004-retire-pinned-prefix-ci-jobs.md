# Plan 004: CI stops re-running new tests against the 8f229d0 source snapshot

> **Executor instructions**: Follow step by step; on a STOP condition, stop and report; update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 10a0cd8..HEAD -- .github/workflows/ci.yml docs/reliability-audit.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (blocks any plan that adds e2e cases, e.g. follow-ups to 001/002)
- **Category**: dx / tests
- **Planned at**: commit `10a0cd8`, 2026-11-11

## Why this matters

PR #64 added proof scaffolding that runs the current tests against the _old_ `src` from commit `8f229d0`:

- `.github/workflows/ci.yml:91-95` — e2e matrix leg `audited-base` restores `src` from 8f229d0.
- `ci.yml:111-120` — asserts **exactly 5** e2e cases and exactly 4 named failures.
- `ci.yml:132-169` — job `pre-fix-regressions` restores the old `src` and requires an exact set of two failing Vitest names.

The fix has merged and the evidence is archived in `docs/reliability-audit.md` (run 42304772986). From now on, adding a 6th e2e journey, renaming those tests, or a config/migration change the old `src` can't run against turns CI red with no real regression. Dependabot auto-merge waits on the whole workflow, so updates stall too. The scaffolding also costs a full extra Chromium job per PR. `AGENTS.md`: "Distinguish temporary development scaffolding from checks worth maintaining."

## Scope

In: `.github/workflows/ci.yml`, `docs/reliability-audit.md` (one appended line).
Out: `test/*-regression.test.ts`. They stay as ordinary regression tests.

## Steps

1. In `ci.yml` `e2e`: remove the `strategy.matrix`, the "Use audited sources" step, the "Require the four original browser regressions" step, and the `if: matrix.source == 'fixed'` condition. Rename the artifact to `pantry-e2e`. Add `if: ${{ github.event.pull_request.draft != true }}` to match the other jobs.
2. Delete the `pre-fix-regressions` job.
3. Append to `docs/reliability-audit.md`: "Pre-fix CI reproduction jobs retired on <date>; the regressions remain in the normal suites."
4. **Verify**: `pnpm format:check` → exit 0. `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` → no error. Push to a branch and confirm the CI jobs `ci`, `firmware` and `e2e` are green.

## Done criteria

- [ ] `grep -n "8f229d0" .github/workflows/ci.yml` → no matches
- [ ] CI green on the PR
- [ ] Only in-scope files changed

## STOP conditions

- Branch protection requires a check named `e2e (audited-base)` or `pre-fix-regressions` (check `gh api repos/{owner}/{repo}/branches/main/protection`). Report it, because the required-check list must change too.

## Maintenance notes

If future proofs of "this test fails before the fix" are wanted, run them once in the PR description or under `workflow_dispatch`, not on every push.
