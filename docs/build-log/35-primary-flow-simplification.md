# Build log — primary flow simplification

## `2cb0d42` — refactor: simplify the primary logging flow (2026-08-10)

The Log screen previously put job management, import/export, backup, federal
withholding, and cloud-account controls below the entire shift history. The
primary action could disappear below a long list. The screen now keeps history,
one visible `Log a shift` action, and a Settings entry in its header. Optional
tools live in a dedicated Settings screen.

The two screens share one SQLite snapshot hook. The completion screen now calls
the gross figure `Earned per hour`, avoiding confusion with a job's stored
hourly rate. The account panel now accurately describes sync behavior.

README and product/roadmap docs now define local-first V1 and explicitly defer
billing, production cloud promises, 1099 features, and broad tax claims.

Verification: full pre-commit hook, TypeScript, docs check, Fallow dead-code
and duplication scans, iOS export, and Android export.
