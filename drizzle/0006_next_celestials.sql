CREATE TABLE "members" (
	"email" text PRIMARY KEY NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
