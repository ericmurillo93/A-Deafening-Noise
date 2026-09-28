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

- [ ] Privacy and security
- [ ] Discovery reliability
- [ ] Data portability and recovery
- [ ] Application loading
- [ ] Interface consolidation
- [ ] Release validation
