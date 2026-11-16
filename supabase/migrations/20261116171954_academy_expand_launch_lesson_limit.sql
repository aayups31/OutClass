-- Keep Academy launch links aligned with the 200-lesson course limit.
SET LOCAL lock_timeout = '5s';
DO $migration$
BEGIN
  IF to_regclass('outclass_platform.launch_grants') IS NOT NULL THEN
    ALTER TABLE outclass_platform.launch_grants
      DROP CONSTRAINT IF EXISTS launch_grants_lesson_index_check,
      ADD CONSTRAINT launch_grants_lesson_index_check
        CHECK (lesson_index >= 0 AND lesson_index < 200);
  END IF;
END
$migration$;
