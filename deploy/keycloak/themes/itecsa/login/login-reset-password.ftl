<#import "template.ftl" as layout>
<#import "fields.ftl" as fields>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>
  <#if section == "header">
    ${msg("emailForgotTitle")}
  <#elseif section == "form">
    <form id="kc-reset-password-form" action="${url.loginAction}" method="post" data-auth-form novalidate>
      <#assign identifierLabel = msg("username")>
      <#if realm.loginWithEmailAllowed><#assign identifierLabel = realm.registrationEmailAsUsername?then(msg("email"), msg("usernameOrEmail"))></#if>
      <@fields.input id="username" name="username" label=identifierLabel autocomplete="username" value=(auth.attemptedUsername!'') autofocus=true invalid=messagesPerField.existsError('username') error=messagesPerField.get('username')/>
      <button class="auth-button auth-button-primary" type="submit">${msg("doSubmit")}</button>
      <a class="back-link" href="${url.loginUrl}">${msg("backToLogin")}</a>
    </form>
  <#elseif section == "info">
    <p class="server-rule">${msg("itecsa.recoveryHelp")}</p>
  </#if>
</@layout.registrationLayout>
