---
schema_version: 0.1.0
id: spec.it3.loop-capacity
kind: specification
title: Capacity, periods and priority reserves
purpose: Protect scarce account and project capacity before starting paid work.
parent: spec.it3.active-project-loop
maturity: specified
lifecycle: proposed
details:
  acceptance_criteria:
    - id: CAP-01
      criterion: Every applicable provider window and local budget is checked in its own unit and period.
      evidence_method: Replay an exhausted weekly window alongside a fresh session reset, then repeat with a stale observation and an unpriced run.
    - id: CAP-02
      criterion: Background steps cannot consume a protected reserve or double-spend capacity shared by two projects.
      evidence_method: Admit two concurrent steps whose combined reservations exceed the spendable balance. Only the fitting reservation succeeds.
---

# Capacity, periods and priority reserves

For each candidate account and model, show every applicable window together. Each row carries its scope, unit, remaining amount or percentage, reset time when available, and observation timestamp. An account might show **68% left in the session, resets in 2 hours**, alongside **12% left this week, resets Friday**. Both apply to the next start.

| Capacity           | How the manager uses it                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider allowance | Match the account and model to all applicable provider windows. Honor an explicit zero spending cap. Keep subscription percentages in their reported units.                      |
| Operator budget    | Apply limits at account, workspace, project, task and attempt scopes as configured. Keep dollars, tokens, turns and concurrency separate. Record period boundaries and timezone. |
| Priority reserve   | Protect a configured share for higher-priority work. A background task can use only what remains above that floor in every applicable window.                                    |

**Before starting.** For an absolute local limit, spendable capacity equals the period cap minus settled usage, outstanding reservations and the reserve protected from this priority. Include retries, competing attempts and subagents under their parent limits. Charge each real run once per applicable scope. If several hosts share an account, coordinate reservations through one authority or allocate disjoint allowances.

**While running.** Enforce a hard limit only where the execution path can bound consumption, including output and additional calls. Otherwise label the estimate and its possible overrun. A job requiring a hard ceiling waits for a route that can enforce it. External account use can change a provider reading between observations.

**When to wait.** A failed probe or an unknown reset remains visible with the last successful reading. If a binding limit cannot be evaluated, try another permitted route or wait for fresh evidence. After a reset, refresh the affected window and recheck the others. An ambiguous or unpriced charge stays pending until reconciled.

**Example.** With the weekly account at 12% remaining and a hypothetical 15% reserve for urgent work, background tasks wait on that account. A session reset in two hours does not release the weekly reserve. The operator can see the blocking window without reading a chat.

[Automatic work in active projects](active-project-loop.md)
