import type { Garment } from '../types/domain'
import { seasonOfDate } from './outfitGenerator'

/**
 * Names for an outfit that say what it is like, not what it is made of: «Cena en negro», «Tonos tierra de otoño»,
 * «Capas para la lluvia». Built from the outfit's main colour, its plan, the season or the weather and the
 * garments' aesthetic, with a few word lists; `variant` gives another name for the same outfit («Otro nombre»).
 */

interface NameContext {
  occasion: string
  date?: Date
  temperatureCelsius?: number
  weatherConditions?: string[]
}

/** The colour as a feminine noun phrase («en negro») and as a name of its own («Total black»). */
const COLOURS: Record<string, { in: string; own: string[] }> = {
  Negro: { in: 'en negro', own: ['Total black', 'Noche cerrada', 'Todo en negro'] },
  Blanco: { in: 'en blanco', own: ['Lienzo blanco', 'Todo en blanco', 'Blanco roto'] },
  Gris: { in: 'en gris', own: ['Gris ciudad', 'Escala de grises', 'Gris niebla'] },
  Beige: { in: 'en beige', own: ['Tonos arena', 'Beige suave', 'Lino y arena'] },
  'Marrón': { in: 'en marrón', own: ['Tonos tierra', 'Café con leche', 'Otoño en marrón'] },
  Rojo: { in: 'en rojo', own: ['Toque rojo', 'Rojo intenso', 'Nota roja'] },
  Naranja: { in: 'en naranja', own: ['Naranja atardecer', 'Toque naranja', 'Mandarina'] },
  Amarillo: { in: 'en amarillo', own: ['Toque de sol', 'Amarillo limón', 'Nota amarilla'] },
  Verde: { in: 'en verde', own: ['Verde bosque', 'Verde oliva', 'Toque verde'] },
  Azul: { in: 'en azul', own: ['Azul cielo', 'Azul de domingo', 'Todo azul'] },
  'Azul marino': { in: 'en azul marino', own: ['Azul marino', 'Marinero', 'Azul noche'] },
  Morado: { in: 'en morado', own: ['Lavanda', 'Morado intenso', 'Toque morado'] },
  Rosa: { in: 'en rosa', own: ['Rosa suave', 'Toque rosa', 'Rosa empolvado'] },
  Dorado: { in: 'con dorado', own: ['Toque dorado', 'Brillo dorado', 'Oro viejo'] },
  Plateado: { in: 'con plata', own: ['Toque plateado', 'Brillo de plata', 'Plata y luz'] },
  Multicolor: { in: 'a todo color', own: ['A todo color', 'Mezcla de color', 'Color sin miedo'] }
}

/** Where or when the outfit is for, per plan: places and moments, as a name begins. */
const SETTINGS: Record<string, string[]> = {
  Diario: ['Paseo', 'Café', 'Lunes', 'Recados', 'Ciudad', 'Tarde libre'],
  Arreglado: ['Cena', 'Afterwork', 'Brunch', 'Galería', 'Cita', 'Terraza'],
  Formal: ['Gala', 'Reunión', 'Ceremonia', 'Oficina', 'Estreno', 'Evento'],
  Deportivo: ['Entreno', 'Ruta', 'Domingo activo', 'Gimnasio', 'Paseo largo', 'Aire libre'],
  'Frío y capas': ['Capas', 'Abrigo', 'Día de frío', 'Invierno', 'Bufanda', 'Mañana helada'],
  'Calor y pocas capas': ['Verano', 'Terraza', 'Día de sol', 'Brisa', 'Sobremesa', 'Tarde de calor'],
  Look: ['Look', 'Estilo propio', 'Día', 'Momento', 'Plan', 'Salida']
}

const SEASONS: Record<string, string> = { Invierno: 'de invierno', Primavera: 'de primavera', Verano: 'de verano', 'Otoño': 'de otoño' }

/** The garments' aesthetic, as an adjective that starts a name. */
const AESTHETICS: Record<string, string> = {
  minimalista: 'Minimal', 'clásico': 'Clásico', clasico: 'Clásico', urbano: 'Urbano', vintage: 'Vintage', 'romántico': 'Romántico',
  romantico: 'Romántico', bohemio: 'Bohemio', boho: 'Bohemio', deportivo: 'Sport', 'grunge': 'Grunge', rock: 'Rock', preppy: 'Preppy',
  'elegante': 'Elegante', 'casual': 'Casual', streetwear: 'Street', y2k: 'Y2K', gótico: 'Gótico', gotico: 'Gótico'
}

const NEUTRALS = new Set(['Negro', 'Blanco', 'Gris', 'Beige'])

/** The colour that sets the tone: the most worn one, a colour before a neutral when they tie, all black if all is. */
export function mainColour(garments: Garment[]) {
  const counts = new Map<string, number>()
  for (const garment of garments) for (const colour of garment.colors.slice(0, 1)) counts.set(colour, (counts.get(colour) ?? 0) + (garment.role === 'Accesorio' ? 0.5 : 1))
  return [...counts].sort((a, b) => b[1] - a[1] || Number(NEUTRALS.has(a[0])) - Number(NEUTRALS.has(b[0])))[0]?.[0]
}

function aestheticOf(garments: Garment[]) {
  const counts = new Map<string, number>()
  for (const garment of garments) for (const style of garment.styles) {
    const adjective = AESTHETICS[style.toLocaleLowerCase('es').trim()]
    if (adjective) counts.set(adjective, (counts.get(adjective) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** A small stable number from a text, so the same outfit gets the same first name. */
function hash(text: string) {
  let value = 7
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) >>> 0
  return value
}

function lower(text: string) {
  return text.charAt(0).toLocaleLowerCase('es') + text.slice(1)
}

/** Every name this outfit could take, in a stable order; `outfitName` picks one. */
export function outfitNames(garments: Garment[], context: NameContext): string[] {
  const colour = mainColour(garments)
  const palette = colour ? COLOURS[colour] : undefined
  const allSame = colour !== undefined && garments.filter((garment) => garment.role !== 'Accesorio').every((garment) => garment.colors[0] === colour)
  const settings = SETTINGS[context.occasion] ?? SETTINGS.Diario!
  const season = SEASONS[seasonOfDate(context.date ?? new Date())]!
  const aesthetic = aestheticOf(garments)
  const rainy = context.weatherConditions?.some((condition) => /lluvia|llovizna|chubasco|tormenta/i.test(condition))
  const cold = context.temperatureCelsius !== undefined && context.temperatureCelsius <= 8
  const hot = context.temperatureCelsius !== undefined && context.temperatureCelsius >= 27
  const names: string[] = []
  for (const setting of settings) {
    if (palette) names.push(`${setting} ${palette.in}`)
    names.push(`${setting} ${season}`)
  }
  // «Total black», «Todo en blanco» only when it is all that colour; the other names of the colour also with the season.
  if (palette) for (const own of palette.own) {
    const whole = /^(todo|total)\b/i.test(own)
    if (allSame) names.push(own)
    else if (!whole) names.push(`${own} ${season}`)
  }
  if (aesthetic) {
    names.push(`${aesthetic} ${season}`)
    for (const setting of settings.slice(0, 3)) names.push(`${aesthetic} de ${lower(setting)}`)
  }
  if (rainy) names.push('Capas para la lluvia', 'Día de lluvia', palette ? `Lluvia ${palette.in}` : 'Bajo la lluvia')
  if (cold) names.push('Abrigo y calma', 'Frío con estilo')
  if (hot) names.push('Fresco y ligero', 'Calor sin prisa')
  return [...new Set(names.map((name) => name.replace(/\s+/g, ' ').trim()).filter((name) => name.length <= 40))]
}

/**
 * One name for the outfit: the same outfit gets the same name, and `variant` (1, 2…) another one each time,
 * going round when all have been given.
 */
export function outfitName(garments: Garment[], context: NameContext, variant = 0) {
  const names = outfitNames(garments, context)
  if (!names.length) return context.occasion
  // The weather and the colour first when they say something: the first name should fit best.
  const key = garments.map((garment) => garment.id).sort().join('|')
  const preferred = names.filter((name) => /lluvia|frío|calor|fresco|abrigo/i.test(name))
  const ordered = [...preferred, ...names.filter((name) => !preferred.includes(name))]
  const start = preferred.length ? 0 : hash(key) % ordered.length
  return ordered[(start + variant) % ordered.length]!
}
