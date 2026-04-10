-- Sync sequences after data import
SELECT setval('clients_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.clients));
SELECT setval('payments_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.payments));
