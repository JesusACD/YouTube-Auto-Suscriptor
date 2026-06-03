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

// Variable para rastrear la pestaña de extracción
let extractionTabId = null;

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

    case 'stopSubscriptions':
      console.log('Proceso de suscripción detenido por el usuario.');
      subscriptionQueue = [];
      if (activeTabsCount === 0) {
        finishProcess();
      }
      sendResponse({ success: true });
      break;

    // --- Casos para extracción de suscripciones ---
    case 'extractSubscriptions':
      console.log('Iniciando extracción de suscripciones...');
      startExtractionProcess();
      sendResponse({ success: true });
      break;

    case 'extractionComplete':
      console.log(`Extracción completada: ${message.count} canales encontrados.`);
      // Cerrar la pestaña de extracción
      if (extractionTabId) {
        chrome.tabs.remove(extractionTabId, () => {
          if (chrome.runtime.lastError) {
            console.warn('No se pudo cerrar la pestaña de extracción:', chrome.runtime.lastError.message);
          }
        });
        extractionTabId = null;
      }
      // Reenviar las URLs al popup/index
      chrome.runtime.sendMessage({
        action: 'extractionResults',
        urls: message.urls,
        count: message.count
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Popup/Index no disponible para recibir resultados:', chrome.runtime.lastError.message);
        }
      });
      sendResponse({ success: true });
      break;

    case 'extractionProgress':
      // Reenviar el progreso al popup/index
      chrome.runtime.sendMessage({
        action: 'extractionStatus',
        status: message.status
      }, () => {
        if (chrome.runtime.lastError) { /* ignorar */ }
      });
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

// Función para iniciar el proceso de extracción de suscripciones
function startExtractionProcess() {
  const SUBSCRIPTIONS_URL = 'https://www.youtube.com/feed/channels';

  // Abrir pestaña con la página de suscripciones
  chrome.tabs.create({ url: SUBSCRIPTIONS_URL, active: false }, function(tab) {
    extractionTabId = tab.id;
    console.log('Pestaña de extracción creada:', tab.id);

    // Esperar a que la pestaña cargue completamente
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log('Página de suscripciones cargada. Inyectando script de extracción...');

        // Inyectar el content script de extracción
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ['extract_subscriptions.js']
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error('Error al inyectar script de extracción:', chrome.runtime.lastError.message);
              chrome.runtime.sendMessage({
                action: 'extractionResults',
                urls: [],
                count: 0,
                error: 'Error al inyectar el script de extracción.'
              }, () => {
                if (chrome.runtime.lastError) { /* ignorar */ }
              });

              // Cerrar la pestaña fallida
              if (extractionTabId) {
                chrome.tabs.remove(extractionTabId, () => {
                  if (chrome.runtime.lastError) { /* ignorar */ }
                });
                extractionTabId = null;
              }
            } else {
              console.log('Script de extracción inyectado exitosamente.');
            }
          }
        );
      }
    });
  });
}
