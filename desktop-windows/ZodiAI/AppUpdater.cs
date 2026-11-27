using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace ZodiAI;

internal static class AppUpdater
{
    private const string UpdateIndexUrl = "https://raw.githubusercontent.com/ZodiBoomer/zodi-ai-releases-publique/main/latest.json";
    private const string OfficialReleasePrefix = "https://github.com/ZodiBoomer/zodi-ai-releases-publique/releases/download/";
    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Zodi-AI-Updater/1.0");
        client.DefaultRequestHeaders.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue { NoCache = true };
        return client;
    }

    public static async Task<string> CheckAndInstallAsync()
    {
        using var indexDoc = JsonDocument.Parse(await Http.GetStringAsync(UpdateIndexUrl));
        var platforms = indexDoc.RootElement.GetProperty("platforms");
        var platform = platforms.GetProperty("windows-x64");
        var version = platform.GetProperty("version").GetString()
            ?? throw new InvalidOperationException("Version manquante dans le catalogue.");
        var downloadUrl = platform.GetProperty("url").GetString()
            ?? throw new InvalidOperationException("Adresse de téléchargement absente.");
        var expectedSha256 = platform.GetProperty("sha256").GetString()?.ToLowerInvariant()
            ?? throw new InvalidOperationException("Empreinte SHA-256 absente.");

        if (!downloadUrl.StartsWith(OfficialReleasePrefix, StringComparison.Ordinal) ||
            expectedSha256.Length != 64 || !expectedSha256.All(Uri.IsHexDigit))
            throw new InvalidOperationException("Le catalogue de mise à jour contient des informations invalides.");

        // Keep all four version components; ToString(3) drops the revision and
        // makes releases such as 1.7.5.3 look perpetually newer than 1.7.5.
        var current = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "0.0.0.0";
        if (CompareVersions(version, current) <= 0)
            return "NO_UPDATE";

        var assetName = Path.GetFileName(new Uri(downloadUrl).AbsolutePath);
        if (!assetName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Le catalogue ne pointe pas vers un installateur compatible.");

        var destination = Path.Combine(Path.GetTempPath(), $"Zodi-AI-Setup-{version}.exe");
        
        await DownloadAsync(downloadUrl, destination);
        var actualSha256 = await ComputeSha256Async(destination);
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(expectedSha256), Convert.FromHexString(actualSha256)))
        {
            File.Delete(destination);
            throw new InvalidOperationException("La vérification SHA-256 de l'installateur a échoué.");
        }

        return destination;
    }

    private static async Task DownloadAsync(string address, string destination)
    {
        using var response = await Http.GetAsync(address, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        await using var input = await response.Content.ReadAsStreamAsync();
        await using var output = File.Create(destination);
        await input.CopyToAsync(output);
    }

    private static async Task<string> ComputeSha256Async(string path)
    {
        await using var stream = File.OpenRead(path);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();
    }

    private static int CompareVersions(string left, string right)
    {
        var a = left.Split('.').Select(x => int.TryParse(x, out var n) ? n : 0).ToArray();
        var b = right.Split('.').Select(x => int.TryParse(x, out var n) ? n : 0).ToArray();
        for (var i = 0; i < Math.Max(a.Length, b.Length); i++)
        {
            var comparison = (i < a.Length ? a[i] : 0).CompareTo(i < b.Length ? b[i] : 0);
            if (comparison != 0) return comparison;
        }
        return 0;
    }
}
