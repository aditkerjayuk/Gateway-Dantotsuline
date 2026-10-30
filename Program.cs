using Gateway_Dantotsuline.Models;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// Timeout pendek: kalau host API tidak terjangkau, jangan biarkan halaman tertahan lama.
builder.Services.AddHttpClient("GatewayApi", (services, client) =>
{
    var api = services.GetRequiredService<IOptions<GatewayApiOptions>>().Value;
    client.Timeout = TimeSpan.FromSeconds(Math.Max(1, api.TimeoutSeconds));
});

// Konfigurasi API gateway eksternal (BaseUrl, path, token).
builder.Services.Configure<GatewayApiOptions>(
    builder.Configuration.GetSection(GatewayApiOptions.SectionName));

// Kompatibilitas ke belakang: kalau GatewayApi:Token kosong, pakai key lama "TOKEN"
// (mis. dari environment variable TOKEN).
builder.Services.PostConfigure<GatewayApiOptions>(options =>
{
    if (string.IsNullOrWhiteSpace(options.Token))
        options.Token = builder.Configuration["TOKEN"];
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
