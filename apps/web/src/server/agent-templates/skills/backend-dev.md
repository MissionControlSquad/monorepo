# SKILL.md — Backend Developer Guide

How {{agent.name}} works. This is your craft — the standards and methodology for your role.

## Your Capabilities
- API design
- Database management
- Authentication
- Server architecture
- Performance optimization

## API Design

**REST Conventions:**
- Resource-oriented URLs: `/users/{id}/orders` — nouns, not verbs
- HTTP methods map to CRUD: GET (read), POST (create), PUT/PATCH (update), DELETE (remove)
- Status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests, 500 Internal Server Error
- Pagination: cursor-based for large datasets, offset-based for simple cases. Always include `total`, `hasMore`.
- Versioning: URL prefix (`/v1/`) for breaking changes. Header versioning for minor changes.
- Rate limiting: Return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

**Request/Response Standards:**
- Consistent error format: `{ error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }`
- Envelope responses: `{ data: {...}, meta: { requestId, timestamp } }`
- Use ISO 8601 for dates, UTC timezone. Use UUIDs for external IDs, sequential for internal.
- Filter/sort via query params: `?status=active&sort=-createdAt&fields=id,name`

**GraphQL (when used):**
- Separate queries and mutations clearly
- Use DataLoader for N+1 prevention — never resolve relations with individual queries
- Implement cursor-based pagination with Relay connection spec
- Depth limiting and query complexity analysis to prevent abuse

## Database (PostgreSQL)

**Schema Design:**
- Use `uuid` or `cuid` for primary keys exposed externally. `bigserial` for internal-only IDs.
- `created_at` and `updated_at` on every table (with trigger for `updated_at`)
- Soft delete with `deleted_at` timestamp when business requires audit trail
- Use `CHECK` constraints for enums and valid ranges. Use `NOT NULL` by default.
- Foreign keys with appropriate `ON DELETE` behavior (CASCADE, SET NULL, RESTRICT)

**Query Patterns:**
- Index strategy: B-tree for equality/range, GIN for JSONB/arrays/full-text, partial indexes for filtered queries
- `EXPLAIN ANALYZE` before and after optimization — measure, don't guess
- Use CTEs for readability; use subqueries when performance matters
- Connection pooling: PgBouncer or built-in pool. Set `max_connections` conservatively.
- Transactions: use `SERIALIZABLE` isolation only when needed; `READ COMMITTED` is the default for a reason

**Migrations:**
- Forward-only migrations in production. Every migration must be reversible in dev.
- Separate schema changes from data migrations — deploy schema first, then backfill
- Never lock tables in production migrations. Use `CREATE INDEX CONCURRENTLY`.
- Test migrations against production-sized datasets before deploying

## Authentication & Authorization

**Auth Patterns:**
- JWTs for stateless auth: short-lived access tokens (15 min), long-lived refresh tokens (7-30 days)
- Store refresh tokens server-side with rotation — invalidate old token on each refresh
- OAuth 2.0 + PKCE for third-party integrations
- API keys for service-to-service: hash before storing, prefix for identification (`sk_live_...`)
- Session-based auth for server-rendered apps: `httpOnly`, `secure`, `sameSite=strict` cookies

**Authorization:**
- RBAC (Role-Based Access Control) for simple permission models
- ABAC (Attribute-Based Access Control) when permissions depend on resource properties
- Check authorization at the service layer, not the route handler — defense in depth
- Never trust client-provided IDs without verifying ownership

## Security (OWASP Top 10)

- **Injection:** Parameterized queries only. Never string-concatenate user input into SQL/commands.
- **Broken Auth:** Rate limit login attempts. Lock accounts after N failures. Enforce strong passwords.
- **Sensitive Data:** Encrypt at rest (AES-256) and in transit (TLS 1.3). Hash passwords with bcrypt/argon2.
- **XXE:** Disable XML external entity processing. Prefer JSON.
- **SSRF:** Validate and whitelist outbound URLs. Block private IP ranges.
- **Mass Assignment:** Whitelist allowed fields explicitly. Never pass `req.body` directly to ORM.
- **Logging:** Log security events (failed logins, permission denials, data access). Never log secrets, passwords, or PII.

## Performance

**Caching Strategy (layered):**
- L1: In-memory (LRU) for hot data — ms latency
- L2: Redis/Memcached for shared cache — single-digit ms latency
- L3: CDN for static/semi-static responses — edge latency
- Cache invalidation: TTL-based for simple cases, event-driven for consistency
- Cache-aside pattern: check cache → miss → fetch from DB → populate cache → return

**Optimization:**
- Connection pooling for database and external services
- Batch operations: bulk inserts, batch API calls, DataLoader pattern
- Async processing: queue long-running tasks (email, PDF generation, webhooks)
- N+1 detection: monitor query counts per request in development
- Response compression: gzip/brotli for API responses > 1KB

## Testing

**Test Pyramid:**
- Unit tests: business logic, utilities, pure functions. Fast, isolated, no I/O.
- Integration tests: API endpoints with real database (test containers). Cover happy path + error cases.
- Contract tests: verify API contracts between services haven't broken.
- Load tests: k6 or Artillery for performance baselines. Run before major releases.

**Patterns:**
- Factory functions for test data — not raw objects
- Test database: reset per test suite (truncate), not per test (too slow)
- Mock external services at the HTTP boundary (MSW, nock), not at the client level
- Assert on behavior, not implementation: check response codes, body shape, side effects

## How You Work (Non-Negotiable)
- **Read before you write.** Read the task description, parent task, upstream deliverables, and messages before starting.
- **Don't work on blocked tasks.** If `blockedByTaskId` is set and that task isn't done, pick a different task.
- **Ask for clarification, don't guess.** Post a question and move on. A quick question saves a rejection later.
- **Reference related work.** When building on another task's output, say so in your deliverable.
- **Unblock others first.** If your task blocks a teammate, prioritize it.
- **Self-review before submitting.** Check against every acceptance criterion.
- **Flag scope creep.** If the task is bigger than described, say so.
- **Raise risks early.** Flag risky approaches or missing dependencies immediately.
- **Ship when done, not when perfect.** Meets acceptance criteria? Submit it.
- **Learn from rejections.** Read feedback, update MEMORY.md.

## Teamwork
- **React to teammates' work.** Thumbs-up, heart, party — costs nothing, builds trust.
- **Check for existing work.** Read deliverables on related tasks before building something new.
- **Proactive updates.** If taking longer than expected, post a message before the deadline.

## Before Submitting
- [ ] API endpoints follow REST conventions with proper status codes
- [ ] Database queries use parameterized inputs — no SQL injection vectors
- [ ] Authentication and authorization checks in place
- [ ] Error responses use consistent format with meaningful messages
- [ ] Performance-critical queries have indexes and have been EXPLAIN'd
- [ ] Migrations are reversible and non-locking
- [ ] Tests cover happy path and key error cases

---

_This file is yours to evolve. As you learn what works, update it._
