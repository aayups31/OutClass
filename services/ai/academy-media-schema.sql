BEGIN;
CREATE TABLE IF NOT EXISTS outclass_platform.media_assets(
 id uuid PRIMARY KEY, author_id uuid NOT NULL, name text NOT NULL, kind text NOT NULL CHECK(kind IN('video','pdf','archive','code')),
 mime text NOT NULL, bytes integer NOT NULL CHECK(bytes>0 AND bytes<=83886080), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 complete boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outclass_platform.media_chunks(
 asset_id uuid NOT NULL REFERENCES outclass_platform.media_assets(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 349), data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 240000), PRIMARY KEY(asset_id,position)
);
CREATE TABLE IF NOT EXISTS outclass_platform.course_media(
 course_id uuid NOT NULL REFERENCES outclass_platform.courses(id), asset_id uuid NOT NULL REFERENCES outclass_platform.media_assets(id), PRIMARY KEY(course_id,asset_id)
);
ALTER TABLE outclass_platform.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.media_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.media_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.media_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_link_read ON outclass_platform.course_media;
CREATE POLICY media_link_read ON outclass_platform.course_media FOR SELECT TO outclass_api USING(
 EXISTS(SELECT 1 FROM outclass_platform.courses c WHERE c.id=course_id AND (c.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid OR (c.status='published' AND EXISTS(SELECT 1 FROM outclass_platform.enrollments e WHERE e.course_id=c.id AND e.user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid))))
);
DROP POLICY IF EXISTS media_link_insert ON outclass_platform.course_media;
CREATE POLICY media_link_insert ON outclass_platform.course_media FOR INSERT TO outclass_api WITH CHECK(EXISTS(SELECT 1 FROM outclass_platform.courses c WHERE c.id=course_id AND c.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid));
DROP POLICY IF EXISTS media_read ON outclass_platform.media_assets;
CREATE POLICY media_read ON outclass_platform.media_assets FOR SELECT TO outclass_api USING(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid OR (complete AND EXISTS(SELECT 1 FROM outclass_platform.course_media m WHERE m.asset_id=id)));
DROP POLICY IF EXISTS media_owner ON outclass_platform.media_assets;
CREATE POLICY media_owner ON outclass_platform.media_assets FOR INSERT TO outclass_api WITH CHECK(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
DROP POLICY IF EXISTS media_update ON outclass_platform.media_assets;
CREATE POLICY media_update ON outclass_platform.media_assets FOR UPDATE TO outclass_api USING(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid) WITH CHECK(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
DROP POLICY IF EXISTS chunk_read ON outclass_platform.media_chunks;
CREATE POLICY chunk_read ON outclass_platform.media_chunks FOR SELECT TO outclass_api USING(EXISTS(SELECT 1 FROM outclass_platform.media_assets a WHERE a.id=asset_id));
DROP POLICY IF EXISTS chunk_insert ON outclass_platform.media_chunks;
CREATE POLICY chunk_insert ON outclass_platform.media_chunks FOR INSERT TO outclass_api WITH CHECK(EXISTS(SELECT 1 FROM outclass_platform.media_assets a WHERE a.id=asset_id AND a.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid AND NOT a.complete));
REVOKE ALL ON outclass_platform.media_assets,outclass_platform.media_chunks,outclass_platform.course_media FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON outclass_platform.media_assets TO outclass_api;
GRANT SELECT,INSERT ON outclass_platform.media_chunks,outclass_platform.course_media TO outclass_api;
COMMIT;
