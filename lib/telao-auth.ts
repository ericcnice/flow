/**
 * A TRANCA DA OPERAÇÃO DO TELÃO. **SERVER-ONLY.**
 *
 * Mora fora do arquivo de Server Actions de propósito: num arquivo
 * `"use server"`, TODO export vira um endpoint chamável pelo cliente — e uma
 * função de verificação exposta como endpoint é um oráculo para adivinhar o
 * token, uma tentativa por vez.
 *
 * O segredo vive em env SERVER-ONLY (sem NEXT_PUBLIC): no bundle do cliente,
 * qualquer visitante o leria no JavaScript da página.
 */

import 'server-only'

export function operacaoAutorizada(token: string | undefined): boolean {
  const esperado = process.env.TELAO_OPERATION_TOKEN
  // FALHA FECHADA: sem o segredo configurado, NINGUÉM entra. Sem esta linha, um
  // ambiente que esquecesse a env aceitaria qualquer token — inclusive vazio.
  if (!esperado || esperado.length < 16) return false
  if (!token || token.length !== esperado.length) return false
  // Comparação de tempo constante: um `===` vaza, pelo tempo de resposta, quantos
  // caracteres iniciais estavam certos, e transforma adivinhar em tarefa fácil.
  let diff = 0
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return diff === 0
}
