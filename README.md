# Furkan Kaan Ünal — 2024502225

# Assignment 5: Study Tasks API

A Deno 2 / TypeScript backend built from the provided starter, using Hono, Drizzle and
SQLite. The task fields and seed examples focus on study planning.

## Run

Requires Deno 2.6.3 or later. No Node.js runtime and no npm install step. Run these
commands **inside the assignment5 folder**:

```sh
cp .env.example .env
deno task dev
# another terminal
deno task test
deno task check
deno fmt --check
deno lint
```

The API listens on http://localhost:8000. Interactive documentation is at
http://localhost:8000/docs; its specification is /openapi.json. Deno downloads packages
and creates its ignored node_modules directory automatically. Commit `deno.lock`; do not
commit that directory.

The optional starter UI is retained and has a WebSocket listener:

```sh
deno task ui:install
deno task ui:dev
```

Open http://localhost:5173 in two tabs and sign in to the same account in each. Changing a
task in one tab refreshes the list in the other. Different users do not receive each
other's events.

## Design

`users` contains id, unique email, bcrypt passwordHash, role and createdAt. `tasks.userId`
references users.id. Each task has title, status, priority, createdAt, updatedAt,
completedAt, deletedAt, attachment and dueDate. Timestamps are Unix seconds; createdAt has
a SQL default. dueDate is an optional ISO calendar date. The database also checks valid
status and priority values.

The API uses one-hour HS256 JWTs instead of the starter's sessions table (Bonus 7). They
carry user id and role, with issuer and audience checks. Password hashes are never
included in responses. Registration always grants role `user`; the non-production seed
creates a demo admin.

All protected routes pass through requireAuth and borrow a connection from a three-client
SQLite pool. Every task query checks the owner. Another user's id gets 404. DELETE marks
deletedAt; GET and the summary exclude deleted tasks. Registration and its welcome task
share a transaction. The welcome task is a real task, so a newly registered account starts
with one item.

PUT replaces the task input fields: title is required; missing status and priority reset
to their documented defaults, and omitted dueDate becomes null. Moving to done sets
completedAt. Keeping done preserves that timestamp; reopening clears it. Purging uses
completion time, so a recently completed old task survives.

Lists sort by increasing id. Defaults are page 1 and limit 20, with limit at most 100;
page must be an integer from 1 to 1,000,000. Zod rejects invalid bodies, ids and query
parameters, including unknown fields. All errors use `{ error, issues, requestId }`; the
same requestId is in the response header. SQL values use Drizzle parameters rather than
concatenated user input.

| Method           | Route                     | Purpose                            |
| ---------------- | ------------------------- | ---------------------------------- |
| GET              | /health, /healthz         | Process health                     |
| GET              | /readyz                   | Database readiness, 503 on failure |
| POST             | /auth/register            | Register and create a welcome task |
| POST             | /auth/login               | Return a JWT                       |
| GET, POST        | /api/tasks                | Paginated list / create            |
| GET, PUT, DELETE | /api/tasks/:id            | Read / replace / soft delete       |
| POST             | /api/tasks/:id/restore    | Restore a deleted task             |
| POST, GET        | /api/tasks/:id/attachment | Upload / download an image         |
| GET              | /api/me/summary           | Counts grouped by status           |
| GET              | /api/admin/users          | Admin-only user list               |
| GET              | /ws?token=...             | Authenticated WebSocket upgrade    |
| GET              | /openapi.json, /docs      | Specification / Swagger UI         |

## Verification

40 tests passed, including real WebSocket connections. Type-check and lint also passed;
raw output is in `evidence/tests.txt`, `check.txt` and `lint.txt`. `evidence/startup.txt`
records an actual `deno task dev` health request.

GitHub Actions also ran the four checks on a fresh Ubuntu runner with the standard
dependency loader and no local native-driver workaround:
[successful checks](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737627126).
The container build and persistence check also passed in
[this run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737811650).
The local platform-detection restriction and its execution-only workaround are recorded in
My own log. Hosted CI required no such workaround.

`deno task evidence` reproduces the curl transcript, benchmark, request logs and live
connection probe. It also needs curl. `deno task cron:verify` runs the actual
once-per-minute scheduler probe and exits after the first tick. Tests themselves need only
Deno, not curl, Docker or a running API.

## Bonus status

Bonuses 1–18 are implemented and exercised. Bonus 6 uses option B (the custom SQLite pool,
counted as two by the handout). The GitHub repository is created and populated; instructor
access remains to be arranged. Bonus 19 is not claimed.

| Bonus             | State                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| 1–16              | Implemented; tests and recorded evidence included                                  |
| 17 Docker         | Built and run in GitHub Actions; persistence and image size recorded               |
| 18 CI             | Real green, deliberate red, and fixed green runs linked below                      |
| 19 Deploy         | Not claimed; the API has not been publicly deployed                                |
| 20 Git repository | Private GitHub repository with incremental history; instructor access still needed |

## Bonus 1: Migrations with Drizzle Kit

Drizzle Kit generated `0000_puzzling_klaw.sql` from the initial schema. I then added
nullable dueDate, ran generation again, and got `0001_stale_valkyrie.sql`, containing
`ALTER TABLE tasks ADD due_date text`. Both snapshots and the journal are included.
Startup uses the Drizzle migrator; rerunning it does not recreate the schema or lose rows.

```sh
deno task db:generate
deno task db:migrate
```

## Bonus 2: Soft delete, restore and a transaction

DELETE hides rather than removes. Restore only succeeds for a deleted task owned by the
caller. The transaction rollback test creates a temporary SQLite trigger that rejects the
welcome insert, receives 500, and verifies that the user insert was rolled back too.

## Bonus 3: Joins and the N+1 problem

The handout's naive summary loads tasks and then counts each of the three statuses
separately: **4 queries**. The grouped summary returns the same counts in **1 query**.
This fixed-status loop stays at four queries as the data grows; the separate true N+1
example below grows with the number of rows.

The real N+1 example in scripts/benchmark.ts loads ten tasks and then looks up the owner
separately for every row: **11 queries**. With N rows that becomes 1 + N. The production
summary groups by status in **one query**, independent of how many tasks a user owns. This
benchmark deliberately demonstrates per-row lookups, rather than calling a fixed
three-status loop an N+1 problem.

The logged statements below come from the run; all eleven naive statements are in
evidence/benchmark.json.

```sql
select "id", "user_id", "title", "status", "priority", "created_at", "updated_at", "completed_at", "deleted_at", "attachment", "due_date" from "tasks" where "tasks"."user_id" = ? limit ? -- [2,10]
select "email" from "users" where "users"."id" = ? -- [2]
-- The owner lookup above was executed ten times.
select "status", count(*) from "tasks" where ("tasks"."user_id" = ? and "tasks"."deleted_at" is null) group by "tasks"."status" -- [2]
```

## Bonus 4: Indexes and EXPLAIN

The benchmark inserted 20,000 tasks for 20 users, removed the index, measured 30
executions of the same parameterized query, added the index and measured again. These are
observations on this machine, not a promised speedup:

| State  | Query plan                                                                | Mean ms/query |
| ------ | ------------------------------------------------------------------------- | ------------- |
| Before | `SCAN tasks`                                                              | 5.48          |
| After  | `SEARCH tasks USING INDEX idx_tasks_user_status (user_id=? AND status=?)` | 4.568         |

The index is declared in schema.ts and in the first migration. It costs disk space and
additional work on writes. The complete run is evidence/benchmark.json;
`deno task benchmark` repeats it using an automatically removed temporary DB.

## Bonus 5: Seed data

```sh
deno task seed
```

This creates student@demo.example (user) and admin@demo.example (admin), each with ten
tasks. Both demo accounts use **DemoStudy123!**. These are deliberately public local demo
credentials. Existing users are left intact and tasks are skipped when the account already
has some. The script refuses production. The test runs it twice and verifies 2 users and
20 tasks.

## Bonus 6: A connection pool (Postgres or SQLite)

**Option B.** Pool<T> has FIFO waiters. acquire borrows an idle client or queues; release
passes it to the oldest waiter. use returns it in finally even if a query throws. The test
starts 20 jobs with three items, observes a peak of 3, and confirms all 20 finish. A
separate test covers rejection and FIFO order.

I chose three connections to keep concurrent reads bounded without opening a large number
of handles. Each uses WAL and busy_timeout=5000. SQLite still has one writer, so a larger
pool would not provide Postgres-style write scaling. The HTTP middleware borrows one
connection per protected request. The purge job follows the same pool-before-cache-lock
order to avoid a deadlock.

## Bonus 7: JWT instead of sessions

Login signs sub, role, issuer, audience and a one-hour expiration with HS256. Tampered,
expired and wrong-secret tokens are all tested as 401. Unlike sessions, JWT authentication
needs no database lookup and works on servers sharing the secret. The cost is that a
token, including its role claim, stays valid until expiry; changing a role does not revoke
an already issued token. Configuration rejects the development secret in production.

## Bonus 8: OpenAPI and a docs page

The app is OpenAPIHono. Route declarations use the same Zod input schemas that validate
actual requests. /openapi.json documents required and bonus routes, including error
responses and a Bearer scheme. /docs has Swagger UI with an Authorize control. The tests
verify the schema routes and protected security metadata. evidence/openapi.json is an
actual generated snapshot.

## Bonus 9: Roles (RBAC)

Only the non-production seed creates an admin. Registration cannot choose its role.
requireRole returns 401 when unauthenticated and 403 when authenticated without the
required role; an admin gets 200 at /api/admin/users. All three are tested, and user
listings omit password hashes.

## Bonus 10: Logging and request ids

Each request gets one generated x-request-id and one JSON log line with method, path,
status and duration. Error bodies carry that id too. The logger uses only c.req.path,
excluding the query string, and never reads request bodies or Authorization. The test
sends a password and a WebSocket query token and checks that neither appears in captured
logs. Actual excerpt:

```json
{"requestId":"9ef2f0b7-104a-4452-ba1f-b7069b44269e","method":"GET","path":"/health","status":200,"ms":2}
{"requestId":"ba29e507-74e0-4016-b400-e237c5590d7a","method":"GET","path":"/healthz","status":200,"ms":0}
{"requestId":"5554e500-6e40-471a-8777-a9e9eededbc8","method":"GET","path":"/readyz","status":200,"ms":1}
```

## Bonus 11: Health, readiness and configuration

/healthz reports process health; /readyz runs SELECT 1 and returns a common 503 error on
failure. Tests cover both and a closed database. config.ts reads and validates environment
settings once, including PORT, DATABASE_URL, JWT_SECRET and APP_ENV. Production needs a
private secret of at least 32 characters.

.env.test is included. Copy .env.production.example to .env.production and replace its
placeholders before `deno task start:production`. That private file is ignored.
`deno task test:env` exercises the test environment file.

## Bonus 12: File upload

POST /api/tasks/:id/attachment accepts multipart field `file`. It requires a File, at most
1,000,000 bytes, with PNG or JPEG MIME type; errors are respectively 400, 413 and 415. The
generated UUID filename ignores the supplied filename. Files are written with
Deno.writeFile. Download repeats the ownership check and sets content-type, nosniff and
private/no-store. Replacing an attachment removes the previous file; a failed DB write
removes the new orphan. Tests cover all three failures, exact downloaded bytes, owner
isolation and cache invalidation.

This is a local/volume attachment store, not persistent object storage. A cloud instance's
writable filesystem must not be treated as durable image storage.

## Bonus 13: WebSocket live updates

Authentication happens before upgrade. LiveTasks maps each user id to their sockets and
removes closed connections. Changes are published only to that owner. The UI reloads its
list on events. The reproducible client test recorded:

```text
Opened two authenticated connections for the same user and one for another user.
Both owner connections received created, updated and deleted with the same task payloads.
The other user's connection received 0 events.
```

This evidence is from real WebSocket clients simulating two open tabs, not a claim of a
browser recording. The live test also exercises create/update/delete.

## Bonus 14: A background job with Deno.cron

main.ts registers `Deno.cron("purge old done tasks", "0 3 * * *", ...)`. It permanently
removes tasks whose completedAt is more than 30 days old, invalidates cached rows, removes
attachments and publishes purged events. A unit test preserves recently completed and
unfinished tasks, and verifies idempotence. The separate once-per-minute probe really
fired:

```json
{"probe":"cron","schedule":"* * * * *","waitingSince":"2026-11-20T12:27:08.465Z"}
{"job":"purge","removed":1,"secondRun":0,"firedAt":"2026-11-20T12:28:00.011Z"}
```

## Bonus 15: Rate limit on login

After five failures for a normalized email within one minute, the next attempt gets 429
and Retry-After even with the right password. Success clears failures; expired entries are
pruned. Tests cover both reset paths. The in-process Map does not coordinate multiple
servers and does not stop attempts spread across many different email addresses.

## Bonus 16: A cache with Deno KV

The app opens KV once. A task lookup caches for 60 seconds under ["task", userId, id].
Tests show one database load for two lookups, separate owner keys, invalidation on
update/delete, and fresh reads after concurrent read/update. Update, delete, restore,
upload and purge invalidate the entry. Per-task locks serialize local cache fills and
mutations. The cache and live connection map assume a single application process;
cross-instance invalidation would require shared versioning or messaging.

## Bonus 17: Docker

**Built and verified in GitHub Actions.** Docker was unavailable locally, so I added a
container job to the workflow and ran the actual build/restart check on its Ubuntu runner.
[Successful run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737811650).
The Dockerfile uses the official Deno 2.6.3 image, caches dependencies, runs as the deno
user and stores SQLite plus uploads under /data. compose.yaml mounts a named volume.
Actual output (full log: evidence/docker-ci.log):

```text
First registration: HTTP 201 {"id":1,"email":"docker@demo.example"}
After container replacement using the same volume: HTTP 409 {"error":"email already registered","issues":[],"requestId":"7a8b1317-924a-4b83-a5d6-bbe42a33db70"}
Image: 126791552 bytes; user=deno
```

The image was 126,791,552 bytes (about 121 MiB). A multi-stage image excluding
migration-generation tooling could reduce its size. The second registration was made in a
new container using the same named volume; 409 proves that the first account survived
replacement.

```sh
export JWT_SECRET="$(deno eval 'console.log(crypto.randomUUID()+crypto.randomUUID())')"
docker compose up --build -d
# Reproduce the successful persistence check:
deno task docker:verify
```

The verification script removes only its own temporary container and volume. Permissions:
net serves HTTP/remote DB; env reads config; read/write handle migrations, DB, files and
KV; ffi loads SQLite's native driver; sys supports the driver's platform detection. No
--allow-run is used by the API.

## Bonus 18: Continuous integration

.github/workflows/ci.yml runs fmt --check, lint, task check and task test on push and pull
requests. A dependent container job builds the Docker image, checks data persistence and
uploads the resulting transcript as an artifact.

- [Green main run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737627126):
  all four required checks passed.
- [Intentional red run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737670184):
  on ci-failure-demo, a formatted, type-correct test deliberately threw an Error.
  Formatting, lint and check passed; test failed as intended.
- [Fixed green run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737875861):
  the demonstration test was removed on that branch and checks passed again.
- [Green Docker run](https://github.com/furkankaanunal/mis233-assignment5/actions/runs/44737811650):
  both test and container jobs passed.

The red demonstration was isolated from main. Its failing test is not in this submission.
Actual job logs are included as evidence/ci-green.log, evidence/ci-red.log and
evidence/docker-ci.log.

## Bonus 19: Deploy

**Not claimed.** The API has not been publicly deployed, so this submission does not
include a live URL or hosted curl output. The local and Docker API are fully implemented
and tested. The optional deployment configuration remains available: createDb accepts a
hosted libSQL URL and DATABASE_AUTH_TOKEN; deno.json declares src/main.ts as a dynamic
entrypoint and enables KV and cron.

## Bonus 20: Git repository

Repository: https://github.com/furkankaanunal/mis233-assignment5

The repository was created as **private**. It contains incremental commits for the
model/pool, API, tests, container checks and documentation, plus the isolated CI
demonstration branch. Instructor access is still required: invite the instructor's
announced GitHub username, or make the repository public with the owner's approval before
submitting its link.

history.bundle preserves the local source history as an offline backup:

```sh
git clone history.bundle assignment5-history
```

The work was done in one session; it does not satisfy the handout's suggestion of commits
spread over several days, and commit dates have not been fabricated. .gitignore excludes
private environments, databases, uploads and node_modules. A fresh GitHub Actions runner
has already exercised all four checks from the remote source.

## My own log

These are actual issues and observations from implementing and checking this project; they
are not examples invented to fill the log requirement.

1. Drizzle Kit printed **Cannot find module 'drizzle-kit'** while importing
   drizzle.config.ts. Deno's global npm cache alone did not satisfy the tool's CommonJS
   resolution. Setting nodeModulesDir to auto made Deno create the local dependency
   layout, without an npm install step.
2. The first type check was launched from the parent directory and reported **Import
   "drizzle-orm" not a dependency**. Running tasks from the project directory picked up
   deno.json. The Run section explicitly names that folder.
3. A prefix import mapping caused **Failed resolving types. Failed to resolve the
   specifier "hono/utils/http-status"**. Replacing the prefix with the exact package
   subpath mapping fixed it.
4. The duplicate-email test initially got **500**, with **409** expected. Drizzle wrapped
   the SQLite exception in its cause, so String(err) did not expose **UNIQUE constraint
   failed: users.email**. The conflict handler now walks Error.cause; the test passes
   without hiding other database failures.
5. OpenAPI handlers failed type checking because **200 | 400 | 401 | 404 | 500 is not
   assignable to type 200**. Explicit success status arguments and a generic fail<S>
   retained each response's status type.
6. Native libSQL startup on the checking machine hit **PermissionDenied: Operation not
   permitted (os error 1)** at Deno.networkInterfaces during platform detection. An
   execution-only local link to the installed GNU native binary, selected by
   LIBSQL_JS_DEV=1, allowed real SQLite tests. That link is inside the excluded
   node_modules folder; project scripts contain no fake platform detector or mock
   database.
7. The starter UI lint check reported **jsx-button-has-type**. I added explicit button
   types and kept Add as submit. Lint also found **require-await** in two pool test
   callbacks and **no-inner-declarations** in the benchmark; both were corrected instead
   of disabling lint rules.
8. A task's creation age and completion age are different. Purging by createdAt would
   remove old tasks just marked done. completedAt plus a regression test keeps those tasks
   until they have actually been done for 30 days.

9. Docker was missing locally. Rather than reporting an untested Dockerfile, the workflow
   was extended to build the image and run the restart test in GitHub Actions. The
   container job passed and reported a non-root image user.
10. The deliberate CI failure produced **Intentional CI failure demonstration; main is
    unaffected**. The red run stopped at the test step, and removing that one test
    produced a green run on the same demonstration branch.
11. Stopping the watched dev process initially caused **BadResource: Bad resource ID**
    when the shutdown callback ran twice. A closing guard made shutdown idempotent; the
    repeated startup/shutdown probe completed cleanly.

## Actual curl examples

The following commands and outputs were captured against a real temporary API. The random
localhost port is from that run; use localhost:8000 after starting normally. The tokens
use a disposable test secret and identify only temporary synthetic accounts. File paths in
the upload/download examples are temporary files created by the evidence script. Nothing
below requires a production secret.

## GET /health

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/health'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 9ef2f0b7-104a-4452-ba1f-b7069b44269e
vary: Accept-Encoding
content-length: 11
date: Fri, 20 Nov 2026 12:27:07 GMT

{"ok":true}
```

## GET /healthz

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/healthz'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: ba29e507-74e0-4016-b400-e237c5590d7a
vary: Accept-Encoding
content-length: 11
date: Fri, 20 Nov 2026 12:27:07 GMT

{"ok":true}
```

## GET /readyz

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/readyz'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 5554e500-6e40-471a-8777-a9e9eededbc8
vary: Accept-Encoding
content-length: 14
date: Fri, 20 Nov 2026 12:27:07 GMT

{"ready":true}
```

## POST /auth/register

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/auth/register' '-H' 'content-type: application/json' '-d' '{"email":"curl@example.com","password":"CurlStudy123!"}'
```

```text
HTTP/1.1 201 Created
content-type: application/json
x-request-id: 0144d53f-f4e7-4acd-9361-90dec9c7cac8
vary: Accept-Encoding
content-length: 35
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":1,"email":"curl@example.com"}
```

## POST /auth/login

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/auth/login' '-H' 'content-type: application/json' '-d' '{"email":"curl@example.com","password":"CurlStudy123!"}'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 7ee631f4-e77b-4a05-9649-b3ba928e2eef
vary: Accept-Encoding
content-length: 208
date: Fri, 20 Nov 2026 12:27:07 GMT

{"token":"eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc"}
```

## POST /api/tasks

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/api/tasks' '-H' 'content-type: application/json' '-d' '{"title":"Prepare MIS 233 API demo","priority":"high","dueDate":"2026-12-01"}' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 201 Created
content-type: application/json
x-request-id: 6559379b-8388-4f1c-9996-c6c66c2e831c
vary: Accept-Encoding
content-length: 211
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"todo","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":null,"deletedAt":null,"attachment":null,"dueDate":"2026-12-01"}
```

## GET /api/tasks?page=1&limit=2

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/tasks?page=1&limit=2' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 373e7f35-e189-4958-b9de-cffdd9272835
vary: Accept-Encoding
content-length: 469
date: Fri, 20 Nov 2026 12:27:07 GMT

{"items":[{"id":1,"userId":1,"title":"Welcome! Plan your first study session","status":"todo","priority":"low","createdAt":1795177627,"updatedAt":1795177627,"completedAt":null,"deletedAt":null,"attachment":null,"dueDate":null},{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"todo","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":null,"deletedAt":null,"attachment":null,"dueDate":"2026-12-01"}],"page":1,"limit":2,"total":2}
```

## GET /api/tasks/2

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/tasks/2' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 88b57b86-a0f3-4e32-8b87-35c4664dc3f1
vary: Accept-Encoding
content-length: 211
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"todo","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":null,"deletedAt":null,"attachment":null,"dueDate":"2026-12-01"}
```

## PUT /api/tasks/2

```sh
curl '-sS' '-i' '-X' 'PUT' 'http://127.0.0.1:34723/api/tasks/2' '-H' 'content-type: application/json' '-d' '{"title":"Prepare MIS 233 API demo","status":"done","priority":"high"}' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: eb9cdbc7-7373-4771-a73c-eeaababc19e0
vary: Accept-Encoding
content-length: 209
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"done","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":1795177627,"deletedAt":null,"attachment":null,"dueDate":null}
```

## POST /api/tasks/2/attachment

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/api/tasks/2/attachment' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc' '-F' 'file=@/tmp/43880b18263d9f29/uploads/demo.png;type=image/png'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: ceb35fc4-56a5-43ee-b16a-b237a152654c
vary: Accept-Encoding
content-length: 247
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"done","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":1795177627,"deletedAt":null,"attachment":"0f79faa1-7df3-4d83-8196-942a36efb1a2.png","dueDate":null}
```

## GET /api/tasks/2/attachment

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/tasks/2/attachment' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc' '-o' '/tmp/43880b18263d9f29/uploads/download.png' '-w' 'Downloaded image with status %{http_code}; content-type %{content_type}; bytes %{size_download}
'
```

```text
Downloaded image with status 200; content-type image/png; bytes 68
```

## GET /api/me/summary

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/me/summary' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: d1580d8c-b32f-4b81-997b-50abfe90ed6d
vary: Accept-Encoding
content-length: 35
date: Fri, 20 Nov 2026 12:27:07 GMT

{"todo":1,"in-progress":0,"done":1}
```

## DELETE /api/tasks/2

```sh
curl '-sS' '-i' '-X' 'DELETE' 'http://127.0.0.1:34723/api/tasks/2' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 98c6913b-6535-4c62-bab8-09bc7295776d
vary: Accept-Encoding
content-length: 11
date: Fri, 20 Nov 2026 12:27:07 GMT

{"ok":true}
```

## POST /api/tasks/2/restore

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/api/tasks/2/restore' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: 763d8931-2a67-4ad7-ba8e-cb31c887f1d6
vary: Accept-Encoding
content-length: 247
date: Fri, 20 Nov 2026 12:27:07 GMT

{"id":2,"userId":1,"title":"Prepare MIS 233 API demo","status":"done","priority":"high","createdAt":1795177627,"updatedAt":1795177627,"completedAt":1795177627,"deletedAt":null,"attachment":"0f79faa1-7df3-4d83-8196-942a36efb1a2.png","dueDate":null}
```

## GET /api/admin/users

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/admin/users' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 403 Forbidden
content-type: application/json
x-request-id: bc6ed0bd-d088-48ac-869e-1204e41e6f13
vary: Accept-Encoding
content-length: 84
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"forbidden","issues":[],"requestId":"bc6ed0bd-d088-48ac-869e-1204e41e6f13"}
```

## GET /api/admin/users

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/admin/users' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4iLCJzdWIiOiIzIiwiaXNzIjoidGFza3MtYXBpIiwiYXVkIjoidGFza3MtY2xpZW50IiwiaWF0IjoxNzk1MTc3NjI3LCJleHAiOjE3OTUxODEyMjd9.RQkD1F8OJWJI4pvOgQ8stkjWi1Wf_UlCS1WSE36CwnE'
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-request-id: e941cf36-f26b-4dee-abba-65d66cf4aa42
vary: Accept-Encoding
content-length: 158
date: Fri, 20 Nov 2026 12:27:07 GMT

[{"id":1,"email":"curl@example.com","role":"user"},{"id":2,"email":"student@demo.example","role":"user"},{"id":3,"email":"admin@demo.example","role":"admin"}]
```

## GET /api/tasks

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/tasks'
```

```text
HTTP/1.1 401 Unauthorized
content-type: application/json
x-request-id: 885ee102-4e56-4ba1-8ddc-293e87a3df95
vary: Accept-Encoding
content-length: 87
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"unauthorized","issues":[],"requestId":"885ee102-4e56-4ba1-8ddc-293e87a3df95"}
```

## GET /ws?token=invalid

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/ws?token=invalid'
```

```text
HTTP/1.1 401 Unauthorized
content-type: application/json
x-request-id: 74df2236-de17-4b40-985c-708a39ec2e15
vary: Accept-Encoding
content-length: 87
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"unauthorized","issues":[],"requestId":"74df2236-de17-4b40-985c-708a39ec2e15"}
```

## GET /api/tasks?limit=101

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/api/tasks?limit=101' '-H' 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidXNlciIsInN1YiI6IjEiLCJpc3MiOiJ0YXNrcy1hcGkiLCJhdWQiOiJ0YXNrcy1jbGllbnQiLCJpYXQiOjE3OTUxNzc2MjcsImV4cCI6MTc5NTE4MTIyN30.cjSXPXbaS_NwT5-QHwm9pY7nIzXwv8w4X8t-WThJqzc'
```

```text
HTTP/1.1 400 Bad Request
content-type: application/json
x-request-id: e322267c-8861-4530-aa96-dbb6e285e703
vary: Accept-Encoding
content-length: 159
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"validation failed","issues":[{"path":["limit"],"message":"Too big: expected number to be <=100"}],"requestId":"e322267c-8861-4530-aa96-dbb6e285e703"}
```

## POST /auth/register

```sh
curl '-sS' '-i' '-X' 'POST' 'http://127.0.0.1:34723/auth/register' '-H' 'content-type: application/json' '-d' '{"email":"curl@example.com","password":"CurlStudy123!"}'
```

```text
HTTP/1.1 409 Conflict
content-type: application/json
x-request-id: 640616ff-4bd3-41e1-a080-e6b61bc521cb
vary: Accept-Encoding
content-length: 99
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"email already registered","issues":[],"requestId":"640616ff-4bd3-41e1-a080-e6b61bc521cb"}
```

## GET /unknown

```sh
curl '-sS' '-i' '-X' 'GET' 'http://127.0.0.1:34723/unknown'
```

```text
HTTP/1.1 404 Not Found
content-type: application/json
x-request-id: a2bc26e0-6d8b-4b08-8d88-52cbca8b9636
vary: Accept-Encoding
content-length: 84
date: Fri, 20 Nov 2026 12:27:07 GMT

{"error":"not found","issues":[],"requestId":"a2bc26e0-6d8b-4b08-8d88-52cbca8b9636"}
```
