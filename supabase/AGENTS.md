# EduZone Supabase — Agent Guide

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`

## 1. Source of truth

Use the current repository state, not stale documentation, as the authority.

```text
Current schema/configuration
→ executable evidence
→ recent Git history
→ documentation
```

## 2. Canonical SQL

For development-stage schema work, use the ordered files under:

```text
supabase/schema/
```

`supabase/config.toml` defines the active schema inputs.

Do not create a competing active schema source.

## 3. Shared database

The database is shared with `EduZone_App`.

Before changing a table, function, RPC, policy, trigger, or constraint, inspect:

```text
dashboard call sites
student-app call sites
SQL dependencies
Edge Functions
tests
CI/scripts
documentation
```

If the student repository cannot be inspected, mark cross-repository compatibility **UNVERIFIED**.

## 4. Security rules

For privileged database functions:

- keep explicit `search_path` control;
- preserve least-privilege grants;
- re-check authorization inside SECURITY DEFINER boundaries;
- derive tenant scope from trusted context;
- do not trust a client-supplied tenant ID as an authorization boundary;
- never hardcode passwords or secrets.

## 5. Forbidden shortcuts

Do not:

```text
weaken RLS to make a test pass
broaden GRANTs for convenience
bypass authorization because a caller is "internal"
claim production readiness from source inspection alone
create a second active schema source
```

## 6. Verification

Material DB changes require, where applicable:

```text
syntax/local verification
schema reset or disposable DB test
direct SQL/RPC tests
RLS negative tests
application integration tests
final reference search
```

## 7. Reporting

Every DB task must report:

```text
Modified files
Verified behavior
Unverified assumptions
Cross-repository impact
Security impact
Required manual/live steps
```
