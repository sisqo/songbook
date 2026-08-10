CREATE TABLE "canzonieri" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "canzoniere_slug" text;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_canzoniere_slug_canzonieri_slug_fk" FOREIGN KEY ("canzoniere_slug") REFERENCES "public"."canzonieri"("slug") ON DELETE restrict ON UPDATE no action;