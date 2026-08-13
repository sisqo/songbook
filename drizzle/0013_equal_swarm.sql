CREATE TABLE "sing_along_sessions" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"current_song_slug" text,
	"current_semitones" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sing_along_sessions_token" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_current_song_slug_songs_slug_fk" FOREIGN KEY ("current_song_slug") REFERENCES "public"."songs"("slug") ON DELETE set null ON UPDATE no action;