import type { ButtonHTMLAttributes, ReactNode } from 'react'
import StarBorderComponent from './StarBorder.jsx'

// React Bits' StarBorder is plain JavaScript: its props are typed here.
const StarBorder = StarBorderComponent as unknown as (props: ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: string
  trailColor?: string
  duration?: number
  thickness?: number
  radius?: number
  trailLength?: number
  stars?: number
  glow?: number
  sparkle?: boolean
  hover?: 'lap' | 'brighten' | 'reveal' | 'none'
  clickPulse?: boolean
  theme?: 'dark' | 'light'
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  children?: ReactNode
}) => ReactNode

/**
 * The main button of a screen (one per page: «Me lo pongo hoy», «Añadir prendas», «Crear outfit», «Nuevo viaje»): the
 * dark button with a light running round its edge, a lap more under the pointer and a pulse on click. The light is
 * drawn on a canvas only while the button is on screen, and stands still with «reducir movimiento».
 */
export default function StarButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <StarBorder
      type="button"
      {...props}
      className={`button button-dark star-button ${className}`.trim()}
      theme="dark"
      // The light is read as a colour by a canvas: a literal colour, not a CSS variable (--lavender-soft).
      color="#D9CFF2"
      trailColor="#B3A6D3"
      backgroundColor="var(--ink)"
      textColor="var(--white)"
      borderColor="rgba(248, 246, 251, .16)"
      radius={6}
      thickness={1.5}
      duration={4.5}
      glow={0.85}
      trailLength={0.4}
    >
      {children}
    </StarBorder>
  )
}
