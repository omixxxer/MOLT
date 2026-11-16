import { useEffect, useId, useRef, useState } from 'react'
import { placeLabel, searchPlaces, type Place } from '../../weather/openMeteo'

interface PlaceFieldProps {
  label: string
  query: string
  onQuery: (query: string) => void
  onSelect: (place: Place) => void
  placeholder?: string
  autoFocus?: boolean
}

/** A city by name, chosen from those that exist: several places share a name, and each has its own weather. */
export default function PlaceField({ label, query, onQuery, onSelect, placeholder, autoFocus }: PlaceFieldProps) {
  const id = useId()
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  // What the box already shows after choosing a place, which needs no search.
  const chosen = useRef(query)

  useEffect(() => {
    if (query.trim().length < 2 || query === chosen.current) {
      setResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    setFailed(false)
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((found) => {
          setResults(found)
          setActive(0)
          setOpen(true)
          setSearching(false)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setResults([])
          setFailed(true)
          setSearching(false)
        })
    }, 280)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  function choose(place: Place) {
    const text = placeLabel(place)
    chosen.current = text
    onQuery(text)
    onSelect(place)
    setOpen(false)
    setResults([])
  }

  const showList = open && query !== chosen.current && query.trim().length >= 2 && !searching

  return (
    <div className="place-field">
      <label className="form-field" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(event) => { onQuery(event.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!showList || !results.length) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % results.length) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + results.length) % results.length) }
          if (event.key === 'Enter') { event.preventDefault(); choose(results[active]!) }
          if (event.key === 'Escape') setOpen(false)
        }}
      />
      {showList && (
        <ul className="place-results" id={`${id}-list`} role="listbox" aria-label={`Resultados para ${query}`}>
          {results.map((place, index) => (
            <li key={place.id ?? placeLabel(place)} id={`${id}-${index}`} role="option" aria-selected={index === active} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}>
              <strong>{place.name}</strong>
              <span>{[place.region !== place.name ? place.region : undefined, place.country].filter(Boolean).join(', ')}</span>
            </li>
          ))}
          {!results.length && <li className="place-none" role="presentation">No encontramos ese lugar. Prueba con otro nombre.</li>}
        </ul>
      )}
      {failed && <p className="place-hint" role="status">No se pudo buscar. Comprueba tu conexión.</p>}
    </div>
  )
}
