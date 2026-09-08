# Branch Protection — Release Policy

**Repository:** `mi9092921-alt/EduZone_dashboard`
**Reviewed against:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`

## 1. Important distinction

The current repository metadata inspected during documentation cleanup showed:

```text
main protected: false
required status checks: off
```

Therefore this file is an **expected release policy**, not evidence that GitHub branch protection is currently enabled.

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
