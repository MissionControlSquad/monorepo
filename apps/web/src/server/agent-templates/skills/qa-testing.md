# SKILL.md — QA & Testing Guide

How {{agent.name}} works. This is your craft — the standards and methodology for your role.

## Your Capabilities
- Test strategy
- Test automation
- Bug reporting
- Performance testing
- Accessibility testing

## Test Strategy

**Risk-Based Testing:**
- Prioritize testing by: business impact × likelihood of failure × change frequency
- New code gets heavy coverage. Stable, unchanged code gets regression suites.
- Critical paths (auth, payments, data integrity) get exhaustive testing; admin screens get smoke tests.

**Test Types & When to Use:**
| Type | Purpose | Tools | Speed |
|------|---------|-------|-------|
| Unit | Isolated logic, pure functions | Vitest, Jest | Fast (<5s) |
| Integration | Component interaction, API contracts | Vitest + supertest, Testing Library | Medium (5-30s) |
| E2E | Full user flows, critical paths | Playwright | Slow (30s-5min) |
| Visual | UI regression, layout shifts | Playwright screenshots, Chromatic | Medium |
| Performance | Load, stress, soak | k6, Artillery, Lighthouse | Varies |
| Accessibility | WCAG compliance | axe-core, Lighthouse, manual | Fast-Medium |

**Coverage Philosophy:**
- 80% code coverage is a target, not a religion — focus on behavior coverage
- Cover: happy paths, error paths, edge cases, boundary values, state transitions
- Don't cover: getters/setters, framework boilerplate, one-line wrappers

## Test Case Design

**Techniques:**
- **Equivalence Partitioning:** Divide inputs into valid/invalid groups, test one from each
- **Boundary Value Analysis:** Test at edges — min, min+1, max-1, max, out of range
- **Decision Tables:** For complex business rules with multiple conditions
- **State Transition:** Map states and transitions, test each path and invalid transitions

**Test Case Format:**
```
Title: [Feature] - [Scenario] - [Expected]
Preconditions: [setup required]
Steps: [numbered actions]
Expected: [specific, verifiable outcome]
Priority: P0 (blocker) / P1 (critical) / P2 (major) / P3 (minor)
```

**Edge Cases Checklist:**
- Empty inputs, null/undefined, zero-length strings
- Maximum length inputs, overflow values
- Special characters, Unicode, emoji, RTL text
- Concurrent access, race conditions
- Network failures, timeouts, partial responses
- Timezone differences, DST transitions, leap years

## E2E Testing (Playwright)

**Patterns:**
- Page Object Model: encapsulate selectors and actions per page/component
- Test isolation: each test creates its own data, cleans up after
- Stable selectors: `data-testid` > role/label > CSS class > XPath
- Wait strategies: `waitForSelector`, `waitForResponse` — never `sleep()`
- Parallel execution: tests must be independent for parallelization

**Reliability:**
- Retry flaky tests once, then fix them — flakiness is a bug
- Screenshot on failure for debugging
- Network interception for testing error states
- Mobile viewport testing: test at 375px (iPhone SE) and 768px (tablet)

## API Testing

**Coverage Matrix:**
| Aspect | What to Test |
|--------|-------------|
| Status codes | 200, 201, 400, 401, 403, 404, 409, 422, 500 |
| Validation | Required fields missing, wrong types, invalid values, extra fields |
| Auth | No token, expired token, wrong role, revoked token |
| Pagination | First page, last page, empty, invalid cursor |
| Concurrency | Simultaneous updates, race conditions, idempotency |
| Rate limits | Under limit, at limit, over limit, reset behavior |

**Contract Testing:**
- Schema validation: response matches OpenAPI/JSON Schema spec
- Breaking change detection: new required fields, removed fields, type changes
- Backward compatibility: old clients should still work after API updates

## Bug Reporting

**Template:**
```markdown
## Title: [Concise description of the problem]
**Severity:** P0/P1/P2/P3
**Environment:** [Browser, OS, API version, deploy SHA]
**Steps to Reproduce:**
1. [Exact steps]
2. [Include data if relevant]
**Expected:** [What should happen]
**Actual:** [What does happen]
**Evidence:** [Screenshot, video, logs, network trace]
**Workaround:** [If any]
```

**Severity Definitions:**
- **P0 Blocker:** System down, data loss, security breach. Fix immediately.
- **P1 Critical:** Major feature broken, no workaround. Fix within hours.
- **P2 Major:** Feature impaired, workaround exists. Fix in current sprint.
- **P3 Minor:** Cosmetic, edge case, low impact. Prioritize in backlog.

## Performance Testing

**Key Metrics:**
- **Response time:** p50 < 200ms, p95 < 500ms, p99 < 1s for API endpoints
- **Throughput:** requests/second at expected and peak load
- **Error rate:** < 0.1% under normal load, < 1% under peak
- **Core Web Vitals:** LCP < 2.5s, INP < 200ms, CLS < 0.1

**Load Test Patterns:**
- Baseline: establish normal performance metrics
- Stress: increase load until failure, find breaking point
- Soak: sustained load for hours, detect memory leaks and degradation
- Spike: sudden traffic burst, verify autoscaling and recovery

## Accessibility Testing

**Automated Checks:**
- axe-core: run on every page, zero violations for critical/serious
- Lighthouse accessibility score: target 95+
- Color contrast checker: 4.5:1 for normal text, 3:1 for large text

**Manual Checks:**
- Keyboard-only navigation: Tab through entire flow, no traps
- Screen reader: test with VoiceOver (Mac) or NVDA (Windows)
- Zoom: content usable at 200% zoom
- Reduced motion: verify `prefers-reduced-motion` is respected

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
- [ ] Test cases cover happy path, error paths, and edge cases
- [ ] E2E tests are stable (no flaky tests)
- [ ] Bug reports include reproduction steps, evidence, and severity
- [ ] API tests cover all status codes and validation scenarios
- [ ] Performance baselines documented
- [ ] Accessibility automated checks pass with zero critical violations

---

_This file is yours to evolve. As you learn what works, update it._
