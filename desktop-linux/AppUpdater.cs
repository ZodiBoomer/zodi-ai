using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace ZodiAI.Linux;

internal static class AppUpdater
{
    private const string ReleasesApi = "https://api.github.com/repos/ZodiBoomer/zodi-ai-releases-publique/releases?per_page=30";
    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Zodi-AI-Updater/1.0");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return client;
    }

    public static async Task<string> CheckAndInstallAsync()
    {
        using var releasesDoc = JsonDocument.Parse(await Http.GetStringAsync(ReleasesApi));
        var release = releasesDoc.RootElement.EnumerateArray()
            .FirstOrDefault(x => x.GetProperty("tag_name").GetString()?.StartsWith("desktop-v", StringComparison.Ordinal) == true);
        if (release.ValueKind == JsonValueKind.Undefined)
            return "Aucune version Linux publiée pour le moment.";

        var assets = release.GetProperty("assets").EnumerateArray().ToArray();
        var manifestAsset = assets.FirstOrDefault(x => x.GetProperty("name").GetString() == "latest-desktop.json");
        if (manifestAsset.ValueKind == JsonValueKind.Undefined)
            throw new InvalidOperationException("Le manifeste de mise à jour est absent.");

        using var manifest = JsonDocument.Parse(await Http.GetStringAsync(manifestAsset.GetProperty("browser_download_url").GetString()!));
        var root = manifest.RootElement;
        var version = root.GetProperty("version").GetString() ?? throw new InvalidOperationException("Version manquante.");
        var current = Assembly.GetEntryAssembly()?.GetName().Version?.ToString(3) ?? "0.0.0";
        if (CompareVersions(version, current) <= 0)
            return $"Zodi AI est à jour (v{current}).";

        var platform = root.GetProperty("platforms").GetProperty("linux-x64-deb");
        var assetName = platform.GetProperty("asset").GetString() ?? throw new InvalidOperationException("Paquet Debian absent du manifeste.");
        var checksumName = root.GetProperty("checksums").GetString() ?? "SHA256SUMS.txt";
        var asset = assets.FirstOrDefault(x => x.GetProperty("name").GetString() == assetName);
        var checksumAsset = assets.FirstOrDefault(x => x.GetProperty("name").GetString() == checksumName);
        if (asset.ValueKind == JsonValueKind.Undefined || checksumAsset.ValueKind == JsonValueKind.Undefined)
            throw new InvalidOperationException("Les fichiers de mise à jour sont incomplets.");

        var checksums = await Http.GetStringAsync(checksumAsset.GetProperty("browser_download_url").GetString()!);
        var expected = ReadChecksum(checksums, assetName);
        var downloadDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        Directory.CreateDirectory(downloadDirectory);
        var destination = Path.Combine(downloadDirectory, assetName);
        await DownloadAsync(asset.GetProperty("browser_download_url").GetString()!, destination);
        var actual = await ComputeSha256Async(destination);
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(expected), Convert.FromHexString(actual)))
        {
            File.Delete(destination);
            throw new InvalidOperationException("La vérification SHA-256 du paquet Debian a échoué.");
        }

        var installer = new ProcessStartInfo("xdg-open") { UseShellExecute = false };
        installer.ArgumentList.Add(destination);
        Process.Start(installer);
        return $"Paquet v{version} vérifié et téléchargé dans {downloadDirectory}. Le gestionnaire de logiciels va s'ouvrir pour confirmer l'installation.";
    }

    private static string ReadChecksum(string content, string fileName)
    {
        foreach (var line in content.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2 && parts[^1].TrimStart('*') == fileName &&
                parts[0].Length == 64 && parts[0].All(Uri.IsHexDigit))
                return parts[0].ToLowerInvariant();
        }
        throw new InvalidOperationException("Aucune empreinte SHA-256 trouvée pour le paquet Debian.");
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
