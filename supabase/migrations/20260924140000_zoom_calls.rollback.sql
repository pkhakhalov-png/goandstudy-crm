-- Откат интеграции Zoom.
--
-- Порядок обратный выкатке: сначала выключить флаги (создание встреч и приём
-- записей прекращаются в ту же секунду), убедиться, что тихо, и только потом
-- снимать схему. Файлы записей в Supabase Storage эта миграция не трогает —
-- они удаляются отдельно и осознанно.
begin;
drop table if exists public.call_recordings;
drop index if exists public.bookings_zoom_meeting_uniq;
alter table public.bookings
  drop column if exists zoom_meeting_id,
  drop column if exists zoom_join_url,
  drop column if exists zoom_host_email;
delete from public.rop_settings where key like 'calls_%';
commit;
