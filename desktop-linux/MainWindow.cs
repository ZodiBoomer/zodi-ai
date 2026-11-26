using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Input.Platform;
using Avalonia.Platform;

namespace ZodiAI.Linux;

public sealed class MainWindow : Window
{
    private const string AppUrl = "https://zodi-ai-core.vercel.app/";
    private const string AppHost = "zodi-ai-core.vercel.app";
    private const string LegacyStore = "zodi-conversations-v2";
    private readonly string legacyFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "zodi-ai",
        "conversations.json");
    private readonly NativeWebView webView;
    private bool migrationAttempted;

    public MainWindow()
    {
        Title = "ZODIX";
        Width = 1180;
        Height = 780;
        MinWidth = 720;
        MinHeight = 520;
        Background = new SolidColorBrush(Color.Parse("#151515"));

        webView = new NativeWebView
        {
            Source = new Uri(AppUrl),
            Background = new SolidColorBrush(Color.Parse("#151515"))
        };
        webView.EnvironmentRequested += WebView_EnvironmentRequested;
        webView.NavigationCompleted += WebView_NavigationCompleted;
        webView.NavigationStarted += WebView_NavigationStarted;
        webView.NewWindowRequested += WebView_NewWindowRequested;
        webView.WebMessageReceived += WebView_WebMessageReceived;
        Content = webView;

        _ = CheckForUpdatesOnStartupAsync();
    }

    private void WebView_EnvironmentRequested(object? sender, WebViewEnvironmentRequestedEventArgs args)
    {
        args.EnableDevTools = false;
        if (args is LinuxWpeWebViewEnvironmentRequestedEventArgs wpe)
        {
#pragma warning disable CS0618
            wpe.PreferWebKitGtkInstead = true;
#pragma warning restore CS0618
        }
        if (args is GtkWebViewEnvironmentRequestedEventArgs gtk)
        {
            gtk.ExperimentalOffscreen = true;
            gtk.BaseDataDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "zodi-ai", "webview");
            gtk.BaseCacheDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "zodi-ai", "webview-cache");
        }
    }

    private void WebView_NavigationStarted(object? sender, WebViewNavigationStartingEventArgs e)
    {
        if (e.Request is null) return;
        if (e.Request.Scheme == Uri.UriSchemeHttps &&
            string.Equals(e.Request.Host, AppHost, StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        OpenExternal(e.Request);
    }

    private void WebView_NewWindowRequested(object? sender, WebViewNewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (e.Request is not null) OpenExternal(e.Request);
    }

    private static void OpenExternal(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeMailto && uri.Scheme != "tel") return;
        try { Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true }); }
        catch { }
    }

    private async void WebView_NavigationCompleted(object? sender, WebViewNavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess) return;
        if (!migrationAttempted)
        {
            migrationAttempted = true;
            await MigrateLegacyConversationsAsync();
        }
        await InstallNativeShareAndClipboardBridgeAsync();
    }

    private async Task MigrateLegacyConversationsAsync()
    {
        if (!File.Exists(legacyFile)) return;
        try
        {
            var raw = await File.ReadAllTextAsync(legacyFile);
            using var document = JsonDocument.Parse(raw);
            if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() == 0) return;
            var rawLiteral = JsonSerializer.Serialize(raw);
            var script = $$"""
                (() => {
                  const key = "{{LegacyStore}}";
                  try {
                    const old = JSON.parse({{rawLiteral}});
                    const normalized = (Array.isArray(old) ? old : []).map((c, i) => ({
                      id: c.id || c.Id || ("linux-" + i),
                      title: c.title || c.Title || "Conversation importée",
                      updatedAt: c.updatedAt || c.UpdatedAt || Date.now(),
                      messages: (c.messages || c.Messages || []).map(m => ({
                        role: m.role || m.Role || "assistant",
                        content: m.content || m.Content || "",
                        images: (m.images || m.Images || []).map(img => ({
                          dataUrl: img.dataUrl || img.DataUrl || "",
                          mimeType: img.mimeType || img.MimeType || "image/jpeg",
                          name: img.name || img.Name || "Photo"
                        }))
                      }))
                    }));
                    const existing = JSON.parse(localStorage.getItem(key) || "[]");
                    const known = new Set(existing.map(item => item.id));
                    const merged = [...existing, ...normalized.filter(item => !known.has(item.id))];
                    if (merged.length > existing.length) {
                      localStorage.setItem(key, JSON.stringify(merged));
                      location.reload();
                    }
                  } catch (_) {}
                })();
                """;
            await webView.InvokeScript(script);
        }
        catch { }
    }

    private async Task InstallNativeShareAndClipboardBridgeAsync()
    {
        const string script = """
            (() => {
              if (window.__zodiNativeBridgeInstalled) return;
              window.__zodiNativeBridgeInstalled = true;
              const send = payload => window.invokeCSharpAction(JSON.stringify(payload));
              if (!navigator.share) {
                Object.defineProperty(navigator, "share", {
                  configurable: true,
                  value: async (data = {}) => send({
                    type: "share",
                    text: [data.title, data.text, data.url].filter(Boolean).join("\n")
                  })
                });
              }
              try {
                Object.defineProperty(navigator, "clipboard", {
                  configurable: true,
                  value: { writeText: async text => send({ type: "copy", text: String(text) }) }
                });
              } catch (_) {}
            })();
            """;
        try { await webView.InvokeScript(script); } catch { }
    }

    private async void WebView_WebMessageReceived(object? sender, WebMessageReceivedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(e.Body)) return;
        try
        {
            using var message = JsonDocument.Parse(e.Body);
            var root = message.RootElement;
            var type = root.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
            var text = root.TryGetProperty("text", out var textValue) ? textValue.GetString() : null;
            if (type is not ("copy" or "share") || string.IsNullOrEmpty(text)) return;
            var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
            if (clipboard is not null) await clipboard.SetTextAsync(text);
        }
        catch { }
    }

    private async Task CheckForUpdatesOnStartupAsync()
    {
        await Task.Delay(1800);
        try { await AppUpdater.CheckAndInstallAsync(); }
        catch { }
    }
}
