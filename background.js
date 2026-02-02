// Variables para controlar el proceso de suscripción
let subscriptionQueue = [];
let successfulSubscriptions = [];
let failedSubscriptions = [];
let isProcessing = false;
let currentIndex = 0;
let totalUrls = 0;

// Configuración de concurrencia - máximo 3 pestañas simultáneas
const MAX_CONCURRENT_TABS = 3;
let activeTabsCount = 0;
let processingTabs = new Map(); // Map<tabId, url>

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
      subscriptionQueue = [...message.urls];
      totalUrls = subscriptionQueue.length;
      currentIndex = 0;
      successfulSubscriptions = [];
      failedSubscriptions = [];
      activeTabsCount = 0;
      processingTabs.clear();
      
      if (!isProcessing) {
        isProcessing = true;
        // Iniciar múltiples workers en paralelo
        startParallelProcessing();
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
            console.log("Popup no disponible para cerrar: " + chrome.runtime.lastError.message);
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
  return true;
});

// Iniciar procesamiento paralelo
function startParallelProcessing() {
  // Lanzar workers hasta el límite de concurrencia
  while (activeTabsCount < MAX_CONCURRENT_TABS && currentIndex < subscriptionQueue.length) {
    processNextSubscription();
  }
}

function closeTabAndContinue(tabId) {
  // Reducir tiempos de espera significativamente
  setTimeout(() => {
    // Limpiar el tracking de esta pestaña
    processingTabs.delete(tabId);
    activeTabsCount = Math.max(0, activeTabsCount - 1);
    
    chrome.tabs.remove(tabId, () => {
      // Continuar inmediatamente con la siguiente URL
      setTimeout(() => {
        if (currentIndex < subscriptionQueue.length) {
          processNextSubscription();
        } else if (activeTabsCount === 0) {
          // Solo finalizar cuando todas las pestañas han terminado
          finishProcess();
        }
      }, 300); // Reducido de 1000ms a 300ms
    });
  }, 500); // Reducido de 1500ms a 500ms
}

// Función para procesar la siguiente URL en la cola
function processNextSubscription() {
  if (currentIndex >= subscriptionQueue.length) {
    // No hay más URLs para procesar
    if (activeTabsCount === 0) {
      finishProcess();
    }
    return;
  }

  const url = subscriptionQueue[currentIndex];
  currentIndex++;
  activeTabsCount++;
  
  console.log(`Procesando URL ${currentIndex}/${totalUrls}: ${url} (${activeTabsCount} pestañas activas)`);
  
  // Actualizar el progreso en el popup
  chrome.runtime.sendMessage({
    action: 'updateProgress',
    current: currentIndex,
    total: totalUrls,
    url: url
  });
  
  // Abrir una nueva pestaña con la URL del canal
  chrome.tabs.create({ url, active: false }, function(tab) {
    processingTabs.set(tab.id, url);
    
    // Usar un listener para cuando la pestaña esté completamente cargada
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        console.log(`Pestaña cargada para ${url}. Inyectando script...`);
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
            // Reducido de 2000ms a 500ms - el script ya está listo
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: 'checkAndSubscribe' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Error al enviar mensaje a content script:', chrome.runtime.lastError.message);
                }
              });
            }, 500);
          }
        );
      }
    });
  });
}

// Función para finalizar el proceso
function finishProcess() {
  console.log('Proceso de suscripción finalizado.');
  isProcessing = false;
  
  chrome.runtime.sendMessage({
    action: 'processComplete',
    successful: successfulSubscriptions,
    failed: failedSubscriptions
  });
  
  subscriptionQueue = [];
  processingTabs.clear();
}
