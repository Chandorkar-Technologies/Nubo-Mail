-- Diagnostic SQL to check IMAP email flow
-- Run this against your database: psql postgresql://postgres:postgres@localhost:5432/zerodotemail -f diagnose-imap.sql

\echo '=== 1. Check IMAP Connections ==='
SELECT id, email, "provider_id", created_at
FROM mail0_connection
WHERE "provider_id" = 'imap';

\echo ''
\echo '=== 2. Check Email Count ==='
SELECT
    c.email as connection_email,
    COUNT(e.id) as email_count
FROM mail0_connection c
LEFT JOIN mail0_email e ON c.id = e.connection_id
WHERE c."provider_id" = 'imap'
GROUP BY c.id, c.email;

\echo ''
\echo '=== 3. Check Recent Emails ==='
SELECT
    id,
    subject,
    "thread_id",
    "connection_id",
    "internal_date",
    "is_read",
    "body_r2_key"
FROM mail0_email
ORDER BY "internal_date" DESC
LIMIT 10;

\echo ''
\echo '=== 4. Check Email Table Structure ==='
\d mail0_email
