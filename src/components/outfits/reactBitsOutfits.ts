import type { ComponentProps, ComponentType, ReactNode } from 'react'
import FlipCardComponent from '../FlipCard.jsx'
import PulseHeartComponent from '../PulseHeart.jsx'

// The React Bits components only the Outfits screen uses, typed here and not in reactBits.ts: that one is part of the
// first load, and FlipCard brings the motion library with it. Like there, every prop is optional.

// Its faces are any content, not the null of their defaults.
export const FlipCard = FlipCardComponent as unknown as ComponentType<
  Partial<Omit<ComponentProps<typeof FlipCardComponent>, 'front' | 'back'>> & { front?: ReactNode; back?: ReactNode }
>
export const PulseHeart = PulseHeartComponent as unknown as ComponentType<Partial<ComponentProps<typeof PulseHeartComponent>>>
