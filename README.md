# GoXPlan

GoXPlan is a personal debt command center built with React, TypeScript, Vite, and SQL.js. It helps track debts, accounts, income, payments, negotiations, payoff planning, reports, and backups in one organized workspace.

The app is designed for real payoff decisions: what needs attention now, what can be negotiated, how much cash is available, and which payment should happen next.

## Current Status

The current local build includes:

- Login and signup with password validation
- Light and dark theme support
- Dashboard with current obligations, priority exposure, emergency focus, and progress placeholders
- Debt register with priority levels, dates, obligations, notes, pagination, editing, and deleting
- Accounts page for bank, trading, and other money sources
- Income page with trading payout rules, destination deposits, fees, dates, edit rollback, and delete rollback
- Payments page with paid-from accounts plus balance/status snapshots for safer editing and deleting
- Negotiations page for offers, follow-ups, agreements, and pay-for-delete notes
- Payoff plan page with budget frequency, reserve, recommendations, and payoff order
- Reports page and CSV exports
- Backup page with JSON export, import preview, merge, replace, and safety checks
- Custom confirmation dialogs for destructive or risky actions

## Technology

- React 19
- TypeScript
- Vite
- SQL.js persisted in IndexedDB
- Lucide icons
- Onest font
- Local-first data storage

## Local Development

```bash
npm install
npm run dev
```

Open the app at:

```text
http://127.0.0.1:5173
```

Build:

```bash
npm run build
```

## Main App Areas

- Dashboard
- Debts
- Accounts
- Income
- Payments
- Negotiations
- Payoff plan
- Reports
- Backup

## Product Principles

- Keep financial data private and local unless the user exports it.
- Show current obligations separately from full debt balances.
- Make risky actions explicit with clear confirmation.
- Use dates everywhere important activity is recorded.
- Prefer explainable payoff recommendations over hidden automation.
- Keep the interface calm, neutral, and practical.

## Documentation

- `PRODUCT_REQUIREMENTS.md` - current product scope
- `DATA_MODEL.md` - local SQL-backed records and relationships
- `PRIORITY_ENGINE.md` - debt priority scoring and levels
- `ROADMAP.md` - completed and next milestones
- `SECURITY_AND_BACKUP.md` - privacy, backup, and restore behavior
- `UX_DESIGN.md` - layout and interaction direction
- `ACCEPTANCE_CRITERIA.md` - quality checklist

## License

Private project. Add a formal license only if the application will be published or sold.
