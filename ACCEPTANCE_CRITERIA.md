# Acceptance Criteria

## Authentication

- User can create an account with first name, last name, username, email, and password.
- Password requires at least 8 characters, lowercase, uppercase, number, and symbol.
- Login works with username or email.
- Invalid signup and login states show clear errors.
- Session state survives refresh until logout.

## Navigation and Theme

- Sidebar links update the browser route.
- Dashboard, debts, accounts, income, payments, negotiations, payoff, reports, and backup routes load without blank pages.
- Light and dark themes apply across the whole app.
- The app uses the same font across shell, pages, modals, and buttons.
- Layout remains usable on small monitors and mobile widths.

## Debts

- User can create, edit, and delete debts.
- Full balance and current obligation are handled separately.
- Auto loan style debts can keep a full balance while using a past-due obligation.
- Closed debts use settlement when available, otherwise full balance.
- Open current accounts can use minimum payment.
- Debt priority levels display as Emergency, Critical, High, Medium, or Low.
- Notes are visible without making the table too wide.
- Pagination shows 10 debts per page.
- Reported counts match reported debt records.

## Dashboard

- Current obligations match debt obligation logic.
- Full debt balance is shown separately.
- Possible savings are based on settlement opportunities.
- Emergency focus remains compact and paginated.
- Obligations by urgency does not duplicate emergency rows already shown in emergency focus.
- Charts or placeholders render without layout overflow.
- Dashboard stays readable on different screen sizes.

## Accounts

- User can create, edit, and delete bank, trading, and other accounts.
- Trading accounts can be copied or separate.
- Trading accounts support up to 5 sub-accounts.
- Trading account profit, payout limit, and fee are saved.
- User can transfer money between cash accounts.
- User can record dated balance adjustments for cash accounts.
- Editing or deleting an account movement restores previous cash balances.
- Account delete uses a custom confirmation dialog.
- Deleting an account unlinks income records without deleting the income history.

## Income

- User can create, edit, and delete income records.
- Income records require a date.
- Net equals gross minus fees and tax withholding.
- Remaining cash equals net minus allocated amount.
- Negative remaining cash shows a warning.
- Trading payouts support single-account and all-account scope.
- For all-account copied payouts, amount taken is per account and total payout equals amount per account times account count.
- Editing income restores the previous account balance/profit effect before applying the new values.
- Deleting income restores linked account balance/profit.
- Trading payout validation shows the selected payout limit.

## Payments

- User can record a payment linked to a debt.
- Payment date is required.
- Payment can use current due or full balance shortcuts.
- Payment preview values fit inside their boxes.
- Payment can update debt balance/status when confirmed.
- Editing a payment restores the previous debt snapshot before applying changes.
- Deleting a payment uses a custom confirmation dialog.

## Negotiations

- User can add, edit, and delete negotiation records.
- Records can include contact method, offers, due dates, expiration, follow-up, written agreement, and pay-for-delete.
- Negotiation history remains linked to a debt when available.

## Payoff Plan

- User can save a budget, reserve, strategy, and budget frequency.
- Plan recommendations do not change debt balances until payments are recorded.
- Budget over-allocation shows a warning.
- Recommended payments and payoff order use existing debts and current obligation logic.
- The payoff page does not duplicate the same information in multiple large areas.

## Backup and Reports

- JSON export includes accounts, account movements, debts, income, negotiations, payments, and payoff settings.
- Import validates backup shape before writing.
- Import preview shows record counts.
- Merge and replace modes work.
- Replace requires a custom confirmation dialog.
- CSV exports open in spreadsheet software.

## Quality

- `npm run build` passes.
- No native browser confirmation dialogs remain.
- No blocking console errors on main routes.
- Form errors are visible and understandable.
- Data writes are upsert-safe.
- Destructive actions require confirmation.
- Existing user data is not silently reset during app updates.
