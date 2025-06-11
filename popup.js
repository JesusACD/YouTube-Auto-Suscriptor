document.addEventListener('DOMContentLoaded', function() {
  const subscribeButton = document.getElementById('subscribe-button');
  const channelUrlsTextarea = document.getElementById('channel-urls');
  const statusDiv = document.getElementById('status');
  
  // Elementos de progreso
  const progressDiv = document.querySelector('.progress');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.querySelector('.progress-fill');
  const currentUrlStatus = document.getElementById('current-url-status');

  // Contenedores de resultados
  const resultsContainer = document.getElementById('results-container');
  const successfulList = document.getElementById('successful-list');
  const failedList = document.getElementById('failed-list');

  // Añadir botón para abrir en modo página completa
  const openFullPageButton = document.createElement('button');
  openFullPageButton.textContent = 'Abrir en Página Completa';
  openFullPageButton.style.marginTop = '10px';
  openFullPageButton.style.backgroundColor = '#4285f4';
  openFullPageButton.style.marginLeft = '10px';
  
  // Insertar el botón después del botón de suscripción
  subscribeButton.parentNode.insertBefore(openFullPageButton, subscribeButton.nextSibling);
  
  // Evento para abrir la página completa
  openFullPageButton.addEventListener('click', function() {
    chrome.tabs.create({ url: 'index.html' });
  });

  // Cargar URLs guardadas
  chrome.storage.local.get(['channelUrls'], function(result) {
    if (result.channelUrls) {
      channelUrlsTextarea.value = result.channelUrls;
    }
  });

  subscribeButton.addEventListener('click', function() {
    const urls = channelUrlsTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
    if (urls.length === 0) {
      statusDiv.textContent = 'Por favor, ingresa al menos una URL.';
      return;
    }

    chrome.storage.local.set({ channelUrls: channelUrlsTextarea.value });

    // Limpiar UI para el nuevo proceso
    statusDiv.textContent = 'Iniciando proceso...';
    progressDiv.style.display = 'block';
    progressText.textContent = `0/${urls.length}`;
    progressFill.style.width = '0%';
    currentUrlStatus.textContent = '';
    resultsContainer.style.display = 'none';
    successfulList.innerHTML = '';
    failedList.innerHTML = '';

    chrome.runtime.sendMessage({ action: 'startSubscriptions', urls: urls }, function(response) {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error al iniciar. Asegúrate de que la extensión está activa.';
        progressDiv.style.display = 'none';
      } else if (response && response.success) {
        statusDiv.textContent = 'Proceso en curso. No cierres esta ventana.';
        subscribeButton.disabled = true;
      } else {
        statusDiv.textContent = 'Error desconocido al iniciar el proceso.';
        progressDiv.style.display = 'none';
      }
    });
  });

  // Escuchar mensajes del background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    switch (message.action) {
      case 'updateProgress':
        const { current, total, url } = message;
        progressText.textContent = `${current}/${total}`;
        progressFill.style.width = `${(current / total) * 100}%`;
        currentUrlStatus.textContent = `Procesando: ${url}`;
        break;

      case 'processComplete':
        statusDiv.textContent = '¡Proceso finalizado!';
        subscribeButton.disabled = false;
        progressDiv.style.display = 'none';
        currentUrlStatus.textContent = '';
        displayResults(message.successful, message.failed);
        break;

      case 'requestPopupClose':
        console.log('Recibida solicitud para cerrar el popup.');
        window.close();
        break;
    }
  });

  function displayResults(successful, failed) {
    resultsContainer.style.display = 'block';

    if (successful.length > 0) {
      successful.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${item.url}" target="_blank">${item.url}</a> ${item.alreadySubscribed ? '(Ya suscrito)' : ''}`;
        li.style.color = item.alreadySubscribed ? '#666' : 'green';
        successfulList.appendChild(li);
      });
    } else {
      successfulList.innerHTML = '<li>No hubo suscripciones exitosas.</li>';
    }

    if (failed.length > 0) {
      failed.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${item.url}" target="_blank">${item.url}</a> - <span style="font-style: italic;">${item.error}</span>`;
        li.style.color = 'red';
        failedList.appendChild(li);
      });
    } else {
      failedList.innerHTML = '<li>No hubo fallos.</li>';
    }
  }
});
