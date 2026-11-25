using System; using System.Collections.ObjectModel; using System.IO; using System.Linq; using System.Net.Http; using System.Net.Http.Json; using System.Text.Json; using Microsoft.UI; using Microsoft.UI.Xaml; using Microsoft.UI.Xaml.Controls; using Microsoft.UI.Xaml.Input; using Microsoft.UI.Xaml.Media; using Windows.System; using Windows.UI; using Windows.Storage.Pickers; using Windows.Storage.Streams; using System.Collections.Generic;
namespace ZodiAI;
public sealed partial class MainWindow : Window {
 private static readonly HttpClient Http=new(){Timeout=TimeSpan.FromSeconds(70)}; private const string Endpoint="https://zodi-ai-core.vercel.app/api/chat";
 private readonly ObservableCollection<Conversation> items=new(); private readonly string store=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ZodiAI","conversations.json"); private Conversation? active; private bool switching; private readonly List<ChatImage> pendingImages=new(); private readonly Dictionary<int,string> feedback=new();
 public MainWindow(){InitializeComponent();Title="Zodi AI";try{if(File.Exists(store)){var saved=JsonSerializer.Deserialize<Conversation[]>(File.ReadAllText(store));if(saved!=null)foreach(var c in saved)items.Add(c);}}catch{} ConversationList.ItemsSource=items;if(items.Count==0)Create();Select(items[0]);CheckForUpdatesOnStartup();}
 private async void CheckForUpdatesOnStartup(){await System.Threading.Tasks.Task.Delay(1500);try{var result=await AppUpdater.CheckAndInstallAsync();if(result=="INSTALLER_STARTED"){Application.Current.Exit();return;}SetStatus(result);}catch{SetStatus("Vérification automatique des mises à jour indisponible. Réessaie avec « Mettre à jour ».");}}
 private void SetStatus(string value){
  StatusText.Text=value;
  var tone=value.Contains("échec",StringComparison.OrdinalIgnoreCase)||value.Contains("impossible",StringComparison.OrdinalIgnoreCase)||value.Contains("indisponible",StringComparison.OrdinalIgnoreCase)||value.Contains("erreur",StringComparison.OrdinalIgnoreCase)?Color.FromArgb(255,239,83,80):
   value.Contains("attention",StringComparison.OrdinalIgnoreCase)||value.Contains("confirmation",StringComparison.OrdinalIgnoreCase)||value.Contains("Recherche",StringComparison.OrdinalIgnoreCase)||value.Contains("Régénération",StringComparison.OrdinalIgnoreCase)?Color.FromArgb(255,255,183,77):
   value.Contains("reçu",StringComparison.OrdinalIgnoreCase)||value.Contains("copiée",StringComparison.OrdinalIgnoreCase)||value.Contains("régénérée",StringComparison.OrdinalIgnoreCase)||value.Contains("En ligne",StringComparison.OrdinalIgnoreCase)?Color.FromArgb(255,76,175,80):Color.FromArgb(255,100,181,246);
  StatusText.Foreground=new SolidColorBrush(tone);
 }
 private void Save(){try{Directory.CreateDirectory(Path.GetDirectoryName(store)!);File.WriteAllText(store,JsonSerializer.Serialize(items));}catch(Exception e){SetStatus("Sauvegarde impossible : "+e.Message);}}
 private void Create(){var c=new Conversation();c.Messages.Add(new Message("assistant","Salut ! Je suis Zodi. Que veux-tu faire aujourd'hui ?"));items.Insert(0,c);Save();Select(c);}
 private void Select(Conversation c){switching=true;active=c;ConversationList.SelectedItem=c;ConversationTitle.Text=c.Title;MessagesPanel.Children.Clear();for(int i=0;i<c.Messages.Count;i++){var m=c.Messages[i];Bubble(m.Content,m.Role=="user",m.Images,i);}switching=false;}
 private void ConversationList_SelectionChanged(object s,SelectionChangedEventArgs e){if(!switching&&ConversationList.SelectedItem is Conversation c)Select(c);}
 private void HistorySearch_TextChanged(object s,TextChangedEventArgs e){var query=HistorySearch.Text?.Trim()??"";var selected=active;switching=true;ConversationList.ItemsSource=string.IsNullOrWhiteSpace(query)?items:items.Where(c=>c.Title.Contains(query,StringComparison.OrdinalIgnoreCase)||c.Messages.Any(m=>m.Content.Contains(query,StringComparison.OrdinalIgnoreCase))).ToList();if(selected!=null)ConversationList.SelectedItem=selected;switching=false;}
 private void NewConversation_Click(object s,RoutedEventArgs e)=>Create();
 private async void CheckForUpdates_Click(object s,RoutedEventArgs e){try{SetStatus("Recherche de mises à jour…");var result=await AppUpdater.CheckAndInstallAsync();if(result=="INSTALLER_STARTED"){Application.Current.Exit();return;}SetStatus(result);}catch(Exception ex){SetStatus("Mise à jour impossible : "+ex.Message);}}
 private async void RenameConversation_Click(object s,RoutedEventArgs e){if(active==null)return;var box=new TextBox{Text=active.Title};var d=new ContentDialog{Title="Renommer la conversation",Content=box,PrimaryButtonText="Enregistrer",CloseButtonText="Annuler",XamlRoot=Content.XamlRoot};if(await d.ShowAsync()==ContentDialogResult.Primary&&!string.IsNullOrWhiteSpace(box.Text)){active.Title=box.Text.Trim();ConversationTitle.Text=active.Title;ConversationList.ItemsSource=null;ConversationList.ItemsSource=items;ConversationList.SelectedItem=active;Save();}}
 private async void DeleteConversation_Click(object s,RoutedEventArgs e){if(active==null)return;var d=new ContentDialog{Title="Supprimer cette conversation ?",Content=$"« {active.Title} » sera supprimée de cet ordinateur.",PrimaryButtonText="Supprimer",CloseButtonText="Annuler",XamlRoot=Content.XamlRoot};if(await d.ShowAsync()!=ContentDialogResult.Primary)return;items.Remove(active);if(items.Count==0){Create();return;}Save();Select(items[0]);}
 private async void SendButton_Click(object s,RoutedEventArgs e)=>await Send();
 private async void AttachImage_Click(object s,RoutedEventArgs e){
  try{
   var picker=new FileOpenPicker(); picker.FileTypeFilter.Add(".jpg");picker.FileTypeFilter.Add(".jpeg");picker.FileTypeFilter.Add(".png");picker.FileTypeFilter.Add(".webp");
   WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(this));
   var files=await picker.PickMultipleFilesAsync();
   foreach(var file in files.Take(Math.Max(0,4-pendingImages.Count))){
    var buffer=await Windows.Storage.FileIO.ReadBufferAsync(file);var bytes=new byte[buffer.Length];using(var reader=DataReader.FromBuffer(buffer))reader.ReadBytes(bytes);
    if(bytes.Length>700*1024){SetStatus("Chaque photo doit faire moins de 700 Ko.");continue;}
    var usedBytes=pendingImages.Sum(image=>Convert.FromBase64String(image.DataUrl.Split(',').Last()).Length);
    if(usedBytes+bytes.Length>2*1024*1024){SetStatus("Les photos jointes ne doivent pas dépasser 2 Mo au total.");continue;}
    var ext=Path.GetExtension(file.Name).ToLowerInvariant();var mime=ext==".png"?"image/png":ext==".webp"?"image/webp":"image/jpeg";
    pendingImages.Add(new ChatImage("data:"+mime+";base64,"+Convert.ToBase64String(bytes),mime,file.Name));
   }
   SetStatus(pendingImages.Count+" photo(s) prête(s) · maximum 4");
  }catch(Exception ex){SetStatus("Ajout photo impossible : "+ex.Message);}
 }
 private async void MessageInput_KeyDown(object s,KeyRoutedEventArgs e){if(e.Key==VirtualKey.Enter&&!Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down)){e.Handled=true;await Send();}}
 private async System.Threading.Tasks.Task Send(){if(active==null)return;var c=active;var text=MessageInput.Text.Trim();if((text.Length==0&&pendingImages.Count==0)||!SendButton.IsEnabled)return;var images=pendingImages.ToList();pendingImages.Clear();var history=c.Messages.TakeLast(10).ToArray();var latestImageIndex=images.Count==0?Array.FindLastIndex(history,message=>message.Images?.Count>0):-1;history=history.Select((message,index)=>index==latestImageIndex?message:message with{Images=null}).ToArray();MessageInput.Text="";c.Messages.Add(new Message("user",text.Length==0?"Analyse les photos jointes.":text,images));if(c.Title=="Nouvelle conversation")c.Title=text.Length>42?text[..39]+"…":text;RefreshList(c);Bubble(text,true,images,c.Messages.Count-1);Save();SendButton.IsEnabled=false;SetStatus("Zodi réfléchit…");try{using var r=await Http.PostAsJsonAsync(Endpoint,new{message=text,history,images=images.Select(image=>new{dataUrl=image.DataUrl,mimeType=image.MimeType})});var body=await r.Content.ReadAsStringAsync();if(!r.IsSuccessStatusCode)throw new Exception($"HTTP {(int)r.StatusCode}: {body}");using var j=JsonDocument.Parse(body);var answer=j.RootElement.TryGetProperty("reply",out var v)?v.GetString():"";if(string.IsNullOrWhiteSpace(answer))throw new Exception("Réponse vide du serveur.");c.Messages.Add(new Message("assistant",answer));if(active==c)Bubble(answer,false,null,c.Messages.Count-1);SetStatus("Réponse reçue · Zodi AI");Save();}catch(Exception ex){var err="Impossible de joindre Zodi AI. Vérifie Internet puis réessaie.\n"+ex.Message;c.Messages.Add(new Message("assistant",err));if(active==c)Bubble(err,false);SetStatus("Connexion indisponible");Save();}finally{SendButton.IsEnabled=true;MessageInput.Focus(FocusState.Programmatic);}}
 private void RefreshList(Conversation c){var query=HistorySearch.Text?.Trim()??"";ConversationList.ItemsSource=null;ConversationList.ItemsSource=string.IsNullOrWhiteSpace(query)?items:items.Where(item=>item.Title.Contains(query,StringComparison.OrdinalIgnoreCase)||item.Messages.Any(message=>message.Content.Contains(query,StringComparison.OrdinalIgnoreCase))).ToList();ConversationList.SelectedItem=c;ConversationTitle.Text=c.Title;}
 private void Bubble(string text,bool user,List<ChatImage>? images=null,int messageIndex=-1){
  var stack=new StackPanel{Spacing=8};
  if(images!=null)foreach(var image in images)stack.Children.Add(new TextBlock{Text="📷 "+image.Name,Foreground=new SolidColorBrush(Color.FromArgb(255,210,210,210))});
  stack.Children.Add(new TextBlock{Text=text,TextWrapping=TextWrapping.Wrap,FontSize=15,Foreground=new SolidColorBrush(Color.FromArgb(255,244,246,252)),IsTextSelectionEnabled=true});
  var b=new Border{Background=new SolidColorBrush(user?Color.FromArgb(255,38,59,99):Color.FromArgb(0,0,0,0)),BorderBrush=new SolidColorBrush(user?Color.FromArgb(255,59,130,246):Color.FromArgb(0,0,0,0)),BorderThickness=new Thickness(user?1:0),CornerRadius=new CornerRadius(20),Padding=user?new Thickness(16,12,16,12):new Thickness(0,4),MaxWidth=720,HorizontalAlignment=user?HorizontalAlignment.Right:HorizontalAlignment.Left,Child=stack};
  MessagesPanel.Children.Add(b);
  if(!user&&messageIndex>=0){
   var actions=new StackPanel{Orientation=Orientation.Horizontal,Spacing=2,HorizontalAlignment=HorizontalAlignment.Left};
   Button Action(string label,Action run){var button=new Button{Content=label,Background=new SolidColorBrush(Color.FromArgb(0,0,0,0)),BorderThickness=new Thickness(0),Foreground=new SolidColorBrush(Color.FromArgb(255,170,170,170)),Padding=new Thickness(7,3,7,3)};button.Click+=(_,_)=>run();return button;}
   actions.Children.Add(Action("▢ Copier",()=>CopyResponse(text)));
   actions.Children.Add(Action(feedback.GetValueOrDefault(messageIndex)=="like"?"👍✓":"👍",()=>{feedback[messageIndex]=feedback.GetValueOrDefault(messageIndex)=="like"?"":"like";Select(active!);} ));
   actions.Children.Add(Action(feedback.GetValueOrDefault(messageIndex)=="dislike"?"👎✓":"👎",()=>{feedback[messageIndex]=feedback.GetValueOrDefault(messageIndex)=="dislike"?"":"dislike";Select(active!);} ));
   actions.Children.Add(Action("↻ Régénérer",()=>_ = RegenerateResponse(messageIndex)));
   actions.Children.Add(Action("↗ Copier pour partager",()=>CopyResponse(text)));
   MessagesPanel.Children.Add(actions);
  }
  _ = MessagesScroll.ChangeView(null,MessagesScroll.ScrollableHeight,null,true);
 }
 private void CopyResponse(string content){var package=new Windows.ApplicationModel.DataTransfer.DataPackage();package.SetText(content);Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);SetStatus("Réponse copiée · prête à partager");}
 private async System.Threading.Tasks.Task RegenerateResponse(int messageIndex){
  if(active==null||!SendButton.IsEnabled||messageIndex<0||messageIndex>=active.Messages.Count)return;
  var c=active;var userIndex=c.Messages.Take(messageIndex).ToList().FindLastIndex(m=>m.Role=="user");if(userIndex<0)return;
  var prompt=c.Messages[userIndex];var history=c.Messages.Take(userIndex).TakeLast(10).ToArray();
  while(c.Messages.Count>userIndex+1)c.Messages.RemoveAt(c.Messages.Count-1);
  SendButton.IsEnabled=false;SetStatus("Régénération de la réponse…");Select(c);
  try{
   using var response=await Http.PostAsJsonAsync(Endpoint,new{message=prompt.Content,history,images=(prompt.Images??new List<ChatImage>()).Select(image=>new{dataUrl=image.DataUrl,mimeType=image.MimeType})});
   var body=await response.Content.ReadAsStringAsync();if(!response.IsSuccessStatusCode)throw new Exception($"HTTP {(int)response.StatusCode}: {body}");
   using var json=JsonDocument.Parse(body);var answer=json.RootElement.TryGetProperty("reply",out var value)?value.GetString():"";
   if(string.IsNullOrWhiteSpace(answer))throw new Exception("Réponse vide du serveur.");
   c.Messages.Add(new Message("assistant",answer));if(active==c)Select(c);SetStatus("Réponse régénérée");Save();
  }catch(Exception ex){c.Messages.Add(new Message("assistant","Régénération impossible : "+ex.Message));if(active==c)Select(c);SetStatus("Échec de la régénération");Save();}
  finally{SendButton.IsEnabled=true;}
 }
 public sealed class Conversation{public string Id{get;set;}=Guid.NewGuid().ToString();public string Title{get;set;}="Nouvelle conversation";public System.Collections.Generic.List<Message> Messages{get;set;}=new();public override string ToString()=>Title;} public sealed record ChatImage(string DataUrl,string MimeType,string Name); public sealed record Message(string Role,string Content,List<ChatImage>? Images=null);
}