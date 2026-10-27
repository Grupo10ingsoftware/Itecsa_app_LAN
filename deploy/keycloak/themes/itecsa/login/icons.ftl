<#macro icon name>
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <#if name == "user">
    <circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3Z"/>
  <#elseif name == "lock">
    <rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>
  <#elseif name == "eye">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/>
  <#elseif name == "shield">
    <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" fill="currentColor" stroke="none"/><path d="m8 12 3 3 5-6" stroke="white"/>
  </#if>
</svg>
</#macro>
