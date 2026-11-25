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

namespace ZodiAI.Linux;

public sealed class MainWindow : Window
{
    const string Api = "https://zodi-ai-core.vercel.app/api/chat";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(70) };
    static readonly SolidColorBrush Page = Brush("#090E1B");
    static readonly SolidColorBrush Panel = Brush("#111A2D");
    static readonly SolidColorBrush PanelAlt = Brush("#17233A");
    static readonly SolidColorBrush Surface = Brush("#202D47");
    static readonly SolidColorBrush Text = Brush("#F2F5FF");
    static readonly SolidColorBrush Muted = Brush("#9BA9C3");
    static readonly SolidColorBrush Accent = Brush("#7868F6");
    static readonly SolidColorBrush Line = Brush("#283650");

    readonly string store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "zodi-ai", "conversations.json");
    readonly List<Conversation> items = new();
    readonly ListBox history = new() { Background = Brushes.Transparent, Foreground = Text };
    readonly StackPanel messages = new() { Spacing = 14 };
    readonly TextBox input = new() { Watermark = "Écris ton message à Zodi…", AcceptsReturn = true, MinHeight = 52, FontSize = 14 };
    readonly TextBlock title = new() { Text = "Zodi AI", FontSize = 20, FontWeight = FontWeight.Bold, Foreground = Text };
    readonly TextBlock status = new() { Text = "Assistant personnel · Internet requis", Foreground = Muted, FontSize = 12 };
    readonly Button send = new() { Content = "Envoyer  ↗", MinWidth = 112, Height = 46 };
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
        send.Click += async (_, _) => await Send();
        input.KeyDown += async (_, e) => { if (e.Key == Key.Enter && !e.KeyModifiers.HasFlag(KeyModifiers.Shift)) { e.Handled = true; await Send(); } };

        var create = new Button { Content = "＋  Nouvelle conversation", HorizontalAlignment = HorizontalAlignment.Stretch };
        StyleButton(create, true);
        create.Click += (_, _) => Create();
        StyleButton(update);
        update.Click += async (_, _) =>
        {
            update.IsEnabled = false; status.Text = "Recherche de mises à jour…";
            try { status.Text = await AppUpdater.CheckAndInstallAsync(); }
            catch (Exception ex) { status.Text = "Mise à jour impossible : " + ex.Message; }
            finally { update.IsEnabled = true; }
        };
        var rename = new Button { Content = "Renommer" }; StyleButton(rename);
        rename.Click += async (_, _) => await Rename();
        var delete = new Button { Content = "Supprimer" }; StyleButton(delete);
        delete.Click += async (_, _) => await Delete();

        var side = new StackPanel { Spacing = 13, Margin = new Thickness(18), Width = 250 };
        side.Children.Add(new TextBlock { Text = "✦  Zodi AI", FontSize = 23, FontWeight = FontWeight.Bold, Foreground = Text, Margin = new Thickness(4, 8) });
        side.Children.Add(new TextBlock { Text = "Ton espace de conversation", Foreground = Muted, FontSize = 12 });
        side.Children.Add(create);
        side.Children.Add(new TextBlock { Text = "TES CONVERSATIONS", Foreground = Muted, FontSize = 10, Margin = new Thickness(4, 12, 4, 0), FontWeight = FontWeight.Bold });
        side.Children.Add(history);
        side.Children.Add(new TextBlock { Text = "Historique enregistré sur cet ordinateur", Foreground = Brush("#71819E"), FontSize = 11, TextWrapping = TextWrapping.Wrap });

        var head = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Background = PanelAlt };
        var labels = new StackPanel { Spacing = 5, Margin = new Thickness(24, 18) };
        labels.Children.Add(title); labels.Children.Add(status); head.Children.Add(labels);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12) };
        actions.Children.Add(update); actions.Children.Add(rename); actions.Children.Add(delete);
        Grid.SetColumn(actions, 1); head.Children.Add(actions);

        var scroll = new ScrollViewer { Content = messages, Padding = new Thickness(26), Background = Page };
        var composer = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(20, 14), Background = PanelAlt };
        input.Background = Brush("#0B1425"); input.Foreground = Text; input.BorderBrush = Line; input.BorderThickness = new Thickness(1); input.CornerRadius = new CornerRadius(12); input.Padding = new Thickness(14, 10);
        composer.Children.Add(input); Grid.SetColumn(send, 1); send.Margin = new Thickness(12, 0, 0, 0); StyleButton(send, true); composer.Children.Add(send);

        var right = new Grid { RowDefinitions = new RowDefinitions("Auto,*,Auto"), Background = Page };
        right.Children.Add(head); Grid.SetRow(scroll, 1); right.Children.Add(scroll); Grid.SetRow(composer, 2); right.Children.Add(composer);
        var root = new Grid { ColumnDefinitions = new ColumnDefinitions("280,*"), Background = Page };
        root.Children.Add(new Border { Background = Panel, BorderBrush = Line, BorderThickness = new Thickness(0, 0, 1, 0), Child = side });
        Grid.SetColumn(right, 1); root.Children.Add(right); Content = root;

        if (items.Count == 0) Create(); else Select(items[0]);
    }

    void Save()
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(store)!); File.WriteAllText(store, JsonSerializer.Serialize(items)); }
        catch (Exception e) { status.Text = "Sauvegarde impossible : " + e.Message; }
    }
    void Refresh()
    {
        switching = true; history.ItemsSource = null; history.ItemsSource = items; history.SelectedItem = active; switching = false;
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
        foreach (var message in active.Messages) Bubble(message.Content, message.Role == "user");
    }
    void Bubble(string value, bool user)
    {
        var bubble = new Border
        {
            Background = Brush(user ? "#5145B8" : "#202D47"),
            BorderBrush = user ? Brush("#7166E7") : Line,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(16),
            Padding = new Thickness(16, 12),
            MaxWidth = 720,
            HorizontalAlignment = user ? HorizontalAlignment.Right : HorizontalAlignment.Left
        };
        bubble.Child = new TextBlock { Text = value, TextWrapping = TextWrapping.Wrap, Foreground = Text, FontSize = 14, LineHeight = 22 };
        messages.Children.Add(bubble);
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
    async Task Send()
    {
        if (active == null || string.IsNullOrWhiteSpace(input.Text) || !send.IsEnabled) return;
        var conversation = active; var value = input.Text.Trim(); input.Text = "";
        var prior = conversation.Messages.ToArray(); conversation.Messages.Add(new Message("user", value));
        if (conversation.Title == "Nouvelle conversation") conversation.Title = value.Length > 42 ? value[..39] + "…" : value;
        title.Text = conversation.Title; Refresh(); Bubble(value, true); Save();
        send.IsEnabled = false; status.Text = "Zodi réfléchit…";
        try
        {
            using var response = await Http.PostAsJsonAsync(Api, new { message = value, history = prior });
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new Exception($"HTTP {(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var answer = json.RootElement.TryGetProperty("reply", out var property) ? property.GetString() : null;
            if (string.IsNullOrWhiteSpace(answer)) throw new Exception("Réponse vide du serveur.");
            conversation.Messages.Add(new Message("assistant", answer));
            if (active == conversation) Bubble(answer, false);
            status.Text = "Réponse reçue · Zodi AI"; Save();
        }
        catch (Exception error)
        {
            var message = "Impossible de joindre Zodi AI. Vérifie Internet puis réessaie.\n" + error.Message;
            conversation.Messages.Add(new Message("assistant", message));
            if (active == conversation) Bubble(message, false);
            status.Text = "Connexion indisponible"; Save();
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
    public sealed record Message(string Role, string Content);
}