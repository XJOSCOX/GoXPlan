# Roadmap

This roadmap reflects the current GoXPlan build, not the older first draft plan.

## Completed Foundation

- React, TypeScript, and Vite app shell
- Local SQL.js database persisted in IndexedDB
- Login and signup with validation
- Light and dark theme
- Onest font and neutral financial UI direction
- Sidebar navigation with route-aware links
- Responsive modal and page layouts
- Custom confirmation dialogs

## Completed Product Areas

### Debts

- Create, edit, delete, and list debts
- Priority score and priority level
- Full balance, settlement, past due, minimum payment, APR, dates, reason, and notes
- Current obligation logic for open, past-due, settlement, and closed debts
- Grouped debt list with pagination
- Notes tooltip behavior
- Seed/sync support for known starting debts

### Dashboard

- Current obligations
- Total full debt balance
- Possible savings
- Reported debt count
- Needs attention count
- Emergency focus with compact pagination
- Obligations by urgency
- Paid vs obligations summary
- Monthly trend placeholder for future real history

### Accounts and Income

- Bank, trading, and other accounts
- Trading account rules for copied/separate accounts
- Up to 5 trading accounts
- Payout limit and fee rules
- Income records with date, gross, fees, tax, net, allocation, and notes
- Income edit/delete rollback for linked account balances
- Trading payout single-account and all-account behavior

### Payments

- Record payments against debts
- Regular, minimum, catch-up, extra, settlement, and payoff types
- Principal, interest/fees, resulting balance, method, confirmation, date, and notes
- Debt status snapshot on payment save
- Safer edit and delete flows with custom confirmation

### Negotiations

- Negotiation records linked to debts
- Contact details, offer amounts, final agreement, dates, written agreement, pay-for-delete, follow-up, and notes

### Payoff Plan

- Budget and reserve
- Budget frequency
- Strategy selection
- Recommended payments
- Payoff order
- Cash check
- Save plan settings without changing balances

### Backup and Reports

- JSON backup export
- JSON backup import preview
- Merge and replace modes
- Backup validation and table normalization
- CSV exports for reporting views

## Next Milestone

Stabilize the current feature set before adding large new areas.

1. Add focused tests or scripted checks for:
   - income edit/delete rollback
   - payment edit/delete status restore
   - backup import validation
   - payoff budget frequency calculations
2. Turn dashboard placeholders into real timeline data.
3. Add better report summaries from existing data.
4. Improve mobile checks for debts, income, payments, and payoff.
5. Prepare a clean Git milestone commit.

## Later Features

- Debt detail page
- Credit report bureau tracking
- Goals
- Document references
- Reminder/calendar support
- Optional encrypted backups
- Optional cloud sync
- Scenario comparisons
