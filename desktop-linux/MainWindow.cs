using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Input;
using Avalonia.Platform.Storage;
using Avalonia.Media.Imaging;

namespace ZodiAI.Linux;

public sealed class MainWindow : Window
{
    const string Api = "https://zodi-ai-core.vercel.app/api/chat";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(70) };
    static readonly SolidColorBrush Page = Brush("#212121");
    static readonly SolidColorBrush Panel = Brush("#171717");
    static readonly SolidColorBrush PanelAlt = Brush("#212121");
    static readonly SolidColorBrush Surface = Brush("#303030");
    static readonly SolidColorBrush Text = Brush("#ECECEC");
    static readonly SolidColorBrush Muted = Brush("#999999");
    static readonly SolidColorBrush Accent = Brush("#10A37F");
    static readonly SolidColorBrush Line = Brush("#424242");

    readonly string store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "zodi-ai", "conversations.json");
    readonly List<Conversation> items = new();
    readonly ListBox history = new() { Background = Brushes.Transparent, Foreground = Text };
    readonly TextBox historySearch = new() { Watermark = "Rechercher dans l’historique…", FontSize = 12, Padding = new Thickness(10, 8) };
    readonly StackPanel messages = new() { Spacing = 14 };
    readonly TextBox input = new() { Watermark = "Écris ton message à Zodi…", AcceptsReturn = true, MinHeight = 52, FontSize = 14 };
    readonly TextBlock title = new() { Text = "Zodi AI", FontSize = 20, FontWeight = FontWeight.Bold, Foreground = Text };
    readonly TextBlock status = new() { Text = "Assistant personnel · Internet requis", Foreground = Muted, FontSize = 12 };
    readonly Button send = new() { Content = "Envoyer  ↗", MinWidth = 112, Height = 46 };
    readonly Button attach = new() { Content = "＋ Photo", MinWidth = 86, Height = 46 };
    readonly List<ChatImage> pendingImages = new();
    readonly Dictionary<int, string> feedback = new();
    readonly Button update = new() { Content = "Mettre à jour" };
    Conversation? active;
    bool switching;

    static SolidColorBrush Brush(string value) => new(Color.Parse(value));

    static void StyleButton(Button button, bool primary = false)
    {
        button.Background = primary ? Accent : Surface;
        button.Foreground = Brushes.White;
        button.BorderBrush = primary ? Accent : Line;
        button.BorderThickness = new Thickness(1);
        button.CornerRadius = new CornerRadius(11);
        button.Padding = new Thickness(primary ? 18 : 14, 9);
        button.FontWeight = FontWeight.SemiBold;
        button.MinHeight = primary ? 46 : 40;
    }

    public MainWindow()
    {
        Title = "Zodi AI"; Width = 1180; Height = 780; MinWidth = 800; MinHeight = 560; Background = Page;
        try { if (File.Exists(store)) items.AddRange(JsonSerializer.Deserialize<List<Conversation>>(File.ReadAllText(store)) ?? new()); } catch { }

        history.SelectionChanged += (_, _) => { if (!switching && history.SelectedItem is Conversation c) Select(c); };
        historySearch.TextChanged += (_, _) => Refresh();
        historySearch.Background = Surface; historySearch.Foreground = Text; historySearch.BorderBrush = Line;
        send.Click += async (_, _) => await Send();
        attach.Click += async (_, _) => await AttachImages();
        input.KeyDown += async (_, e) => { if (e.Key == Key.Enter && !e.KeyModifiers.HasFlag(KeyModifiers.Shift)) { e.Handled = true; await Send(); } };

        var create = new Button { Content = "＋  Nouvelle conversation", HorizontalAlignment = HorizontalAlignment.Stretch };
        StyleButton(create, true);
        create.Click += (_, _) => Create();
        StyleButton(update);
        update.Click += async (_, _) =>
        {
            update.IsEnabled = false; SetStatus("Recherche de mises à jour…");
            try { SetStatus(await AppUpdater.CheckAndInstallAsync()); }
            catch (Exception ex) { SetStatus("Mise à jour impossible : " + ex.Message); }
            finally { update.IsEnabled = true; }
        };
        var rename = new Button { Content = "Renommer" }; StyleButton(rename);
        rename.Click += async (_, _) => await Rename();
        var delete = new Button { Content = "Supprimer" }; StyleButton(delete);
        delete.Click += async (_, _) => await Delete();

        var side = new StackPanel { Spacing = 13, Margin = new Thickness(14), Width = 250 };
        side.Children.Add(new TextBlock { Text = "Zodi AI", FontSize = 20, FontWeight = FontWeight.SemiBold, Foreground = Text, Margin = new Thickness(8, 8) });
        side.Children.Add(new TextBlock { Text = "Ton espace de conversation", Foreground = Muted, FontSize = 12 });
        side.Children.Add(create);
        side.Children.Add(new TextBlock { Text = "HISTORIQUE", Foreground = Muted, FontSize = 10, Margin = new Thickness(4, 12, 4, 0), FontWeight = FontWeight.Bold });
        side.Children.Add(historySearch);
        side.Children.Add(history);
        side.Children.Add(new TextBlock { Text = "Historique enregistré sur cet ordinateur", Foreground = Brush("#71819E"), FontSize = 11, TextWrapping = TextWrapping.Wrap });

        var head = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Background = PanelAlt };
        var labels = new StackPanel { Spacing = 5, Margin = new Thickness(24, 18) };
        labels.Children.Add(title); labels.Children.Add(status); head.Children.Add(labels);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12) };
        actions.Children.Add(update); actions.Children.Add(rename); actions.Children.Add(delete);
        Grid.SetColumn(actions, 1); head.Children.Add(actions);

        var scroll = new ScrollViewer { Content = messages, Padding = new Thickness(26), Background = Page };
        var composer = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto"), Margin = new Thickness(20, 14), Background = Page };
        input.Background = Brush("#303030"); input.Foreground = Text; input.BorderBrush = Brush("#555555"); input.BorderThickness = new Thickness(1); input.CornerRadius = new CornerRadius(24); input.Padding = new Thickness(16, 12);
        composer.Children.Add(input); Grid.SetColumn(attach, 1); attach.Margin = new Thickness(8, 0, 0, 0); StyleButton(attach); composer.Children.Add(attach);
        Grid.SetColumn(send, 2); send.Margin = new Thickness(8, 0, 0, 0); StyleButton(send, true); composer.Children.Add(send);

        var right = new Grid { RowDefinitions = new RowDefinitions("Auto,*,Auto"), Background = Page };
        right.Children.Add(head); Grid.SetRow(scroll, 1); right.Children.Add(scroll); Grid.SetRow(composer, 2); right.Children.Add(composer);
        var root = new Grid { ColumnDefinitions = new ColumnDefinitions("280,*"), Background = Page };
        root.Children.Add(new Border { Background = Panel, BorderBrush = Line, BorderThickness = new Thickness(0, 0, 1, 0), Child = side });
        Grid.SetColumn(right, 1); root.Children.Add(right); Content = root;

        if (items.Count == 0) Create(); else Select(items[0]);
        _ = CheckForUpdatesOnStartup();
    }

    async Task CheckForUpdatesOnStartup()
    {
        await Task.Delay(1500);
        try { SetStatus(await AppUpdater.CheckAndInstallAsync()); }
        catch { SetStatus("Vérification automatique des mises à jour indisponible. Réessaie avec « Mettre à jour »."); }
    }

    void SetStatus(string value)
    {
        status.Text = value;
        status.Foreground = value.Contains("échec", StringComparison.OrdinalIgnoreCase) || value.Contains("impossible", StringComparison.OrdinalIgnoreCase) || value.Contains("indisponible", StringComparison.OrdinalIgnoreCase) || value.Contains("erreur", StringComparison.OrdinalIgnoreCase) ? Brush("#EF5350") :
            value.Contains("attention", StringComparison.OrdinalIgnoreCase) || value.Contains("confirmation", StringComparison.OrdinalIgnoreCase) || value.Contains("Recherche", StringComparison.OrdinalIgnoreCase) || value.Contains("Régénération", StringComparison.OrdinalIgnoreCase) ? Brush("#FFB74D") :
            value.Contains("reçu", StringComparison.OrdinalIgnoreCase) || value.Contains("copiée", StringComparison.OrdinalIgnoreCase) || value.Contains("régénérée", StringComparison.OrdinalIgnoreCase) || value.Contains("En ligne", StringComparison.OrdinalIgnoreCase) ? Brush("#4CAF50") : Brush("#64B5F6");
    }

    void Save()
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(store)!); File.WriteAllText(store, JsonSerializer.Serialize(items)); }
        catch (Exception e) { SetStatus("Sauvegarde impossible : " + e.Message); }
    }
    void Refresh()
    {
        switching = true; var query = historySearch.Text?.Trim() ?? ""; history.ItemsSource = null; history.ItemsSource = items.Where(c => c.Title.Contains(query, StringComparison.OrdinalIgnoreCase) || c.Messages.Any(m => m.Content.Contains(query, StringComparison.OrdinalIgnoreCase))).ToList(); history.SelectedItem = active; switching = false;
    }
    void Create()
    {
        var c = new Conversation(); c.Messages.Add(new Message("assistant", "Salut ! Je suis Zodi. Que veux-tu faire aujourd'hui ?"));
        items.Insert(0, c); active = c; Refresh(); Render(); Save();
    }
    void Select(Conversation c) { active = c; title.Text = c.Title; Render(); }
    void Render()
    {
        messages.Children.Clear(); if (active == null) return;
        title.Text = active.Title;
        for (var i = 0; i < active.Messages.Count; i++) { var message = active.Messages[i]; Bubble(message.Content, message.Role == "user", message.Images, i); }
    }
    void Bubble(string value, bool user, List<ChatImage>? images = null, int messageIndex = -1)
    {
        var content = new StackPanel { Spacing = 8 };
        foreach (var image in images ?? new())
        {
            try { var bytes = Convert.FromBase64String(image.DataUrl.Split(',').Last()); using var stream = new MemoryStream(bytes); content.Children.Add(new Image { Source = new Bitmap(stream), MaxWidth = 360, MaxHeight = 240, Stretch = Avalonia.Media.Stretch.Uniform }); } catch { }
        }
        content.Children.Add(new TextBlock { Text = value, TextWrapping = TextWrapping.Wrap, Foreground = Text, FontSize = 14, LineHeight = 22 });
        var bubble = new Border { Background = Brush("#303030"), BorderBrush = Brush("#424242"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = new Thickness(16, 12), MaxWidth = 720, HorizontalAlignment = user ? HorizontalAlignment.Right : HorizontalAlignment.Left, Child = content };
        messages.Children.Add(bubble);
        if (!user && messageIndex >= 0)
        {
            var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, HorizontalAlignment = HorizontalAlignment.Left };
            Button Action(string label, Action run) { var button = new Button { Content = label, Background = Brushes.Transparent, BorderThickness = new Thickness(0), Foreground = Muted, Padding = new Thickness(7, 3) }; button.Click += (_, _) => run(); return button; }
            actions.Children.Add(Action("▢ Copier", () => CopyResponse(value)));
            actions.Children.Add(Action(feedback.GetValueOrDefault(messageIndex) == "like" ? "👍✓" : "👍", () => { feedback[messageIndex] = feedback.GetValueOrDefault(messageIndex) == "like" ? "" : "like"; if (active != null) Render(); }));
            actions.Children.Add(Action(feedback.GetValueOrDefault(messageIndex) == "dislike" ? "👎✓" : "👎", () => { feedback[messageIndex] = feedback.GetValueOrDefault(messageIndex) == "dislike" ? "" : "dislike"; if (active != null) Render(); }));
            actions.Children.Add(Action("↻ Régénérer", () => _ = RegenerateResponse(messageIndex)));
            actions.Children.Add(Action("↗ Copier pour partager", () => CopyResponse(value)));
            messages.Children.Add(actions);
        }
    }
    async void CopyResponse(string value)
    {
        try { await TopLevel.GetTopLevel(this)!.Clipboard!.SetTextAsync(value); SetStatus("Réponse copiée · prête à partager"); }
        catch { SetStatus("Copie indisponible sur ce bureau"); }
    }
    async Task RegenerateResponse(int messageIndex)
    {
        if (active == null || !send.IsEnabled || messageIndex < 0 || messageIndex >= active.Messages.Count) return;
        var conversation = active;
        var userIndex = conversation.Messages.Take(messageIndex).ToList().FindLastIndex(message => message.Role == "user");
        if (userIndex < 0) return;
        var prompt = conversation.Messages[userIndex];
        var prior = conversation.Messages.Take(userIndex).TakeLast(10).ToArray();
        conversation.Messages.RemoveRange(userIndex + 1, conversation.Messages.Count - userIndex - 1);
        send.IsEnabled = false; SetStatus("Régénération de la réponse…"); Render();
        try
        {
            using var response = await Http.PostAsJsonAsync(Api, new { message = prompt.Content, history = prior, images = (prompt.Images ?? new List<ChatImage>()).Select(image => new { dataUrl = image.DataUrl, mimeType = image.MimeType }) });
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new Exception($"HTTP {(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var answer = json.RootElement.TryGetProperty("reply", out var property) ? property.GetString() : null;
            if (string.IsNullOrWhiteSpace(answer)) throw new Exception("Réponse vide du serveur.");
            conversation.Messages.Add(new Message("assistant", answer));
            if (active == conversation) Render();
            SetStatus("Réponse régénérée"); Save();
        }
        catch (Exception error)
        {
            conversation.Messages.Add(new Message("assistant", "Régénération impossible : " + error.Message));
            if (active == conversation) Render();
            SetStatus("Échec de la régénération"); Save();
        }
        finally { send.IsEnabled = true; }
    }
    async Task<string?> Prompt(string caption, string value)
    {
        var box = new TextBox { Text = value, Background = Brush("#0B1425"), Foreground = Text, BorderBrush = Line, Padding = new Thickness(12) };
        var ok = new Button { Content = "Enregistrer", HorizontalAlignment = HorizontalAlignment.Right }; StyleButton(ok, true);
        var panel = new StackPanel { Margin = new Thickness(18), Spacing = 12, Background = Panel };
        panel.Children.Add(box); panel.Children.Add(ok);
        var window = new Window { Title = caption, Width = 390, Height = 180, WindowStartupLocation = WindowStartupLocation.CenterOwner, Background = Panel, Content = panel };
        ok.Click += (_, _) => window.Close(box.Text);
        return await window.ShowDialog<string?>(this);
    }
    async Task Rename()
    {
        if (active == null) return;
        var value = await Prompt("Renommer la conversation", active.Title);
        if (!string.IsNullOrWhiteSpace(value)) { active.Title = value.Trim(); title.Text = active.Title; Refresh(); Save(); }
    }
    async Task Delete()
    {
        if (active == null) return;
        var confirm = new Window { Title = "Supprimer la conversation ?", Width = 380, Height = 170, WindowStartupLocation = WindowStartupLocation.CenterOwner, Background = Panel };
        var panel = new StackPanel { Margin = new Thickness(18), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = $"Supprimer « {active.Title} » de cet ordinateur ?", Foreground = Text, TextWrapping = TextWrapping.Wrap });
        var button = new Button { Content = "Supprimer", HorizontalAlignment = HorizontalAlignment.Right }; StyleButton(button, true);
        panel.Children.Add(button); confirm.Content = panel; button.Click += (_, _) => confirm.Close(true);
        if (await confirm.ShowDialog<bool>(this))
        {
            items.Remove(active); active = null;
            if (items.Count == 0) { Create(); return; }
            active = items[0]; Refresh(); Render(); Save();
        }
    }
    async Task AttachImages()
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions { Title = "Choisir des photos", AllowMultiple = true, FileTypeFilter = new[] { new FilePickerFileType("Images") { Patterns = new[] { "*.jpg", "*.jpeg", "*.png", "*.webp" } } } });
        foreach (var file in files.Take(Math.Max(0, 4 - pendingImages.Count)))
        {
            try { await using var stream = await file.OpenReadAsync(); using var memory = new MemoryStream(); await stream.CopyToAsync(memory); var bytes = memory.ToArray(); if (bytes.Length > 700 * 1024) { SetStatus("Chaque photo doit faire moins de 700 Ko."); continue; } var usedBytes = pendingImages.Sum(image => Convert.FromBase64String(image.DataUrl.Split(',').Last()).Length); if (usedBytes + bytes.Length > 2 * 1024 * 1024) { SetStatus("Les photos jointes ne doivent pas dépasser 2 Mo au total."); continue; } pendingImages.Add(new ChatImage("data:image/jpeg;base64," + Convert.ToBase64String(bytes), "image/jpeg")); }
            catch { SetStatus("Impossible de lire une photo."); }
        }
        SetStatus(pendingImages.Count > 0 ? $"{pendingImages.Count} photo(s) prête(s) · maximum 4" : string.Empty);
    }
    async Task Send()
    {
        if (active == null || (string.IsNullOrWhiteSpace(input.Text) && pendingImages.Count == 0) || !send.IsEnabled) return;
        var conversation = active!; var value = input.Text.Trim(); var images = pendingImages.ToList(); pendingImages.Clear(); input.Text = "";
        var prior = conversation.Messages.TakeLast(10).ToArray(); var latestImageIndex = images.Count == 0 ? Array.FindLastIndex(prior, message => message.Images?.Count > 0) : -1; prior = prior.Select((message, index) => index == latestImageIndex ? message : message with { Images = null }).ToArray(); conversation.Messages.Add(new Message("user", value, images));
        if (conversation.Title == "Nouvelle conversation") conversation.Title = value.Length > 42 ? value[..39] + "…" : value;
        title.Text = conversation.Title; Refresh(); Bubble(value, true, images, conversation.Messages.Count - 1); Save();
        send.IsEnabled = false; SetStatus("Zodi réfléchit…");
        try
        {
            using var response = await Http.PostAsJsonAsync(Api, new { message = value, history = prior, images = images.Select(image => new { dataUrl = image.DataUrl, mimeType = image.MimeType }) });
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new Exception($"HTTP {(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var answer = json.RootElement.TryGetProperty("reply", out var property) ? property.GetString() : null;
            if (string.IsNullOrWhiteSpace(answer)) throw new Exception("Réponse vide du serveur.");
            conversation.Messages.Add(new Message("assistant", answer));
            if (active == conversation) Bubble(answer, false, null, conversation.Messages.Count - 1);
            SetStatus("Réponse reçue · Zodi AI"); Save();
        }
        catch (Exception error)
        {
            var message = "Impossible de joindre Zodi AI. Vérifie Internet puis réessaie.\n" + error.Message;
            conversation.Messages.Add(new Message("assistant", message));
            if (active == conversation) Bubble(message, false);
            SetStatus("Connexion indisponible"); Save();
        }
        finally { send.IsEnabled = true; }
    }

    public sealed class Conversation
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Title { get; set; } = "Nouvelle conversation";
        public List<Message> Messages { get; set; } = new();
        public override string ToString() => Title;
    }
    public sealed record ChatImage(string DataUrl, string MimeType);
    public sealed record Message(string Role, string Content, List<ChatImage>? Images = null);
}