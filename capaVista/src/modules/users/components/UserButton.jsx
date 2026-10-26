import styles from '../pages/UserManagementPage.module.css'
import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'

const VARIANT_CLASS = Object.freeze({
  primary: styles.userButtonPrimary,
  secondary: styles.userButtonSecondary,
  danger: styles.userButtonDanger,
  ghost: styles.userButtonGhost,
})

export default function UserButton({
  children,
  className = '',
  icon,
  type = 'button',
  variant = 'secondary',
  busy = false,
  ...props
}) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.secondary

  return (
    <button className={`${styles.userButton} ${variantClass} ${className}`.trim()} type={type} {...props} disabled={busy || props.disabled} aria-busy={busy || props['aria-busy']}>
      {icon && !busy && <i className={`bi ${icon}`} aria-hidden="true" />}
      <span><LoadingAction busy={busy} surface={variant === 'primary' ? 'dark' : 'light'}>{children}</LoadingAction></span>
    </button>
  )
}
