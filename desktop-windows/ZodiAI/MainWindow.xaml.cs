using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;

namespace ZodiAI;

public sealed partial class MainWindow : Window
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(50)
    };

    private const string ChatEndpoint = "https://zodi-ai-core.vercel.app/api/chat";
    private readonly List<ChatMessage> _history = new();

    public MainWindow()
    {
        InitializeComponent();
        Title = "Zodi IA";
    }

    private async void SendButton_Click(object sender, RoutedEventArgs e) => await SendMessageAsync();

    private async void MessageInput_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter && !Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down))
        {
            e.Handled = true;
            await SendMessageAsync();
        }
    }

    private async System.Threading.Tasks.Task SendMessageAsync()
    {
        var text = MessageInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(text) || SendButton.IsEnabled == false)
            return;

        MessageInput.Text = string.Empty;
        AddMessage(text, true);
        _history.Add(new ChatMessage("user", text));
        SendButton.IsEnabled = false;
        StatusText.Text = "Zodi réfléchit…";

        try
        {
            var payload = new
            {
                message = text,
                history = _history.Count > 1 ? _history.GetRange(0, _history.Count - 1) : new List<ChatMessage>()
            };

            using var response = await Http.PostAsJsonAsync(ChatEndpoint, payload);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new HttpRequestException($"Le serveur a répondu HTTP {(int)response.StatusCode}. {body}");

            using var document = JsonDocument.Parse(body);
            var answer = ReadAnswer(document.RootElement);
            if (string.IsNullOrWhiteSpace(answer))
                answer = "Le serveur a répondu, mais je n'ai pas trouvé de texte dans sa réponse.";

            AddMessage(answer, false);
            _history.Add(new ChatMessage("assistant", answer));
            StatusText.Text = "Réponse reçue · Zodi IA";
        }
        catch (Exception ex)
        {
            AddMessage("Je n'ai pas réussi à joindre le service Zodi IA. Vérifie ta connexion Internet puis réessaie.\n\nDétail : " + ex.Message, false);
            StatusText.Text = "Connexion au service indisponible";
        }
        finally
        {
            SendButton.IsEnabled = true;
            MessageInput.Focus(FocusState.Programmatic);
        }
    }

    private static string ReadAnswer(JsonElement root)
    {
        foreach (var key in new[] { "response", "reply", "message", "content", "text" })
        {
            if (root.ValueKind == JsonValueKind.Object &&
                root.TryGetProperty(key, out var value) &&
                value.ValueKind == JsonValueKind.String)
                return value.GetString() ?? string.Empty;
        }

        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("choices", out var choices) &&
            choices.ValueKind == JsonValueKind.Array &&
            choices.GetArrayLength() > 0)
        {
            var first = choices[0];
            if (first.TryGetProperty("message", out var message) &&
                message.TryGetProperty("content", out var content))
                return content.GetString() ?? string.Empty;
        }

        return string.Empty;
    }

    private void AddMessage(string text, bool isUser)
    {
        var bubble = new Border
        {
            Background = new SolidColorBrush(isUser ? Color.FromArgb(255, 42, 74, 125) : Color.FromArgb(255, 27, 34, 48)),
            CornerRadius = new CornerRadius(16),
            Padding = new Thickness(16, 12, 16, 12),
            MaxWidth = 720,
            HorizontalAlignment = isUser ? HorizontalAlignment.Right : HorizontalAlignment.Left
        };

        bubble.Child = new TextBlock
        {
            Text = text,
            TextWrapping = TextWrapping.Wrap,
            FontSize = 15,
            Foreground = new SolidColorBrush(Color.FromArgb(255, 244, 246, 252)),
            IsTextSelectionEnabled = true
        };

        MessagesPanel.Children.Add(bubble);
        _ = MessagesScroll.ChangeView(null, MessagesScroll.ScrollableHeight, null, true);
    }

    private sealed record ChatMessage(string role, string content);
}
