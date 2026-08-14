-- v3.1 — niente più ospiti. No additive half precedes this one, unlike 0015/0016: there
-- is nothing to add before the deploy, only a table to take away once it is. Apply only
-- after the deploy whose code no longer reads or writes `members` — `isAdmitted` and
-- `roleOf` by then decide everything from `accounts` alone (see `PLAN.md`, *v3.1 — niente
-- più ospiti*, point 4) — same rule 0016 followed for `builds`, just with no counterpart
-- to run early.
DROP TABLE "members";
