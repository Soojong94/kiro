-- students.school_id FK 를 CASCADE → RESTRICT.
-- 학교 삭제 시 학생 행이 같이 사라지지 않도록 (로그인 정보 보호).
-- super 어드민이 진짜로 학교 + 학생 모두 정리하고 싶을 땐 앱 레이어에서
-- 학생 먼저 명시적으로 정리한 뒤 학교 삭제하도록.

BEGIN;

ALTER TABLE students
  DROP CONSTRAINT students_school_id_fkey;

ALTER TABLE students
  ADD CONSTRAINT students_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

COMMIT;
