/**
 * Constantes compartilhadas entre o formulário (client) e as Server Actions.
 *
 * Vivem FORA de actions.ts porque um arquivo 'use server' só pode exportar
 * funções async — exportar uma const de lá quebra o build.
 *
 * O schema zod fica em actions.ts de propósito: importá-lo daqui arrastaria o
 * zod para o bundle do client sem necessidade.
 */

/** Espelha o CHECK `venues_slug_formato` do banco. Os dois têm que concordar. */
export const SLUG_REGEX = /^[a-z0-9-]+$/

/**
 * Domínio público usado para MONTAR e EXIBIR URLs (preview do slug no formulário
 * e links de compartilhamento na página de detalhe). Não vem de env porque é
 * texto de UI, não configuração de runtime — nada aqui faz request para ele.
 */
export const DOMINIO_PUBLICO = 'flow.pwer.com.br'

/** Espelha o CHECK de `type` do banco. */
export const TIPOS = [
  { valor: 'club', rotulo: 'Clube' },
  { valor: 'condominio', rotulo: 'Condomínio' },
  { valor: 'publica', rotulo: 'Quadra pública' },
] as const
