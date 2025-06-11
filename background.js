// Variables para controlar el proceso de suscripción
let subscriptionQueue = [];
let isProcessing = false;
let currentIndex = 0;
let totalUrls = 0;

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'startSubscriptions') {
    // Iniciar el proceso de suscripción
    subscriptionQueue = message.urls;
    totalUrls = subscriptionQueue.length;
    currentIndex = 0;
    
    if (!isProcessing) {
      isProcessing = true;
      processNextSubscription();
    }
    
    sendResponse({ success: true });
    return true; // Indica que la respuesta puede ser asíncrona
  }
  
  // Mensaje del content script indicando que se completó una suscripción
  if (message.action === 'subscriptionComplete') {
    // Cerrar la pestaña actual después de un breve retraso
    setTimeout(() => {
      chrome.tabs.remove(sender.tab.id);
      
      // Procesar la siguiente URL después de un breve retraso
      setTimeout(() => {
        processNextSubscription();
      }, 1000);
    }, 2000);
    
    sendResponse({ success: true });
    return true;
  }
  
  // Mensaje del content script indicando que hubo un error
  if (message.action === 'subscriptionError') {
    console.error('Error en la suscripción:', message.error);
    
    // Cerrar la pestaña actual después de un breve retraso
    setTimeout(() => {
      chrome.tabs.remove(sender.tab.id);
      
      // Procesar la siguiente URL después de un breve retraso
      setTimeout(() => {
        processNextSubscription();
      }, 1000);
    }, 2000);
    
    sendResponse({ success: true });
    return true;
  }
});

// Función para procesar la siguiente URL en la cola
function processNextSubscription() {
  if (currentIndex < subscriptionQueue.length) {
    const url = subscriptionQueue[currentIndex];
    currentIndex++;
    
    // Actualizar el progreso
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      current: currentIndex,
      total: totalUrls
    });
    
    // Abrir una nueva pestaña con la URL del canal
    chrome.tabs.create({ url, active: false }, function(tab) {
      // Esperar a que la pestaña se cargue completamente antes de inyectar el script
      setTimeout(() => {
        // Inyectar el content script en la pestaña
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ['content.js']
          },
          () => {
            // Una vez inyectado el script, enviar el mensaje para activar la suscripción
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: 'checkAndSubscribe' }, function(response) {
                console.log('Mensaje enviado al content script');
              });
            }, 1000);
          }
        );
      }, 3000);
    });
  } else {
    // Proceso completado
    isProcessing = false;
    subscriptionQueue = [];
  }
}
