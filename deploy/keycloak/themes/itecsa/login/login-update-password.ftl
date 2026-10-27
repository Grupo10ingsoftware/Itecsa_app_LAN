<#import "template.ftl" as layout>
<#import "fields.ftl" as fields>
<#import "password-commons.ftl" as passwordCommons>
<#import "icons.ftl" as icons>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm') passwordUpdate=true; section>
  <#if section == "header">
    ${msg("updatePasswordTitle")}
  <#elseif section == "form">
    <form id="kc-passwd-update-form" action="${url.loginAction}" method="post" data-auth-form data-password-update novalidate data-mismatch="${msg('notMatchPasswordMessage')}">
      <@fields.input id="password-new" name="password-new" label=msg("passwordNew") type="password" autocomplete="new-password" autofocus=true invalid=messagesPerField.existsError('password') error=messagesPerField.get('password') describedBy="password-requirements"/>
      <@fields.input id="password-confirm" name="password-confirm" label=msg("passwordConfirm") type="password" autocomplete="new-password" invalid=messagesPerField.existsError('password-confirm') error=messagesPerField.get('password-confirm')/>
      <@passwordCommons.logoutOtherSessions/>
      <button class="auth-button auth-button-primary" id="kc-submit" name="login" type="submit">${msg("updatePasswordTitle")}</button>
      <#if isAppInitiatedAction??><button class="auth-button auth-button-secondary" type="submit" name="cancel-aia" value="true" formnovalidate>${msg("doCancel")}</button></#if>
    </form>
  <#elseif section == "passwordRequirements">
    <aside class="requirements-card" id="password-requirements" aria-labelledby="requirements-title">
      <h2 id="requirements-title"><@icons.icon name="shield"/>${msg("itecsa.requirementsTitle")}</h2>
      <ul class="requirements-list">
        <#-- Values come from Keycloak's PasswordPoliciesBean, never from a parallel policy. -->
        <#if passwordPolicies??>
          <#list ["length", "maxLength", "upperCase", "lowerCase", "digits", "specialChars"] as rule>
            <#assign count = (passwordPolicies[rule])!0>
            <#if count gt 0>
              <li data-password-rule="${rule}" data-count="${count?c}">
                <span class="rule-indicator" aria-hidden="true"></span>
                <span>${msg("itecsa.rule." + rule + (count == 1)?then("One", "Many"), count)}</span>
                <span class="sr-only rule-status" data-pending="${msg('itecsa.pending')}" data-satisfied="${msg('itecsa.satisfied')}">${msg("itecsa.pending")}</span>
              </li>
            </#if>
          </#list>
        </#if>
      </ul>
      <#if passwordPolicies??>
        <#if passwordPolicies.notUsername><p class="server-rule">${msg("itecsa.notUsername")}</p></#if>
        <#if passwordPolicies.notEmail><p class="server-rule">${msg("itecsa.notEmail")}</p></#if>
        <#if (passwordPolicies.passwordHistory!0) gt 0><p class="server-rule">${msg("itecsa.passwordHistory", passwordPolicies.passwordHistory)}</p></#if>
      </#if>
      <p class="requirements-summary" aria-live="polite" aria-atomic="true" data-rules-summary data-summary-label="${msg('itecsa.rulesProgress')}"></p>
      <p class="server-rule">${msg("itecsa.serverValidation")}</p>
    </aside>
  </#if>
</@layout.registrationLayout>
