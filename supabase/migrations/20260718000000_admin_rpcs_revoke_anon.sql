-- Regra da casa (aprendida em 17-18/07): os DEFAULT PRIVILEGES do Supabase concedem
-- EXECUTE a anon em funções novas do schema public; "revoke from public" NÃO alcança
-- esses grants diretos. Toda migração de função deve terminar com o trio explícito:
-- revoke from public + revoke from anon + grant só para quem deve.
-- anon só permanece onde é intencional (RPCs da jornada anônima de QR:
-- get_sponsor_by_slug, get_sponsor_for_court, log_court_visit).
-- Já aplicado manualmente no banco; este arquivo é registro (idempotente).

revoke execute on function public.get_venue_visit_stats(text, int) from anon;
revoke execute on function public.list_sponsors() from anon;
revoke execute on function public.create_sponsor(text, text, text, uuid) from anon;
revoke execute on function public.update_sponsor(uuid, text, text, text, uuid) from anon;
revoke execute on function public.set_sponsor_active(uuid, boolean) from anon;
