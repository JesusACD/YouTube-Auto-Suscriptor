// Variables para controlar el proceso de suscripción
let subscriptionQueue = [];
let successfulSubscriptions = [];
let failedSubscriptions = [];
let isProcessing = false;
let currentIndex = 0;
let totalUrls = 0;

// Escuchar comandos de teclado
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_full_page') {
    chrome.tabs.create({ url: 'index.html' });
  }
});

// Escuchar mensajes del popup y content scripts
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.action) {
    case 'startSubscriptions':
      console.log('Iniciando proceso de suscripción...');
      subscriptionQueue = message.urls;
      totalUrls = subscriptionQueue.length;
      currentIndex = 0;
      successfulSubscriptions = [];
      failedSubscriptions = [];
      
      if (!isProcessing) {
        isProcessing = true;
        processNextSubscription();
      }
      sendResponse({ success: true });
      break;

    case 'subscriptionComplete':
      console.log(`Suscripción completada para: ${message.url}`);
      const isNewSubscription = !(message.alreadySubscribed || false);
      successfulSubscriptions.push({
        url: message.url,
        alreadySubscribed: message.alreadySubscribed || false
      });
      
      // Informar al popup para que se cierre si es una NUEVA suscripción exitosa
      if (isNewSubscription) {
        chrome.runtime.sendMessage({ action: 'requestPopupClose' }, (response) => {
          if (chrome.runtime.lastError) {
            // Es normal si el popup no está abierto o ya se cerró
            console.log("Popup no disponible para cerrar: " + chrome.runtime.lastError.message);
          } else {
            console.log("Solicitud de cierre de popup enviada tras nueva suscripción.");
          }
        });
      }

      closeTabAndContinue(sender.tab.id);
      sendResponse({ success: true });
      break;

    case 'subscriptionError':
      console.error(`Error en la suscripción para: ${message.url}. Razón: ${message.error}`);
      failedSubscriptions.push({
        url: message.url,
        error: message.error
      });
      closeTabAndContinue(sender.tab.id);
      sendResponse({ success: true });
      break;
  }
  return true; // Indica que la respuesta puede ser asíncrona
});

function closeTabAndContinue(tabId) {
  // Esperar un poco antes de cerrar la pestaña
  setTimeout(() => {
    chrome.tabs.remove(tabId, () => {
      // Continuar con la siguiente URL después de cerrar la pestaña
      setTimeout(processNextSubscription, 1000);
    });
  }, 1500);
}

// Función para procesar la siguiente URL en la cola
function processNextSubscription() {
  if (currentIndex < subscriptionQueue.length) {
    const url = subscriptionQueue[currentIndex];
    currentIndex++;
    
    console.log(`Procesando URL ${currentIndex}/${totalUrls}: ${url}`);
    
    // Actualizar el progreso en el popup
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      current: currentIndex,
      total: totalUrls,
      url: url
    });
    
    // Abrir una nueva pestaña con la URL del canal
    chrome.tabs.create({ url, active: false }, function(tab) {
      // Usar un listener para cuando la pestaña esté completamente cargada
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          // Remover el listener para no ejecutarlo múltiples veces
          chrome.tabs.onUpdated.removeListener(listener);

          console.log(`Pestaña cargada para ${url}. Inyectando script...`);
          // Inyectar el content script en la pestaña
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              files: ['content.js']
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error('Error al inyectar script:', chrome.runtime.lastError.message);
                failedSubscriptions.push({ url: url, error: 'Error al inyectar content script.' });
                closeTabAndContinue(tab.id);
                return;
              }
              // Una vez inyectado el script, enviar el mensaje para activar la suscripción
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { action: 'checkAndSubscribe' }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error('Error al enviar mensaje a content script:', chrome.runtime.lastError.message);
                  } else {
                    console.log('Mensaje enviado al content script para:', url);
                  }
                });
              }, 2000); // Dar un poco de tiempo extra después de la inyección
            }
          );
        }
      });
    });
  } else {
    // Proceso completado
    console.log('Proceso de suscripción finalizado.');
    isProcessing = false;
    
    // Enviar los resultados finales al popup
    chrome.runtime.sendMessage({
      action: 'processComplete',
      successful: successfulSubscriptions,
      failed: failedSubscriptions
    });
    
    subscriptionQueue = [];
  }
}
