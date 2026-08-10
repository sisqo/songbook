CREATE TABLE "builds" (
	"id" text PRIMARY KEY DEFAULT 'last' NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
