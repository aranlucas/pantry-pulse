# Upstream provenance

Source: https://github.com/dmmulroy/anti-slop

Revision: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b

Canonical `src/` is vendored in `tools/oxlint/anti-slop/`, with the upstream MIT license and nested ESLint Stylistic license/provenance preserved. No intentional source deviations.

The entire canonical src tree is retained, including upstream RuleTester test files. App Vitest discovery excludes only this vendored directory; RuleTester suites can be run directly with Node to verify the plugin independently of the Workers test runtime.
