-- CONVITE VIRAL / FATIA B.1c: o CELULAR PRÉ-PREENCHIDO no cadastro do convidado.
--
-- POR QUE EXISTE: o convite chegou ao aluno PELO WHATSAPP daquele número — ele
-- já está validado na prática. Pré-preencher tira o campo mais chato do celular
-- do caminho ("leva 1 minuto" era a promessa da mensagem).
--
-- POR QUE NÃO VEM DA LEITURA PÚBLICA: get_invite_by_token é anônima, e telefone
-- NUNCA pode sair por ali (seria um "digite tokens, colha celulares"). Aqui o
-- chamador já está LOGADO e já é o DONO do member (o claim rodou) — a função só
-- devolve o que, na prática, é o próprio dado dele.
--
-- POR QUE NÃO É UMA POLICY EM members: dar SELECT do próprio member ao aluno
-- mexeria numa tabela sensível (hoje só super_admin e coach leem) para servir um
-- único campo de um único formulário. RPC aditiva tem raio de explosão zero.
--
-- Aditivo: 1 função NOVA. NÃO toca invites, members, get_invite_by_token,
-- claim_invite, coach_*, a jornada nem lib/scoring. Idempotente. Rodar no SQL
-- Editor após verificação.

create or replace function public.get_claimed_member_phone(p_token text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid     uuid := auth.uid();
  v_phone text;
begin
  -- Sem sessão não há "próprio member". Silencioso (null) — é leitura.
  if uid is null then
    return null;
  end if;

  if p_token is null or length(p_token) > 64 then
    return null;
  end if;

  -- A DUPLA CONDIÇÃO é a segurança inteira desta função: o token tem de bater
  -- E o member tem de já pertencer a quem está chamando (m.profile_id = uid,
  -- gravado pelo claim_invite). Token sozinho não revela telefone nenhum.
  select m.phone
    into v_phone
    from public.invites i
    join public.members m
      on m.id = i.student_member_id
   where i.token = p_token
     and i.kind = 'direct'
     and m.profile_id = uid
   limit 1;

  return v_phone;  -- null quando não casa: não distingue "sem telefone" de
                   -- "não é seu", e não precisa.
end;
$$;

-- GRANTS (regra da casa): exige sessão — anon nunca executa. Trio explícito,
-- porque os DEFAULT PRIVILEGES do Supabase concedem EXECUTE a anon em funções
-- novas do schema public e `revoke from public` não alcança esse grant direto.
revoke execute on function public.get_claimed_member_phone(text) from public;
revoke execute on function public.get_claimed_member_phone(text) from anon;
grant  execute on function public.get_claimed_member_phone(text) to authenticated;
