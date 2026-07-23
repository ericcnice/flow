'use client'

/**
 * Modal de PERFIL OBRIGATÓRIO (A1.2), aberto após o 1º login quando o perfil
 * está incompleto. Agora é só a MOLDURA glass — os campos vivem no <ProfileForm>
 * compartilhado (A1.3c, modo "cadastro"): nome/sobrenome (pré do OAuth), username
 * sugerido com check em tempo real, email travado, celular E.164 com check. O
 * form grava profiles.name + profiles.phone (update self) + username em
 * user_metadata. Sem "fechar" — o cadastro é obrigatório.
 */

import type { User } from '@supabase/supabase-js'
import { ProfileForm } from './profile-form'

export function ProfileModal({ user, onDone }: { user: User; onDone: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Complete seu perfil"
    >
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Complete seu perfil</h2>
          <p className="mt-1 text-xs text-white/60">Precisamos do seu nome, um @username e o celular.</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          <ProfileForm user={user} mode="cadastro" onDone={onDone} />
        </div>
      </div>
    </div>
  )
}
