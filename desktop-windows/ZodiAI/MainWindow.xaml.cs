using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.System;

namespace ZodiAI;

public sealed partial class MainWindow : Window
{
    private const string AppUrl = "https://zodi-ai-core.vercel.app/";
    private const string AppHost = "zodi-ai-core.vercel.app";
    private const string LegacyStore = "zodi-conversations-v2";
    private readonly string legacyFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ZodiAI",
        "conversations.json");
    private bool migrationAttempted;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Zodi AI";
        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await AppWebView.EnsureCoreWebView2Async();
            var core = AppWebView.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.NavigationStarting += Core_NavigationStarting;
            core.NewWindowRequested += Core_NewWindowRequested;
            AppWebView.NavigationCompleted += AppWebView_NavigationCompleted;
            AppWebView.Source = new Uri(AppUrl);
            _ = CheckForUpdatesOnStartupAsync();
        }
        catch
        {
            FallbackText.Visibility = Visibility.Visible;
        }
    }

    private void Core_NavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) { e.Cancel = true; return; }
        if (uri.Scheme == Uri.UriSchemeHttps && string.Equals(uri.Host, AppHost, StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        _ = OpenExternalAsync(uri);
    }

    private void Core_NewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) _ = OpenExternalAsync(uri);
    }

    private static async Task OpenExternalAsync(Uri uri)
    {
        if (uri.Scheme is Uri.UriSchemeHttps or Uri.UriSchemeHttp or Uri.UriSchemeMailto or "tel")
        {
            try { await Launcher.LaunchUriAsync(uri); } catch { }
        }
    }

    private async void AppWebView_NavigationCompleted(WebView2 sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess || migrationAttempted) return;
        migrationAttempted = true;
        await MigrateLegacyConversationsAsync();
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
                  if (localStorage.getItem(key)) return;
                  try {
                    let old = JSON.parse({{rawLiteral}});
                    const normalized = (Array.isArray(old) ? old : []).map((c, i) => ({
                      id: c.id || c.Id || ("windows-" + i),
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
                    if (normalized.length) {
                      localStorage.setItem(key, JSON.stringify(normalized));
                      location.reload();
                    }
                  } catch (_) {}
                })();
                """;
            await AppWebView.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch { /* The original local history file is intentionally left untouched. */ }
    }

    private async Task CheckForUpdatesOnStartupAsync()
    {
        await Task.Delay(1800);
        try
        {
            var result = await AppUpdater.CheckAndInstallAsync();
            if (result == "INSTALLER_STARTED")
            {
                Application.Current.Exit();
            }
        }
        catch { /* The web app remains usable when the release service is offline. */ }
    }
}
