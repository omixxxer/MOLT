export const garmentCategories = [
  'Parte superior',
  'Parte inferior',
  'Vestido / mono',
  'Abrigo',
  'Calzado',
  'Accesorio'
] as const

export type GarmentCategory = (typeof garmentCategories)[number]
/** How dressed up a garment is; a garment lists every level it suits (a white shirt: Diario, Arreglado, Formal). */
export const dressLevels = ['Deportivo', 'Diario', 'Arreglado', 'Formal'] as const
export type DressLevel = (typeof dressLevels)[number]
/** Single formality saved before database version 6, converted to dress levels by the upgrade. */
export type LegacyFormality = 'Casual' | 'Smart casual' | 'Formal'
export type GarmentRole = 'Top' | 'Bottom' | 'Una pieza' | 'Capa' | 'Calzado' | 'Accesorio'
export type Season = 'Primavera' | 'Verano' | 'Otoño' | 'Invierno'
export type GarmentAvailability = 'available' | 'laundry' | 'unavailable'
export type OutfitFeedbackType = 'like' | 'dislike' | 'saved' | 'worn' | 'included' | 'excluded'

export interface GarmentAnalysis {
  modelId: string
  modelVersion: string
  /** Scores calibrated by temperature scaling; missing in garments analysed before calibration. */
  calibrated?: boolean
  analyzedAt: string
  suggestions: {
    category: GarmentCategory
    subcategory: string
    colors: string[]
    pattern?: string
    sleeve?: string
    fit?: string
    brand?: string
    size?: string
    composition?: string
    alternatives?: Array<{
      category: GarmentCategory
      subcategory: string
      score: number
    }>
  }
  confidenceByAttribute: Partial<Record<'category' | 'subcategory' | 'colors' | 'pattern' | 'brand', number>>
  // wargon-vit and clip-zero-shot only appear in garments analysed by earlier versions of the app.
  sourcesByAttribute: Partial<Record<'category' | 'subcategory' | 'colors' | 'pattern' | 'brand' | 'size' | 'composition', 'vesta-dinov2' | 'paddle-ocr' | 'wargon-vit' | 'clip-zero-shot' | 'local-pixels'>>
  unknownAttributes: string[]
  correctedAttributes: string[]
}

/** A garment's data without its photos, which live in their own stores and are read only when shown. */
export interface Garment {
  id: string
  /** Short readable code given when the garment is created (e.g. SUD-002); never changes. */
  code?: string
  name: string
  category: GarmentCategory
  subcategory: string
  colors: string[]
  pattern?: string
  brand?: string
  size?: string
  /** Free text, e.g. "95 % algodón, 5 % elastano". */
  composition?: string
  notes?: string
  seasons: Season[]
  styles: string[]
  /** «Estilo» in the interface; empty when unknown. */
  dressLevels: DressLevel[]
  role: GarmentRole
  availability?: GarmentAvailability
  /** Size of the thumbnail, so the gallery can lay out before the image loads. */
  width: number
  height: number
  confirmedAttributes: string[]
  suggestedAttributes: string[]
  analysis?: GarmentAnalysis
  createdAt: string
  updatedAt: string
}

/** The original photos of a garment (reduced when saved), read only by the detail, the form and the exports. */
export interface GarmentPhotos {
  image: Blob
  additionalImages?: Blob[]
  /** Close-up of the care label, only read for brand, size and composition; not a garment photo. */
  labelImage?: Blob
}

/** A garment with every image, as the form saves it and the backup carries it. */
export type GarmentWithPhotos = Garment & GarmentPhotos & { thumbnail: Blob }

export interface Outfit {
  id: string
  garmentIds: string[]
  occasion: string
  kind?: 'generated' | 'manual'
  name?: string
  weather?: { temperatureCelsius?: number; conditions?: string[] }
  score: number
  createdAt: string
  favorite: boolean
  rating?: number
  wornAt?: string
}

export interface UserPreferences {
  id: 'current'
  preferredColors: string[]
  preferredStyles: string[]
  preferredDressLevel?: DressLevel
  feedbackWeights: Record<string, number>
  updatedAt: string
}

export interface OutfitFeedback {
  id: string
  type: OutfitFeedbackType
  garmentIds: string[]
  outfitId?: string
  createdAt: string
}

export interface TrendPack {
  id: string
  version: string
  publishedAt: string
  source: string
  categories: Array<{
    name: string
    rules: Array<{ attribute: string; value: string; weight: number }>
  }>
}
