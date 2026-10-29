-- Run this once in Neon SQL Editor if /api/subscriptions still returns:
-- response is too large (max is 67108864 bytes)

SELECT
  id,
  user_id,
  pg_size_pretty(pg_column_size(receipt_url)::bigint) AS receipt_url_size,
  pg_size_pretty(pg_column_size(receipt_history)::bigint) AS receipt_history_size,
  pg_size_pretty(pg_column_size(subjects)::bigint) AS subjects_size,
  pg_size_pretty(pg_column_size(grades)::bigint) AS grades_size,
  updated_at
FROM teacher_subscriptions
ORDER BY GREATEST(pg_column_size(receipt_url), pg_column_size(receipt_history), pg_column_size(subjects), pg_column_size(grades)) DESC
LIMIT 20;

UPDATE teacher_subscriptions
SET
  receipt_url = '',
  receipt_file_name = LEFT(COALESCE(receipt_file_name, 'receipt'), 180),
  receipt_file_type = ''
WHERE pg_column_size(receipt_url) > 4096
   OR receipt_url LIKE 'data:%';

UPDATE teacher_subscriptions
SET receipt_history = CASE
  WHEN COALESCE(receipt_url, '') <> '' THEN jsonb_build_array(jsonb_build_object(
    'grade', grade,
    'grades', CASE WHEN pg_column_size(grades) <= 1048576 THEN grades ELSE '[]'::jsonb END,
    'receiptUrl', receipt_url,
    'receiptFileName', receipt_file_name,
    'receiptFileType', receipt_file_type,
    'status', status,
    'createdAt', updated_at
  ))
  ELSE '[]'::jsonb
END
WHERE pg_column_size(receipt_history) > 1048576;

SELECT
  COUNT(*) FILTER (WHERE pg_column_size(receipt_url) > 4096 OR receipt_url LIKE 'data:%') AS oversized_receipt_url_rows,
  COUNT(*) FILTER (WHERE pg_column_size(receipt_history) > 1048576) AS oversized_receipt_history_rows,
  pg_size_pretty(MAX(pg_column_size(receipt_url))::bigint) AS largest_receipt_url,
  pg_size_pretty(MAX(pg_column_size(receipt_history))::bigint) AS largest_receipt_history
FROM teacher_subscriptions;
