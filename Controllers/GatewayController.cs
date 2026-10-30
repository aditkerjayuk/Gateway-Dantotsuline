using Gateway_Dantotsuline.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Gateway_Dantotsuline.Controllers
{
    public class GatewayController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly GatewayApiOptions _api;

        public GatewayController(IHttpClientFactory httpClientFactory, IOptions<GatewayApiOptions> apiOptions)
        {
            _httpClient = httpClientFactory.CreateClient("GatewayApi");
            _api = apiOptions.Value;
        }

        public async Task<IActionResult> Editor()
        {
            var requestBody = new GatewayRequest
            {
                Token = _api.Token
            };

            string url = _api.GatewaysUrl;

            try
            {
                HttpResponseMessage response = await _httpClient.PostAsJsonAsync(url, requestBody);

                if (response.IsSuccessStatusCode)
                {
                    var apiResponse = await response.Content.ReadFromJsonAsync<GatewayResponse<GatewayDto>>();

                    if (apiResponse != null && apiResponse.StatusCode == 200)
                    {
                        // log
                        Console.WriteLine($"pesan: {apiResponse.Message}");

                        foreach (var datas in apiResponse.Data)
                        {
                            string ip = string.IsNullOrEmpty(datas.IpAddress) ? "Ip kosong" : datas.IpAddress;
                            Console.WriteLine($"- [{datas.Id}] {datas.Name} | IP: {ip} | Status: {datas.Status}");
                        }

                        return View(apiResponse.Data);
                    }
                    else
                    {
                        Console.WriteLine($"Data API Kosong");
                    }
                }
                else
                {
                    Console.WriteLine($"Gagal memanggil API, status code {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Terjadi kesalahan: {ex:Message}");
            }

            return View(new List<GatewayDto>());
        }

        // Halaman monitoring read-only. Data gateway diambil oleh browser lewat
        // GetGatewayJson supaya halaman tetap bisa dibuka walau API sedang lambat.
        public IActionResult Index()
        {
            return View();
        }

        public async Task<IActionResult> GetGatewayJson()
        {
            var requestBody = new GatewayRequest
            {
                Token = _api.Token
            };

            string url = _api.GatewaysUrl;

            try
            {
                HttpResponseMessage response = await _httpClient.PostAsJsonAsync(url, requestBody);

                if (response.IsSuccessStatusCode)
                {
                    var apiResponse = await response.Content.ReadFromJsonAsync<GatewayResponse<GatewayDto>>();

                    if (apiResponse != null && apiResponse.StatusCode == 200)
                    {
                        return Json(apiResponse.Data);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Terjadi kesalahan: {ex.Message}");
            }

            // Beri status error yang jelas supaya frontend bisa menandai box sebagai
            // "tidak diketahui", bukan berpura-pura API mengembalikan daftar kosong.
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Gagal mengambil data gateway dari API." });
        }
    }
}