/**
 * Versão vigente dos Termos de Uso + Política de Privacidade. O aceite guarda
 * QUAL versão foi aceita (consents.tos_version); quando esta constante muda, o
 * /perfil detecta o descompasso e pede novo aceite. Formato de data (AAAA-MM-DD)
 * para ordenação e leitura óbvias. Suba a versão ao alterar o conteúdo legal.
 */
export const TOS_VERSION = '2026-07-23'

/**
 * IDADE MÍNIMA para cadastro autônomo (sem consentimento parental).
 *
 * 18 é PISO SEGURO PROVISÓRIO, não convicção de produto: a LGPD (art. 14) trata
 * CRIANÇA (até 12) com consentimento parental obrigatório e ADOLESCENTE (13-17)
 * como zona cinzenta de interpretação. A intenção declarada é liberar 13+
 * autônomo — mas só depois da validação com advogado/DPO, que é a mesma que
 * destrava o fluxo de menores (B.2).
 *
 * Por isso mora AQUI, sozinha e nomeada: baixar a linha é trocar este número.
 * Nada no banco trava 18 (profiles.birth_date é só a data).
 */
export const IDADE_MINIMA = 18

/**
 * Idade em anos completos numa data ISO (AAAA-MM-DD). Conta pelo aniversário
 * já ocorrido no ano corrente — não por divisão de dias, que erra em bissexto.
 * Retorna null se a data não for válida.
 */
export function idadeEmAnos(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(ano, mes - 1, dia)
  // Rejeita data inexistente (31/02 vira 03/03 no construtor do Date).
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null

  const hoje = new Date()
  let idade = hoje.getFullYear() - ano
  const aniversarioPassou =
    hoje.getMonth() > mes - 1 || (hoje.getMonth() === mes - 1 && hoje.getDate() >= dia)
  if (!aniversarioPassou) idade -= 1
  return idade
}
