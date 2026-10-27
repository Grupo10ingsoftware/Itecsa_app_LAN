<#import "footer.ftl" as loginFooter>
<#import "theme-resources.ftl" as themeResourceTags>
<#-- Keep Keycloak's native session checks and nested template contract. -->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false passwordUpdate=false>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title><#nested "header"> · ITECSA</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/itecsa.css"/>
  <#if properties.itecsaFont?has_content><link rel="stylesheet" href="${url.resourcesPath}/css/font.css"/></#if>
  <script type="importmap">{"imports":{"rfc4648":"${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"}}</script>
  <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>
  <script src="${url.resourcesPath}/js/itecsa.js" type="module"></script>
  <#if themeResources?? && themeResources.scripts?has_content>
    <@themeResourceTags.renderScripts themeResources.scripts url.resourcesPath "text/javascript"/>
  <#elseif properties.scripts?has_content>
    <#list properties.scripts?split(' ') as script><script src="${url.resourcesPath}/${script}" type="text/javascript"></script></#list>
  </#if>
  <#if scripts??><#list scripts as script><script src="${script}" type="text/javascript"></script></#list></#if>
  <script type="module">
    <#outputformat "JavaScript">
    import { startSessionPolling } from ${(url.resourcesPath + "/js/authChecker.js")?c};
    startSessionPolling(${url.ssoLoginInOtherTabsUrl?c});
    </#outputformat>
  </script>
  <#if authenticationSession??>
    <script type="module">
      <#outputformat "JavaScript">
      import { checkAuthSession } from ${(url.resourcesPath + "/js/authChecker.js")?c};
      checkAuthSession(${authenticationSession.authSessionIdHash?c});
      </#outputformat>
    </script>
  </#if>
</head>
<body data-page-id="login-${pageId}" class="${bodyClass}">
  <main class="auth-layout<#if passwordUpdate> auth-layout-password</#if>">
    <section class="auth-card" aria-labelledby="kc-page-title">
      <header class="auth-header">
        <#if properties.itecsaLogo?has_content>
          <img class="brand-logo" src="${url.resourcesPath}/${properties.itecsaLogo}" alt="ITECSA"/>
        <#else>
          <#-- Source checkout only. Packaging requires the original logo. -->
          <span class="brand-name">ITECSA</span>
        </#if>
        <h1 id="kc-page-title"><#nested "header"></h1>
        <#if displayRequiredFields><p class="required-fields">${msg("requiredFields")}</p></#if>
        <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials() && !passwordUpdate>
          <div id="kc-username">
            <span id="kc-attempted-username">${auth.attemptedUsername}</span>
            <a id="reset-login" href="${url.loginRestartFlowUrl}">${msg("restartLoginTooltip")}</a>
          </div>
        </#if>
      </header>
      <div id="kc-content"><div id="kc-content-wrapper">
        <#-- Suppress only the redundant required UPDATE_PASSWORD warning. -->
        <#if displayMessage && message?has_content && !(passwordUpdate && message.type == "warning" && message.summary == msg("updatePasswordMessage")) && (message.type != "warning" || !isAppInitiatedAction??)>
          <div id="server-message" class="form-message alert-${message.type}" role="<#if message.type == 'error'>alert<#else>status</#if>">
            ${kcSanitize(message.summary)?no_esc}
          </div>
        </#if>
        <#nested "form">
        <#if auth?has_content && auth.showTryAnotherWayLink()>
          <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
            <input type="hidden" name="tryAnotherWay" value="on"/>
            <button class="text-button" type="submit">${msg("doTryAnotherWay")}</button>
          </form>
        </#if>
        <#nested "socialProviders">
        <#if displayInfo><div id="kc-info"><#nested "info"></div></#if>
      </div></div>
      <@loginFooter.content/>
    </section>
    <#if passwordUpdate><#nested "passwordRequirements"></#if>
  </main>
</body>
</html>
</#macro>
