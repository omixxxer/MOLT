import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

// Small building blocks of the garment form.

export function SuggestedBadge() {
  return <span className="suggested-badge" title="Rellenado por el análisis; revísalo">Sugerido</span>
}

export function FieldHeading({ htmlFor, label, hint, suggested }: { htmlFor?: string; label: string; hint?: string; suggested?: boolean }) {
  return (
    <div className="field-heading">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {hint && <small>{hint}</small>}
      {suggested && <SuggestedBadge />}
    </div>
  )
}

interface ChipsFieldProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  options: string[]
  placeholder: string
  suggested?: boolean
  /** CSS colour shown in each chip, for colours. */
  swatch?: (value: string) => string
}

/** A list of short values edited as chips; Enter, comma or leaving the field adds what was typed. */
export function ChipsField({ label, values, onChange, options, placeholder, suggested, swatch }: ChipsFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState('')

  function add(text: string) {
    const additions = text.split(',').map((value) => value.trim()).filter(Boolean)
    const known = new Set(values.map((value) => value.toLocaleLowerCase('es')))
    const fresh = additions.filter((value) => {
      const key = value.toLocaleLowerCase('es')
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    if (fresh.length) onChange([...values, ...fresh])
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
      setDraft('')
    } else if (event.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="form-field full">
      <FieldHeading htmlFor={id} label={label} suggested={suggested} />
      <div className="chips-input">
        {values.map((value) => (
          <span className="chip" key={value}>
            {swatch && <span className="color-dot" style={{ background: swatch(value) }} />}
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`Quitar ${value}`}>×</button>
          </span>
        ))}
        <input
          id={id}
          list={`${id}-options`}
          value={draft}
          onChange={(event) => {
            const text = event.target.value
            if (text.includes(',')) {
              add(text)
              setDraft('')
            } else {
              setDraft(text)
            }
          }}
          onKeyDown={keyDown}
          onBlur={() => {
            add(draft)
            setDraft('')
          }}
          placeholder={values.length ? 'Añadir…' : placeholder}
        />
        <datalist id={`${id}-options`}>
          {options.filter((option) => !values.includes(option)).map((option) => <option key={option} value={option} />)}
        </datalist>
      </div>
    </div>
  )
}

interface SuggestInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  maxLength?: number
}

/**
 * Free text with a list of suggestions. Unlike a native datalist, which filters by what the box
 * already holds (so a chosen value hides every other option), opening it shows the whole list,
 * and it only narrows once something is typed.
 */
export function SuggestInput({ id, value, onChange, options, placeholder, maxLength }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const query = value.trim().toLocaleLowerCase('es')
  const shown = typed && query ? options.filter((option) => option.toLocaleLowerCase('es').includes(query)) : options
  const showList = open && shown.length > 0

  function show() {
    setOpen(true)
    setTyped(false)
    setActive(options.indexOf(value))
  }

  function choose(option: string) {
    onChange(option)
    setOpen(false)
    setTyped(false)
  }

  return (
    <div className="suggest-field">
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onFocus={show}
        onClick={() => { if (!open) show() }}
        onChange={(event) => { onChange(event.target.value); setTyped(true); setOpen(true); setActive(-1) }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!showList) { show(); return }
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((active + step + shown.length) % shown.length)
          } else if (event.key === 'Enter' && showList && shown[active]) {
            event.preventDefault()
            choose(shown[active])
          } else if (event.key === 'Escape' && showList) {
            event.preventDefault()
            setOpen(false)
          }
        }}
      />
      {showList && (
        <ul className="suggest-list" id={`${id}-list`} role="listbox">
          {shown.map((option, index) => (
            <li
              key={option}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              data-current={option === value || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  )
}

/** A section that can stay folded: its summary says what it holds, so most garments never need opening it. */
export function FormFold({ title, summary, defaultOpen, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="form-fold" open={defaultOpen}>
      <summary>
        <span className="form-fold-title">{title}</span>
        {summary && <span className="form-fold-summary">{summary}</span>}
      </summary>
      <div className="form-grid">{children}</div>
    </details>
  )
}
