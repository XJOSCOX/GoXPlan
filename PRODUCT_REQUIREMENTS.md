# Product Requirements

## Product Summary

GoXPlan is a personal financial recovery workspace for debts, accounts, income, payments, negotiations, payoff planning, reports, and backup.

The app focuses on practical debt decisions:

- What must be handled now?
- What is the current obligation versus the full balance?
- Which accounts can be settled?
- Which payments should happen next?
- How much cash is available after income, fees, and allocations?
- What changed over time?

## Target User

The primary user may have:

- Past-due accounts
- Open accounts that need to be brought current
- Closed accounts that need payoff or settlement
- Collection accounts
- Trading payouts or irregular income
- Pay-for-delete negotiations
- A goal of becoming stable enough for future credit or mortgage readiness

## Current Functional Scope

### Authentication

The app includes local user signup and login.

Required signup fields:

- First name
- Last name
- Username
- Email
- Password

Password requirements:

- 8 characters minimum
- Lowercase letter
- Uppercase letter
- Number
- Symbol

### Dashboard

The dashboard must show:

- Current obligations
- Full debt balance
- Possible settlement savings
- Reported debts
- Needs-attention count
- Emergency focus
- Obligations by urgency
- Paid versus obligations
- Monthly trend area for future history

### Debts

Debt records must support:

- Creditor
- Category
- Full balance
- Settlement amount
- Past due amount
- Minimum payment
- APR
- Months behind
- Tracked date
- Target date
- Settlement expiration date
- Status
- Reported flag
- Pay-for-delete flag
- Negotiable flag
- Priority score and level
- Reason
- Notes

The app must distinguish full debt balance from the amount that needs action now.

### Accounts

Accounts represent where money can come from or move through.

Supported types:

- Bank
- Trading
- Other

Trading accounts support:

- Max 5 accounts
- Copied or separate account profits
- Profit available
- Payout limit percent
- Fee percent
- Notes

### Income

Income records must support:

- Linked account
- Source description
- Source type
- Gross amount
- Fees
- Tax withholding
- Net amount
- Allocated amount
- Remaining amount
- Date
- Notes

Trading income must support:

- Single account payout
- All account payout
- Amount per account
- Total payout
- Payout limit validation
- Automatic fee calculation from account rules
- Account profit rollback on edit/delete

### Payments

Payment records must support:

- Linked debt
- Payment type
- Payment date
- Amount
- Interest and fees
- Principal
- Resulting balance
- Payment method
- Confirmation number
- Notes

Payment edit/delete must preserve safety by restoring previous debt status before applying changes.

### Negotiations

Negotiation records must support:

- Linked debt
- Contact date
- Contact method
- Representative
- Phone or portal
- Balance
- Current offer
- User offer
- Counter offer
- Final agreement
- Number of payments
- Due date
- Written agreement received
- Pay-for-delete included
- Offer expiration
- Follow-up date
- Status
- Notes

### Payoff Plan

Payoff planning must support:

- Budget amount
- Budget frequency
- Emergency reserve
- Strategy
- Recommended payments
- Payoff order
- Cash check
- Warnings when the plan exceeds safe cash

The payoff plan must not record payments automatically.

### Reports and Backup

The app must support:

- CSV exports for useful views
- JSON backup export
- JSON backup import preview
- Merge import
- Replace import
- Validation before import
- Custom confirmation before destructive restore

## Non-Functional Requirements

- Responsive at desktop, small monitor, and mobile widths
- Works locally after loading
- Clear error handling
- No native browser confirm dialogs
- Consistent formatting for money and dates
- SQL migrations keep older local data usable
- Build passes before milestone commits

## Out of Scope for Current Milestone

- Bank API connections
- Automated payments
- Credit bureau API connections
- Cloud sync
- Multi-user household sharing
- Native mobile apps
- Legal or debt settlement advice automation
