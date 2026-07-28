/**
 * POLÍTICA DE PRIVACIDADE (/privacidade) — server component, conteúdo-base LGPD
 * editável AQUI, já com os dados reais da PWER IO LTDA. Base honesta e factual —
 * pode ser revisada por advogado depois.
 */

import type { Metadata } from 'next'
import { LegalShell } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Flow',
  description: 'Como o Flow trata dados pessoais, conforme a LGPD.',
}

export default function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade">
      <p>
        Esta Política explica como o <strong>Flow</strong> (Flow by PWER IO), operado por{' '}
        <strong>PWER IO LTDA</strong> (CNPJ <strong>65.132.165/0001-62</strong>, com sede na Rua País Leme, 215, Conj.
        1713, Pinheiros, São Paulo/SP, CEP 05.424-150), trata dados pessoais, em conformidade com a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Controlador e encarregado (DPO)</h2>
      <p>
        Controlador: <strong>PWER IO LTDA</strong> (CNPJ 65.132.165/0001-62). Encarregado pelo tratamento de dados
        (DPO): contato pelo email <strong>pwerioflow@gmail.com</strong>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, email, celular, username e, quando você entra com o Google, a foto do perfil.
        </li>
        <li>
          <strong>Partidas:</strong> resultados registrados (placar, sets) e os nomes dos participantes informados na
          súmula.
        </li>
        <li>
          <strong>Uso do serviço:</strong> dados técnicos mínimos para o funcionamento e a segurança (ex.: registros de
          acesso). O Flow usa armazenamento local no seu dispositivo (para funcionar offline) e cookies essenciais de
          sessão para manter você conectado; não usamos cookies de publicidade nem rastreadores de terceiros.
        </li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          Prestar o serviço (criar conta, salvar histórico, montar perfil) — base: <strong>execução de contrato</strong>.
        </li>
        <li>
          Segurança, prevenção a fraude e melhoria do serviço — base: <strong>legítimo interesse</strong>.
        </li>
        <li>
          Envio de novidades por email — base: <strong>consentimento</strong> (opt-in separado e opcional, revogável a
          qualquer momento em <strong>/perfil</strong>).
        </li>
        <li>
          Cumprimento de obrigações legais — base: <strong>obrigação legal</strong>.
        </li>
      </ul>

      <h2>4. Compartilhamento</h2>
      <p>
        Não vendemos seus dados. Compartilhamos apenas com operadores necessários à prestação do serviço — a
        infraestrutura de autenticação, banco de dados e armazenamento <strong>Supabase</strong> e a hospedagem{' '}
        <strong>Vercel</strong> —, sob obrigações de confidencialidade, ou quando exigido por lei.
      </p>

      <h2>5. Registro histórico esportivo</h2>
      <p>
        Os resultados de partidas são <strong>registros históricos esportivos</strong> e os nomes dos participantes são
        preservados mesmo após a exclusão da conta de quem registrou a partida, para assegurar a integridade do
        histórico e o direito dos demais participantes. A exclusão de conta remove a associação ao seu perfil, mas o
        resultado esportivo permanece.
      </p>

      <h2>6. Seus direitos (LGPD)</h2>
      <p>
        Você pode confirmar a existência de tratamento, acessar, corrigir, portar, e solicitar a eliminação de dados
        pessoais, além de revogar consentimentos. Muitos desses direitos são exercidos direto em <strong>/perfil</strong>{' '}
        (editar dados, alternar marketing, excluir a conta). Para os demais, ou para acesso, correção e exclusão,
        contate o encarregado em <strong>pwerioflow@gmail.com</strong>.
      </p>

      <h2>7. Exclusão de conta</h2>
      <p>
        Ao excluir sua conta em <strong>/perfil</strong>, apagamos seus dados pessoais de cadastro (nome, email, celular,
        username e foto) e desvinculamos suas partidas do seu perfil. Preservamos os placares e os nomes já registrados
        nas súmulas, conforme a seção 5.
      </p>

      <h2>8. Retenção e segurança</h2>
      <p>
        Mantemos os dados de cadastro enquanto sua conta existir; ao excluí-la, seus dados pessoais são apagados
        (conforme a seção 7), ressalvados os registros que a lei exigir manter e os resultados esportivos preservados
        como registro histórico (seção 5). Adotamos medidas técnicas e organizacionais para proteger os dados.
      </p>

      <h2>9. Transferência internacional</h2>
      <p>
        Nossos provedores de infraestrutura (Supabase e Vercel) podem processar e armazenar dados em servidores fora do
        Brasil. Nesses casos, a transferência ocorre com as salvaguardas previstas na LGPD.
      </p>

      <h2>10. Alterações desta Política</h2>
      <p>
        Podemos atualizar esta Política; mudanças relevantes serão sinalizadas no app e refletidas na versão vigente
        acima. Contato: <strong>pwerioflow@gmail.com</strong>.
      </p>
    </LegalShell>
  )
}
