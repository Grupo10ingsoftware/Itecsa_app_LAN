import '../../../../../shared/loading/indicator.css'

/** Presentación solamente: el contenedor conserva la operación, foco y permisos. */
export default function LoadingIndicator({ scope = 'section', surface = 'light', size, context, className = '', announce = true }) {
  return <span className={`itecsa-loading ${className}`} data-scope={scope} data-surface={surface}
    data-size={size} role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined}>
    <svg className="itecsa-loading__ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="itecsa-loading__track" cx="24" cy="24" r="20" />
      <circle className="itecsa-loading__arc" cx="24" cy="24" r="20" />
    </svg>
    <span>Cargando...</span>
    {context && <span className="itecsa-loading__context"> {context}</span>}
  </span>
}

export function LoadingAction({ busy, children, surface = 'dark', context, announce = true }) {
  return <span className="itecsa-loading-action" data-busy={busy ? 'true' : undefined}>
    <span className="itecsa-loading-action__label" aria-hidden={busy || undefined}>{children}</span>
    {busy && <LoadingIndicator scope="action" surface={surface} context={context} announce={announce} />}
  </span>
}
