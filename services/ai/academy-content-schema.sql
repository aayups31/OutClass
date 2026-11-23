BEGIN;
CREATE TABLE IF NOT EXISTS outclass_platform.course_lesson_content(
 course_id uuid NOT NULL REFERENCES outclass_platform.courses(id), position integer NOT NULL CHECK(position BETWEEN 0 AND 199),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'), body jsonb NOT NULL CHECK(octet_length(body::text)<=1000000), PRIMARY KEY(course_id,position)
);
ALTER TABLE outclass_platform.course_lesson_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.course_lesson_content FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lesson_read ON outclass_platform.course_lesson_content;
CREATE POLICY lesson_read ON outclass_platform.course_lesson_content FOR SELECT TO outclass_api USING(EXISTS(
 SELECT 1 FROM outclass_platform.courses c WHERE c.id=course_id AND (c.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid OR (c.status='published' AND EXISTS(SELECT 1 FROM outclass_platform.enrollments e WHERE e.course_id=c.id AND e.user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid)))
));
DROP POLICY IF EXISTS lesson_insert ON outclass_platform.course_lesson_content;
CREATE POLICY lesson_insert ON outclass_platform.course_lesson_content FOR INSERT TO outclass_api WITH CHECK(EXISTS(SELECT 1 FROM outclass_platform.courses c WHERE c.id=course_id AND c.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid));
REVOKE ALL ON outclass_platform.course_lesson_content FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON outclass_platform.course_lesson_content TO outclass_api;
COMMIT;
