"use client"

/**
 * /remoto — CONTROLE DE PLACAR, para um 2º aparelho (e, no alvo, um smartwatch
 * Wear OS).
 *
 * ⚠️ SEND-ONLY, e é isso que o torna viável num relógio. A propagação já é do
 * SERVIDOR: `apply_live_match_action` grava e dispara o broadcast. Então este
 * controle NÃO assina canal, NÃO abre WebSocket e NÃO carrega o motor — faz
 * três tipos de POST (`point`/`game`/`undo`) e pronto. WebSocket com a tela
 * apagada e o rádio dormindo é a parte mais frágil de um navegador de relógio;
 * aqui ela simplesmente não existe.
 *
 * STATELESS por obrigação: o relógio apaga a tela e pode RECARREGAR a página ao
 * acordar. Tudo vem da URL; não há estado em memória que se perca.
 *
 * SEM SESSÃO: usa o client anônimo, e a autorização é o `edit_token` — uma
 * capacidade, não uma identidade. É o mesmo mecanismo do editor convidado que
 * já existe (o QR "Convidar editor" do ShareModal).
 *
 * FORA DA ZONA SENSÍVEL: só envia AÇÕES DE PLACAR. Não escreve `players`, não
 * escreve `playerIds`, não passa pelo Lamport (que versiona `players`) nem pela
 * reivindicação de slot.
 *
 * FATIA 1: os tokens vêm na URL. Na prática dá para pegar o link de editor do
 * ShareModal e trocar `/jogo` por `/remoto` — os parâmetros são os mesmos. O
 * pareamento amigável (código de 4 dígitos, para quem não digita URL num
 * relógio) é a Fatia 2.
 */

import { Suspense, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeftRight, Undo2 } from "lucide-react"
import { applyLiveMatchAction, type LiveMatchAction } from "@/lib/supabase/live-match"
import { themeClassName, type ThemeId } from "@/lib/themes"

/** O mesmo limiar do palco: 2 toques no MESMO lado dentro disto = desfazer. */
const DOUBLE_TAP_MS = 300

/** Vibração curta de confirmação. Ausente no desktop — o flash cobre. */
function vibrar(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Sem suporte: o feedback visual já confirma.
  }
}

function ControleRemoto() {
  const searchParams = useSearchParams()

  // TUDO da URL — nada de estado que não sobreviva a um reload.
  const matchId = searchParams.get("match") ?? ""
  const editToken = searchParams.get("edit") ?? ""
  const theme = (searchParams.get("theme") ?? "neutro") as ThemeId
  // O MODO DE CONTAGEM importa: em "games" cada toque concede um GAME inteiro,
  // e é o que a tela de jogo envia. Mandar "point" aqui faria o controle e o
  // placar contarem coisas diferentes.
  const scoreType = searchParams.get("scoreType") === "games" ? "games" : "pontos"

  /** Espelha os lados NESTE aparelho — para pôr "o seu lado" perto do polegar. */
  const [espelhado, setEspelhado] = useState(false)
  const [flash, setFlash] = useState<"A" | "B" | "undo" | null>(null)
  const [erro, setErro] = useState(false)

  const lastTapRef = useRef<{ side: "A" | "B"; time: number } | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)

  const piscar = (q: "A" | "B" | "undo") => {
    setFlash(q)
    window.setTimeout(() => setFlash((f) => (f === q ? null : f)), 220)
  }

  /** Envia e sinaliza falha sem nunca lançar — o controle não pode quebrar. */
  const enviar = async (action: LiveMatchAction) => {
    if (!matchId || !editToken) return
    const ok = await applyLiveMatchAction(editToken, matchId, action)
    setErro(ok === null)
  }

  const tocarLado = (side: "A" | "B") => {
    // Um release que foi SWIPE não marca ponto — mesma trava do palco.
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }

    // DUPLO-TOQUE no MESMO lado = DESFAZER, idêntico ao scoreboard. Como o 1º
    // toque JÁ marcou (o toque simples nunca espera), este 2º não marca e
    // desfaz DOIS: o ponto que o 1º acabou de mandar + o último ponto real. O
    // efeito líquido é o mesmo de apertar voltar uma vez.
    const agora = Date.now()
    const ultimo = lastTapRef.current
    if (ultimo && ultimo.side === side && agora - ultimo.time <= DOUBLE_TAP_MS) {
      lastTapRef.current = null
      piscar("undo")
      vibrar(40)
      // EM SEQUÊNCIA, não em paralelo: a ordem das ações define o estado final,
      // e dois undos disparados juntos podem chegar fora de ordem.
      void (async () => {
        await enviar({ kind: "undo" })
        await enviar({ kind: "undo" })
      })()
      return
    }

    lastTapRef.current = { side, time: agora }
    piscar(side)
    vibrar(18)
    void enviar({ kind: scoreType === "games" ? "game" : "point", side })
  }

  // Sem os tokens não há o que controlar. Mensagem curta — cabe num relógio.
  if (!matchId || !editToken) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 bg-black p-5 text-center text-white">
        <p className="text-sm font-bold uppercase tracking-wide">Controle sem partida</p>
        <p className="text-xs leading-snug opacity-60">
          Abra pelo link de editor da partida.
        </p>
      </div>
    )
  }

  const ordem: ("A" | "B")[] = espelhado ? ["B", "A"] : ["A", "B"]

  return (
    <div
      className={`relative flex h-[100dvh] flex-col overflow-hidden select-none ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-divisor)", gap: "2px", touchAction: "none" }}
      /* SWIPE horizontal troca os lados — o MESMO gesto do palco. Mesmo limiar
         relativo, então numa tela de relógio ele exige ~40% da largura.
         ⚠️ No Wear OS o swipe a partir da borda esquerda é o "voltar" do
         SISTEMA e vence qualquer página. Por isso existe também o botão ⇄ no
         centro: no relógio ele é o caminho confiável; no celular o swipe é o
         gesto natural. Os dois fazem a mesma coisa. */
      onPointerDown={(e) => {
        swipedRef.current = false
        swipeStartRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const inicio = swipeStartRef.current
        swipeStartRef.current = null
        if (!inicio) return
        const dx = e.clientX - inicio.x
        const dy = e.clientY - inicio.y
        const limiar = Math.max(64, e.currentTarget.clientWidth * 0.15)
        if (Math.abs(dx) >= limiar && Math.abs(dx) > Math.abs(dy)) {
          swipedRef.current = true
          setEspelhado((m) => !m)
          vibrar(12)
        }
      }}
      onPointerCancel={() => {
        swipeStartRef.current = null
      }}
    >
      {ordem.map((side) => {
        const aceso = flash === side || flash === "undo"
        return (
          <button
            key={side}
            type="button"
            onClick={() => tocarLado(side)}
            aria-label={`Ponto para o lado ${side}`}
            className="flex min-h-0 flex-1 items-center justify-center text-6xl font-black transition-[filter,transform] duration-150"
            style={{
              backgroundColor: side === "A" ? "var(--lado-a-bg)" : "var(--lado-b-bg)",
              color: side === "A" ? "var(--lado-a-texto)" : "var(--lado-b-texto)",
              // FLASH: inverte o brilho por um instante. Sem placar visível, o
              // toque PRECISA se confirmar — senão a pessoa toca de novo achando
              // que não pegou, e marca um ponto a mais.
              filter: aceso ? "invert(1)" : "none",
              transform: aceso ? "scale(0.98)" : "none",
            }}
          >
            {flash === "undo" ? (
              <Undo2 className="h-10 w-10" />
            ) : (
              <span className="opacity-90">{side}</span>
            )}
          </button>
        )
      })}

      {/* TROCAR LADOS por toque — o caminho confiável no relógio. Fica no
          centro, sobre a divisória, para não roubar área dos dois botões. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEspelhado((m) => !m)
          vibrar(12)
        }}
        aria-label="Trocar os lados de posição"
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white ring-1 ring-white/25 active:scale-90"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>

      {/* Falha de envio: discreto e não-bloqueante. O controle segue usável e o
          próximo toque tenta de novo — em quadra, um aviso que exige interação
          seria pior que o erro. */}
      {erro && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1 z-10 text-center text-[10px] font-bold uppercase tracking-wider text-red-400">
          sem conexão
        </span>
      )}
    </div>
  )
}

export default function RemotoPage() {
  return (
    <Suspense
      fallback={<div className="flex h-[100dvh] items-center justify-center bg-black text-white">…</div>}
    >
      <ControleRemoto />
    </Suspense>
  )
}
