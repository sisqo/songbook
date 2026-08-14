-- v3.2 — si entra da soli. Wholly additive: three new tables, no column touched on
-- anything that exists, so there is no post-deploy half to run later and no window
-- where the currently-deployed code disagrees with what is here — same shape as
-- 0015/0017, minus the transitional backfill 0015 needed.

-- A registration by email and password, waiting on the link in its verification email
-- (v3.2, PLAN.md point 3). No account, no credentials row, until that link is clicked —
-- keyed by email so registering again while one is still pending overwrites it with a
-- fresh token instead of piling up a second attempt for the same address.
CREATE TABLE "pending_registrations" (
	"email" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"verification_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- A password-reset link waiting to be used (v3.2, PLAN.md point 6). Keyed by email, same
-- reasoning as above: at most one live reset per address, and asking again overwrites
-- the row rather than leaving an older link usable alongside the new one.
CREATE TABLE "password_reset_tokens" (
	"email" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- A fixed-window rate limit, shared by registration, resend, password recovery and
-- login (v3.2, PLAN.md point 10). No foreign key: "key" is not always an email, it can
-- be an IP address or an action name folded in, depending on what is being throttled.
CREATE TABLE "rate_limit_hits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
