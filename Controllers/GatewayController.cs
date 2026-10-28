using Gateway_Dantotsuline.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace Gateway_Dantotsuline.Controllers
{
    public class GatewayController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public GatewayController(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        public async Task<IActionResult> Index()
        {
            var requestBody = new GatewayRequest
            {
                Token = _configuration["TOKEN"]
            };

            string url = "http://10.146.124.150:5000/api/gateways";

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

        public async Task<IActionResult> GetGatewayJson()
        {
            var requestBody = new GatewayRequest
            {
                Token = _configuration["TOKEN"]
            };

            string url = "http://10.146.124.150:5000/api/gateways";

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

            return Json(new List<GatewayDto>());
        }
    }
}