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

## Remaining release gates — not claimed complete

- WebKit was downloaded, but system-library installation stopped because sudo
  requires a terminal/password. Run `npx playwright install --with-deps webkit`
  interactively, then `npm run test:webkit`; physical Safari still merits review.
- Configure CAPTCHA provider + matching UI + CSP together before opening
  unrestricted public signup. No provider keys were created or guessed, and
  server CAPTCHA was deliberately not enabled without its widget.
- Decide whether the public repository should retain personal fallback JSON.
  Bundle isolation cannot retract existing public Git history.
- Digest rows in `review` mean an ambiguous send passed the safe retry window
  or exhausted attempts: inspect Resend before retrying, never blindly reset.
  A first production run may email currently eligible suggestions once.
- No full provider outage/load test, live email end-to-end test or Auth/Vault
  disaster restore is claimed. Keeping five users free does not guarantee free
  operation at arbitrary scale.

## Later production rollout (requires explicit approval)

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
