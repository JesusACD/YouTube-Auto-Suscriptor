let retryCount = 0;
const maxRetries = 3;

// Escuchar mensajes del background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkAndSubscribe') {
    console.log('Recibido mensaje para suscribirse a:', window.location.href);
    waitForSubscribeButtonAndAction();
    return true; // Indica que la respuesta puede ser asíncrona
  }
});

function waitForSubscribeButtonAndAction() {
  let initialObserver = null;
  let initialTimeoutId = null;
  const INITIAL_TIMEOUT_MS = 15000; // 15 segundos para que aparezca el botón

  const cleanupInitialObserver = () => {
    if (initialObserver) initialObserver.disconnect();
    if (initialTimeoutId) clearTimeout(initialTimeoutId);
  };

  const attemptSubscription = () => {
    cleanupInitialObserver();
    findAndClickSubscribeButton(true); // Proceder con el intento de suscripción
  };

  const handleInitialTimeout = () => {
    cleanupInitialObserver();
    console.warn('Timeout esperando que aparezca el botón de suscripción. Intentando de todas formas...');
    // Como fallback, intentar buscar el botón una vez más directamente
    findAndClickSubscribeButton(true);
  };

  initialTimeoutId = setTimeout(handleInitialTimeout, INITIAL_TIMEOUT_MS);

  initialObserver = new MutationObserver((mutationsList, obs) => {
    // Reutilizar la lógica de búsqueda de findAndClickSubscribeButton, pero sin hacer clic aún
    if (checkIfSubscribed()) { // Si ya está suscrito, no necesitamos el botón de "suscribirse"
        console.log('Ya estás suscrito a este canal (detectado por observador inicial).');
        cleanupInitialObserver();
        chrome.runtime.sendMessage({
            action: 'subscriptionComplete',
            url: window.location.href,
            alreadySubscribed: true
        });
        return;
    }

    const button = findSubscribeButtonOnPage();
    if (button) {
      console.log('Botón de suscripción detectado por MutationObserver inicial.');
      attemptSubscription();
    }
  });

  // Observar todo el body por si el botón se añade dinámicamente
  initialObserver.observe(document.body, { childList: true, subtree: true });
  console.log('MutationObserver inicial configurado para detectar el botón de suscripción.');

  // Intento inmediato en caso de que el botón ya esté presente
  const initialButton = findSubscribeButtonOnPage();
  if (initialButton) {
     console.log('Botón de suscripción encontrado inmediatamente.');
     attemptSubscription();
  } else if (checkIfSubscribed()) {
     console.log('Ya estás suscrito a este canal (detectado en carga inicial).');
     cleanupInitialObserver();
     chrome.runtime.sendMessage({
        action: 'subscriptionComplete',
        url: window.location.href,
        alreadySubscribed: true
     });
  }
}

// Función auxiliar para buscar el botón de suscripción sin hacer clic
function findSubscribeButtonOnPage() {
  const possibleSelectors = [
    'ytd-subscribe-button-renderer button[aria-label*="Suscribirse"]',
    'ytd-subscribe-button-renderer button[aria-label*="Subscribe"]',
    'ytd-subscribe-button-renderer paper-button:not([subscribed])',
    '#subscribe-button ytd-button-renderer button:not([aria-label*="Suscrito"]):not([aria-label*="Subscribed"])',
    'button.yt-spec-button-shape-next--filled:not([aria-label*="Suscrito"]):not([aria-label*="Subscribed"])'
  ];
  for (const selector of possibleSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      if (isElementVisible(button)) {
        return button;
      }
    }
  }
  return null;
}

// Función para encontrar y hacer clic en el botón de suscripción
function findAndClickSubscribeButton(isFirstAttempt) {
  const subscribeButton = findSubscribeButtonOnPage();

  if (checkIfSubscribed()) {
    console.log('Ya estás suscrito a este canal (verificación en findAndClick).');
    chrome.runtime.sendMessage({
      action: 'subscriptionComplete',
      url: window.location.href,
      alreadySubscribed: true
    });
    return;
  }

  console.log(`Intento de suscripción #${retryCount + 1}`);

  if (subscribeButton) {
    console.log('Botón de suscripción encontrado (en findAndClick), haciendo clic...');
    subscribeButton.click();

    // --- Inicio de la lógica del MutationObserver de CONFIRMACIÓN ---
    let observer = null;
    let observationTimeoutId = null;
    const TIMEOUT_MS = 7000; // 7 segundos para que el botón cambie

    const confirmSubscriptionAndCleanup = (reason) => {
      console.log(`Suscripción confirmada (${reason}).`);
      if (observer) observer.disconnect();
      if (observationTimeoutId) clearTimeout(observationTimeoutId);
      chrome.runtime.sendMessage({
        action: 'subscriptionComplete',
        url: window.location.href
        // 'alreadySubscribed' se maneja mediante las verificaciones iniciales de checkIfSubscribed
      });
    };

    const handleObservationTimeout = () => {
      if (observer) observer.disconnect();
      console.warn('Timeout esperando cambio a "Suscrito". Verificando una última vez.');
      if (checkIfSubscribed()) { // Fallback a la verificación general
        confirmSubscriptionAndCleanup("verificación final en timeout");
      } else {
        console.warn('No se pudo confirmar la suscripción después del clic y timeout del observador.');
        handleSubscriptionFailure();
      }
    };

    observationTimeoutId = setTimeout(handleObservationTimeout, TIMEOUT_MS);

    observer = new MutationObserver((mutationsList, obs) => {
      // Verificar el estado del botón original que se clickeó
      const buttonText = (subscribeButton.textContent || "").trim().toLowerCase();
      const ariaLabel = (subscribeButton.getAttribute('aria-label') || "").toLowerCase();
      const renderer = subscribeButton.closest('ytd-subscribe-button-renderer');
      const hasSubscribedAttributeOnRenderer = renderer && renderer.hasAttribute('subscribed');

      if (buttonText === 'suscrito' || buttonText === 'subscribed' ||
          ariaLabel.includes('cancelar la suscripción') || 
          ariaLabel.includes('unsubscribe from') || 
          hasSubscribedAttributeOnRenderer) {
        confirmSubscriptionAndCleanup("MutationObserver de confirmación");
      }
    });

    const rendererElement = subscribeButton.closest('ytd-subscribe-button-renderer');
    const elementToObserve = rendererElement || subscribeButton;
    observer.observe(elementToObserve, { attributes: true, childList: true, subtree: true });
    console.log('MutationObserver de confirmación configurado para el botón de suscripción.');
    // --- Fin de la lógica del MutationObserver de CONFIRMACIÓN ---

  } else {
    // Botón no encontrado por findSubscribeButtonOnPage()
    console.warn('Botón de suscripción NO encontrado en findAndClickSubscribeButton.');
    // handleSubscriptionFailure gestionará los reintentos o el error final.
    handleSubscriptionFailure();
  }
}

function handleSubscriptionFailure() {
  retryCount++;
  if (retryCount < maxRetries) {
    console.log(`Reintentando en 5 segundos... (Intento ${retryCount})`);
    setTimeout(() => findAndClickSubscribeButton(false), 5000);
  } else {
    reportError('No se pudo confirmar la suscripción después de varios reintentos.');
  }
}

// Función para verificar si un elemento es visible
function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// Función mejorada para verificar si ya estamos suscritos
function checkIfSubscribed() {
  console.log('Verificando estado de suscripción...');
  const subscribedIndicators = [
    'ytd-subscribe-button-renderer[subscribed]', // El más fiable
    'paper-button[subscribed]',
    'button[aria-label*="Cancelar la suscripción"]',
    'button[aria-label*="Unsubscribe"]',
    // Verificar el texto del botón de forma más precisa
    () => {
        const buttons = document.querySelectorAll('ytd-subscribe-button-renderer button');
        for(const button of buttons) {
            const buttonText = button.textContent || '';
            if(isElementVisible(button) && (buttonText.trim().toLowerCase() === 'suscrito' || buttonText.trim().toLowerCase() === 'subscribed')) {
                console.log('Detectado por texto de botón: Suscrito');
                return true;
            }
        }
        return false;
    }
  ];

  for (const indicator of subscribedIndicators) {
    if (typeof indicator === 'string') {
      const elements = document.querySelectorAll(indicator);
      for (const element of elements) {
        if (isElementVisible(element)) {
          console.log('Suscripción confirmada con el selector:', indicator);
          return true;
        }
      }
    } else if (typeof indicator === 'function') {
        if(indicator()) return true;
    }
  }

  console.log('No se encontraron indicadores de suscripción.');
  return false;
}

// Función para reportar errores con más detalles
function reportError(errorMessage) {
  const errorDetails = `Error en la URL: ${window.location.href} - Mensaje: ${errorMessage}`;
  console.error(errorDetails);
  chrome.runtime.sendMessage({
    action: 'subscriptionError',
    error: errorDetails,
    url: window.location.href
  });
}
