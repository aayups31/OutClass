export const COURSE_LESSON_LIMIT = 200;
export const COURSE_SOURCE_LIMIT = 40000;
export const COURSE_CHAR_LIMIT = 6000000;
// JSON escaping, pretty-printing and envelopes are transport overhead, not teaching content.
export const COURSE_IMPORT_CHAR_LIMIT = COURSE_CHAR_LIMIT * 8;
