import type { ReactNode } from 'react'

export function PhoneFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative mx-auto w-full max-w-[260px] rounded-[2.2rem] border border-border bg-[#0c0d10] p-2.5 shadow-2xl shadow-black/50 ${className}`}
    >
      <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#0c0d10]" aria-hidden />
      <div className="relative aspect-[9/19] overflow-hidden rounded-[1.7rem] bg-background">
        {children}
      </div>
    </div>
  )
}
