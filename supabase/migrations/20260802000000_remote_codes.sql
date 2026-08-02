-- PAREAMENTO DO CONTROLE REMOTO (/remoto) por CÓDIGO CURTO.
--
-- O PROBLEMA: a URL de editor tem 100+ caracteres (match + edit + view tokens).
-- Ninguém digita isso num relógio. O código curto é a ponte: o celular gera,
-- a pessoa digita seis dígitos no relógio, o relógio troca por tokens.
--
-- ⚠️ O CÓDIGO ENTREGA O `edit_token`, que é TUDO-OU-NADA: quem o tem marca
-- ponto, mas também pode dar reset e set_config. Por isso as três defesas
-- vivem AQUI, no servidor, e não no cliente (onde seriam decorativas):
--   1. EXPIRA em 10 minutos;
--   2. USO ÚNICO — consumido atomicamente no resolve;
--   3. UM ATIVO POR PARTIDA — gerar de novo invalida o anterior, mantendo a
--      superfície de adivinhação no mínimo.
--
-- SEIS DÍGITOS, e não quatro (a fatia falava em quatro): quatro são 10 mil
-- combinações, e não há rate limit no PostgREST. Um script chutando encontraria
-- um código ATIVO em segundos — e o estrago seria zerar o placar de alguém no
-- meio de uma partida real, exatamente durante a validação em campo. Seis
-- dígitos são um milhão de combinações e custam DOIS toques a mais no relógio.
-- A troca é barata demais para não fazer.
--
-- POR QUE `anon` NAS DUAS RPCs: o dono da partida pode estar ANÔNIMO (jogar sem
-- login é inviolável) e o relógio nunca tem sessão. A autorização aqui não é
-- identidade — é POSSE do `edit_token`, o mesmo modelo de capacidade que a sala
-- ao vivo já usa. É a exceção consciente à regra dos grants, como em
-- `log_court_visit` e `get_sponsor_by_slug`.
--
-- Aditivo: tabela NOVA + duas funções NOVAS. NÃO toca live_matches, matches,
-- court_visits, profiles nem qualquer RPC existente. Idempotente.
-- Rodar no SQL Editor do Supabase após verificação.

-- ===========================================================================
-- 1. TABELA public.remote_codes
-- ===========================================================================
create table if not exists public.remote_codes (
  code       text primary key,
  match_id   uuid not null,
  -- Os tokens que o controle precisa. Guardados aqui por poucos minutos: a
  -- linha é efêmera por desenho, e o resolve a consome.
  edit_token text not null,
  view_token text,
  -- Contexto de apresentação do controle (tema e modo de contagem). O modo
  -- REAL é relido do state a cada toque; isto é só para ele nascer certo.
  sport      text,
  theme      text,
  score_type text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- null = nunca usado. Preenchido no resolve, que é o que torna o uso único.
  used_at    timestamptz
);

-- Busca do resolve: por code (a PK) já é coberta. Este índice serve à limpeza
-- oportunista e à invalidação do código anterior da mesma partida.
create index if not exists remote_codes_match_idx
  on public.remote_codes (match_id, used_at, expires_at);

-- RLS ligado e ZERO policies: ninguém lê nem escreve a tabela direto. As duas
-- RPCs SECURITY DEFINER são a única porta — é o mesmo desenho de court_visits.
-- Sem isto, um `select * from remote_codes` do cliente anônimo entregaria TODOS
-- os edit_tokens ativos de uma vez.
alter table public.remote_codes enable row level security;
revoke all on public.remote_codes from anon;
revoke all on public.remote_codes from authenticated;

-- ===========================================================================
-- 2. GERAR — o celular pede um código para a partida que ele controla
-- ===========================================================================
-- A autorização é a POSSE do edit_token: quem o tem já pode marcar ponto por
-- RPC, então já pode delegar isso a um segundo aparelho. Não validamos contra
-- live_matches de propósito — a posse é a prova, e consultar aquela tabela
-- acoplaria esta migração ao schema dela.
create or replace function public.create_remote_code(
  p_match_id   uuid,
  p_edit_token text,
  p_sport      text default null,
  p_theme      text default null,
  p_score_type text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code text;
  v_tentativas int := 0;
begin
  -- GUARDAS DE TAMANHO: os parâmetros vêm do cliente. Nada aqui precisa ser
  -- grande, e um limite barato evita lixo na tabela.
  if p_edit_token is null or length(p_edit_token) < 8 or length(p_edit_token) > 200 then
    raise exception 'edit_token inválido';
  end if;
  if p_match_id is null then
    raise exception 'match_id obrigatório';
  end if;

  -- LIMPEZA OPORTUNISTA: sem cron, a tabela se limpa no uso. Só linhas mortas.
  delete from public.remote_codes where expires_at < now() - interval '1 hour';

  -- UM ATIVO POR PARTIDA: gerar um novo mata o anterior. Menos códigos vivos =
  -- menos chance de um chute acertar algum.
  delete from public.remote_codes
   where match_id = p_match_id and used_at is null;

  -- Código de 6 dígitos, com zeros à esquerda preservados (é texto).
  -- Até 12 tentativas em caso de colisão — com 1 milhão de combinações e
  -- poucos códigos vivos, a primeira quase sempre passa.
  loop
    v_tentativas := v_tentativas + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.remote_codes (
        code, match_id, edit_token, view_token, sport, theme, score_type, expires_at
      ) values (
        v_code, p_match_id, p_edit_token, null,
        left(coalesce(p_sport, ''), 40),
        left(coalesce(p_theme, ''), 40),
        left(coalesce(p_score_type, ''), 20),
        now() + interval '10 minutes'
      );
      return v_code;
    exception when unique_violation then
      if v_tentativas >= 12 then
        raise exception 'não foi possível gerar um código';
      end if;
    end;
  end loop;
end;
$$;

-- ===========================================================================
-- 3. RESOLVER — o relógio troca o código pelos tokens
-- ===========================================================================
-- O UPDATE ... WHERE used_at is null é o que torna o uso ÚNICO de forma ATÔMICA:
-- duas chamadas simultâneas com o mesmo código, só uma atualiza a linha e
-- devolve dados. A outra sai de mãos vazias. Fazer isso em dois passos (ler,
-- depois marcar) abriria justamente a janela que o uso único existe para fechar.
create or replace function public.resolve_remote_code(p_code text)
returns table(
  match_id   uuid,
  edit_token text,
  sport      text,
  theme      text,
  score_type text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_code is null or length(p_code) <> 6 then
    return; -- vazio: o cliente traduz em "código inválido"
  end if;

  return query
  update public.remote_codes rc
     set used_at = now()
   where rc.code = p_code
     and rc.used_at is null
     and rc.expires_at > now()
  returning rc.match_id, rc.edit_token, rc.sport, rc.theme, rc.score_type;
end;
$$;

-- ===========================================================================
-- 4. GRANTS
-- ===========================================================================
-- `anon` nas DUAS é deliberado e documentado no topo: o dono pode estar anônimo
-- e o relógio nunca tem sessão. A autorização é posse de token, não identidade.
revoke execute on function public.create_remote_code(uuid, text, text, text, text) from public;
revoke execute on function public.resolve_remote_code(text) from public;
grant execute on function public.create_remote_code(uuid, text, text, text, text)
  to anon, authenticated;
grant execute on function public.resolve_remote_code(text)
  to anon, authenticated;
