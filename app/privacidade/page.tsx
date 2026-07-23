/**
 * POLÍTICA DE PRIVACIDADE (/privacidade) — server component, conteúdo-base LGPD
 * editável AQUI. Placeholders [ASSIM] a preencher antes da publicação real.
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
        Esta Política explica como o <strong>Flow</strong>, operado por <strong>[RAZÃO SOCIAL]</strong> (CNPJ{' '}
        <strong>[CNPJ]</strong>), trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº
        13.709/2018 — LGPD).
      </p>

      <h2>1. Controlador e encarregado (DPO)</h2>
      <p>
        Controlador: <strong>[RAZÃO SOCIAL]</strong>. Encarregado pelo tratamento de dados (DPO):{' '}
        <strong>[NOME DO ENCARREGADO]</strong> — <strong>[EMAIL DO ENCARREGADO/DPO]</strong>.
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
          acesso). <strong>[DETALHAR SE HOUVER ANALYTICS/COOKIES]</strong>
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
        Não vendemos seus dados. Compartilhamos apenas com operadores necessários à prestação do serviço (por exemplo, a
        infraestrutura de autenticação e banco de dados <strong>[SUPABASE / PROVEDOR]</strong> e a hospedagem{' '}
        <strong>[VERCEL / PROVEDOR]</strong>), sob obrigações de confidencialidade, ou quando exigido por lei.
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
        (editar dados, alternar marketing, excluir a conta). Para os demais, contate o encarregado em{' '}
        <strong>[EMAIL DO ENCARREGADO/DPO]</strong>.
      </p>

      <h2>7. Exclusão de conta</h2>
      <p>
        Ao excluir sua conta em <strong>/perfil</strong>, apagamos seus dados pessoais de cadastro (nome, email, celular,
        username e foto) e desvinculamos suas partidas do seu perfil. Preservamos os placares e os nomes já registrados
        nas súmulas, conforme a seção 5.
      </p>

      <h2>8. Retenção e segurança</h2>
      <p>
        Mantemos os dados pelo tempo necessário às finalidades acima ou conforme exigido por lei. Adotamos medidas
        técnicas e organizacionais para proteger os dados. <strong>[DETALHAR PRAZOS DE RETENÇÃO SE APLICÁVEL]</strong>
      </p>

      <h2>9. Transferência internacional</h2>
      <p>
        Alguns provedores podem processar dados fora do Brasil, com salvaguardas adequadas.{' '}
        <strong>[CONFIRMAR PROVEDORES E LOCAIS]</strong>
      </p>

      <h2>10. Alterações desta Política</h2>
      <p>
        Podemos atualizar esta Política; mudanças relevantes serão sinalizadas no app e refletidas na versão vigente
        acima. Contato: <strong>[EMAIL DO ENCARREGADO/DPO]</strong>.
      </p>
    </LegalShell>
  )
}
