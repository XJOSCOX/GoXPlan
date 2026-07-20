# Security and Backup

## Privacy Model

GoXPlan is local-first. Financial data is stored in the browser database on the user's device unless the user exports a backup file.

The app should be written as if it were a serious production product, even though the current storage is local.

## Storage

Current storage:

- SQL.js database
- Persisted through IndexedDB
- Theme/session preferences stored separately in browser storage

Primary financial records should stay in the SQL database:

- users
- debts
- financial accounts
- income
- payments
- negotiations
- payoff settings

## Sensitive Data

Do not store:

- Social Security numbers
- Full bank account numbers
- Full card numbers
- Bank login credentials
- Credit bureau login credentials
- Tax IDs

Use account nicknames, institutions, notes, and optional non-sensitive identifiers only.

## Authentication

Current authentication is local to the browser database.

Requirements:

- Store salted password hashes, not raw passwords.
- Enforce password complexity during signup.
- Keep errors clear without exposing sensitive internals.

## Backup

The backup export must include:

- financial accounts
- debts
- income
- negotiations
- payments
- payoff settings

Backup payload requirements:

- App name
- Version
- Export timestamp
- Table columns
- Table rows

## Restore Process

1. User selects a backup file.
2. App validates the file structure.
3. App shows backup date and record counts.
4. User selects merge or replace.
5. Replace mode requires a custom confirmation dialog.
6. App imports rows in dependency order.
7. App normalizes legacy-safe values.
8. App refreshes all visible workspace state.

## Error Handling

- Invalid backups must not overwrite existing records.
- Failed writes must show visible errors.
- Destructive actions must use custom confirmation dialogs.
- Import must reject unknown or malformed table data.
- Payment status and income account changes must be restorable on edit/delete.

## Future Security Work

- Optional encrypted backup files
- Data export password protection
- Stronger local session timeout controls
- Dedicated migration tests
