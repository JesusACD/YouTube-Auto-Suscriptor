// Escuchar mensajes del background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkAndSubscribe') {
    console.log('Recibido mensaje para suscribirse');
    // Dar tiempo para que los elementos de YouTube se carguen completamente
    setTimeout(findAndClickSubscribeButton, 2000);
    return true;
  }
});

// Función para encontrar y hacer clic en el botón de suscripción
function findAndClickSubscribeButton() {
  console.log('Buscando botón de suscripción...');
  
  // Verificar si estamos en una página de canal
  if (!window.location.href.includes('youtube.com/@') && 
      !window.location.href.includes('youtube.com/channel/') &&
      !window.location.href.includes('youtube.com/c/')) {
    reportError('No estamos en una página de canal de YouTube');
    return;
  }
  
  // Diferentes selectores para el botón de suscripción
  const possibleSelectors = [
    // Selector para el botón de suscripción principal
    'ytd-subscribe-button-renderer paper-button, ytd-subscribe-button-renderer button',
    // Selector para el nuevo diseño de YouTube
    'ytd-subscribe-button-renderer #subscribe-button button',
    // Selector alternativo
    '#subscribe-button ytd-button-renderer button',
    // Selector más genérico
    'button[aria-label*="suscribir"], button[aria-label*="Suscribir"]',
    // Selector en inglés
    'button[aria-label*="subscribe"], button[aria-label*="Subscribe"]'
  ];
  
  // Intentar encontrar el botón con alguno de los selectores
  let subscribeButton = null;
  for (const selector of possibleSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      // Verificar si el botón es visible y no está ya suscrito
      if (isElementVisible(button) && !isAlreadySubscribed(button)) {
        subscribeButton = button;
        break;
      }
    }
    if (subscribeButton) break;
  }
  
  if (subscribeButton) {
    console.log('Botón de suscripción encontrado, haciendo clic...');
    
    // Hacer clic en el botón
    subscribeButton.click();
    
    // Verificar si se completó la suscripción
    setTimeout(function() {
      const isNowSubscribed = checkIfSubscribed();
      
      if (isNowSubscribed) {
        console.log('Suscripción exitosa');
        // Notificar al background script que la suscripción se completó
        chrome.runtime.sendMessage({
          action: 'subscriptionComplete',
          url: window.location.href
        });
      } else {
        reportError('No se pudo confirmar la suscripción');
      }
    }, 2000);
  } else {
    // Si no se encuentra el botón, puede ser que ya estemos suscritos o hay un problema
    if (checkIfSubscribed()) {
      console.log('Ya estás suscrito a este canal');
      chrome.runtime.sendMessage({
        action: 'subscriptionComplete',
        url: window.location.href,
        alreadySubscribed: true
      });
    } else {
      reportError('No se encontró el botón de suscripción');
    }
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

// Función para verificar si ya estamos suscritos al canal
function isAlreadySubscribed(button) {
  // Verificar el texto o atributos del botón
  const buttonText = button.textContent.toLowerCase();
  const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
  
  return buttonText.includes('suscrito') || 
         buttonText.includes('subscribed') ||
         ariaLabel.includes('suscrito') || 
         ariaLabel.includes('subscribed') ||
         button.getAttribute('subscribed') === '' ||
         button.getAttribute('subscribed') === 'true';
}

// Función para verificar si ahora estamos suscritos
function checkIfSubscribed() {
  // Buscar elementos que indiquen que estamos suscritos
  const subscribedIndicators = [
    'button[aria-label*="Cancelar suscripción"]',
    'button[aria-label*="Unsubscribe"]',
    'ytd-subscribe-button-renderer[subscribed]',
    '#subscribe-button ytd-button-renderer[subscribed]'
  ];
  
  for (const selector of subscribedIndicators) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (isElementVisible(element)) {
        return true;
      }
    }
  }
  
  return false;
}

// Función para reportar errores
function reportError(errorMessage) {
  console.error(errorMessage);
  chrome.runtime.sendMessage({
    action: 'subscriptionError',
    error: errorMessage,
    url: window.location.href
  });
}
