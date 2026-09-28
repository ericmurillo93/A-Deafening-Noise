# Production hardening — staging review

Scope: implement the 28 September 2026 audit on a local review branch. No push,
production database changes, production email sends, or destructive staging
refresh. Production rollout requires Eric's review and explicit approval.

## Commit-sized work packages

1. **Privacy and security** — exclude private fallback datasets from hosted
   bundles; verify the output; shared API quotas, timeouts and defensive headers;
   document authentication settings and any provider-owned requirements.
2. **Discovery reliability** — union every active user's affinity, remove
   Eric-specific exclusions from shared scraping, preserve event identity and
   reject expired candidates; durable daily digest delivery and retries.
3. **Data portability and recovery** — versioned complete personal export,
   safe import preview/roundtrip, staging-only transactional refresh safeguards,
   recovery verification and explicit exclusions for Auth/Vault/Storage.
4. **Application loading** — separate essential archive loading from optional
   services, reduce polling, reject stale requests/account-crossing responses,
   maintain isolated cached rendering.
5. **Interface consolidation** — preserve Default and Poster; improve Home
   layouts, readable metadata, keyboard focus, shared theme tokens and components.
6. **Release validation** — deterministic fixtures, representative visual and
   browser coverage, isolated database permissions tests, operations documentation
   and a manual staging checklist.

## Verification and deployment boundary

- Each package: targeted checks, build where applicable, diff review and one commit.
- Database migrations: apply only to `olqtafovoprkesxdbndp` after inspecting the
  explicit target; transactional tests must roll back their disposable records.
- Never run discovery/email jobs with production credentials during development.
- Final local functional, accessibility, visual and Lighthouse checks. No automatic
  GitHub quality workflow is introduced.
- Record unresolved external setup or genuinely unavailable verification rather
  than claiming it passed. Keep Notion aligned with durable operational decisions.

## Progress

- [x] Privacy and security (code; external CAPTCHA setup remains pending)
- [x] Discovery reliability
- [x] Data portability and recovery
- [x] Application loading
- [x] Interface consolidation
- [x] Release validation (available local checks; WebKit prerequisites below)

## Implementation and verification — 28 September 2026

Local branch: `staging-production-hardening`. Nothing pushed. Production has
not been written to. Six new migrations applied only to staging: provider quotas
`100000`, affinity `110000`, digest outbox `130000`, portable export `140000`,
application snapshots `150000`, and server date validation `160000`, all prefixed
`20260928`. The existing `20260928120000_import_be_prog_2026` is unrelated and must
not be reapplied as part of this release.

- 88 functional/browser checks passed across desktop, portrait and landscape;
  two touch-only cases intentionally skipped on desktop.
- 18 Axe checks passed with no serious/critical violations in the tested states.
- 18 visual comparisons passed using reviewed synthetic baselines; Home covers
  Default and Poster. No horizontal document overflow in the four manually
  inspected Home theme/viewport combinations.
- Eleven unit-test files, security migration audit, eight auth email templates,
  production-bundle privacy check, build and diff checks passed.
- Lighthouse archive: performance 95, accessibility 95, best practices 100,
  SEO 91. Calendar: 94, 100, 100, 91. Synthetic unauthenticated audit, not a
  production-network or authenticated-load benchmark.
- Disposable-user staging SQL checks passed, including consent, independent
  attendance, atomic import failure, quota isolation and frozen-message email
  retries. No emails were sent.
- Production application-data snapshot was read and restored **inside a staging
  transaction that rolled back**, with row counts checked. This is not a full
  disaster-recovery test of Auth, Vault, uploaded avatar binaries or provider
  configuration. Backups stay ignored locally, with checksums and restrictive
  permissions.

## Eric's manual staging review

Run `npm run dev` with the existing staging `.env.local` and open
`http://127.0.0.1:5173`.

1. Sign in, reload, switch between Eric and another staging user, and verify
   archive, avatar and theme never cross accounts. Try a reload with the network
   temporarily offline, then restore it.
2. Check Home, calendar, archive, suggestions and Profile in both themes,
   English/Spanish, phone portrait/landscape and desktop. Check keyboard focus,
   Ctrl/Cmd+K, modal Back/Escape and long labels in Upcoming.
3. Invite a friend to a concert, accept it from that account, then leave it.
   The creator must retain the concert. Revoke statistical sharing and verify
   comparison access is removed.
4. Export personal JSON and preview/reimport in staging. Locations, dates,
   tickets and guest names must survive without duplicates or new invitations.
   Account identity, passwords, friendships/consents and provider observation
   history are not recreated by a concert import; those remain export records.
5. Review Interested/Not interested independently for two users. Cached
   suggestions must not prevent the archive opening if discovery fails.
6. Manually verify signup/password recovery and Safari on an actual device.
   Automated quality tests intentionally do not send real auth/digest emails.

## Follow-up: browser coverage and data ownership

Eric approved keeping old Git history and deferring CAPTCHA. The current tree
now excludes personal JSON and one-off personal seed payloads; historical
migration versions remain as placeholders and must not be replayed on existing
databases. No data has been deleted from Supabase.

- Chromium: 88 passed, 2 layout-specific skips.
- WebKit: 59 passed, 1 desktop-only skip.
- Firefox: 29 passed, 1 desktop-only skip.
- Four additional modal captures (WebKit/Firefox, 390/1280px) fit the viewport.
- Thirteen unit-test files pass. Discovery reconstructs runtime files from a
  mocked database in an empty directory, without a checked-in dataset.
- The initial cross-browser failures were test synchronization issues: shortcut
  dispatch before the page was ready and polling a not-yet-received OAuth URL.
  Both now wait for their actual prerequisite rather than adding arbitrary sleeps.
- A read-only personal staging export produced 184 concerts, all accepted by
  import preview validation, with a verified checksum and mode-0600 file outside
  Git. No Drive upload or production write was performed.
- Production still holds 506 historical Spotify artist rows; staging currently
  has none with the historical-import prefix. Existing staging and production
  taste data therefore differ; removing local JSON did not cause that difference.

## Remaining release gates — not claimed complete

- WebKit and Firefox now pass. A physical Safari device still merits review;
  Chromium testing is engine coverage for Chrome/Edge, not a run of each vendor
  binary or every older browser version.
- CAPTCHA is explicitly deferred by Eric. No provider keys were created and
  server CAPTCHA was not enabled without a corresponding widget.
- Personal JSON is removed from the current tree. Old public commits are kept
  by explicit owner decision; no force push or history rewrite is planned.
- Digest rows in `review` mean an ambiguous send passed the safe retry window
  or exhausted attempts: inspect Resend before retrying, never blindly reset.
  A first production run may email currently eligible suggestions once.
- No full provider outage/load test, live email end-to-end test or Auth/Vault
  disaster restore is claimed. Keeping five users free does not guarantee free
  operation at arbitrary scale.

## Production rollout — explicitly approved 28 September 2026

The six hardening migrations listed above were applied atomically to production
after a verified private application snapshot and public function-definition
backup in `~/adn-backups/production-before-hardening-*`. Application table row
counts were unchanged. Historical personal-seed migrations were not replayed.
Production Auth now requires a minimum password length of eight, matching
staging; email confirmation remains enabled. CAPTCHA remains deferred.

The final Stats changes apply only to Stats and Year in Review. Archive and
Timeline retain their prior controls. Fourteen unit-test files, security audit,
build and hosted-bundle privacy checks passed before release. `ref.png` remains
an untracked local reference, excluded from publication.

### Rollout procedure and remaining manual verification

1. Review these commits and the manual results; make an application-data backup.
2. Apply the six new migrations to production in order, reviewing the target
   separately. Do not use the staging-only runner with a production target.
3. Confirm production Auth minimum 8 and existing environment variables. No new
   server secret is required by this hardening release.
4. Deploy the application/functions and discovery workflow only after the SQL
   exists. Verify login, core/discovery snapshots and an authorized provider
   request, then observe the first digest run and its durable outbox.
5. If reverting frontend/functions, keep the additive database compatibility
   wrappers; never drop the outbox or personal records as a rollback shortcut.
