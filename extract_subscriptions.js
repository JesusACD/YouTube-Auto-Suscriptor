// Content script para extraer URLs de canales suscritos desde youtube.com/feed/channels

(function() {
  // Configuración del auto-scroll
  const SCROLL_DELAY_MS = 800;
  const MAX_SCROLL_ATTEMPTS = 150; // Máximo de intentos de scroll para evitar bucle infinito
  const STABLE_THRESHOLD = 3; // Cuántas veces sin cambio de altura para considerar que se cargó todo

  /**
   * Realiza auto-scroll hasta el final de la página para cargar todos los canales.
   * YouTube usa lazy-loading, así que hay que scrollear para que carguen todos.
   */
  async function autoScrollToBottom() {
    return new Promise((resolve) => {
      let lastHeight = document.documentElement.scrollHeight;
      let stableCount = 0;
      let scrollAttempts = 0;

      const scrollInterval = setInterval(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        scrollAttempts++;

        const newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        lastHeight = newHeight;

        // Detener si la altura no cambia tras varios intentos o se supera el máximo
        if (stableCount >= STABLE_THRESHOLD || scrollAttempts >= MAX_SCROLL_ATTEMPTS) {
          clearInterval(scrollInterval);
          console.log(`Auto-scroll completado. Intentos: ${scrollAttempts}, Altura final: ${lastHeight}`);
          resolve();
        }
      }, SCROLL_DELAY_MS);
    });
  }

  /**
   * Extrae las URLs de todos los canales visibles en la página de suscripciones.
   * Intenta múltiples selectores para mayor compatibilidad con cambios de YouTube.
   */
  function extractChannelUrls() {
    const urls = new Set();

    // Selectores para la página de suscripciones (/feed/channels)
    const selectors = [
      'ytd-channel-renderer a#main-link',
      'ytd-channel-renderer a.channel-link',
      'ytd-channel-renderer #avatar-section a',
      'ytd-channel-renderer a[href*="/@"]',
      'ytd-channel-renderer a[href*="/channel/"]',
      'ytd-channel-renderer a[href*="/c/"]',
      // Selectores alternativos por si YouTube cambia la estructura
      '#items ytd-channel-renderer a[href]',
      'ytd-section-list-renderer ytd-channel-renderer a[href]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const href = el.href || el.getAttribute('href');
        if (href && isValidChannelUrl(href)) {
          // Normalizar la URL para evitar duplicados
          const normalizedUrl = normalizeChannelUrl(href);
          if (normalizedUrl) {
            urls.add(normalizedUrl);
          }
        }
      });
    }

    return Array.from(urls);
  }

  /**
   * Verifica si una URL corresponde a un canal de YouTube válido.
   */
  function isValidChannelUrl(url) {
    return (
      url.includes('youtube.com/@') ||
      url.includes('youtube.com/channel/') ||
      url.includes('youtube.com/c/')
    );
  }

  /**
   * Normaliza la URL del canal eliminando parámetros y fragmentos extra.
   */
  function normalizeChannelUrl(url) {
    try {
      const urlObj = new URL(url, 'https://www.youtube.com');
      // Mantener solo el pathname del canal sin sub-rutas (videos, about, etc.)
      let pathname = urlObj.pathname;

      // Extraer solo la parte del canal
      const channelPatterns = [
        /^(\/@[^/]+)/,           // /@NombreCanal
        /^(\/channel\/[^/]+)/,   // /channel/UCxxxxx
        /^(\/c\/[^/]+)/          // /c/NombreCanal
      ];

      for (const pattern of channelPatterns) {
        const match = pathname.match(pattern);
        if (match) {
          return `https://www.youtube.com${match[1]}`;
        }
      }
      return null;
    } catch (e) {
      console.error('Error al normalizar URL:', url, e);
      return null;
    }
  }

  /**
   * Función principal: hace scroll, extrae URLs y envía el resultado al background.
   */
  async function main() {
    console.log('Iniciando extracción de suscripciones...');

    // Notificar que se inició el proceso de scroll
    chrome.runtime.sendMessage({
      action: 'extractionProgress',
      status: 'Cargando todos los canales (haciendo scroll)...'
    });

    // Hacer auto-scroll para cargar todos los canales
    await autoScrollToBottom();

    // Pequeña pausa para asegurar que el DOM se actualice
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extraer las URLs
    const channelUrls = extractChannelUrls();

    console.log(`Extracción completada. ${channelUrls.length} canales encontrados.`);

    // Enviar resultado al background script
    chrome.runtime.sendMessage({
      action: 'extractionComplete',
      urls: channelUrls,
      count: channelUrls.length
    });
  }

  // Ejecutar la función principal
  main();
})();
