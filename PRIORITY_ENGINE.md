# Priority Engine

## Purpose

The priority engine ranks debts by urgency, risk, credit impact, and payoff opportunity. The result should be easy to understand and easy to override.

## Priority Levels

| Score | Level |
|---|---|
| 100+ | Emergency |
| 75-99 | Critical |
| 50-74 | High |
| 25-49 | Medium |
| Below 25 | Low |

## Current Scoring Intent

| Condition | Score |
|---|---:|
| Immediate asset or legal risk | +100 |
| Repossession, foreclosure, or shutoff risk | +100 |
| Reported collection | +50 |
| Pay-for-delete available | +40 |
| Open account that can still be preserved | +35 |
| Four or more months behind | +35 |
| Three months behind | +30 |
| One or two months behind | +20 |
| Settlement discount at least 70% | +25 |
| Settlement discount 50-69% | +20 |
| APR above 25% | +20 |
| APR 15-24.99% | +15 |
| APR 7-14.99% | +8 |
| Small balance below $500 | +5 |
| Not currently reported | -15 |
| Settled account | -1,000 |

## Obligation Logic

The app separates full debt balance from current obligation.

Current obligation should prefer:

1. Past due amount for past-due open debts.
2. Minimum payment for open accounts that need to stay current.
3. Settlement amount for settlement or collection payoff opportunities.
4. Full balance when no better current obligation exists.

Examples:

- Auto loan can have a full balance and a smaller past-due obligation.
- Best Buy can have a full balance and a smaller current amount to bring the account current.
- Closed debts can use settlement if available, otherwise the full payoff balance.

## Manual Control

The user can enter or adjust priority score and priority order. The UI should show the final priority level without forcing the user to understand every score detail.

## Payoff Allocation Rules

The payoff planner should:

1. Respect the user's saved budget and frequency.
2. Reserve emergency cash when entered.
3. Handle emergency obligations first.
4. Avoid paying more than the current obligation or settlement target.
5. Avoid completed or settled accounts unless the user edits the debt.
6. Warn when the plan exceeds safe cash.
7. Never mark payments as completed automatically.

## Future Improvements

- Show score explanations inside debt details.
- Allow manual priority locking.
- Add scenario comparisons.
- Add stronger timeline forecasting once more payment history exists.
