/**
 * GRADE de quadras do dashboard — esporte (slug de URL) × quadras.
 *
 * ⚠️ CONVENÇÃO TEMPORÁRIA E HARDCODED. Esta grade NÃO vem do banco: "quadras de
 * um venue" ainda não existe como estrutura de dado (tabela `courts`
 * conscientemente adiada). Enquanto não existir, ela é igual para TODO venue, o
 * que é obviamente falso — um condomínio de uma quadra e um clube de oito
 * recebem a mesma lista. Quando a estrutura existir, isto vira leitura por venue
 * e os consumidores passam a só renderizar o que vier.
 *
 * FONTE ÚNICA (peça C.2): antes vivia duplicada, à mão, em share-links.tsx e
 * visit-stats.tsx; foi extraída para cá para as duas cópias gêmeas não saírem
 * de sincronia. É a 4ª representação de "quadras" e a única do DASHBOARD —
 * separada de propósito de `CLUBS.quadras` (lib/clubs-config.ts), que é a lista
 * PLANA que serve a JORNADA e não expressa o vínculo esporte↔quadra.
 *
 * `esporte` é o SLUG DE URL ("tenis", "beachtennis", "pingpong"), não o id
 * canônico do catálogo ("tennis", "beach", "tabletennis"). Quem junta com dados
 * que usam o id canônico (visit-stats, court-sponsors) converte com
 * sportIdFromSlug — sem isso só "squash" casa por coincidência (slug == id).
 *
 * O sufixo da quadra nomeia o piso (-saibro / -rapida) e faz parte do id: quem
 * valida (resolveClubContext) só checa `includes` numa lista plana, sem vínculo
 * quadra↔esporte. Por isso a grade é escrita à mão aqui em vez de derivada do
 * CLUBS: derivar daria o produto cartesiano (esportes × quadras), que passa na
 * validação mas não existe no mundo físico.
 */
export const GRADE = [
  {
    esporte: 'tenis',
    nome: 'Tênis',
    quadras: [
      'q1-saibro',
      'q2-saibro',
      'q3-saibro',
      'q4-saibro',
      'q5-saibro',
      'q6-saibro',
      'q7-saibro',
      'q8-rapida',
    ],
  },
  { esporte: 'squash', nome: 'Squash', quadras: ['q1', 'q2', 'q3'] },
  { esporte: 'beachtennis', nome: 'Beach Tennis', quadras: ['q1', 'q2'] },
  { esporte: 'pingpong', nome: 'Ping Pong', quadras: ['q1', 'q2'] },
  // Sem `as const` de propósito: ele tiparia `quadras.length` como o literal
  // `2 | 3 | 8`, e o TS passaria a acusar o singular do plural como código
  // morto — justamente o caso que aparece quando isto virar dado de banco (um
  // condomínio de uma quadra só).
]
