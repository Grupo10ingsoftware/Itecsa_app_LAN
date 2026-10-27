<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section == "header">
    <#if messageHeader??>${kcSanitize(msg(messageHeader))?no_esc}<#else>${msg("itecsa.infoTitle")}</#if>
  <#elseif section == "form">
    <p class="instruction" role="status">${kcSanitize(message.summary)?no_esc}</p>
    <#if requiredActions??>
      <ul><#list requiredActions as action><li>${msg("requiredAction." + action)}</li></#list></ul>
    </#if>
    <#if !skipLink??>
      <#if pageRedirectUri?has_content><a class="back-link" href="${pageRedirectUri}">${msg("backToApplication")}</a>
      <#elseif actionUri?has_content><a class="back-link" href="${actionUri}">${msg("proceedWithAction")}</a>
      <#elseif (client.baseUrl)?has_content><a class="back-link" href="${client.baseUrl}">${msg("backToApplication")}</a></#if>
    </#if>
  </#if>
</@layout.registrationLayout>
