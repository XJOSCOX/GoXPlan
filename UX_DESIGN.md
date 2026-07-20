# UX and Visual Design

## Design Direction

GoXPlan should feel calm, focused, and financial. The current direction is neutral: dark gray, black, white, soft borders, subtle urgency colors, and no loud decorative theme.

The app should prioritize readability and decision-making over decoration.

## Global UI

- Same font across the full app.
- Light and dark themes.
- Left sidebar navigation on desktop.
- Compact page header with route title.
- Footer kept quiet and minimal.
- Cards should be used for real grouped content, not nested decoration.
- Buttons should be aligned, consistent, and easy to scan.

## Navigation

Current sidebar areas:

- Dashboard
- Debts
- Accounts
- Income
- Payments
- Negotiations
- Payoff plan
- Reports
- Backup

Routes should always reflect the selected page.

## Dashboard

The dashboard should stay high signal:

- Current obligations
- Emergency focus
- Obligations by urgency
- Total full balance
- Savings
- Reported count
- Needs attention count
- Paid vs obligations
- Monthly trend placeholder

Avoid repeating the same number in multiple large sections.

## Debts Page

The debts page should be compact and friendly.

Debt list behavior:

- Group by priority level.
- Show level in the group header, not repeatedly after every creditor name.
- Keep notes behind an icon/tooltip.
- Keep dates compact.
- Show 10 debts per page.
- Keep action buttons aligned.

Priority colors:

- Emergency: red
- Critical: orange
- High: gold
- Medium: green
- Low: gray

## Accounts Page

The accounts page should make the source of money clear.

Trading accounts must show:

- Profit per account or total profit
- Copied/separate mode
- Account count
- Payout limit
- Fee
- Notes

Delete should use a custom dialog, not the browser alert.

## Income Page

Income forms should clearly separate:

- Account/source
- Trading rules
- Amounts
- Date
- Notes

For trading payouts:

- If all accounts are selected, the amount field means amount per account.
- Total payout should be shown in preview.
- Payout limit warning should reference the selected scope.

## Payments Page

The payment modal should fit the screen and avoid overflow.

Payment preview boxes must:

- Keep currency inside the box.
- Show before/after clearly.
- Allow shortcuts for current due and full balance.

## Payoff Plan

The payoff plan should stay organized:

- Planner controls on the left.
- Recommended payments and payoff order on the right.
- Avoid repeating the same budget and next-payment info.
- Budget frequency should be visible and saved.

## Modals

- Modals should adapt to viewport height.
- Long forms can scroll inside the modal area.
- Close button stays visible.
- Cancel and save actions stay aligned.
- Confirm dialogs should use app styling.

## Accessibility

- Labels on inputs.
- Visible focus states.
- Color is not the only status signal.
- Touch targets should be comfortable.
- Text must not overflow buttons, cards, or preview boxes.
