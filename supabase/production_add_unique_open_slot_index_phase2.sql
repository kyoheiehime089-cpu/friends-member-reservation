-- Optional safety index after deduplication has been completed.
-- Prevents duplicate open fixed slots per menu_id + starts_at.
create unique index concurrently if not exists reservation_slots_unique_open_menu_starts_at
  on reservation_slots (menu_id, starts_at)
  where is_open = true and menu_id is not null;
