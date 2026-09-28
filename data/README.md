# Runtime data — never commit

Supabase stores real concert archives, listening affinity and suggestions.
Discovery jobs generate ignored JSON here from the database, then publish back
to Supabase. These files are disposable working inputs, not backups.

Local UI demonstrations and browser tests use `tests/fixtures/archive.mjs`.
Unauthenticated demo edits are saved only to ignored `demo-concerts.json`.
Personal exports and database dumps belong outside the checkout; see
`docs/DEVELOPMENT.md`. Old Git history is intentionally unchanged.
