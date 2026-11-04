import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  analyzeGarmentImage,
  labelSize,
  readGarmentLabel,
  type ClothingAnalysisSuggestion,
  type LabelReading
} from '../ai/clothingAnalyzer'
import { colorSwatch } from '../ai/colors'
import { cutOutGarments, cutoutColors } from '../ai/cutout'
import type { SegmentationMap } from '../ai/segmentation'
import { suggestUsage } from '../ai/usageRules'
import { createThumbnail, reducePhoto } from '../db/imageProcessing'
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB } from '../db/photoLimits'
import { taxonomy } from '../ml/taxonomy'
import {
  dressLevels,
  garmentCategories,
  roleByCategory,
  type DressLevel,
  type Garment,
  type GarmentCategory,
  type Season
} from '../types/domain'
import ColorPalette from './ColorPalette'
import AnalysisCard from './garmentForm/AnalysisCard'
import { analysisRecord } from './garmentForm/analysisRecord'
import { ChipsField, FormFold, FieldHeading, FormSection, SuggestedBadge } from './garmentForm/fields'
import { createSuggestedGarmentName } from './garmentForm/garmentName'
import LabelPhotoSlot, { type LabelFinding } from './garmentForm/LabelPhotoSlot'
import PhotoCollection from './garmentForm/PhotoCollection'

const seasons: Season[] = ['Primavera', 'Verano', 'Otoño', 'Invierno']
const dressLevelHints: Record<DressLevel, string> = {
  Deportivo: 'Para hacer deporte',
  Diario: 'Día a día, sin código',
  Arreglado: 'Cena, oficina, una cita',
  Formal: 'Boda, evento, traje'
}
const maxPhotos = 4
const colorOptions = taxonomy.attributes.colors.values.map((value) => value.label)
const patternOptions = taxonomy.attributes.pattern.values.map((value) => value.label)
// How dressed up a garment is goes in «Estilo» (dress levels); these are aesthetics.
const styleOptions = ['Minimalista', 'Clásico', 'Urbano', 'Bohemio', 'Romántico', 'Vintage', 'Rockero', 'Preppy']

// Fields the analysis can fill; each shows a «Sugerido» mark until the user edits it.
type SuggestedField = 'category' | 'subcategory' | 'colors' | 'pattern' | 'brand' | 'size' | 'composition' | UsageField
// Suggested from the garment type (usageRules) and kept up to date with it until the user changes them.
type UsageField = 'seasons' | 'dressLevels' | 'styles'
const usageFields: UsageField[] = ['seasons', 'dressLevels', 'styles']

interface GarmentFormProps {
  garment?: Garment
  onSave: (garment: Garment) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

export default function GarmentForm({ garment, onSave, onCancel, submitLabel }: GarmentFormProps) {
  const fieldId = useId()
  const [name, setName] = useState(garment?.name ?? '')
  const [category, setCategory] = useState<GarmentCategory>(garment?.category ?? 'Parte superior')
  const [subcategory, setSubcategory] = useState(garment?.subcategory ?? '')
  const [colors, setColors] = useState<string[]>(garment?.colors ?? [])
  const [pattern, setPattern] = useState(garment?.pattern ?? '')
  const [brand, setBrand] = useState(garment?.brand ?? '')
  const [size, setSize] = useState(garment?.size ?? '')
  const [composition, setComposition] = useState(garment?.composition ?? '')
  const [price, setPrice] = useState(garment?.price === undefined ? '' : String(garment.price).replace('.', ','))
  const [notes, setNotes] = useState(garment?.notes ?? '')
  const [selectedSeasons, setSelectedSeasons] = useState<Season[]>(garment?.seasons ?? [])
  const [styles, setStyles] = useState<string[]>(garment?.styles ?? [])
  const [levels, setLevels] = useState<DressLevel[]>(garment?.dressLevels ?? [])
  const [nameManuallyEdited, setNameManuallyEdited] = useState(Boolean(garment?.name))
  const [photos, setPhotos] = useState<Blob[]>(() => garment ? [garment.image, ...(garment.additionalImages ?? [])] : [])
  const [imageChanged, setImageChanged] = useState(false)
  // The main photo without its background, shown and saved unless the user prefers the original.
  const [cutout, setCutout] = useState<Blob | undefined>(garment?.cutout)
  const [cuttingOut, setCuttingOut] = useState(false)
  const [useCutout, setUseCutout] = useState(true)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisSuggestion, setAnalysisSuggestion] = useState<ClothingAnalysisSuggestion>()
  const [suggested, setSuggested] = useState<Set<SuggestedField>>(() => new Set())
  // The care label has its own photo, read only for text, so it never weighs on the garment photos' results.
  const [labelPhoto, setLabelPhoto] = useState<Blob | undefined>(garment?.labelImage)
  const [labelReading, setLabelReading] = useState<LabelReading>()
  const [readingLabel, setReadingLabel] = useState(false)
  const [labelError, setLabelError] = useState('')
  const analysisRequestId = useRef(0)
  const labelRequestId = useRef(0)
  // Analyses finish later; they must see what the user typed meanwhile, not the values when they started.
  const typed = useRef({ brand, size, composition, suggested, category })
  typed.current = { brand, size, composition, suggested, category }
  // A saved garment keeps the use the user gave it; a new one follows the suggestion until the user changes it.
  const usageTouched = useRef(new Set<UsageField>(garment ? usageFields : []))

  useEffect(() => {
    if (!analysisSuggestion || nameManuallyEdited) return
    setName(createSuggestedGarmentName(subcategory, colors, brand))
  }, [analysisSuggestion, brand, colors, nameManuallyEdited, subcategory])

  // Which size a label gives depends on the garment (a number for shoes, a letter for tops): choose it again when
  // the category changes, unless the user has typed a size.
  const sizeFromLabel = labelSize(labelReading, category)
  useEffect(() => {
    if (!sizeFromLabel) return
    const { size: current, suggested: marks } = typed.current
    if (current.trim() && !marks.has('size')) return
    setSize(sizeFromLabel.value)
    mark(['size'])
  }, [sizeFromLabel?.value]) // eslint-disable-line react-hooks/exhaustive-deps

  const usage = suggestUsage({ category, subcategory, sleeve: analysisSuggestion?.sleeve?.value, composition })
  const usageKey = JSON.stringify(usage)
  const hasType = Boolean(analysisSuggestion || subcategory.trim())
  useEffect(() => {
    if (!hasType) return
    const untouched = usageFields.filter((field) => !usageTouched.current.has(field))
    if (untouched.includes('seasons')) setSelectedSeasons(usage.seasons)
    if (untouched.includes('dressLevels')) setLevels(usage.dressLevels)
    if (untouched.includes('styles')) setStyles(usage.styles)
    // No style is suggested for most types: then the field is left empty and unmarked.
    mark(untouched.filter((field) => field !== 'styles' || usage.styles.length))
    if (untouched.includes('styles') && !usage.styles.length) edited('styles')
  }, [usageKey, hasType]) // eslint-disable-line react-hooks/exhaustive-deps

  function touchUsage(field: UsageField) {
    usageTouched.current.add(field)
    edited(field)
  }

  function mark(fields: SuggestedField[]) {
    setSuggested((current) => fields.every((field) => current.has(field)) ? current : new Set([...current, ...fields]))
  }

  function edited(field: SuggestedField) {
    setSuggested((current) => {
      if (!current.has(field)) return current
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }

  function selectImages(files: FileList | null) {
    setFormError('')
    const selectedFiles = Array.from(files ?? [])
    if (!selectedFiles.length) return
    // One unusable photo does not lose the others chosen with it.
    const validFiles = selectedFiles.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= MAX_PHOTO_BYTES)
    const rejected = selectedFiles.length - validFiles.length
    if (rejected) {
      setFormError(`${rejected === 1 ? '1 archivo no se ha añadido' : `${rejected} archivos no se han añadido`}: solo fotos JPG, PNG o WebP de ${MAX_PHOTO_MB} MB o menos.`)
    }
    if (!validFiles.length) return
    if (photos.length + validFiles.length > maxPhotos) {
      setFormError(`Puedes guardar hasta ${maxPhotos} fotos por prenda. Quita alguna antes de añadir más.`)
      return
    }
    const nextPhotos = [...photos, ...validFiles]
    setPhotos(nextPhotos)
    setImageChanged(true)
    setAnalysisSuggestion(undefined)
    setAnalysisError('')
    void analyzeImage(nextPhotos)
  }

  function updatePhotos(nextPhotos: Blob[]) {
    setCutout(undefined)
    setPhotos(nextPhotos)
    setImageChanged(true)
    setAnalysisSuggestion(undefined)
    setAnalysisError('')
    void analyzeImage(nextPhotos)
  }

  async function analyzeImage(imagesToAnalyze: Blob[] = photos) {
    if (!imagesToAnalyze.length) {
      analysisRequestId.current += 1
      setAnalyzing(false)
      return
    }
    const requestId = ++analysisRequestId.current
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const suggestion = await analyzeGarmentImage(imagesToAnalyze)
      if (requestId !== analysisRequestId.current) return
      const filled: SuggestedField[] = ['category', 'subcategory', 'colors']
      setAnalysisSuggestion(suggestion)
      void cutOutMainPhoto(imagesToAnalyze[0]!, suggestion.segmentations[0], requestId)
      setCategory(suggestion.category)
      setSubcategory(suggestion.subcategory)
      setColors(suggestion.colors)
      if (suggestion.pattern) {
        setPattern(suggestion.pattern.label)
        filled.push('pattern')
      }
      // A brand typed by the user is never replaced by one read from the photo.
      if (suggestion.brand && !typed.current.brand.trim()) {
        setBrand(suggestion.brand.brand)
        filled.push('brand')
      }
      // Marks from the label photo (size, composition) stay; those of a previous analysis of these photos go.
      setSuggested((current) => new Set([
        ...[...current].filter((field) => ['brand', 'size', 'composition', ...usageFields].includes(field)),
        ...filled
      ]))
    } catch (error) {
      console.error('No se pudo analizar la imagen de la prenda:', error)
      if (requestId === analysisRequestId.current) {
        setAnalysisError('No se pudo cargar o ejecutar el modelo. Comprueba la conexión si es la primera vez y el espacio y la memoria del dispositivo. La foto no se envía y no se ha generado ninguna predicción.')
      }
    } finally {
      if (requestId === analysisRequestId.current) setAnalyzing(false)
    }
  }

  /** Cuts the main photo out in the background; a newer analysis (other photos) makes this result obsolete. */
  async function cutOutMainPhoto(photo: Blob, map: SegmentationMap | undefined, requestId: number) {
    if (!map) return
    setCuttingOut(true)
    try {
      const [main] = await cutOutGarments(photo, map, 'single')
      if (requestId !== analysisRequestId.current) return
      setCutout(main?.image)
      // The cut-out's own pixels give the colours more exactly than the coarse map; only if the user kept them.
      if (main && typed.current.suggested.has('colors')) {
        const measured = await cutoutColors(main.image)
        if (measured.length && requestId === analysisRequestId.current && typed.current.suggested.has('colors')) {
          setColors(measured.map((entry) => entry.color))
        }
      }
    } catch (error) {
      console.warn('No se pudo quitar el fondo de la foto:', error)
    } finally {
      if (requestId === analysisRequestId.current) setCuttingOut(false)
    }
  }

  function selectLabelPhoto(file: File | undefined) {
    setLabelError('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      setLabelError(`La foto de la etiqueta debe ser JPG, PNG o WebP de ${MAX_PHOTO_MB} MB o menos.`)
      return
    }
    setLabelPhoto(file)
    void readLabel(file)
  }

  function removeLabelPhoto() {
    labelRequestId.current += 1
    setLabelPhoto(undefined)
    setLabelReading(undefined)
    setReadingLabel(false)
    setLabelError('')
  }

  async function readLabel(image: Blob) {
    const requestId = ++labelRequestId.current
    setReadingLabel(true)
    setLabelReading(undefined)
    try {
      const reading = await readGarmentLabel(image)
      if (requestId !== labelRequestId.current) return
      setLabelReading(reading)
      // A new label photo is the latest word on what it shows: what it reads replaces brand, size and composition,
      // even if typed. Fields it does not read are left as they are. Later category changes choose the size again
      // (effect above).
      const filled: SuggestedField[] = []
      if (reading.brand) {
        setBrand(reading.brand.brand)
        filled.push('brand')
      }
      const readSize = labelSize(reading, typed.current.category)
      if (readSize) {
        setSize(readSize.value)
        filled.push('size')
      }
      if (reading.composition) {
        setComposition(reading.composition.value)
        filled.push('composition')
      }
      mark(filled)
      if (!reading.brand && !reading.composition && !reading.lines.length) {
        setLabelError('No se ha podido leer texto en la etiqueta. Prueba con una foto más cercana, recta y con buena luz.')
      }
    } catch (error) {
      console.error('No se pudo leer la etiqueta:', error)
      if (requestId === labelRequestId.current) setLabelError('No se pudo leer la etiqueta en este dispositivo. Puedes rellenar los campos a mano.')
    } finally {
      if (requestId === labelRequestId.current) setReadingLabel(false)
    }
  }

  function toggleLevel(level: DressLevel) {
    touchUsage('dressLevels')
    // Kept in scale order, whatever order they were ticked in.
    setLevels((current) => dressLevels.filter((value) => value === level ? !current.includes(value) : current.includes(value)))
  }

  function toggleSeason(season: Season) {
    touchUsage('seasons')
    setSelectedSeasons((current) => current.includes(season)
      ? current.filter((value) => value !== season)
      : [...current, season])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!photos.length) {
      setFormError('Añade una fotografía para guardar la prenda.')
      return
    }

    setSaving(true)
    try {
      // Stored photos are reduced (≤ 2048 px); photos already saved are not processed again.
      const [image, ...additionalImages] = (imageChanged ? await Promise.all(photos.map(reducePhoto)) : photos) as [Blob, ...Blob[]]
      const labelImage = labelPhoto && labelPhoto !== garment?.labelImage ? await reducePhoto(labelPhoto) : labelPhoto
      // The gallery shows the cut-out when there is one; its thumbnail and size come from it.
      const savedCutout = useCutout ? cutout : undefined
      const processedImage = imageChanged || savedCutout !== garment?.cutout || !garment || !garment.thumbnail || !garment.width || !garment.height
        ? await createThumbnail(savedCutout ?? image)
        : {
            thumbnail: garment.thumbnail,
            width: garment.width,
            height: garment.height
          }
      const timestamp = Date.now()
      const analysis = analysisRecord({
        suggestion: analysisSuggestion,
        labelReading,
        labelSize: sizeFromLabel,
        imageChanged,
        garment,
        values: { category, subcategory, colors, pattern, brand, size, composition }
      })
      await onSave({
        id: garment?.id ?? crypto.randomUUID(),
        ...(garment?.code ? { code: garment.code } : {}),
        name: name.trim(),
        category,
        subcategory: subcategory.trim(),
        colors,
        pattern: pattern.trim() || undefined,
        brand: brand.trim() || undefined,
        size: size.trim() || undefined,
        composition: composition.trim() || undefined,
        price: Number(price.replace(',', '.')) > 0 ? Number(price.replace(',', '.')) : undefined,
        notes: notes.trim() || undefined,
        seasons: selectedSeasons,
        styles,
        dressLevels: levels,
        role: roleByCategory[category],
        availability: garment?.availability,
        image,
        ...(additionalImages.length ? { additionalImages } : {}),
        ...(labelImage ? { labelImage } : {}),
        ...(savedCutout ? { cutout: savedCutout } : {}),
        thumbnail: processedImage.thumbnail,
        width: processedImage.width,
        height: processedImage.height,
        confirmedAttributes: ['category', 'colors', 'seasons', 'styles', 'dressLevels', ...(pattern.trim() ? ['pattern'] : [])],
        suggestedAttributes: analysisSuggestion
          ? ['category', 'subcategory', 'colors',
              ...(['pattern', 'brand', 'size', 'composition'] as const).filter((attribute) => suggested.has(attribute))]
          : imageChanged ? [] : garment?.suggestedAttributes ?? [],
        analysis,
        createdAt: garment?.createdAt ?? new Date(timestamp).toISOString(),
        updatedAt: new Date(timestamp).toISOString()
      })
    } catch {
      setFormError('No se pudo guardar la prenda. Comprueba la imagen y el espacio disponible e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const categoryId = taxonomy.categories.find((entry) => entry.label === category)?.id
  const subcategoryOptions = taxonomy.subcategories.filter((entry) => entry.category === categoryId).map((entry) => entry.label)
  // A pattern typed in an earlier version of the form stays selectable.
  const patterns = pattern && !patternOptions.includes(pattern) ? [...patternOptions, pattern] : patternOptions
  const brandRead = labelReading?.brand ?? analysisSuggestion?.brand
  const readFromLabel: LabelFinding[] = ([
    ['Marca', brandRead?.brand, brandRead?.text],
    ['Talla', sizeFromLabel && (sizeFromLabel.european ? `${sizeFromLabel.value} (≈ ${sizeFromLabel.european} EU)` : sizeFromLabel.value), sizeFromLabel?.text],
    ['Composición', labelReading?.composition?.value, labelReading?.composition?.text]
  ] as const).filter(([, value]) => value)

  const hasPhotos = photos.length > 0
  const labelSummary = [brand, size, composition].filter(Boolean).join(' · ')
  const usageSummary = [selectedSeasons.length === seasons.length ? 'Todo el año' : selectedSeasons.join(', '), levels.join(', '), styles.join(', ')].filter(Boolean).join(' · ')

  return (
    <form className="garment-form" onSubmit={(event) => void submit(event)}>
      <div className="garment-form-layout" {...(hasPhotos ? {} : { 'data-empty': '' })}>
        <aside className="garment-form-media">
          <PhotoCollection
            photos={photos}
            max={maxPhotos}
            disabled={saving}
            onAdd={selectImages}
            onChange={updatePhotos}
            cutout={useCutout ? cutout : undefined}
            cuttingOut={cuttingOut}
            canToggleCutout={Boolean(cutout)}
            onToggleCutout={() => setUseCutout((current) => !current)}
          />
        </aside>

        {hasPhotos && (
          <div className="garment-form-fields">
            <AnalysisCard
              analyzing={analyzing}
              photoCount={photos.length}
              suggestion={analysisSuggestion}
              labelHasBrand={Boolean(labelReading?.brand)}
              error={analysisError}
              disabled={saving}
              onAlternative={(candidate) => {
                setCategory(candidate.category)
                setSubcategory(candidate.subcategory)
                setName(candidate.subcategory)
                edited('category')
                edited('subcategory')
              }}
              onAnalyze={() => void analyzeImage()}
            />

            <FormSection title="La prenda">
              <div className="form-field full form-field-title">
                <FieldHeading htmlFor={`${fieldId}-name`} label="Nombre" hint={nameManuallyEdited ? undefined : 'Se propone solo; cámbialo si quieres'} />
                <input id={`${fieldId}-name`} value={name} onChange={(event) => { setName(event.target.value); setNameManuallyEdited(true) }} placeholder="p. ej. Camiseta azul · Marca" maxLength={80} />
              </div>
              <div className="form-field">
                <FieldHeading htmlFor={`${fieldId}-category`} label="Categoría" suggested={suggested.has('category')} />
                <select id={`${fieldId}-category`} value={category} onChange={(event) => { setCategory(event.target.value as GarmentCategory); edited('category') }}>
                  {garmentCategories.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div className="form-field">
                <FieldHeading htmlFor={`${fieldId}-subcategory`} label="Subcategoría" suggested={suggested.has('subcategory')} />
                <input id={`${fieldId}-subcategory`} list={`${fieldId}-subcategories`} value={subcategory} onChange={(event) => { setSubcategory(event.target.value); edited('subcategory') }} placeholder="p. ej. Camiseta" maxLength={50} />
                <datalist id={`${fieldId}-subcategories`}>{subcategoryOptions.map((value) => <option key={value} value={value} />)}</datalist>
              </div>
              <ChipsField label="Colores" values={colors} onChange={(values) => { setColors(values); edited('colors') }} options={colorOptions} placeholder="Elige abajo o escribe uno" suggested={suggested.has('colors')} swatch={colorSwatch} />
              <div className="form-field full">
                <ColorPalette values={colors} onChange={(values) => { setColors(values); edited('colors') }} disabled={saving} />
              </div>
              <div className="form-field full">
                <FieldHeading htmlFor={`${fieldId}-pattern`} label="Estampado" suggested={suggested.has('pattern')} />
                <select id={`${fieldId}-pattern`} value={pattern} onChange={(event) => { setPattern(event.target.value); edited('pattern') }}>
                  <option value="">Sin especificar</option>
                  {patterns.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
            </FormSection>

            <div>
              <FormFold title="Etiqueta" summary={labelSummary || 'Marca, talla y composición'} defaultOpen>
                <LabelPhotoSlot
                  photo={labelPhoto}
                  reading={readingLabel}
                  read={Boolean(labelReading)}
                  findings={readFromLabel}
                  error={labelError}
                  disabled={saving}
                  onSelect={selectLabelPhoto}
                  onRead={(photo) => void readLabel(photo)}
                  onRemove={removeLabelPhoto}
                />
                <div className="form-field">
                  <FieldHeading htmlFor={`${fieldId}-brand`} label="Marca" suggested={suggested.has('brand')} />
                  <input id={`${fieldId}-brand`} value={brand} onChange={(event) => { setBrand(event.target.value); edited('brand') }} maxLength={50} />
                </div>
                <div className="form-field">
                  <FieldHeading htmlFor={`${fieldId}-size`} label="Talla" suggested={suggested.has('size')} />
                  <input id={`${fieldId}-size`} value={size} onChange={(event) => { setSize(event.target.value); edited('size') }} placeholder="p. ej. M, 42, 38 US" maxLength={30} />
                </div>
                <div className="form-field full">
                  <FieldHeading htmlFor={`${fieldId}-composition`} label="Composición" suggested={suggested.has('composition')} />
                  <input id={`${fieldId}-composition`} value={composition} onChange={(event) => { setComposition(event.target.value); edited('composition') }} placeholder="p. ej. 95 % algodón, 5 % elastano" maxLength={120} />
                </div>
                <div className="form-field">
                  <FieldHeading htmlFor={`${fieldId}-price`} label="Precio (€, opcional)" />
                  <input id={`${fieldId}-price`} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^\d.,]/g, ''))} placeholder="Para ver el coste por puesta" maxLength={9} />
                </div>
              </FormFold>

              <FormFold title="Uso" summary={usageSummary || 'Temporadas, estilo y estética'}>
                <fieldset className="form-field full choice-field">
                  <legend>Temporadas{suggested.has('seasons') && <SuggestedBadge />}</legend>
                  <div className="choice-row">{seasons.map((season) => <label key={season} className={`choice-chip ${selectedSeasons.includes(season) ? 'selected' : ''}`}><input type="checkbox" checked={selectedSeasons.includes(season)} onChange={() => toggleSeason(season)} />{season}</label>)}</div>
                </fieldset>
                <fieldset className="form-field full choice-field">
                  <legend>Estilo{suggested.has('dressLevels') && <SuggestedBadge />}<small>Marca todos los que encajen</small></legend>
                  <div className="choice-row">{dressLevels.map((level) => <label key={level} className={`choice-chip ${levels.includes(level) ? 'selected' : ''}`} title={dressLevelHints[level]}><input type="checkbox" checked={levels.includes(level)} onChange={() => toggleLevel(level)} />{level}</label>)}</div>
                </fieldset>
                <ChipsField label="Estética" values={styles} onChange={(values) => { setStyles(values); touchUsage('styles') }} options={styleOptions} placeholder="Opcional, p. ej. Minimalista" suggested={suggested.has('styles')} />
              </FormFold>

              <FormFold title="Notas" summary={notes ? notes.slice(0, 60) : 'Opcional'}>
                <div className="form-field full">
                  <label className="visually-hidden" htmlFor={`${fieldId}-notes`}>Notas</label>
                  <textarea id={`${fieldId}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} placeholder="Dónde la compraste, cómo lavarla…" />
                </div>
              </FormFold>
            </div>
          </div>
        )}
      </div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      {hasPhotos && (
        <footer className="form-footer">
          <span className="form-footer-name">{name.trim() || subcategory || category}</span>
          <button className="button button-outline" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Guardando…' : submitLabel ?? (garment ? 'Guardar cambios' : 'Guardar prenda')}</button>
        </footer>
      )}
    </form>
  )
}
