// These mirror Keycloak's char-based policy providers. No credentials leave the form.
export function satisfiesRule(value, rule, count) {
  if (!value || !Number.isInteger(count) || count < 1) return false
  if (rule === 'length') return value.length >= count
  if (rule === 'maxLength') return value.length <= count
  const patterns = {
    upperCase: /\p{Uppercase}/u,
    lowerCase: /\p{Lowercase}/u,
    digits: /\p{Nd}/u,
    specialChars: /[^\p{L}\p{Nd}]/u,
  }
  // Java iterates UTF-16 chars, so an astral character occupies two code units here too.
  return patterns[rule] ? value.split('').filter(char => patterns[rule].test(char)).length >= count : false
}

export function initializeAuthForms(root = document) {
  root.querySelectorAll('a[data-once-link]').forEach(link => {
    if (link.dataset.bound) return
    link.dataset.bound = 'true'
    root.defaultView?.addEventListener('pageshow', event => {
      if (event.persisted) link.removeAttribute('aria-disabled')
    })
    link.addEventListener('click', event => {
      if (link.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return }
      link.setAttribute('aria-disabled', 'true')
    })
  })
  root.querySelectorAll('[data-toggle-password]').forEach(button => {
    if (button.dataset.bound) return
    button.dataset.bound = 'true'
    button.addEventListener('click', () => {
      const input = root.querySelector(`#${button.getAttribute('aria-controls')}`)
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      button.setAttribute('aria-pressed', String(show))
      button.setAttribute('aria-label', show ? button.dataset.labelHide : button.dataset.labelShow)
    })
  })

  root.querySelectorAll('form[data-auth-form]').forEach(form => {
    if (form.dataset.bound) return
    form.dataset.bound = 'true'
    let submitting = false
    let submitted = false
    const buttons = [...form.querySelectorAll('[type=submit]')]
    const originalContent = new Map(buttons.map(button => [button, button.innerHTML]))
    const restore = () => {
      submitting = false
      form.removeAttribute('aria-busy')
      buttons.forEach(button => {
        button.removeAttribute('aria-disabled')
        button.innerHTML = originalContent.get(button)
      })
    }
    // Una página restaurada desde BFCache debe aceptar otro POST nativo.
    root.defaultView?.addEventListener('pageshow', event => { if (event.persisted) restore() })
    const password = form.querySelector('#password-new')
    const confirmation = form.querySelector('#password-confirm')
    const rules = password ? [...root.querySelectorAll('[data-password-rule]')] : []
    const requirements = password ? root.querySelector('#password-requirements') : null
    const summary = requirements?.querySelector('[data-rules-summary]')
    const setError = (input, message) => {
      input.setAttribute('aria-invalid', String(Boolean(message)))
      const error = form.querySelector(`#${input.id}-error`)
      if (error) { error.textContent = message; error.hidden = !message }
    }
    const validateConfirmation = () => {
      if (!confirmation) return true
      const mismatch = Boolean(confirmation.value) && confirmation.value !== password.value
      const message = mismatch ? form.dataset.mismatch : submitted && !confirmation.value ? confirmation.dataset.requiredMessage : ''
      setError(confirmation, message)
      return !message
    }
    const updateRules = () => {
      let satisfied = 0
      rules.forEach(item => {
        const matches = satisfiesRule(password.value, item.dataset.passwordRule, Number(item.dataset.count))
        item.dataset.satisfied = String(matches)
        const status = item.querySelector('.rule-status')
        if (status) status.textContent = matches ? status.dataset.satisfied : status.dataset.pending
        if (matches) satisfied++
      })
      if (summary && rules.length) summary.textContent = `${summary.dataset.summaryLabel}: ${satisfied}/${rules.length}`
      const valid = satisfied === rules.length
      if (requirements) requirements.dataset.invalid = String(submitted && !valid)
      return valid
    }
    form.querySelectorAll('input[required]').forEach(input => {
      input.addEventListener('input', () => {
        setError(input, submitted && !input.value ? input.dataset.requiredMessage : '')
        const credentialsError = form.querySelector('#credential-error')
        if (credentialsError) {
          credentialsError.hidden = true
          form.querySelectorAll('input[required]').forEach(field => {
            if (field !== input && field.value) setError(field, '')
          })
        }
        if (password) { updateRules(); validateConfirmation() }
      })
    })
    confirmation?.addEventListener('blur', validateConfirmation)
    if (password) updateRules()
    form.addEventListener('submit', event => {
      if (submitting) { event.preventDefault(); return }
      if (event.submitter?.name === 'cancel-aia') return
      submitted = true
      let firstInvalid
      form.querySelectorAll('input[required]').forEach(input => {
        // Do not trim passwords: spaces are part of the credential.
        const empty = input.type === 'text' && input.name === 'username' ? !input.value.trim() : !input.value
        setError(input, empty ? input.dataset.requiredMessage : '')
        if (empty) firstInvalid ??= input
      })
      if (password && !updateRules()) { password.setAttribute('aria-invalid', 'true'); firstInvalid ??= password }
      if (!validateConfirmation()) firstInvalid ??= confirmation
      if (firstInvalid) { event.preventDefault(); firstInvalid.focus(); return }
      submitting = true
      form.setAttribute('aria-busy', 'true')
      // Keep successful controls (including named submit buttons) in the native POST.
      buttons.forEach(button => button.setAttribute('aria-disabled', 'true'))
      const submitter = event.submitter
      if (submitter) {
        submitter.innerHTML = '<span class="itecsa-loading" data-scope="action" data-surface="dark" role="status" aria-live="polite"><svg class="itecsa-loading__ring" width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle class="itecsa-loading__track" cx="24" cy="24" r="20"/><circle class="itecsa-loading__arc" cx="24" cy="24" r="20"/></svg><span>Cargando...</span></span>'
      }
    })
  })
}

if (typeof document !== 'undefined') initializeAuthForms()
