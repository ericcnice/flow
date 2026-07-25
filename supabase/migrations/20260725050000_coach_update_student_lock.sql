-- SOBERANIA DE DADOS / FATIA 2: a TRAVA NO BANCO. O professor não escreve mais
-- nome/celular de aluno CADASTRADO.
--
-- A REGRA: quem tem conta é dono da própria identidade. members.profile_id é a
-- fronteira —
--   profile_id NULL     → aluno solto: nome/celular são ANOTAÇÃO do professor,
--                         totalmente editáveis (comportamento de hoje, intacto);
--   profile_id PREENCHIDO → o aluno declarou quem é no profile dele: nome e
--                         celular ficam CONGELADOS aqui, e a Fatia 1 já os
--                         resolve na leitura (coach_list_students).
-- Os campos PEDAGÓGICOS (nível, nº de sócio, horário) seguem sempre do coach —
-- são a visão dele sobre o aluno, não identidade.
--
-- POR QUE NO BANCO, e não só na tela: a UI da Fatia 3 vai parar de oferecer os
-- campos, mas uma tela é uma chamada de DevTools de distância. A tranca real
-- mora aqui.
--
-- POR QUE IGNORAR EM SILÊNCIO (o `case`) e não `raise`: com a UI nova, um
-- payload trazendo nome divergente significa cliente desatualizado (aba velha
-- aberta) ou manipulação. No primeiro caso, explodir na cara de um professor que
-- só queria salvar o horário da aula seria punir a pessoa errada; no segundo, o
-- valor é descartado do mesmo jeito. Em ambos, o dado do aluno fica intocado.
--
-- SÓ ALTERA coach_update_student. NÃO toca coach_add_student,
-- coach_remove_student, coach_list_students, members, profiles, a jornada nem
-- lib/scoring. Idempotente. Rodar no SQL Editor após verificação.

-- GRANTS: `create or replace` PRESERVA os privilégios e a assinatura não muda —
-- o trio de 20260724010000_coach_roster.sql continua valendo, não é reemitido.
create or replace function public.coach_update_student(
  p_student_id     uuid,
  p_name           text,
  p_phone          text,
  p_level          text,
  p_member_number  text,
  p_class_schedule text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid   uuid := auth.uid();
  v_pid uuid;   -- profile_id do aluno: null = solto, preenchido = cadastrado
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  -- QUEM É ESTE ALUNO. O escopo (coach dono + role player) é o mesmo do UPDATE
  -- lá embaixo: aluno de outro professor não é encontrado, v_pid fica null e o
  -- update não casa linha — silencioso, como já era.
  select m.profile_id
    into v_pid
    from public.members m
   where m.id = p_student_id
     and m.coach_id = uid
     and m.role = 'player';

  -- VALIDAÇÕES CONDICIONAIS: só fazem sentido sobre o que VAI SER ESCRITO.
  -- Para aluno cadastrado, p_name/p_phone são descartados pelo `case`, então
  -- exigi-los recusaria um "salvar o horário" perfeitamente legítimo — a UI
  -- nova nem envia esses campos.
  if v_pid is null then
    if p_name is null or length(trim(p_name)) = 0 then
      raise exception 'name required';
    end if;
    if p_phone is not null and p_phone !~ '^\+[1-9]\d{6,14}$' then
      raise exception 'invalid phone';
    end if;
  end if;

  -- Guardas de tamanho seguem para TODOS os campos e nos dois casos (defesa da
  -- porta, independente de o valor ser gravado ou não).
  if coalesce(length(p_name), 0) > 120
     or coalesce(length(p_phone), 0) > 20
     or coalesce(length(p_level), 0) > 40
     or coalesce(length(p_member_number), 0) > 40
     or coalesce(length(p_class_schedule), 0) > 120 then
    raise exception 'field too long';
  end if;

  -- O `case` lê o profile_id DA PRÓPRIA LINHA sendo atualizada: é a linha do
  -- banco que decide, não o payload. Solto → grava nome/celular exatamente como
  -- antes; cadastrado → mantém o valor que já está lá (`name`/`phone` do lado
  -- direito são as colunas), aconteça o que acontecer no cliente.
  update public.members
     set name           = case when profile_id is null then trim(p_name) else name  end,
         phone          = case when profile_id is null then p_phone      else phone end,
         level          = p_level,
         member_number  = p_member_number,
         class_schedule = p_class_schedule
   where id = p_student_id
     and coach_id = uid
     and role = 'player';
end;
$$;
