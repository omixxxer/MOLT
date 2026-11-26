// The name proposed while the user has not typed one: subcategory, up to two colours and the brand, with the
// colours agreeing with the garment in gender and number («Sudadera roja», «Zapatillas blancas», «Vaqueros negros»).

/** Garment words whose ending misleads: «pijama» is masculine although it ends in -a. */
const MASCULINE_IN_A = new Set(['pijama', 'poncho', 'kimono'])
const FEMININE_OTHER = new Set(['blazer', 'parka', 'tanga'])

/** Colours that do not change with the garment: nouns used as colours (una falda naranja, unos zapatos rosa). */
const INVARIABLE_COLOURS = new Set(['naranja', 'rosa', 'beige', 'beis', 'crema', 'camel', 'lila', 'fucsia', 'caqui', 'turquesa', 'mostaza', 'burdeos', 'coral', 'salmón', 'vino'])

export interface Agreement {
  feminine: boolean
  plural: boolean
}

/** Gender and number of a garment's name, read from its first word («Camiseta de manga larga» → camiseta). */
export function garmentAgreement(subcategory: string): Agreement {
  const word = subcategory.trim().toLocaleLowerCase('es').split(/[\s/]+/)[0] ?? ''
  const plural = word.length > 3 && word.endsWith('s')
  const singular = plural ? word.replace(/es$/, '').replace(/s$/, '') : word
  if (MASCULINE_IN_A.has(singular)) return { feminine: false, plural }
  if (FEMININE_OTHER.has(singular)) return { feminine: true, plural }
  return { feminine: plural ? word.endsWith('as') : word.endsWith('a'), plural }
}

const unaccented: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }

/** A colour agreeing with the garment: «rojo» → roja, rojos; «gris» → grises; «azul marino» and «naranja» stay. */
export function agreeColour(colour: string, { feminine, plural }: Agreement): string {
  const text = colour.trim().toLocaleLowerCase('es')
  // Compound colours (azul marino, gris claro) and colour nouns are invariable.
  if (!text || text.includes(' ') || INVARIABLE_COLOURS.has(text)) return text
  if (text.endsWith('o')) return `${text.slice(0, -1)}${feminine ? 'a' : 'o'}${plural ? 's' : ''}`
  if (!plural) return text
  if (/[aeiou]$/.test(text)) return `${text}s`
  // marrón → marrones: the accent goes once the word grows a syllable.
  return `${text.replace(/[áéíóú](?=[^áéíóú]*$)/, (vowel) => unaccented[vowel] ?? vowel)}es`
}

// Every form a colour can take in a name, back to the colour: what fixNameAgreement recognises.
const COLOURS = [
  'negro', 'blanco', 'gris', 'beige', 'marrón', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'azul marino', 'morado',
  'rosa', 'dorado', 'plateado', 'multicolor', 'gris claro', 'gris oscuro', 'crema', 'camel'
]
const COLOUR_FORMS = new Map<string, string>()
for (const colour of COLOURS) {
  for (const feminine of [false, true]) for (const plural of [false, true]) COLOUR_FORMS.set(agreeColour(colour, { feminine, plural }), colour)
}
// Earlier names agreed these compounds in gender («gris clara»).
COLOUR_FORMS.set('gris clara', 'gris claro')
COLOUR_FORMS.set('gris oscura', 'gris oscuro')

/** The colour that ends these words («… azul marino», «… negras»), and how many words it takes. */
function trailingColour(words: string[]): { colour: string; length: number } | undefined {
  for (const length of [2, 1]) {
    if (words.length <= length) continue
    const colour = COLOUR_FORMS.get(words.slice(-length).join(' ').toLocaleLowerCase('es'))
    if (colour) return { colour, length }
  }
  return undefined
}

/**
 * A name shaped like the proposed ones («Sudadera blanco · Pull&Bear», «Botas negro y gris») with its colours agreeing
 * with its own garment word («Sudadera blanca · Pull&Bear», «Botas negras y grises»); undefined when the name does
 * not end in colours or already agrees. Its words and colours stay: only the grammar changes.
 */
export function fixNameAgreement(name: string): string | undefined {
  const [main = '', ...rest] = name.split(' · ')
  let words = main.trim().split(/\s+/)
  const colours: string[] = []
  const last = trailingColour(words)
  if (!last) return undefined
  colours.unshift(last.colour)
  words = words.slice(0, -last.length)
  if (words.at(-1) === 'y') {
    const first = trailingColour(words.slice(0, -1))
    if (first) {
      colours.unshift(first.colour)
      words = words.slice(0, -1 - first.length)
    }
  }
  if (!words.length || words.at(-1) === 'y') return undefined
  const garmentWords = words.join(' ')
  const agreement = garmentAgreement(garmentWords)
  const fixed = [[garmentWords, colours.map((colour) => agreeColour(colour, agreement)).join(' y ')].join(' '), ...rest].join(' · ')
  return fixed === name ? undefined : fixed
}

export function createSuggestedGarmentName(subcategory: string, colors: string[], brand: string): string {
  const agreement = garmentAgreement(subcategory)
  const colorText = colors.map((color) => color.trim()).filter(Boolean).slice(0, 2).map((color) => agreeColour(color, agreement)).join(' y ')
  const name = [subcategory.trim(), colorText].filter(Boolean).join(' ')
  return [name, brand.trim() ? `· ${brand.trim()}` : ''].filter(Boolean).join(' ').slice(0, 80).trimEnd()
}
