CREATE TABLE IF NOT EXISTS outclass_service.learn_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 131072),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

REVOKE ALL ON outclass_service.learn_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON outclass_service.learn_progress TO outclass_api;
ALTER TABLE outclass_service.learn_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY outclass_service_only ON outclass_service.learn_progress
  FOR ALL TO outclass_api
  USING (user_id = nullif(current_setting('outclass.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('outclass.user_id', true), '')::uuid);
