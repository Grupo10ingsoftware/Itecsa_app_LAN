import freemarker.cache.*;
import freemarker.core.HTMLOutputFormat;
import freemarker.template.*;
import freemarker.template.utility.DeepUnwrap;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.text.MessageFormat;
import java.util.*;
import java.util.jar.JarFile;

/** Renders actual FTL with the matching native themes JAR, without running another IdP. */
public class ThemeRender {
  static Properties messages = new Properties();
  static Map<String, Object> props = new HashMap<>();
  static TemplateMethodModelEx method(java.util.function.Function<List<?>, Object> fn) { return args -> fn.apply(args); }
  static String text(Object value) { return value == null ? "" : value.toString(); }

  static Map<String, Object> model(Map<String, String> errors, boolean policy) {
    Map<String, Object> m = new HashMap<>();
    m.put("properties", props);
    m.put("lang", "es");
    m.put("pageId", "test");
    m.put("client", Map.of("baseUrl", "/"));
    m.put("realm", Map.of("password", true, "registrationAllowed", false, "rememberMe", true,
      "resetPasswordAllowed", true, "loginWithEmailAllowed", true, "registrationEmailAsUsername", false,
      "internationalizationEnabled", false, "duplicateEmailsAllowed", false));
    m.put("url", Map.of("resourcesPath", "resources", "resourcesCommonPath", "common",
      "loginAction", "/native-action?session_code=fixture", "loginUrl", "login.html",
      "loginResetCredentialsUrl", "recovery.html", "loginRestartFlowUrl", "login.html",
      "ssoLoginInOtherTabsUrl", "/session-check"));
    m.put("authenticationSession", Map.of("authSessionIdHash", "fixture-hash"));
    m.put("auth", Map.of("showUsername", method(args -> false), "showResetCredentials", method(args -> false),
      "showTryAnotherWayLink", method(args -> false), "selectedCredential", "", "attemptedUsername", ""));
    m.put("login", Map.of("username", ""));
    m.put("messagesPerField", Map.of(
      "existsError", method(args -> args.stream().anyMatch(key -> errors.containsKey(text(key)))),
      "get", method(args -> errors.getOrDefault(text(args.get(0)), "")),
      "getFirstError", method(args -> args.stream().map(key -> errors.get(text(key))).filter(Objects::nonNull).findFirst().orElse(""))));
    m.put("msg", (TemplateMethodModelEx) args -> {
      String key = text(args.get(0));
      Object[] params = new Object[Math.max(0, args.size() - 1)];
      for (int i = 1; i < args.size(); i++) params[i - 1] = DeepUnwrap.unwrap((TemplateModel) args.get(i));
      return new MessageFormat(messages.getProperty(key, key), Locale.forLanguageTag("es")).format(params);
    });
    m.put("kcSanitize", method(args -> text(args.get(0)))); // Fixtures contain no rich HTML.
    if (policy) m.put("passwordPolicies", Map.of("length", 8, "upperCase", 1, "lowerCase", 1, "digits", 1,
      "specialChars", 1, "notUsername", true, "notEmail", true, "passwordHistory", 3));
    return m;
  }

  static String render(Configuration cfg, Path output, String file, String template, Map<String, Object> model) throws Exception {
    StringWriter result = new StringWriter();
    cfg.getTemplate(template).process(model, result);
    String html = result.toString();
    if (html.contains("<html lang=\"es\">") == false) throw new AssertionError("Spanish document required: " + file);
    Files.writeString(output.resolve(file), html);
    System.out.println("Rendered " + file);
    return html;
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 3) throw new IllegalArgumentException("ThemeRender <theme-login-dir> <native-themes.jar> <output-dir>");
    Path login = Path.of(args[0]), output = Path.of(args[2]);
    Files.createDirectories(output);
    try (JarFile nativeJar = new JarFile(args[1])) {
      for (var entry : Collections.list(nativeJar.entries())) {
        String name = entry.getName();
        String relative = name.startsWith("theme/base/login/resources/js/") ? "resources/" + name.substring("theme/base/login/resources/".length())
          : name.startsWith("theme/common/keycloak/resources/vendor/rfc4648/") ? "common/" + name.substring("theme/common/keycloak/resources/".length()) : null;
        if (relative != null && !entry.isDirectory()) {
          Path target = output.resolve(relative); Files.createDirectories(target.getParent());
          try (var stream = nativeJar.getInputStream(entry)) { Files.copy(stream, target, StandardCopyOption.REPLACE_EXISTING); }
        }
      }
    }
    Path resources = login.resolve("resources");
    try (var files = Files.walk(resources)) {
      for (Path file : files.filter(Files::isRegularFile).toList()) {
        Path target = output.resolve("resources").resolve(resources.relativize(file));
        Files.createDirectories(target.getParent()); Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING);
      }
    }
    try (Reader reader = Files.newBufferedReader(login.resolve("messages/messages_es.properties"))) { messages.load(reader); }
    Properties properties = new Properties();
    try (Reader reader = Files.newBufferedReader(login.resolve("theme.properties"))) { properties.load(reader); }
    properties.forEach((key, value) -> props.put(key.toString(), value.toString()));
    URLClassLoader nativeLoader = new URLClassLoader(new URL[] { Path.of(args[1]).toUri().toURL() });
    Configuration cfg = new Configuration(Configuration.VERSION_2_3_34);
    cfg.setDefaultEncoding("UTF-8");
    cfg.setOutputFormat(HTMLOutputFormat.INSTANCE);
    cfg.setAutoEscapingPolicy(Configuration.ENABLE_IF_SUPPORTED_AUTO_ESCAPING_POLICY);
    cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
    cfg.setLogTemplateExceptions(false);
    cfg.setTemplateLoader(new MultiTemplateLoader(new TemplateLoader[] {
      new FileTemplateLoader(login.toFile()), new ClassTemplateLoader(nativeLoader, "/theme/base/login")
    }));
    // Parsing all local templates catches syntax errors even in rarely visited branches.
    try (var files = Files.list(login)) { for (Path file : files.filter(p -> p.toString().endsWith(".ftl")).toList()) cfg.getTemplate(file.getFileName().toString()); }
    render(cfg, output, "login.html", "login.ftl", model(Map.of(), true));
    String generic = messages.getProperty("invalidUserMessage");
    String invalidUser = render(cfg, output, "login-invalid-user.html", "login.ftl", model(Map.of("username", generic, "password", generic), true));
    String invalidPassword = render(cfg, output, "login-invalid-password.html", "login.ftl", model(Map.of("username", generic, "password", generic), true));
    if (!invalidUser.equals(invalidPassword)) throw new AssertionError("Credential failures must be indistinguishable");
    Map<String, Object> required = model(Map.of(), true);
    String requiredWarning = messages.getProperty("updatePasswordMessage");
    required.put("message", Map.of("type", "warning", "summary", requiredWarning));
    String update = render(cfg, output, "password.html", "login-update-password.ftl", required);
    if (update.contains(requiredWarning)) throw new AssertionError("Redundant action warning");
    required.put("message", Map.of("type", "warning", "summary", "Functional warning"));
    String warning = render(cfg, output, "password-warning.html", "login-update-password.ftl", required);
    if (!warning.contains("Functional warning")) throw new AssertionError("Functional warning lost");
    if (update.split("data-password-rule=", -1).length - 1 != 5) throw new AssertionError("Expected actual policy rules");
    String empty = render(cfg, output, "password-no-policy.html", "login-update-password.ftl", model(Map.of(), false));
    if (empty.contains("data-password-rule=")) throw new AssertionError("Must not invent password rules");
    Map<String, Object> cancel = model(Map.of(), true); cancel.put("isAppInitiatedAction", true);
    String action = render(cfg, output, "password-action.html", "login-update-password.ftl", cancel);
    if (!action.contains("name=\"cancel-aia\"")) throw new AssertionError("Native cancellation control lost");
    render(cfg, output, "password-mismatch.html", "login-update-password.ftl", model(Map.of("password-confirm", "Las contraseñas no coinciden"), true));
    render(cfg, output, "recovery.html", "login-reset-password.ftl", model(Map.of(), true));
    Map<String, Object> info = model(Map.of(), true);
    info.put("message", Map.of("type", "success", "summary", messages.getProperty("emailSentMessage")));
    render(cfg, output, "recovery-info.html", "info.ftl", info);
    render(cfg, output, "expired.html", "login-page-expired.ftl", model(Map.of(), true));
    render(cfg, output, "error.html", "error.ftl", model(Map.of(), true));
    nativeLoader.close();
    System.out.println("FTL syntax, native inheritance, policy binding and error fixtures passed.");
  }
}
