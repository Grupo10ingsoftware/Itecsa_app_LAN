<#import "template.ftl" as layout>
<#import "fields.ftl" as fields>
<#assign credentialError = messagesPerField.existsError('username','password')>
<@layout.registrationLayout displayMessage=!credentialError displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
  <#if section == "header">
    ${msg("doLogIn")}
  <#elseif section == "form">
    <#if realm.password>
      <form id="kc-form-login" action="${url.loginAction}" method="post" data-auth-form novalidate>
        <#if !usernameHidden??>
          <@fields.input id="username" name="username" label=msg("username") value=(login.username!'') autocomplete="username" autofocus=true invalid=credentialError describedBy="credential-error"/>
        </#if>
        <@fields.input id="password" name="password" label=msg("password") type="password" autocomplete="current-password" invalid=credentialError describedBy="credential-error"/>
        <#if realm.rememberMe && !usernameHidden??>
          <label class="checkbox-label"><input id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>/>${msg("rememberMe")}</label>
        </#if>
        <#if realm.resetPasswordAllowed><a class="recovery-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a></#if>
        <div id="credential-error" class="form-message alert-error" role="alert"<#if !credentialError> hidden</#if>>
          <#if credentialError>${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</#if>
        </div>
        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
        <button class="auth-button auth-button-primary" name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
      </form>
    </#if>
  <#elseif section == "info">
    <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
      <p>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></p>
    </#if>
  <#elseif section == "socialProviders">
    <#if realm.password && social?? && social.providers?has_content>
      <div class="social-providers"><h2>${msg("identity-provider-login-label")}</h2>
        <#list social.providers as provider><a data-once-link id="social-${provider.alias}" class="auth-button auth-button-secondary" href="${provider.loginUrl}">${provider.displayName!}</a></#list>
      </div>
    </#if>
  </#if>
</@layout.registrationLayout>
