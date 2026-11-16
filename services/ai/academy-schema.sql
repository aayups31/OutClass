-- Hosted free-course beta. No changes to existing AI subscription tables.
CREATE SCHEMA IF NOT EXISTS outclass_platform;
REVOKE ALL ON SCHEMA outclass_platform FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA outclass_platform TO outclass_api;
CREATE TABLE outclass_platform.courses (
 id uuid PRIMARY KEY, author_id uuid NOT NULL, lineage_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), title text NOT NULL,
 body jsonb NOT NULL CHECK(octet_length(body::text)<=400000), body_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('published','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(author_id,lineage_id,revision)
);
CREATE INDEX academy_catalog_idx ON outclass_platform.courses(status,created_at DESC);
CREATE INDEX academy_author_idx ON outclass_platform.courses(author_id,created_at DESC);
CREATE FUNCTION outclass_platform.keep_course_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.lineage_id IS DISTINCT FROM OLD.lineage_id OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body OR NEW.body_hash IS DISTINCT FROM OLD.body_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Released course snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION outclass_platform.keep_course_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER keep_course_snapshot BEFORE UPDATE ON outclass_platform.courses FOR EACH ROW EXECUTE FUNCTION outclass_platform.keep_course_snapshot();
CREATE TABLE outclass_platform.enrollments (
 user_id uuid NOT NULL,course_id uuid NOT NULL REFERENCES outclass_platform.courses(id),
 enrolled_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,course_id)
);
CREATE INDEX academy_enrollment_course_idx ON outclass_platform.enrollments(course_id);
CREATE TABLE outclass_platform.launch_grants (
 token_hash text PRIMARY KEY,user_id uuid NOT NULL,course_id uuid NOT NULL REFERENCES outclass_platform.courses(id),
 lesson_index integer NOT NULL CHECK(lesson_index>=0 AND lesson_index<200),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX academy_grant_user_idx ON outclass_platform.launch_grants(user_id,expires_at);
ALTER TABLE outclass_platform.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.courses FORCE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.launch_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE outclass_platform.launch_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY courses_read ON outclass_platform.courses FOR SELECT TO outclass_api
 USING(status='published' OR author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
CREATE POLICY courses_insert ON outclass_platform.courses FOR INSERT TO outclass_api
 WITH CHECK(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
CREATE POLICY courses_update ON outclass_platform.courses FOR UPDATE TO outclass_api
 USING(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid)
 WITH CHECK(author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
CREATE POLICY enrollment_read ON outclass_platform.enrollments FOR SELECT TO outclass_api
 USING(user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid OR EXISTS(SELECT 1 FROM outclass_platform.courses c WHERE c.id=course_id AND c.author_id=nullif(current_setting('outclass.actor_id',true),'')::uuid));
CREATE POLICY enrollment_insert ON outclass_platform.enrollments FOR INSERT TO outclass_api
 WITH CHECK(user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
CREATE POLICY grants_owner ON outclass_platform.launch_grants FOR ALL TO outclass_api
 USING(user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('outclass.actor_id',true),'')::uuid);
REVOKE ALL ON ALL TABLES IN SCHEMA outclass_platform FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON outclass_platform.courses TO outclass_api;
GRANT SELECT,INSERT ON outclass_platform.enrollments TO outclass_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON outclass_platform.launch_grants TO outclass_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA outclass_platform REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
