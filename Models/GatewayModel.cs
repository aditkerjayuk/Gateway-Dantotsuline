using System.Text.Json.Serialization;

namespace Gateway_Dantotsuline.Models
{
    public class GatewayRequest
    {
        [JsonPropertyName("TOKEN")]
        public string? Token { get; set; }
    }

    public class GatewayResponse<T>
    {
        [JsonPropertyName("statusCode")]
        public int StatusCode { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("data")]
        public List<T> Data { get; set; } = new();
    }

    public class GatewayDto
    {
        [JsonPropertyName("ID")]
        public int Id { get; set; }

        [JsonPropertyName("NAME")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("IP_ADDRESS")]
        public string? IpAddress { get; set; }

        [JsonPropertyName("TOPIC")]
        public string Topic { get; set; } = string.Empty;

        [JsonPropertyName("STATUS")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("CREATED_AT")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("UPDATED_AT")]
        public DateTime UpdatedAt { get; set; }
    }
}