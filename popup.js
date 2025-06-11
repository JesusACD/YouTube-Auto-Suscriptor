document.addEventListener('DOMContentLoaded', function() {
  const subscribeButton = document.getElementById('subscribe-button');
  const channelUrlsTextarea = document.getElementById('channel-urls');
  const statusDiv = document.getElementById('status');
  const progressDiv = document.querySelector('.progress');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.querySelector('.progress-fill');
  
  // Cargar URLs guardadas previamente
  chrome.storage.local.get(['channelUrls'], function(result) {
    if (result.channelUrls) {
      channelUrlsTextarea.value = result.channelUrls;
    }
  });
  
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
  
  // Escuchar actualizaciones de progreso
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'updateProgress') {
      const { current, total } = message;
      progressText.textContent = `${current}/${total}`;
      progressFill.style.width = `${(current / total) * 100}%`;
      
      if (current === total) {
        statusDiv.textContent = '¡Proceso completado! Te has suscrito a todos los canales.';
      }
    }
  });
});
