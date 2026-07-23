/**
 * TERMOS DE USO (/termos) — server component. Conteúdo-base editável AQUI mesmo.
 * Ao alterar o conteúdo, suba a TOS_VERSION em lib/legal.ts (o /perfil detecta e
 * pede novo aceite). Placeholders [ASSIM] a preencher antes da publicação.
 */

import type { Metadata } from 'next'
import { LegalShell } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Termos de Uso — Flow',
  description: 'Termos de Uso do Flow, placar para esportes de raquete.',
}

export default function TermosPage() {
  return (
    <LegalShell title="Termos de Uso">
      <p>
        Bem-vindo ao <strong>Flow</strong>, aplicativo de placar para esportes de raquete (tênis, beach tennis, padel,
        squash, ping pong e pickleball), operado por <strong>[RAZÃO SOCIAL]</strong>, inscrita no CNPJ sob o nº{' '}
        <strong>[CNPJ]</strong>, com sede em <strong>[ENDEREÇO]</strong> (&quot;Flow&quot;, &quot;nós&quot;). Ao criar
        uma conta ou usar o Flow, você concorda com estes Termos de Uso.
      </p>

      <h2>1. O que é o Flow</h2>
      <p>
        O Flow é um placar digital que funciona inclusive sem conexão, com narração de árbitro e registro opcional de
        partidas. O uso do placar não exige conta; o cadastro serve para salvar seu histórico de jogos e montar seu
        perfil de jogador.
      </p>

      <h2>2. Conta e cadastro</h2>
      <ul>
        <li>Você deve fornecer dados verdadeiros (nome, email e celular) e manter seu username.</li>
        <li>Você é responsável pela atividade na sua conta e pelo sigilo do seu acesso.</li>
        <li>O cadastro é destinado a maiores de 18 anos; menores dependem de consentimento dos responsáveis.</li>
      </ul>

      <h2>3. Uso aceitável</h2>
      <p>Você concorda em não usar o Flow para fins ilícitos, nem em:</p>
      <ul>
        <li>violar direitos de terceiros ou registrar dados de outra pessoa sem autorização;</li>
        <li>tentar burlar, sobrecarregar ou comprometer a segurança do serviço;</li>
        <li>reproduzir, revender ou explorar o serviço sem autorização.</li>
      </ul>

      <h2>4. Partidas, placares e registro histórico</h2>
      <p>
        Ao registrar uma partida, o Flow guarda o resultado — placar, sets e os <strong>nomes dos participantes</strong>{' '}
        informados na súmula. <strong>Os resultados de partidas são registros históricos esportivos, e os nomes dos
        participantes são preservados mesmo após a exclusão da conta</strong> de quem registrou a partida. Isso protege
        a integridade do histórico e o direito dos demais participantes de terem seus resultados reconhecidos. A
        exclusão de conta remove a associação da partida ao seu perfil, mas não apaga o registro esportivo em si.
      </p>

      <h2>5. Disponibilidade e alterações</h2>
      <p>
        O Flow é oferecido &quot;como está&quot;. Podemos alterar, suspender ou descontinuar funcionalidades, e atualizar
        estes Termos. Mudanças relevantes serão sinalizadas no app; o uso contínuo após a atualização implica aceite da
        nova versão.
      </p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, o Flow não se responsabiliza por danos indiretos decorrentes do uso ou da
        indisponibilidade do serviço. <strong>[REVISAR CLÁUSULA COM APOIO JURÍDICO]</strong>
      </p>

      <h2>7. Encerramento</h2>
      <p>
        Você pode excluir sua conta a qualquer momento em <strong>/perfil</strong>. Podemos suspender contas que violem
        estes Termos.
      </p>

      <h2>8. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de <strong>[CIDADE/UF]</strong>,
        salvo disposição legal em contrário.
      </p>

      <h2>9. Contato</h2>
      <p>
        Dúvidas sobre estes Termos: <strong>[EMAIL DE CONTATO]</strong>. Sobre dados pessoais, veja a{' '}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>
    </LegalShell>
  )
}
