import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error?: Error
  copied?: 'yes' | 'no'
}

/**
 * Shows a way out instead of a blank page when a screen fails, or when a new version has replaced the code of a screen
 * loaded on demand. Nothing is sent anywhere: the user decides whether to copy the report and pass it on.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {}
  private componentStack = ''

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.componentStack = info.componentStack ?? ''
    console.error('Error en la interfaz:', error)
  }

  private report() {
    const { error } = this.state
    return [
      `Molt · ${new Date().toISOString()}`,
      navigator.userAgent,
      `${error?.name}: ${error?.message}`,
      error?.stack ?? '',
      this.componentStack
    ].join('\n')
  }

  private copyReport = async () => {
    try {
      await navigator.clipboard.writeText(this.report())
      this.setState({ copied: 'yes' })
    } catch {
      this.setState({ copied: 'no' })
    }
  }

  override render() {
    const { error, copied } = this.state
    if (!error) return this.props.children
    return (
      <section className="empty-state" role="alert">
        <h2>Algo ha fallado.</h2>
        <p>Tus prendas siguen guardadas en este dispositivo. Volver a cargar la app suele arreglarlo.</p>
        <div className="empty-actions">
          <button className="button button-dark" type="button" onClick={() => window.location.reload()}>Volver a cargar</button>
          <button className="button button-outline" type="button" onClick={() => void this.copyReport()}>Copiar informe del error</button>
        </div>
        {copied && <p role="status">{copied === 'yes' ? 'Informe copiado. No incluye tus prendas ni tus fotos.' : 'Este navegador no ha permitido copiar el informe.'}</p>}
      </section>
    )
  }
}
