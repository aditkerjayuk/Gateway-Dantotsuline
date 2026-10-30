(function () {
    const STORAGE_KEY = 'sidebar-collapsed';
    const root = document.documentElement;
    const toggle = document.getElementById('app-sidebar-toggle');
    if (!toggle) return;

    const mobileQuery = window.matchMedia('(max-width: 820px)');

    function readStored() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
    }

    function persist(collapsed) {
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
            /* penyimpanan tidak tersedia: abaikan */
        }
    }

    function apply(collapsed) {
        root.classList.toggle('sidebar-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', collapsed ? 'Tampilkan menu' : 'Sembunyikan menu');
        toggle.title = collapsed ? 'Tampilkan menu' : 'Sembunyikan menu';
    }

    // Skrip di <head> sudah memasang class sebelum paint; di sini hanya menyinkronkan
    // atribut aksesibilitas dan menangani layar kecil.
    const stored = readStored();
    const startCollapsed = stored === null ? mobileQuery.matches : stored === '1';
    apply(startCollapsed);

    toggle.addEventListener('click', () => {
        const collapsed = !root.classList.contains('sidebar-collapsed');
        apply(collapsed);
        persist(collapsed);
    });

    window.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (mobileQuery.matches && !root.classList.contains('sidebar-collapsed')) {
            apply(true);
            persist(false);
        }
    });
})();
