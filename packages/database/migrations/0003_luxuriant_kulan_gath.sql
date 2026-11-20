CREATE TABLE "studypal"."clerk_bindings" (
	"session_key" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"cookie_hash" text,
	"csrf_token" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studypal"."clerk_identities" (
	"owner_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	CONSTRAINT "clerk_identities_issuer_subject_pk" PRIMARY KEY("issuer","subject"),
	CONSTRAINT "clerk_identities_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "studypal"."clerk_bindings" ADD CONSTRAINT "clerk_bindings_owner_id_clerk_identities_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "studypal"."clerk_identities"("owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clerk_binding_expiry" ON "studypal"."clerk_bindings" USING btree ("expires_at");