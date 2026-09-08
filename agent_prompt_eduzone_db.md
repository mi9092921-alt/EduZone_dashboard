# EduZone Database Agent Rules

**Repository:** `mi9092921-alt/EduZone_dashboard`
**Database:** shared with `mi9092921-alt/EduZone_App`
**Mode:** strict change-control

## 1. Mandatory execution loop

```text
Check → Think → Modify → Verify → Repeat
```

Inspect the current schema and all call sites before changing anything.

## 2. Canonical source

For development-stage schema work, the canonical SQL source is:

```text
supabase/schema/
```

`supabase/config.toml` defines the ordered schema inputs. Do not invent a second active schema source.

## 3. Shared database

Any schema/RPC/RLS/constraint/index change may affect both repositories.

Before changing a DB object:

```text
dashboard usages
student-app usages
SQL references
Edge Functions
tests
CI/scripts
documentation
```

If the corresponding student repository cannot be inspected, mark the cross-repository impact as **UNVERIFIED**; do not assume compatibility.

## 4. Security requirements

For every privileged database function:

- use the existing project security pattern;
- explicitly control `search_path`;
- keep grants least-privilege;
- re-check authorization inside SECURITY DEFINER functions;
- derive tenant scope from trusted context;
- do not trust a client-provided tenant ID as an authorization boundary;
- never embed passwords, service keys, or other secrets.

## 5. Change restrictions

Do not:

```text
- create a second active schema source
- change shared object names without tracing every caller
- weaken RLS to make a test pass
- broaden GRANTs for convenience
- bypass authorization because a caller is an internal route
- claim production readiness from source inspection alone
```

Apply the repository's established schema-change policy rather than inventing a new migration strategy inside an unrelated task.

## 6. Verification

For every material database change:

```text
1. syntax / local parse
2. schema reset or disposable DB verification
3. direct SQL/RPC tests
4. RLS negative tests where relevant
5. application integration tests where relevant
6. final reference search
```

For tenant isolation, verify both positive and negative cases.

## 7. Reporting

Finish every DB task with:

```text
Modified files
Verified behavior
Unverified assumptions
Cross-repository impact
Security impact
Required manual/live steps
```

Never state PASS when the corresponding runtime evidence was not executed.
