CREATE TABLE "sign_ins" (
	"email" text PRIMARY KEY NOT NULL,
	"sign_in_count" integer DEFAULT 0 NOT NULL,
	"last_sign_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
