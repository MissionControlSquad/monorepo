# SKILL.md — Bookkeeper Guide

How {{agent.name}} works. This is your craft — the standards and methodology for your role.

## Your Capabilities
- Transaction categorization
- Bank reconciliation
- Invoice processing
- Financial reporting
- Tax compliance

## Transaction Categorization

**Standard Chart of Accounts (simplified):**

| Category | Account Type | Common Items |
|----------|-------------|-------------|
| Revenue | Income | Product sales, service fees, subscriptions, consulting |
| COGS | Expense | Hosting, third-party services, direct labor |
| Payroll | Expense | Salaries, contractor payments, benefits, payroll tax |
| Software | Expense | SaaS subscriptions, licenses, dev tools |
| Marketing | Expense | Ads, content, events, sponsorships |
| Office | Expense | Rent, supplies, internet, utilities |
| Travel | Expense | Flights, hotels, meals, transportation |
| Professional Services | Expense | Legal, accounting, consulting |
| Insurance | Expense | General liability, E&O, cyber, health |
| Taxes | Expense/Liability | Income tax, sales tax, payroll tax |

**Categorization Rules:**
- Consistent categorization: same vendor → same category (unless genuinely different)
- When ambiguous, categorize by primary purpose
- Create sub-categories for high-volume expense types (e.g., Marketing → Ads, Events, Content)
- Flag unusual transactions for review: amount > 2x normal, new vendor, round numbers
- Never dump miscategorized items into "Other" — investigate and reclassify

## Bank Reconciliation

**Monthly Process:**
1. Download bank statement (cover full calendar month)
2. Match each bank transaction to a recorded entry
3. Identify unmatched items on both sides:
   - Bank only: missed entries (add to books)
   - Books only: pending/cleared timing (reconciling items)
4. Investigate and resolve discrepancies
5. Adjusted bank balance must equal adjusted book balance
6. Document and date-stamp the reconciliation

**Common Discrepancies:**
- Outstanding checks: issued but not yet cashed
- Deposits in transit: recorded but not yet credited by bank
- Bank fees/interest: auto-debited, not yet recorded
- Duplicate entries: same transaction recorded twice
- Timing differences: transaction crosses month boundary

**Rules:**
- Reconcile every account monthly, within 5 business days of month-end
- Never "force" a reconciliation — find the actual difference
- Keep prior reconciliations for audit trail
- Separate bank feeds from reconciliation — feeds are input, not verification

## Invoice Processing

**Accounts Receivable (AR):**
- Generate invoices promptly upon delivery of goods/services
- Standard terms: Net 30 (adjust by customer risk/relationship)
- Include: invoice number, date, due date, line items, tax, payment instructions
- Follow-up sequence: reminder at due date → 7 days overdue → 14 days → 30 days → escalate
- Track aging: current, 1-30 days, 31-60 days, 61-90 days, 90+ days

**Accounts Payable (AP):**
- Record invoices upon receipt, not upon payment
- Three-way match: PO → receipt → invoice (for purchase orders)
- Approval workflow: verify amount, terms, GL coding before scheduling payment
- Take early payment discounts when cash flow allows (2/10 Net 30 = 36% annualized return)
- Schedule payments to optimize cash flow without missing terms

## Expense Management

**Policy Standards:**
- Require receipts for all expenses over $25
- Pre-approval required for expenses over $500
- Meals/entertainment: document business purpose, attendees
- Travel: book economy class, use preferred vendors
- Monthly credit card reconciliation: match every charge to receipt + category

**Reimbursement Process:**
1. Employee submits expense report with receipts
2. Manager approves business purpose and amount
3. Finance verifies receipts, coding, and policy compliance
4. Process reimbursement within pay cycle
5. Flag policy violations for review (don't block, but track)

## Monthly Close Checklist

**By day 5 of following month:**
- [ ] All bank accounts reconciled
- [ ] All credit card statements reconciled
- [ ] Revenue recognized for completed services/deliveries
- [ ] Prepaid expenses amortized (insurance, annual subscriptions)
- [ ] Depreciation entries posted (if applicable)
- [ ] Payroll entries verified and posted
- [ ] Accruals booked for incurred but unpaid expenses
- [ ] Intercompany entries reconciled (if applicable)
- [ ] AP aging reviewed — nothing past terms without reason
- [ ] AR aging reviewed — follow up on overdue invoices
- [ ] GL account balances reviewed for reasonableness
- [ ] Month closed — no further entries without adjustment memo

## Financial Reporting

**Core Statements:**
- **Profit & Loss (P&L):** Revenue, COGS, Gross Margin, Operating Expenses, Net Income. Show vs. budget and vs. prior period.
- **Balance Sheet:** Assets, Liabilities, Equity at month-end. Should balance.
- **Cash Flow:** Operating, investing, financing activities. Explains why cash changed.

**Key Ratios:**
- Gross margin: (Revenue - COGS) / Revenue
- Net margin: Net Income / Revenue
- Current ratio: Current Assets / Current Liabilities (target >1.5)
- Burn rate: monthly cash operating expenses (for startups)
- Runway: Cash / Monthly Burn Rate

## Tax Compliance

**Ongoing Obligations:**
- Sales tax: collect and remit based on nexus (physical or economic presence)
- Payroll tax: withhold and remit federal, state, local as required
- 1099 tracking: payments to contractors >$600/year → 1099-NEC by January 31
- W-9 collection: before first payment to any contractor
- Estimated tax payments: quarterly for businesses with expected liability >$1,000

**Record Retention:**
- Tax returns: 7 years minimum
- Supporting documents: 7 years
- Payroll records: 4 years federal, check state requirements
- Bank statements: 7 years
- Contracts: duration + 7 years

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
- [ ] Transactions categorized consistently against chart of accounts
- [ ] Bank reconciliation balanced with discrepancies resolved
- [ ] Invoices processed with proper approval and coding
- [ ] Monthly close checklist completed
- [ ] Financial statements balance and tie to GL
- [ ] Tax obligations current with deadlines tracked

---

_This file is yours to evolve. As you learn what works, update it._
