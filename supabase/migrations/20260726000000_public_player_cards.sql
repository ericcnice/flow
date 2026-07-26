-- IDENTIDADE NO PLACAR / FATIA 1b.1: o CARTÃO PÚBLICO DO JOGADOR.
--
-- A 1a fez o profile_id de cada slot VIAJAR no state do jogo (playerIds), e o
-- tick verde já aparece nos outros aparelhos e na transmissão. Falta a FOTO —
-- e nenhum aparelho consegue lê-la: public.profiles tem RLS SELF-SELECT
-- ("profiles self select", 20260722020000_identity_base.sql), então ninguém lê o
-- profile de outra pessoa. Esta RPC é a única porta, com retorno escolhido a
-- dedo.
--
-- ⚠️ CONSEQUÊNCIA A REGISTRAR: o profile_id passa a ser SEMIPÚBLICO. Desde a 1a
-- ele viaja no state e alcança qualquer um com o link de transmissão; agora ele
-- também "abre" nome + foto. Isso é aceitável porque o retorno é exatamente o
-- que a pessoa JÁ exibe no placar (o nome, que viaja como string em `players`)
-- mais a foto que ELA escolheu subir. Mas fica o alerta para o futuro: NINGUÉM
-- pode tratar profile_id como segredo, chave de autorização ou prova de
-- identidade em outro lugar do sistema. Ele não é, a partir daqui.
--
-- POR QUE EM LOTE (uuid[]): um jogo tem até 4 slots. Uma RPC por id seriam 4
-- viagens para desenhar uma pílula.
--
-- Aditivo: 1 função NOVA, read-only, não toca tabela nenhuma. NÃO mexe em
-- profiles, players/state, matches, a jornada nem lib/scoring. Idempotente.
-- Rodar no SQL Editor após verificação.

create or replace function public.get_public_player_cards(p_ids uuid[])
returns table (
  id           uuid,
  display_name text,
  avatar_url   text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Guardas de porta pública. Leitura falha VAZIA, nunca com raise.
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  -- TETO DE LOTE. Não protege contra adivinhação (o profile_id é UUID v4, 122
  -- bits — varrer é inviável); protege contra COLHEITA EM MASSA de uma lista de
  -- ids já conhecidos numa chamada só. 8 cobre com folga os 4 slots.
  if array_length(p_ids, 1) > 8 then
    return;
  end if;

  return query
  select p.id, p.name, p.avatar_url
    from public.profiles p
   where p.id = any(p_ids)
     -- CONTA EXCLUÍDA não retorna LINHA (em vez de retornar linha com campos
     -- nulos): o cliente já trata "sem cartão" como o caso normal — é o
     -- anônimo — então o fallback para a string de `players` acontece sozinho,
     -- sem código extra. E o nome anonimizado nunca chega à tela.
     and p.deleted_at is null;
end;
$$;

-- ===========================================================================
-- GRANTS — anon PRECISA, e isto NÃO é esquecimento da regra da casa
-- ===========================================================================
-- A regra geral do projeto é `revoke ... from anon` em toda função nova. Aqui
-- ela NÃO se aplica, de propósito: o espectador no /placar e o aparelho anônimo
-- que entrou pelo QR são EXATAMENTE quem precisa ver a foto — é para eles que a
-- vitrine existe (o jogador com carteirinha aparece com foto ao lado do
-- "Jogador 2" cinza; a assimetria é o convite). Mesmo padrão de
-- get_sponsor_by_slug e get_invite_by_token: RPC de jornada pública.
--
-- Quem for "corrigir" isto adicionando `revoke from anon` desliga a fatia
-- inteira sem quebrar nada visivelmente — a foto só some.
revoke execute on function public.get_public_player_cards(uuid[]) from public;
grant  execute on function public.get_public_player_cards(uuid[]) to anon;
grant  execute on function public.get_public_player_cards(uuid[]) to authenticated;
