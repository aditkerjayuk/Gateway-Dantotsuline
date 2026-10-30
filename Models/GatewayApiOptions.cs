namespace Gateway_Dantotsuline.Models
{
    /// <summary>
    /// Konfigurasi koneksi ke API gateway eksternal (bagian "GatewayApi" di appsettings).
    /// </summary>
    public class GatewayApiOptions
    {
        public const string SectionName = "GatewayApi";

        public string BaseUrl { get; set; } = "http://10.146.124.150:5000";

        public string GatewaysPath { get; set; } = "/api/gateways";

        /// <summary>
        /// Batas waktu request ke API (detik). Default 8 detik supaya halaman tidak
        /// tertahan lama ketika host API tidak terjangkau.
        /// </summary>
        public int TimeoutSeconds { get; set; } = 8;

        /// <summary>
        /// Token dikirim sebagai field "TOKEN" di body request.
        /// Jangan disimpan di appsettings.json yang ikut Git; isi lewat
        /// appsettings.Development.json, user-secrets, atau env var GatewayApi__Token.
        /// </summary>
        public string? Token { get; set; }

        public string GatewaysUrl =>
            $"{BaseUrl.TrimEnd('/')}/{GatewaysPath.TrimStart('/')}";
    }
}
