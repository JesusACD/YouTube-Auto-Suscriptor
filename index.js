document.addEventListener('DOMContentLoaded', function() {
  const subscribeButton = document.getElementById('subscribe-button');
  const channelUrlsTextarea = document.getElementById('channel-urls');
  const statusDiv = document.getElementById('status');
  const progressDiv = document.querySelector('.progress');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.querySelector('.progress-fill');

  // Elementos de extracción
  const extractButton = document.getElementById('extract-button');
  const copyButton = document.getElementById('copy-button');
  const extractionStatusDiv = document.getElementById('extraction-status');
  
  // Cargar URLs guardadas previamente
  chrome.storage.local.get(['channelUrls'], function(result) {
    if (result.channelUrls) {
      channelUrlsTextarea.value = result.channelUrls;
    }
  });
  
  // --- Evento: Suscribirse a canales ---
  subscribeButton.addEventListener('click', async function() {
    const urls = channelUrlsTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
    
    if (urls.length === 0) {
      statusDiv.textContent = 'Por favor, ingresa al menos una URL de canal.';
      return;
    }
    
    // Guardar las URLs para uso futuro
    chrome.storage.local.set({ channelUrls: channelUrlsTextarea.value });
    
    // Validar URLs
    const validUrls = urls.filter(url => {
      return url.match(/^https:\/\/www\.youtube\.com\/@[\w-]+/i) || 
             url.match(/^https:\/\/www\.youtube\.com\/channel\/[\w-]+/i) ||
             url.match(/^https:\/\/www\.youtube\.com\/c\/[\w-]+/i);
    });
    
    if (validUrls.length !== urls.length) {
      statusDiv.textContent = 'Algunas URLs no son válidas. Por favor, verifica el formato.';
      return;
    }
    
    // Configurar la barra de progreso
    progressDiv.style.display = 'block';
    progressText.textContent = `0/${validUrls.length}`;
    progressFill.style.width = '0%';
    
    statusDiv.textContent = 'Iniciando proceso de suscripción...';
    
    // Enviar mensaje al background script para iniciar el proceso
    chrome.runtime.sendMessage({
      action: 'startSubscriptions',
      urls: validUrls
    }, function(response) {
      if (response && response.success) {
        statusDiv.textContent = 'Proceso iniciado. Las pestañas se abrirán secuencialmente.';
      } else {
        statusDiv.textContent = 'Error al iniciar el proceso.';
        progressDiv.style.display = 'none';
      }
    });
  });

  // --- Evento: Extraer suscripciones ---
  extractButton.addEventListener('click', function() {
    extractButton.disabled = true;
    extractionStatusDiv.textContent = 'Iniciando extracción... Se abrirá una pestaña temporal.';
    copyButton.style.display = 'none';

    chrome.runtime.sendMessage({ action: 'extractSubscriptions' }, function(response) {
      if (chrome.runtime.lastError) {
        extractionStatusDiv.textContent = 'Error al iniciar la extracción.';
        extractButton.disabled = false;
      } else if (response && response.success) {
        extractionStatusDiv.textContent = 'Extracción en curso... Cargando canales (esto puede tomar unos segundos).';
      }
    });
  });

  // --- Evento: Copiar URLs al portapapeles ---
  copyButton.addEventListener('click', function() {
    const urls = channelUrlsTextarea.value.trim();
    if (urls) {
      navigator.clipboard.writeText(urls).then(() => {
        copyButton.textContent = '✅ ¡URLs Copiadas!';
        setTimeout(() => {
          copyButton.textContent = '📎 Copiar URLs al Portapapeles';
        }, 2000);
      }).catch(err => {
        // Fallback: seleccionar el texto del textarea
        channelUrlsTextarea.select();
        document.execCommand('copy');
        copyButton.textContent = '✅ ¡URLs Copiadas!';
        setTimeout(() => {
          copyButton.textContent = '📎 Copiar URLs al Portapapeles';
        }, 2000);
      });
    }
  });
  
  // Escuchar actualizaciones de progreso y extracción
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    switch (message.action) {
      case 'updateProgress':
        const { current, total } = message;
        progressText.textContent = `${current}/${total}`;
        progressFill.style.width = `${(current / total) * 100}%`;
        
        if (current === total) {
          statusDiv.textContent = '¡Proceso completado! Te has suscrito a todos los canales.';
        }
        break;

      // --- Mensajes de extracción ---
      case 'extractionResults':
        extractButton.disabled = false;
        if (message.error) {
          extractionStatusDiv.textContent = `Error: ${message.error}`;
        } else if (message.urls && message.urls.length > 0) {
          // Colocar las URLs extraídas en el textarea
          channelUrlsTextarea.value = message.urls.join('\n');
          // Guardar las URLs extraídas
          chrome.storage.local.set({ channelUrls: channelUrlsTextarea.value });
          extractionStatusDiv.textContent = `✅ ${message.count} canales encontrados y cargados en el campo de texto.`;
          copyButton.style.display = 'inline-block';
        } else {
          extractionStatusDiv.textContent = 'No se encontraron canales suscritos.';
        }
        break;

      case 'extractionStatus':
        extractionStatusDiv.textContent = message.status;
        break;
    }
  });
});
