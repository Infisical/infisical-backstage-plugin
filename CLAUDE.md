# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

A Backstage monorepo (Yarn 4 workspaces, `backstage-cli`) that publishes three packages from `plugins/`:

| Directory | Package | Role |
|---|---|---|
| `plugins/infisical` | `@infisical/backstage-plugin-infisical` | Frontend plugin (pluginId `infisical`) |
| `plugins/infisical-backend` | `@infisical/backstage-backend-plugin-infisical` | Backend plugin (pluginId `infisical-backend`) |
| `plugins/infisical-common` | `@infisical/backstage-plugin-infisical-common` | Annotation keys and permission definitions shared by both |

`packages/app` and `packages/backend` are a scaffolded example Backstage app that consumes the plugins via `workspace:^`. They exist for local testing and are not published.

## Commands

Node `20 || 22` (per `engines`); Yarn 4.4.1 is vendored in `.yarn/releases`.

`backstage-cli ... test` runs Jest in **watch mode and never exits** unless `CI=true` is set. Always prefix test commands with `CI=true`.

```bash
yarn install
yarn tsc                      # type-check the whole repo (output goes to dist-types/, git-ignored)
CI=true yarn test             # all packages
CI=true yarn test:all         # all packages with coverage
yarn lint:all                 # lint everything
yarn prettier:check
yarn build:all

# Single package / single test (run from the package directory)
cd plugins/infisical-backend
CI=true yarn test router                    # file name pattern
CI=true yarn test router -t "returns 404"   # test name filter
```

`yarn lint` (without `:all`) runs `--since origin/master`, but the default branch is `main`, so use `yarn lint:all` or `yarn backstage-cli repo lint --since origin/main`.

Running things locally:

- `yarn start` inside `plugins/infisical-backend` starts the backend plugin standalone on http://localhost:7007 using `dev/index.ts` (mock auth, mock catalog with one sample entity whose `infisical/projectId` must be edited).
- `yarn start` inside `plugins/infisical` starts a dev app (`dev/index.tsx`) with a mocked `infisicalApiRef` and permission API, so no backend is needed.
- `yarn dev` at the root runs the example app and backend together. The root `app-config.yaml` has no `infisical:` block and the backend plugin fails at startup without one; put it (with credentials) in `app-config.local.yaml`, which is git-ignored and loaded automatically. The example backend uses the allow-all permission policy, so permission-denied paths cannot be exercised there.

## Architecture

### Entity-scoped request flow

The API is entity-based: the frontend never sends an Infisical project ID, only an `entityRef`. Everything else is derived server-side from the entity's annotations. Frontend and backend must therefore be released together.

1. **Frontend**: `EntityInfisicalContent` wraps `EntitySecretsProvider`, which reads the entity via `useEntity()` and passes `entityRef` plus the `infisical/environment` and `infisical/secretPath` annotations (used only to shape the UI) to `EntityInfisicalSecretsContent`. `InfisicalClient` resolves the backend via `discoveryApi.getBaseUrl('infisical-backend')` and sends `entityRef` as a query param (GET) or in the JSON body (POST/PATCH/DELETE).
2. **Backend** (`src/service/router.ts`), for every route in this order:
   - `validateEntityRef` (400 on malformed refs).
   - `httpAuth.credentials(request, { allow: ['user'] })`: service principals get 403 and unauthenticated requests 401. The permission framework allows service principals without consulting the policy, so they must not reach the permission check.
   - `resolveEntityAccess` (`entityAccess.ts`): loads the entity from the catalog **with the caller's credentials**, takes the workspace from `infisical/projectId` (404 if missing), enforces the `infisical/environment` lock (403; the requested environment is trimmed first, so a padded value cannot miss its `infisical/identity.<env>` annotation) and the `infisical/secretPath` restriction (exact path, or path plus subfolders with a `+` prefix; traversal is 400), and picks the identity name (`infisical/identity.<env>`, then `infisical/identity`, then default).
   - Permission check against the entity (`permissions.authorize` with `resourceRef: entityRef`).
   - `InfisicalIdentityRegistry.getClient(identity, entityRef)` (`identities.ts`): 404 for an unconfigured identity, 403 when the entity is not in the identity's `allowedEntityRefs`. This deliberately runs **after** the permission check.
   - Every 403 is built with `forbiddenError(reason, message)` (`errors.ts`), which sets `error.reason` in the response body to one of `INFISICAL_FORBIDDEN_REASONS` (from `infisical-common`). The frontend uses it to tell a missing permission apart from a configuration problem, so new 403s need a reason.
   - Call `InfisicalApiClient` with a context `{ userRef, entityRef }` that is written into the `User-Agent` header so it shows up in Infisical's audit log.
3. `GET /secrets` needs only `infisical.secret.describe`; values are redacted unless `infisical.secret.value.read` is also allowed. `GET /secrets/:secretId` requires `infisical.secret.value.read`.

### Permissions

Defined in `plugins/infisical-common/src/permissions.ts`. All five use the `catalog-entity` resource type so policies can reuse catalog conditional rules (`isEntityOwner`, etc.) without this plugin registering any rules. The backend registers them via `permissionsRegistry.addPermissions` in `plugin.ts`. The frontend uses `usePermission` only to hide controls; the backend is authoritative. `infisical.secret.value.read` has `attributes: {}` (no action) on purpose, so blanket `read` grants on catalog entities do not reveal values.

### Machine identities

`InfisicalIdentityRegistry` builds one `InfisicalApiClient` per identity at startup: the default from `infisical.authentication` (mandatory only when no named identities exist) and one per key under `infisical.identities`. Each client handles `auth_token` or `universalAuth` (token cached and refreshed 5 minutes before it expires, or after 80% of its lifetime when it lives 5 minutes or less), retries GETs on network errors and 408/429/5xx (writes only on 429), maps Infisical error statuses to `@backstage/errors` classes (400/422, 403, 404, 409 pass through; 408/429/5xx become 503; 401 stays 500), and calls Infisical's `/v3/secrets/raw`, `/v1/folders` and `/v1/workspace/:id` endpoints. Identity names must be valid Backstage config keys (`payments-dev` works, `team-1` does not).

### Keeping things in sync

- New annotation keys or permissions go in `plugins/infisical-common` and are imported by both plugins; do not redefine the strings locally.
- `plugins/infisical-backend/config.d.ts` is the config schema (`configSchema` in its `package.json`); credential fields need `@visibility secret`.
- The root `README.md` documents annotations, permissions, the enforcement rules and HTTP status codes above. Update it alongside behavior changes. `plugins/infisical-common/README.md` has its own permission table.

## Testing notes

- Backend tests use `@backstage/backend-test-utils` (`mockServices`, `mockCredentials`) and `supertest`. `router.test.ts` mocks `./InfisicalApi` so the constructor returns a per-identity mock keyed by `identityName`, mocks the catalog with a bare `getEntityByRef` jest fn, and toggles decisions with `allowOnly(...)` / `allowAll()` helpers. The router has no error middleware of its own (the root HTTP router handles errors), so tests mount `mockErrorHandler()` after it. A router created after the first test must re-apply `mockClientFor` to the `InfisicalApiClient` mock, because `setupTests.ts` resets mock implementations.
- `plugins/infisical-backend/src/setupTests.ts` calls `jest.resetAllMocks()` after every test (wiping `mockImplementation`/`mockResolvedValue`) and freezes `Date.now` at `2023-01-01T12:00:00Z`. Set stubs in `beforeEach`, not at module scope.
- The backend uses `msw` v2 and the frontend uses `msw` v1; their APIs differ.
- Frontend tests use `@testing-library/react` 12 (the plugin's React peer range is 16/17). `src/mockInfisicalApi.ts` (`createMockInfisicalApi`) and `src/mocks.ts` provide an in-memory API and fixtures.
