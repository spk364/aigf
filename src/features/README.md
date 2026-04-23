# features

FSD layer for user-facing actions (e.g. send-message, purchase-tokens, toggle-like).
Each feature contains the UI, logic, and API calls for one user action.
May import from `entities` and `shared`, but not from `widgets` or `pages`.
