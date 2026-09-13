# Branch Protection — Release Policy

**Repository:** `mi9092921-alt/EduZone_dashboard`
**Last verified against the live GitHub API:** 2026-09-13

## 1. Observed protection state (verified, not inferred)

This section records settings read directly from the GitHub API — the only
source this file treats as evidence (see §4). Repository workflow files alone
prove nothing about protection.

```text
GET /repos/mi9092921-alt/EduZone_dashboard/branches/main/protection

main protected:                 true
required status checks:         ON — contexts: "build_and_test" (ci.yml),
                                     "e2e" (e2e.yml)
strict (up-to-date branch):     true
enforce_admins:                 true
allow_force_pushes:             false
allow_deletions:                false

GET /repos/mi9092921-alt/EduZone_dashboard/actions/variables/E2E_ENABLED

E2E_ENABLED:                    "true"
```

Interpretation:

- PR merges into `main` are blocked unless `build_and_test` and `e2e` pass on
  a branch that is up to date with `main` (`strict: true`), and administrators
  cannot bypass the rules (`enforce_admins: true`).
- Required status checks gate *merges*, not *pushes*: direct pushes to `main`
  by an admin are still possible and cannot be pre-blocked. They are
  re-validated after landing by `deploy.yml`, which mirrors the same gate
  chain as ci.yml — including the Security / RLS Gate (fast) and the
  coverage thresholds — so a bypassed gate fails visibly in that run instead
  of passing silently.

Re-verify at any time with:

```bash
gh api repos/mi9092921-alt/EduZone_dashboard/branches/main/protection
gh api repos/mi9092921-alt/EduZone_dashboard/actions/variables/E2E_ENABLED
```

## 2. Required release policy for `main`

Production-bound changes should require, at minimum:

```text
typecheck
lint
unit tests
production build
critical E2E/security gates
```

Database/security-sensitive changes should additionally require the applicable integration/RLS verification jobs.

## 3. Merge rule

Do not treat:

```text
“workflow exists”
```

as equivalent to:

```text
“workflow is a required protected check”
```

The repository owner must verify the actual GitHub Rules/Branch Protection configuration before declaring this control satisfied.

## 4. Documentation rule

Update this file when the actual GitHub protection configuration changes. Keep the status statement tied to observed GitHub settings, not intended configuration.
