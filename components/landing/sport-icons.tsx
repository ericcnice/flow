import type { ReactElement, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Racket({ ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="10.5" cy="8" rx="6" ry="7" />
      <path d="M10.5 15l4 6" />
      <path d="M13 20l3.5 1.5" />
    </svg>
  )
}

function PaddleRacket({ ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="8.5" r="6.5" />
      <path d="M11 15v6" />
      <path d="M8.5 21h5" />
      <circle cx="9" cy="7" r="0.6" fill="currentColor" />
      <circle cx="13" cy="7" r="0.6" fill="currentColor" />
      <circle cx="11" cy="10" r="0.6" fill="currentColor" />
    </svg>
  )
}

function PingPong({ ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="8" r="6" />
      <path d="M10 14l3.5 5.5" />
      <path d="M12 18l3 1" />
      <circle cx="18" cy="6" r="1.6" />
    </svg>
  )
}

function Ball({ ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M5 8c4 2 10 2 14 0" />
      <path d="M5 16c4-2 10-2 14 0" />
    </svg>
  )
}

export type Sport = {
  key: string
  label: string
  Icon: (props: IconProps) => ReactElement
}

export const SPORTS: Sport[] = [
  { key: 'tennis', label: 'Tênis', Icon: Racket },
  { key: 'beach', label: 'Beach Tennis', Icon: PaddleRacket },
  { key: 'padel', label: 'Padel', Icon: PaddleRacket },
  { key: 'squash', label: 'Squash', Icon: Racket },
  { key: 'pingpong', label: 'Ping Pong', Icon: PingPong },
  { key: 'pickleball', label: 'Pickleball', Icon: Ball },
]
