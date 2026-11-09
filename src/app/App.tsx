import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { garmentRepository } from '../db/garmentRepository'
import { requestPersistentStorage } from '../db/storageHealth'
import GarmentCard from '../components/GarmentCard'
import ErrorBoundary from '../components/ErrorBoundary'
import MoltMark from '../components/MoltMark'
import PillNav from '../components/PillNav.jsx'
import WardrobeData from '../components/WardrobeData'
import { useDriveSync } from '../cloud/useDriveSync'
import { garmentCategories, type Garment } from '../types/domain'
import { ClickSpark, Counter, GradualBlur, LatticeLoader } from '../components/reactBits'

type Page = 'home' | 'wardrobe' | 'add' | 'batch' | 'look' | 'outfits' | 'history' | 'packing'

// Loaded when first needed, so the wardrobe opens without them: the form and the detail bring the analyser,
// Outfits and Maleta their own screens, and the animated background its WebGL library.
const GarmentForm = lazy(() => import('../components/GarmentForm'))
const LookImport = lazy(() => import('../components/LookImport'))
const BatchImport = lazy(() => import('../components/BatchImport'))
const BatchReturn = lazy(() => import('../components/batchImport/BatchReturn'))
const GarmentDetailPanel = lazy(() => import('../components/GarmentDetailPanel'))
const OutfitGenerator = lazy(() => import('../components/OutfitGenerator'))
const TripPlanner = lazy(() => import('../components/TripPlanner'))
const HomeScreen = lazy(() => import('../components/home/HomeScreen'))
const WearHistory = lazy(() => import('../components/history/WearHistory'))
const PatternWaves = lazy(() => import('../components/PatternWaves.jsx'))

function ScreenLoader() {
  return <div className="loading-state"><LatticeLoader label="Cargando" pattern="ripple" fontSize={13} showTimer={false} /></div>
}

type PillItem = {
  label: string
  href: string
  icon: ReactNode
}

const navigation: PillItem[] = [
  { label: 'Inicio', href: '#inicio', icon: <span className="pill-nav__icon" aria-hidden="true">◉</span> },
  { label: 'Armario', href: '#armario', icon: <span className="pill-nav__icon" aria-hidden="true">▦</span> },
  { label: 'Outfits', href: '#outfits', icon: <span className="pill-nav__icon" aria-hidden="true">✳</span> },
  { label: 'Historial', href: '#historial', icon: <span className="pill-nav__icon" aria-hidden="true">◷</span> },
  { label: 'Maleta', href: '#maleta', icon: <span className="pill-nav__icon" aria-hidden="true">▣</span> }
]

const pageHrefs: Record<Page, string> = {
  home: '#inicio',
  history: '#historial',
  wardrobe: '#armario',
  add: '#armario',
  batch: '#armario',
  look: '#armario',
  outfits: '#outfits',
  packing: '#maleta'
}

const localStorageMessage = 'Tus prendas y fotografías se guardan únicamente en este dispositivo.'

function getGarmentLabel(garment: Garment) {
  return garment.name.trim() || garment.subcategory || garment.category
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [garments, setGarments] = useState<Garment[]>([])
  const [displayCount, setDisplayCount] = useState(40)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [lookMessage, setLookMessage] = useState('')
  const [outfitAround, setOutfitAround] = useState<{ id: string; nonce: number }>()
  // Used once: coming back to Outfits later does not start around that garment again.
  useEffect(() => {
    if (page !== 'outfits') setOutfitAround(undefined)
  }, [page])
  // Lives here, not in the wardrobe screen, so automatic Drive saves also follow changes made in Outfits.
  const drive = useDriveSync()

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(preference.matches)
    updatePreference()
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  const refreshGarments = useCallback(async () => {
    const list = await garmentRepository.list()
    setGarments(list)
    return list
  }, [])

  useEffect(() => {
    void refreshGarments()
      .catch(() => setError('No se pudo abrir el armario. Comprueba el almacenamiento de este navegador.'))
      .finally(() => setLoading(false))
  }, [refreshGarments])

  // Only once there is something to protect: some browsers ask the user, and an empty app has no reason to.
  const hasGarments = garments.length > 0
  useEffect(() => {
    if (hasGarments) void requestPersistentStorage()
  }, [hasGarments])

  const visibleGarments = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    return garments.filter((garment) => {
      const searchableText = [garment.code, garment.name, garment.subcategory, garment.brand, ...garment.colors]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
      return (!normalizedSearch || searchableText.includes(normalizedSearch))
        && (categoryFilter === 'Todas' || garment.category === categoryFilter)
    })
  }, [categoryFilter, garments, search])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const garment of garments) counts.set(garment.category, (counts.get(garment.category) ?? 0) + 1)
    return counts
  }, [garments])

  // The tabs of the three ways of adding garments.
  const addModes = (
    <div className="add-modes" role="group" aria-label="Cómo añadir">
      {([['add', 'Una prenda'], ['batch', 'Varias prendas'], ['look', 'Desde un look']] as const).map(([mode, label]) => (
        <button key={mode} type="button" aria-pressed={page === mode} onClick={() => setPage(mode)}>{label}</button>
      ))}
    </div>
  )

  const closeDetail = useCallback(() => setSelectedGarment(null), [])

  const createGarment = useCallback(async (garment: Garment) => {
    setError('')
    await garmentRepository.create(garment)
    await refreshGarments()
    setPage('wardrobe')
  }, [refreshGarments])

  const updateGarment = useCallback(async (garment: Garment) => {
    setError('')
    await garmentRepository.update(garment)
    await refreshGarments()
    setSelectedGarment(garment)
  }, [refreshGarments])

  const removeGarment = useCallback(async (id: string) => {
    setError('')
    await garmentRepository.remove(id)
    await refreshGarments()
  }, [refreshGarments])

  const updateAvailability = useCallback(async (garment: Garment) => {
    await garmentRepository.update(garment)
    await refreshGarments()
  }, [refreshGarments])

  function handleNavigation(_item: PillItem, index: number, event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    event.preventDefault()
    const next = (['home', 'wardrobe', 'outfits', 'history', 'packing'] as const)[index]
    if (next) setPage(next)
  }

  return (
    <>
      <Suspense fallback={null}>
      <PatternWaves
        className="app-background"
        preset="pond"
        pattern="dot"
        wave="ripple"
        spacing={13}
        markSize={0.75}
        depth={0.4}
        light={undefined}
        shine={0.3}
        contrast={0.8}
        scale={1.6}
        direction={35}
        color="#8A79B2"
        backgroundColor="#F8F6FB"
        opacity={0.36}
        speed={0.25}
        fade="none"
        interactive
        paused={reducedMotion}
        style={undefined}
      />
      </Suspense>
      <ClickSpark sparkColor="#9786BC" sparkSize={9} sparkRadius={20} sparkCount={7} sparkWidth={1.5} duration={380} style={{ height: 'auto' }}>
      <div className="app-shell">
        <header className="app-header">
          <a className="wordmark" href="#inicio" onClick={() => setPage('home')} aria-label="Molt, ir al inicio">
            <MoltMark />
            Molt<span aria-hidden="true">.</span>
          </a>
          <span className="privacy-note"><span className="privacy-indicator" /><span className="privacy-long">{localStorageMessage}</span><span className="privacy-short">Guardado solo en tu dispositivo</span></span>
        </header>

        <main className="screen-content">
          {error && <div className="alert" role="alert">{error}</div>}
          {/* One per page: a failed screen leaves the navigation working, and going to another page recovers. */}
          <ErrorBoundary key={page}>
          {page === 'home' && (
            <Suspense fallback={<ScreenLoader />}>
              <HomeScreen garments={garments} loading={loading} onNavigate={setPage} onOpenGarment={setSelectedGarment} />
            </Suspense>
          )}

          {page === 'wardrobe' && (
            <section aria-labelledby="wardrobe-title">
              <WardrobeData garments={garments} onImported={refreshGarments} drive={drive}>
                {({ menu, notices }) => <>
              <div className="page-heading">
                <div>
                                    <h1 id="wardrobe-title">Armario<span>.</span></h1>
                  {garments.length > 0 && <p className="page-intro"><span className="wardrobe-count"><Counter value={garments.length} locale="es" fontSize="1em" fade={0.15} intro={false} /> {garments.length === 1 ? 'prenda' : 'prendas'}</span> en tu colección</p>}
                </div>
                <div className="page-actions">
                  {menu}
                  <button className="button button-outline" type="button" onClick={() => setPage('batch')}>Añadir varias</button>
                  <button className="button button-dark" type="button" onClick={() => setPage('add')}>＋ Añadir prenda</button>
                </div>
              </div>
              {notices}
              {lookMessage && <p className="export-note" role="status">{lookMessage}</p>}
                </>}
              </WardrobeData>

              <Suspense fallback={null}><BatchReturn onOpen={() => setPage('batch')} /></Suspense>

              {garments.length > 0 && (
                <div className="wardrobe-toolbar">
                  <label className="search-field">
                    <HugeiconsIcon icon={Search01Icon} size={16} />
                    <span className="visually-hidden">Buscar prendas</span>
                    <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setDisplayCount(40) }} placeholder="Buscar en tu armario" />
                  </label>
                  <div className="category-chips" role="group" aria-label="Filtrar por categoría">
                    {['Todas', ...garmentCategories.filter((category) => categoryCounts.has(category))].map((category) => (
                      <button key={category} type="button" aria-pressed={categoryFilter === category} onClick={() => { setCategoryFilter(category); setDisplayCount(40) }}>
                        {category} <small>{category === 'Todas' ? garments.length : categoryCounts.get(category)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="loading-state"><LatticeLoader label="Abriendo tu armario" pattern="ripple" fontSize={13} showTimer={false} /></div>
              ) : visibleGarments.length === 0 ? (
                <section className="empty-state">
                  <div className="empty-mark" aria-hidden="true">✳</div>
                  <h2>{garments.length === 0 ? 'Tu armario empieza aquí.' : 'No encontramos esa prenda.'}</h2>
                  <p>{garments.length === 0
                    ? 'Haz fotos a tus prendas y Molt las reconoce y les quita el fondo. Puedes añadirlas de una en una o todas de golpe.'
                    : 'Cambia el texto o la categoría para ver más resultados.'}</p>
                  {garments.length === 0 && (
                    <div className="empty-actions">
                      <button className="button button-dark" type="button" onClick={() => setPage('batch')}>Añadir varias de golpe</button>
                      <button className="button button-outline" type="button" onClick={() => setPage('add')}>Añadir una prenda</button>
                    </div>
                  )}
                </section>
              ) : (
                <ul className="garment-grid">
                  {visibleGarments.slice(0, displayCount).map((garment) => (
                    <li key={garment.id}><GarmentCard garment={garment} label={getGarmentLabel(garment)} onOpen={() => setSelectedGarment(garment)} /></li>
                  ))}
                </ul>
              )}
              {displayCount < visibleGarments.length && !loading && (
                <div className="catalog-more">
                  <p>Mostrando {displayCount} de {visibleGarments.length} prendas.</p>
                  <button className="button button-outline" type="button" onClick={() => setDisplayCount((count) => count + 40)}>Cargar 40 más</button>
                </div>
              )}
            </section>
          )}

          {page === 'add' && (
            <section className="form-screen" aria-labelledby="add-title">
                            <h1 id="add-title">Añadir prenda<span>.</span></h1>
              {addModes}
              <Suspense fallback={<ScreenLoader />}>
                <GarmentForm
                  onSave={createGarment}
                  onCancel={() => setPage('wardrobe')}
                  submitLabel="Guardar prenda"
                />
              </Suspense>
            </section>
          )}

          {page === 'batch' && (
            <section className="form-screen" aria-labelledby="batch-title">
                            <h1 id="batch-title">Añadir varias prendas<span>.</span></h1>
              {addModes}
              <Suspense fallback={<ScreenLoader />}>
                <BatchImport
                  onDone={(added) => {
                    void refreshGarments()
                    setPage('wardrobe')
                    setLookMessage(`${added} ${added === 1 ? 'prenda añadida' : 'prendas añadidas'}.`)
                  }}
                />
              </Suspense>
            </section>
          )}

          {page === 'look' && (
            <section className="form-screen" aria-labelledby="look-title">
                            <h1 id="look-title">Desde un look<span>.</span></h1>
              {addModes}
              <p className="page-intro">Una foto de cuerpo entero: Molt busca cada prenda, la recorta y la reconoce. Es un prototipo; revisa lo que encuentre.</p>
              <Suspense fallback={<ScreenLoader />}>
                <LookImport
                  onDone={(added) => {
                    void refreshGarments()
                    setPage('wardrobe')
                    setLookMessage(`${added} ${added === 1 ? 'prenda añadida' : 'prendas añadidas'} desde el look.`)
                  }}
                  onCancel={() => setPage('add')}
                />
              </Suspense>
            </section>
          )}

          {page === 'outfits' && (
            <Suspense fallback={<ScreenLoader />}>
              <OutfitGenerator garments={garments} onAvailabilityChange={updateAvailability} onAddGarments={() => setPage('batch')} startGarmentId={outfitAround} />
            </Suspense>
          )}
          {page === 'history' && (
            <Suspense fallback={<ScreenLoader />}>
              <WearHistory garments={garments} onAddGarments={() => setPage('batch')} onCreateOutfit={() => setPage('outfits')} onOpenGarment={setSelectedGarment} />
            </Suspense>
          )}
          {page === 'packing' && <Suspense fallback={<ScreenLoader />}><TripPlanner garments={garments} onAvailabilityChange={updateAvailability} onAddGarments={() => setPage('batch')} /></Suspense>}
          </ErrorBoundary>
        </main>

        {/* Content scrolling under the bottom navigation blurs softly instead of being cut; gone at the end of the page. */}
        <GradualBlur target="page" position="bottom" height="6.5rem" strength={1.4} layers={6} autoHide zIndex={15} />
        <PillNav
          items={navigation}
          activeHref={pageHrefs[page]}
          onItemClick={handleNavigation}
          logo={undefined}
          onMenuToggle={undefined}
          style={undefined}
          theme="dark"
          surface="solid"
          layout="split"
          size="md"
          itemStyle="pill"
          hoverEffect="fill"
          indicator="pill"
          barColor="#2D2838"
          textColor="#F8F6FB"
          highlightColor="#B3A6D3"
          highlightTextColor="#2D2838"
          collapse="never"
          intro={false}
          ariaLabel="Navegación principal"
          className="molt-pill-nav"
        />
      </div>
      </ClickSpark>

      {selectedGarment && (
        <Suspense fallback={null}>
          <GarmentDetailPanel
            garment={selectedGarment}
            onCreateOutfit={(garment) => {
              setSelectedGarment(null)
              setOutfitAround({ id: garment.id, nonce: Date.now() })
              setPage('outfits')
            }}
            onClose={closeDetail}
            onSave={updateGarment}
            onDelete={removeGarment}
          />
        </Suspense>
      )}
    </>
  )
}

export default App
