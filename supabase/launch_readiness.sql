-- Launch readiness migration notes
-- Safe rules: no drop table, no truncate, no existing data deletion.
-- Apply the schema hardening in Supabase SQL editor before final production test.

-- Required checks:
-- stores, plans, members, menus, reservation_slots, reservations, mail_logs, admin_users
-- reservations minimum columns: id, reservation_slot_id, member_id, status, created_by, created_at
-- optional cancellation columns: cancelled_at, cancelled_by

-- Important runtime requirements:
-- reservation_slot_id must point to reservation_slots.id
-- member_id must match auth.users.id
-- booked reservations only count toward remaining seats
-- cancelled reservations must not count toward remaining seats
-- mail_logs should record sent, skipped, or failed notification attempts
