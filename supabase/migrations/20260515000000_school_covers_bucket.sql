-- Bucket для обложек вузов (загружаются кураторами).
-- Public read — клиенты видят фото на странице вуза; write — только service role (server-side).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-covers',
  'school-covers',
  true,
  3 * 1024 * 1024,  -- 3 MB макс (после client-side compress должно быть 200-400 KB)
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
