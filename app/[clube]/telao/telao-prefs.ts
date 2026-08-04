"use client"

/**
 * A PREFERÊNCIA DE EXIBIÇÃO do telão — **local a cada tela**.
 *
 * A separação que organiza a feature inteira:
 *  • FONTE (servidor, compartilhada): qual partida está ligada a cada quadra,
 *    qual o vídeo, qual o canal. Muda no /operar e reflete em TODAS as telas.
 *  • VIEW (aqui, local): como ESTA tela exibe o que a fonte oferece. Destaque
 *    ou grade, vídeo em cima ou ao lado, qual quadra no palco, e se esta tela
 *    quer só o placar de alguma quadra AGORA.
 *
 * A URL do telão "roda o mundo" — bar, hotel, casa, saguão do clube. Cada uma
 * dessas telas quer uma coisa diferente da MESMA fonte: o bar quer a grade com
 * tudo, a quadra quer o destaque do jogo dela. Guardar isso no servidor faria
 * o bar mudar o telão do clube sem querer.
 *
 * ⚠️ ISTO NÃO É OFFLINE. O telão é ONLINE por natureza — transmissão ao vivo
 * exige rede, e ele vive em lugares que têm. O localStorage aqui é
 * PERSONALIZAÇÃO por aparelho, não cache de funcionamento. O offline-first do
 * JOGO (escanear, marcar ponto, salvar histórico) é outro assunto e não passa
 * por este arquivo.
 */

import { useCallback, useEffect, useRef, useState } from "react"

export type ModoView = "hero" | "grid"
/** No hero: vídeo EM CIMA do placar (stacked) ou AO LADO dele (split). */
export type SubLayout = "stacked" | "split"

export type PrefsTelao = {
  /**
   * Destaque ou grade. O CONTROLE ainda não existe na tela — a grade é a
   * próxima fatia. O campo nasce aqui de propósito: quem já tiver preferências
   * salvas não perde nada quando o controle aparecer, e `saneia` já aceita o
   * valor. Adicionar campo depois exigiria migrar o que está no localStorage.
   */
  modo: ModoView
  layout: SubLayout
  /** Quadra no palco. null = a que o servidor escolheu (?quadra= ou a padrão). */
  destaque: string | null
  /** Quadras que ESTA tela quer só com placar, mesmo tendo vídeo disponível. */
  soPlacar: string[]
}

/**
 * O DEFAULT importa mais do que parece: ele é o que a TV pinta ANTES de a
 * preferência salva ser lida (o localStorage só existe depois da hidratação).
 * `split` é o que o telão já fazia — assim a tela nasce no formato certo e a
 * leitura da preferência não causa um salto visível em quem nunca mexeu nela.
 */
const PADRAO: PrefsTelao = { modo: "hero", layout: "split", destaque: null, soPlacar: [] }

/** Uma chave POR CLUBE: a mesma TV pode alternar entre telões de clubes. */
function chave(clube: string): string {
  return `flow_telao_view_${clube}`
}

/** Aceita só o que reconhece — dado velho ou adulterado vira o padrão. */
function saneia(bruto: unknown): Partial<PrefsTelao> {
  if (!bruto || typeof bruto !== "object") return {}
  const o = bruto as Record<string, unknown>
  const out: Partial<PrefsTelao> = {}
  if (o.modo === "hero" || o.modo === "grid") out.modo = o.modo
  if (o.layout === "stacked" || o.layout === "split") out.layout = o.layout
  if (typeof o.destaque === "string") out.destaque = o.destaque
  if (Array.isArray(o.soPlacar)) {
    out.soPlacar = o.soPlacar.filter((v): v is string => typeof v === "string")
  }
  return out
}

export function usePrefsTelao(clube: string) {
  const [prefs, setPrefs] = useState<PrefsTelao>(PADRAO)

  // Lido DEPOIS da montagem, e não no initializer do useState: o servidor não
  // tem localStorage, e um estado inicial diferente entre servidor e cliente é
  // erro de hidratação. O preço é um frame no padrão — invisível numa TV, e o
  // motivo de o padrão ser o layout que o telão já usava.
  useEffect(() => {
    try {
      const cru = localStorage.getItem(chave(clube))
      if (cru) setPrefs({ ...PADRAO, ...saneia(JSON.parse(cru)) })
    } catch {
      // localStorage bloqueado (aba privada, TV antiga): o telão segue no
      // padrão. Sem preferência é uma degradação aceitável; travar não é.
    }
  }, [clube])

  // ⚠️ A GUARDA DA PRIMEIRA GRAVAÇÃO existe por um motivo concreto: sem ela,
  // este efeito roda na montagem com o PADRÃO ainda no estado e sobrescreve a
  // preferência salva antes de o efeito de leitura acima chegar a aplicá-la —
  // a tela esqueceria a escolha a cada recarga, silenciosamente.
  const jaGravou = useRef(false)
  useEffect(() => {
    if (!jaGravou.current) {
      jaGravou.current = true
      return
    }
    try {
      localStorage.setItem(chave(clube), JSON.stringify(prefs))
    } catch {
      // idem: sem persistência a tela ainda funciona, só não lembra.
    }
  }, [clube, prefs])

  const atualizar = useCallback((patch: Partial<PrefsTelao>) => {
    setPrefs((p) => ({ ...p, ...patch }))
  }, [])

  /** Liga/desliga o "só placar" desta quadra NESTA tela. */
  const alternarSoPlacar = useCallback((quadra: string) => {
    setPrefs((p) => ({
      ...p,
      soPlacar: p.soPlacar.includes(quadra)
        ? p.soPlacar.filter((q) => q !== quadra)
        : [...p.soPlacar, quadra],
    }))
  }, [])

  return { prefs, atualizar, alternarSoPlacar }
}
