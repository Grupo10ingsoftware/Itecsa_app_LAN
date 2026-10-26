<#import "icons.ftl" as icons>
<#macro input id name label type="text" value="" autocomplete="" autofocus=false invalid=false error="" describedBy="" required=true>
  <div class="field-group">
    <label class="sr-only" for="${id}">${label}</label>
    <div class="input-wrap">
      <@icons.icon name=(type == "password")?then("lock", "user")/>
      <input class="auth-input" id="${id}" name="${name}" type="${type}" <#if type != "password">value="${value}"</#if>
        placeholder="${label}" autocomplete="${autocomplete}" <#if autofocus>autofocus</#if> <#if required>required</#if>
        aria-invalid="${invalid?c}" aria-describedby="${id}-error<#if describedBy?has_content> ${describedBy}</#if>"
        data-required-message="${msg('itecsa.required.' + id)}" dir="ltr"/>
      <#if type == "password">
        <button class="password-toggle" type="button" aria-controls="${id}" aria-label="${msg('showPassword')}" aria-pressed="false"
          data-toggle-password data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
          <@icons.icon name="eye"/>
        </button>
      </#if>
    </div>
    <span class="field-error" id="${id}-error" aria-live="polite" data-local-error<#if !error?has_content> hidden</#if>>${kcSanitize(error)?no_esc}</span>
  </div>
</#macro>
