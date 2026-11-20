CREATE TABLE "studypal"."recording_parts" (
	"owner_id" uuid NOT NULL,
	"recording_id" uuid NOT NULL,
	"part" integer NOT NULL,
	"hash" text NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "recording_parts_owner_id_recording_id_part_pk" PRIMARY KEY("owner_id","recording_id","part"),
	CONSTRAINT "recording_part_size" CHECK (octet_length("studypal"."recording_parts"."data") between 1 and 4194304)
);
--> statement-breakpoint
CREATE TABLE "studypal"."recordings" (
	"owner_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"set_id" bigint NOT NULL,
	"title" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	"transcript" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"audio_hash" text NOT NULL,
	"revision" integer NOT NULL,
	"next_part" integer DEFAULT 0 NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recordings_owner_id_id_pk" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "recording_size" CHECK ("studypal"."recordings"."size" between 1 and 214958080),
	CONSTRAINT "recording_revision" CHECK ("studypal"."recordings"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "studypal"."recording_parts" ADD CONSTRAINT "recording_parts_owner_id_recording_id_recordings_owner_id_id_fk" FOREIGN KEY ("owner_id","recording_id") REFERENCES "studypal"."recordings"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recordings_set" ON "studypal"."recordings" USING btree ("owner_id","set_id","id");