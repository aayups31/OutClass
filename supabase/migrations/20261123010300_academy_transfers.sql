BEGIN;
CREATE TABLE IF NOT EXISTS outclass_platform.course_transfers(
 id uuid PRIMARY KEY, author_id uuid NOT NULL, bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 48000000),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), receipt jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE TABLE IF NOT EXISTS outclass_platform.course_transfer_chunks(
 transfer_id uuid NOT NULL REFERENCES outclass_platform.course_transfers(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 199), data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 240000), PRIMARY KEY(transfer_id,position)
);
CREATE INDEX IF NOT EXISTS course_transfer_owner ON outclass_platform.course_transfers(author_id,expires_at);
ALTER TABLE outclass_platform.courses DROP CONSTRAINT IF EXISTS courses_body_check;
ALTER TABLE outclass_platform.courses ADD CONSTRAINT courses_body_check CHECK(octet_length(body::text)<=2000000);
ALTER TABLE outclass_platform.course_lesson_content DROP CONSTRAINT IF EXISTS course_lesson_content_body_check;
ALTER TABLE outclass_platform.course_lesson_content ADD CONSTRAINT course_lesson_content_body_check CHECK(octet_length(body::text)<=24000000);
ALTER TABLE outclass_platform.assessment_banks DROP CONSTRAINT IF EXISTS assessment_banks_keys_check;
ALTER TABLE outclass_platform.assessment_banks ADD CONSTRAINT assessment_banks_keys_check CHECK(octet_length(keys::text)<=16000000);
ALTER TABLE outclass_platform.course_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_transfer_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_transfer_chunks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transfer_owner ON outclass_platform.course_transfers;
CREATE POLICY transfer_owner ON outclass_platform.course_transfers FOR ALL TO outclass_api USING(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid) WITH CHECK(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
DROP POLICY IF EXISTS transfer_chunk_owner ON outclass_platform.course_transfer_chunks;
CREATE POLICY transfer_chunk_owner ON outclass_platform.course_transfer_chunks FOR ALL TO outclass_api USING(EXISTS(SELECT 1 FROM outclass_platform.course_transfers t WHERE t.id=transfer_id AND t.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid)) WITH CHECK(EXISTS(SELECT 1 FROM outclass_platform.course_transfers t WHERE t.id=transfer_id AND t.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid AND t.receipt IS NULL));
REVOKE ALL ON outclass_platform.course_transfers,outclass_platform.course_transfer_chunks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON outclass_platform.course_transfers,outclass_platform.course_transfer_chunks TO outclass_api;
COMMIT;
