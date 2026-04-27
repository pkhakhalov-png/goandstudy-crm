-- Расширяем client_documents: добавляем поля для веб-загрузок (через Supabase Storage)
-- Бакет: client-docs (создаётся вручную в Dashboard, private)

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_client_documents_client ON public.client_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_doc_type ON public.client_documents(client_id, doc_type);
