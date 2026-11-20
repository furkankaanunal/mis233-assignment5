# Actual curl requests and responses

Captured 2026-11-20T12:27:07.348Z with Deno 2.6.3. The database was temporary. Demo credentials and the local test JWT below are disposable.

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
