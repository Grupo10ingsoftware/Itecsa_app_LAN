<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section == "header">
    ${msg("errorTitle")}
  <#elseif section == "form">
    <p class="form-message alert-error" role="alert">${msg("itecsa.authError")}</p>
    <#if !skipLink?? && client?? && client.baseUrl?has_content>
      <a class="back-link" href="${client.baseUrl}">${msg("backToApplication")}</a>
    </#if>
  </#if>
</@layout.registrationLayout>
