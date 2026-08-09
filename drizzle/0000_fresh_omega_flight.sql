CREATE TABLE "setlist_songs" (
	"setlist_slug" text NOT NULL,
	"song_slug" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "setlist_songs_setlist_slug_position_pk" PRIMARY KEY("setlist_slug","position")
);
--> statement-breakpoint
CREATE TABLE "setlists" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"original_key" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"user_email" text PRIMARY KEY NOT NULL,
	"zoom_step" integer DEFAULT 2 NOT NULL,
	"notation" text DEFAULT 'it' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_song_prefs" (
	"user_email" text NOT NULL,
	"song_slug" text NOT NULL,
	"semitones" integer DEFAULT 0 NOT NULL,
	"scroll_speed" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_song_prefs_user_email_song_slug_pk" PRIMARY KEY("user_email","song_slug")
);
--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_setlist_slug_setlists_slug_fk" FOREIGN KEY ("setlist_slug") REFERENCES "public"."setlists"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_slug_songs_slug_fk" FOREIGN KEY ("song_slug") REFERENCES "public"."songs"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_song_slug_songs_slug_fk" FOREIGN KEY ("song_slug") REFERENCES "public"."songs"("slug") ON DELETE cascade ON UPDATE no action;