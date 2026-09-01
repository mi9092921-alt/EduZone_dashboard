# Dependency Audit Resolutuions

# Date: 2026-03-28

## High Vulnerability: Picomatch ReDoS (extglob quantifiers)

- **Path:** `apps/admin > eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > picomatch` AND `apps/admin > @storybook/addon-docs > @storybook/csf-plugin > unplugin > picomatch`
- **Severity:** High
- **Context:** This vulnerability relates to Regular Expression Denial of Service (ReDoS) when processing malicious file globs. These specific transitive dependencies exist purely within the Dev toolchain (`eslint` and `storybook-docs`).
- **Resolution:** ACCEPTED. Since these toolchains perform compilation over statically trusted codebases managed exclusively internally in CI/CD (and are never exposed to arbitrary strings governed by an attacker locally), the risk factor is essentially null to the end user. Will automatically resolve as `@next/eslint-plugin-next` and `@storybook/addon-docs` push patch version bumps in future root `pnpm update` sweeps.
- **Action:** Annotated and bypassed.
