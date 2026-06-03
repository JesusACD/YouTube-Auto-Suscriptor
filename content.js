let retryCount = 0;
const maxRetries = 5;

// Escuchar mensajes del background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkAndSubscribe') {
    console.log('Recibido mensaje para suscribirse a:', window.location.href);
    retryCount = 0; // Reiniciar contador de reintentos para cada canal
    waitForSubscribeButtonAndAction();
    sendResponse({ success: true });
    return true;
  }
});

function waitForSubscribeButtonAndAction() {
  let initialObserver = null;
  let initialTimeoutId = null;
  const INITIAL_TIMEOUT_MS = 10000; // 10 segundos para esperar que cargue la página

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

  // Observar el área del canal para detectar cuando aparezca el botón
  const targetElement = document.querySelector('#owner') || 
                        document.querySelector('#channel-header') || 
                        document.querySelector('#page-header') ||
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

// Función para buscar el botón de suscripción en la página
// Soporta tanto la nueva UI (yt-subscribe-button-view-model) como la antigua (ytd-subscribe-button-renderer)
function findSubscribeButtonOnPage() {
  let button = null;

  // === NUEVA UI DE YOUTUBE (2024+): yt-subscribe-button-view-model ===
  // Estructura: yt-subscribe-button-view-model > yt-animated-action > div > div > button
  const viewModel = document.querySelector('yt-subscribe-button-view-model');
  if (viewModel) {
    // Verificar si ya suscrito por clase del view-model
    if (viewModel.classList.contains('subscribed')) {
      console.log('yt-subscribe-button-view-model tiene clase subscribed');
      return null;
    }

    button = viewModel.querySelector('button');
    if (button && isElementVisible(button) && isButtonSubscribe(button)) {
      console.log('Botón encontrado en yt-subscribe-button-view-model');
      return button;
    }
  }

  // === UI ANTIGUA: ytd-subscribe-button-renderer ===
  const renderer = document.querySelector('ytd-subscribe-button-renderer');
  if (renderer) {
    // Verificar si ya suscrito por atributo
    if (renderer.hasAttribute('subscribed')) {
      console.log('ytd-subscribe-button-renderer tiene atributo subscribed');
      return null;
    }

    // Intentar acceder al Shadow DOM de yt-button-shape si existe
    const buttonShape = renderer.querySelector('yt-button-shape');
    if (buttonShape && buttonShape.shadowRoot) {
      button = buttonShape.shadowRoot.querySelector('button');
      if (button && isElementVisible(button) && isButtonSubscribe(button)) {
        console.log('Botón encontrado via Shadow DOM de yt-button-shape');
        return button;
      }
    }

    // Buscar botón directamente en el renderer
    button = renderer.querySelector('button');
    if (button && isElementVisible(button) && isButtonSubscribe(button)) {
      console.log('Botón encontrado directamente en ytd-subscribe-button-renderer');
      return button;
    }

    // Fallback: paper-button (versiones muy antiguas)
    const paperButton = renderer.querySelector('paper-button:not([subscribed])');
    if (paperButton && isElementVisible(paperButton)) {
      console.log('Botón encontrado como paper-button');
      return paperButton;
    }
  }

  // === FALLBACK GENÉRICO: buscar por selectores amplios ===
  const fallbackSelectors = [
    '#subscribe-button button',
    '#subscribe-button-shape button',
    '#owner button[aria-label*="uscrib"]' // Cubre "Suscribirse", "Subscribe", etc.
  ];

  for (const selector of fallbackSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const btn of buttons) {
      if (isElementVisible(btn) && isButtonSubscribe(btn)) {
        console.log('Botón encontrado con fallback:', selector);
        return btn;
      }
    }
  }

  console.log('No se pudo encontrar el botón de suscripción');
  return null;
}

// Verificar si un botón es el de "Suscribirse" y no el de "Suscrito"
function isButtonSubscribe(button) {
  if (!button) return false;

  const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
  const text = (button.textContent || '').toLowerCase().trim();

  // Si está vacío, no es un botón válido
  if (!ariaLabel && !text) return false;

  // Verificar que NO sea un botón de "ya suscrito" o "cancelar"
  const negativePatterns = ['cancelar', 'unsubscribe', 'anular', 'suscrito', 'subscribed', 'notificaciones', 'notification'];
  for (const pattern of negativePatterns) {
    if (ariaLabel.includes(pattern) || text.includes(pattern)) {
      return false;
    }
  }

  // Verificar que SÍ sea un botón de suscripción (con patrones más amplios)
  const positivePatterns = ['suscrib', 'subscribe']; // Cubre "suscribirse", "suscribirme", "subscribe"
  for (const pattern of positivePatterns) {
    if (ariaLabel.includes(pattern) || text.includes(pattern)) {
      return true;
    }
  }

  return false;
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
    console.log('  - aria-label:', subscribeButton.getAttribute('aria-label'));
    console.log('  - texto:', subscribeButton.textContent.trim());
    
    // Asegurar que el botón esté en la vista antes de hacer clic
    subscribeButton.scrollIntoView({ behavior: 'instant', block: 'center' });
    
    // Pequeño retraso para permitir que la vista se actualice
    setTimeout(() => {
      // Despachar eventos completos de mouse para simular interacción real
      const rect = subscribeButton.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const mouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY
      };

      subscribeButton.dispatchEvent(new MouseEvent('mouseover', mouseEventInit));
      subscribeButton.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
      subscribeButton.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
      subscribeButton.dispatchEvent(new MouseEvent('click', mouseEventInit));

      console.log('Clic despachado. Esperando confirmación de suscripción...');

      // Observar cambios para confirmar la suscripción
      let observer = null;
      let observationTimeoutId = null;
      const TIMEOUT_MS = 6000;

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

      // Buscar el mejor elemento para observar cambios
      const observeTarget = document.querySelector('yt-subscribe-button-view-model') ||
                            document.querySelector('ytd-subscribe-button-renderer') ||
                            subscribeButton.parentElement;

      if (observeTarget) {
        observer = new MutationObserver((mutationsList, obs) => {
          if (checkIfSubscribed()) {
            confirmSubscriptionAndCleanup("MutationObserver detectó suscripción");
          }
        });
        observer.observe(observeTarget, { attributes: true, childList: true, subtree: true, characterData: true });
      }
    }, 500); // Retraso después del scroll

  } else {
    console.warn('Botón de suscripción NO encontrado.');
    handleSubscriptionFailure();
  }
}

function handleSubscriptionFailure() {
  retryCount++;
  if (retryCount < maxRetries) {
    console.log(`Reintentando en 3 segundos... (Intento ${retryCount}/${maxRetries})`);
    setTimeout(() => findAndClickSubscribeButton(false), 3000);
  } else {
    reportError('No se pudo confirmar la suscripción después de varios reintentos.');
  }
}

// Función para verificar si un elemento es visible
function isElementVisible(element) {
  if (!element) return false;
  if (element.offsetWidth === 0 && element.offsetHeight === 0) return false;
  
  try {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  } catch (e) {
    return element.offsetWidth > 0 && element.offsetHeight > 0;
  }
}

// Función mejorada para verificar si ya estamos suscritos
function checkIfSubscribed() {
  // === NUEVA UI: yt-subscribe-button-view-model ===
  const viewModel = document.querySelector('yt-subscribe-button-view-model');
  if (viewModel) {
    // Verificar por clase CSS
    if (viewModel.classList.contains('subscribed')) {
      console.log('Detectado suscrito por clase en yt-subscribe-button-view-model');
      return true;
    }
    
    // Verificar el botón dentro del view-model
    const button = viewModel.querySelector('button');
    if (button) {
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const text = (button.textContent || '').toLowerCase().trim();
      
      if (text.includes('suscrito') || text.includes('subscribed') ||
          ariaLabel.includes('cancelar') || ariaLabel.includes('unsubscribe') ||
          ariaLabel.includes('anular')) {
        console.log('Detectado suscrito via yt-subscribe-button-view-model - texto:', text);
        return true;
      }
    }
  }

  // === UI ANTIGUA: ytd-subscribe-button-renderer ===
  const renderer = document.querySelector('ytd-subscribe-button-renderer');
  if (renderer) {
    if (renderer.hasAttribute('subscribed')) {
      console.log('Detectado suscrito por atributo subscribed en renderer');
      return true;
    }

    // Verificar Shadow DOM de yt-button-shape
    const buttonShape = renderer.querySelector('yt-button-shape');
    if (buttonShape && buttonShape.shadowRoot) {
      const button = buttonShape.shadowRoot.querySelector('button');
      if (button) {
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        const text = (button.textContent || '').toLowerCase().trim();
        if (text.includes('suscrito') || text.includes('subscribed') ||
            ariaLabel.includes('cancelar') || ariaLabel.includes('unsubscribe')) {
          console.log('Detectado suscrito via Shadow DOM');
          return true;
        }
      }
    }

    // Verificar botón directo
    const directButton = renderer.querySelector('button');
    if (directButton) {
      const text = (directButton.textContent || '').toLowerCase().trim();
      if (text.includes('suscrito') || text.includes('subscribed')) {
        console.log('Detectado suscrito por texto directo del botón');
        return true;
      }
    }
  }

  // Verificar paper-button con atributo subscribed (versiones muy antiguas)
  if (document.querySelector('paper-button[subscribed]')) {
    console.log('Detectado suscrito por paper-button[subscribed]');
    return true;
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
