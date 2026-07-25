-- CONVITE VIRAL / correção descoberta na B.1a: REVOGAR OS CONVITES PENDENTES
-- AO REMOVER O ALUNO DO ROSTER.
--
-- O BURACO: coach_remove_student faz soft-delete (active=false), mas o convite
-- 'pending' daquele aluno continuava valendo. Nem get_invite_by_token nem
-- claim_invite filtram por members.active — então o aluno REMOVIDO que clicasse
-- no link antigo do WhatsApp ainda seria vinculado ao roster de onde acabou de
-- sair.
--
-- CORREÇÃO NA ORIGEM: quem remove o aluno revoga os convites dele, na MESMA
-- transação. Fechar aqui evita espalhar um filtro `active` por duas RPCs de
-- leitura/claim (que continuam intocadas) — e as duas JÁ tratam 'revoked' como
-- inválido, devolvendo a mensagem genérica.
--
-- 'revoked' e NÃO delete: o convite existiu, e isso é história (send_count,
-- created_at, a métrica do professor). O status é o registro de que foi cortado.
--
-- Esta migração SÓ ACRESCENTA a revogação — todos os guards e o soft-delete de
-- 20260724010000_coach_roster.sql seguem idênticos. NÃO toca
-- get_invite_by_token, claim_invite, coach_invite_student, coach_add_student,
-- coach_update_student, a jornada nem lib/scoring. Idempotente. Rodar no SQL
-- Editor após verificação.

-- GRANTS: `create or replace` PRESERVA os privilégios existentes da função e a
-- assinatura não muda (uuid), então o trio de 20260724010000 continua valendo —
-- não é reemitido aqui de propósito.
create or replace function public.coach_remove_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  v_n integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  -- SOFT-DELETE (inalterado): escopado ao próprio coach + role player.
  update public.members
     set active = false
   where id = p_student_id
     and coach_id = uid
     and role = 'player';

  -- QUANTAS LINHAS o soft-delete pegou é o que autoriza a revogação. Sem esta
  -- guarda, um p_student_id de OUTRO coach passaria batido pelo update de
  -- members (0 linhas, silencioso, por desenho) e ainda assim revogaria os
  -- convites de um aluno alheio.
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return;
  end if;

  -- Convites PENDENTES daquele aluno viram 'revoked'. O `coach_id = uid` é
  -- redundante depois da guarda acima — fica como cinto e suspensório, já que
  -- esta linha é a que mexe em dado de convite.
  --
  -- Só 'pending': 'registered' é história consumada (o aluno JÁ se cadastrou;
  -- reescrever isso apagaria a métrica do professor) e 'revoked' já está no
  -- lugar certo. O índice parcial invites_one_pending_per_student solta o slot
  -- do aluno, então um convite novo pode nascer se ele voltar ao roster.
  update public.invites
     set status = 'revoked'
   where student_member_id = p_student_id
     and coach_id = uid
     and status = 'pending'
     and kind = 'direct';
end;
$$;
