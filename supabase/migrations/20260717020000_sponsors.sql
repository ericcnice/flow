-- Peça A: tabela public.sponsors + migração da resolução por slug para ela.
--
-- 100% banco: a jornada de QR NÃO muda. get_sponsor_by_slug mantém assinatura e
-- formato de retorno idênticos; só troca a FONTE (members → sponsors). Os três
-- pontos de consumo do cliente (abertura, tela de fim, /placar) continuam
-- chamando a mesma RPC e recebendo as mesmas colunas.
--
-- Idempotente: create if not exists / on conflict do nothing / create or replace.
-- Rodar no SQL Editor do Supabase após verificação.

-- 1. Patrocinador como ENTIDADE própria. Pessoas (coach) apontam para o member;
--    marcas (ex.: Coca-Cola, na peça B) ficam com member_id null. O slug é
--    canônico e definitivo: um patrocinador = um slug (é o que viaja na URL e
--    no cache do cliente, então não pode variar).
create table if not exists public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  logo_url   text not null,
  -- on delete set null: apagar a pessoa no roster não apaga o patrocinador —
  -- ele vira uma "marca solta" com o logo preservado, em vez de sumir.
  member_id  uuid references public.members(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS ligado e ZERO policies: ninguém lê nem escreve direto. O único acesso é
-- via get_sponsor_by_slug (SECURITY DEFINER), mesmo padrão de court_visits.
alter table public.sponsors enable row level security;

-- 2. Seed a partir dos patrocinadores que hoje vivem em members. Amarrado por
--    SLUG (não por uuid hardcoded): o mesmo slug que a jornada já usa é a chave
--    estável, e member_id vem junto para preservar o vínculo com a pessoa.
--    on conflict do nothing: reexecutar não duplica nem sobrescreve.
insert into public.sponsors (slug, name, logo_url, member_id)
select m.slug, m.name, m.sponsor_logo_url, m.id
from public.members m
where m.slug in ('nicholasventura', 'anazannoni')
  and m.sponsor_logo_url is not null
on conflict (slug) do nothing;

-- 3. Reescreve get_sponsor_by_slug para ler de sponsors. Assinatura e retorno
--    IDÊNTICOS ao atual — TABLE(name, slug, sponsor_logo_url) — então nenhum
--    consumidor precisa mudar. logo_url da tabela nova sai com ALIAS
--    sponsor_logo_url para casar o nome de coluna que o cliente já espera.
--
--    Mantém plpgsql, SECURITY DEFINER e SET search_path TO '' (vazio): por isso
--    todos os nomes são qualificados com public.*. CREATE OR REPLACE preserva as
--    ACLs existentes — nenhum grant novo é adicionado.
create or replace function public.get_sponsor_by_slug(p_slug text)
returns table(name text, slug text, sponsor_logo_url text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
    select s.name, s.slug, s.logo_url as sponsor_logo_url
    from public.sponsors s
    where s.slug = p_slug
      and s.active = true;
end;
$$;
