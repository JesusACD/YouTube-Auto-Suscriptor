let retryCount = 0;
const maxRetries = 3;

// Escuchar mensajes del background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkAndSubscribe') {
    console.log('Recibido mensaje para suscribirse a:', window.location.href);
    waitForSubscribeButtonAndAction();
    return true;
  }
});

function waitForSubscribeButtonAndAction() {
  let initialObserver = null;
  let initialTimeoutId = null;
  const INITIAL_TIMEOUT_MS = 8000; // Reducido de 15s a 8s

  const cleanupInitialObserver = () => {
    if (initialObserver) initialObserver.disconnect();
    if (initialTimeoutId) clearTimeout(initialTimeoutId);
  };

  const attemptSubscription = () => {
    cleanupInitialObserver();
    findAndClickSubscribeButton(true);
  };

  const handleInitialTimeout = () => {
    cleanupInitialObserver();
    console.warn('Timeout esperando que aparezca el botón de suscripción. Intentando de todas formas...');
    findAndClickSubscribeButton(true);
  };

  initialTimeoutId = setTimeout(handleInitialTimeout, INITIAL_TIMEOUT_MS);

  // Verificación inmediata primero
  if (checkIfSubscribed()) {
    console.log('Ya estás suscrito a este canal (detectado en carga inicial).');
    cleanupInitialObserver();
    chrome.runtime.sendMessage({
      action: 'subscriptionComplete',
      url: window.location.href,
      alreadySubscribed: true
    });
    return;
  }

  const initialButton = findSubscribeButtonOnPage();
  if (initialButton) {
    console.log('Botón de suscripción encontrado inmediatamente.');
    attemptSubscription();
    return;
  }

  // Optimizar MutationObserver - observar solo el área del botón
  const targetElement = document.querySelector('#owner') || 
                        document.querySelector('#channel-header') || 
                        document.body;

  initialObserver = new MutationObserver((mutationsList, obs) => {
    if (checkIfSubscribed()) {
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

  initialObserver.observe(targetElement, { childList: true, subtree: true });
  console.log('MutationObserver configurado en:', targetElement.id || targetElement.tagName);
}

// Función auxiliar para buscar el botón de suscripción sin hacer clic
function findSubscribeButtonOnPage() {
  // Selectores ordenados por probabilidad de éxito
  const possibleSelectors = [
    'ytd-subscribe-button-renderer button[aria-label*="Suscribirse"]',
    'ytd-subscribe-button-renderer button[aria-label*="Subscribe"]',
    '#subscribe-button ytd-button-renderer button:not([aria-label*="Suscrito"]):not([aria-label*="Subscribed"])',
    'button.yt-spec-button-shape-next--filled:not([aria-label*="Suscrito"]):not([aria-label*="Subscribed"])',
    'ytd-subscribe-button-renderer paper-button:not([subscribed])'
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
  if (checkIfSubscribed()) {
    console.log('Ya estás suscrito a este canal (verificación en findAndClick).');
    chrome.runtime.sendMessage({
      action: 'subscriptionComplete',
      url: window.location.href,
      alreadySubscribed: true
    });
    return;
  }

  const subscribeButton = findSubscribeButtonOnPage();
  console.log(`Intento de suscripción #${retryCount + 1}`);

  if (subscribeButton) {
    console.log('Botón de suscripción encontrado, haciendo clic...');
    subscribeButton.click();

    // MutationObserver de confirmación optimizado
    let observer = null;
    let observationTimeoutId = null;
    const TIMEOUT_MS = 3000; // Reducido de 7s a 3s

    const confirmSubscriptionAndCleanup = (reason) => {
      console.log(`Suscripción confirmada (${reason}).`);
      if (observer) observer.disconnect();
      if (observationTimeoutId) clearTimeout(observationTimeoutId);
      chrome.runtime.sendMessage({
        action: 'subscriptionComplete',
        url: window.location.href
      });
    };

    const handleObservationTimeout = () => {
      if (observer) observer.disconnect();
      console.warn('Timeout esperando cambio a "Suscrito". Verificando una última vez.');
      if (checkIfSubscribed()) {
        confirmSubscriptionAndCleanup("verificación final en timeout");
      } else {
        console.warn('No se pudo confirmar la suscripción después del clic y timeout del observador.');
        handleSubscriptionFailure();
      }
    };

    observationTimeoutId = setTimeout(handleObservationTimeout, TIMEOUT_MS);

    observer = new MutationObserver((mutationsList, obs) => {
      const buttonText = (subscribeButton.textContent || "").trim().toLowerCase();
      const ariaLabel = (subscribeButton.getAttribute('aria-label') || "").toLowerCase();
      const renderer = subscribeButton.closest('ytd-subscribe-button-renderer');
      const hasSubscribedAttribute = renderer && renderer.hasAttribute('subscribed');

      if (buttonText === 'suscrito' || buttonText === 'subscribed' ||
          ariaLabel.includes('cancelar la suscripción') || 
          ariaLabel.includes('unsubscribe from') || 
          hasSubscribedAttribute) {
        confirmSubscriptionAndCleanup("MutationObserver de confirmación");
      }
    });

    const rendererElement = subscribeButton.closest('ytd-subscribe-button-renderer');
    const elementToObserve = rendererElement || subscribeButton;
    observer.observe(elementToObserve, { attributes: true, childList: true, subtree: true });

  } else {
    console.warn('Botón de suscripción NO encontrado.');
    handleSubscriptionFailure();
  }
}

function handleSubscriptionFailure() {
  retryCount++;
  if (retryCount < maxRetries) {
    console.log(`Reintentando en 2 segundos... (Intento ${retryCount})`);
    setTimeout(() => findAndClickSubscribeButton(false), 2000); // Reducido de 5s a 2s
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
  // Verificación rápida primero - el selector más fiable
  if (document.querySelector('ytd-subscribe-button-renderer[subscribed]')) {
    console.log('Detectado suscrito por atributo subscribed');
    return true;
  }

  const subscribedIndicators = [
    'paper-button[subscribed]',
    'button[aria-label*="Cancelar la suscripción"]',
    'button[aria-label*="Unsubscribe"]'
  ];

  for (const selector of subscribedIndicators) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (isElementVisible(element)) {
        console.log('Suscripción confirmada con selector:', selector);
        return true;
      }
    }
  }

  // Verificar texto del botón como último recurso
  const buttons = document.querySelectorAll('ytd-subscribe-button-renderer button');
  for (const button of buttons) {
    const buttonText = (button.textContent || '').trim().toLowerCase();
    if (isElementVisible(button) && (buttonText === 'suscrito' || buttonText === 'subscribed')) {
      console.log('Detectado suscrito por texto de botón');
      return true;
    }
  }

  return false;
}

// Función para reportar errores
function reportError(errorMessage) {
  const errorDetails = `Error en la URL: ${window.location.href} - Mensaje: ${errorMessage}`;
  console.error(errorDetails);
  chrome.runtime.sendMessage({
    action: 'subscriptionError',
    error: errorDetails,
    url: window.location.href
  });
}
