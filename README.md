# YouTube Auto Suscriptor

Esta extensión para Google Chrome te permite suscribirte automáticamente a canales de YouTube a partir de una lista de URLs.

## Características

- Suscripción automática a múltiples canales de YouTube
- Interfaz sencilla para ingresar las URLs de los canales
- Barra de progreso para seguir el proceso de suscripción
- Almacenamiento de las URLs para uso futuro

## Instalación

1. Clona o descarga este repositorio
2. Abre Chrome y navega a `chrome://extensions/`
3. Activa el "Modo desarrollador" en la esquina superior derecha
4. Haz clic en "Cargar descomprimida" y selecciona la carpeta de esta extensión

## Iconos

Para que la extensión funcione correctamente, necesitas crear los siguientes iconos:

- `images/icon16.png` (16x16 píxeles)
- `images/icon48.png` (48x48 píxeles)
- `images/icon128.png` (128x128 píxeles)

Puedes crear estos iconos usando cualquier editor de imágenes o descargar iconos gratuitos de sitios como [Flaticon](https://www.flaticon.com/) o [Icons8](https://icons8.com/).

## Uso

1. Haz clic en el icono de la extensión en la barra de herramientas de Chrome
2. Ingresa las URLs de los canales de YouTube (una por línea)
3. Haz clic en "Suscribirse a Canales"
4. La extensión abrirá cada canal en una pestaña y se suscribirá automáticamente

## Formatos de URL soportados

- `https://www.youtube.com/@NombreCanal`
- `https://www.youtube.com/channel/ID_DEL_CANAL`
- `https://www.youtube.com/c/NombreCanal`

## Notas importantes

- Debes estar previamente logueado en tu cuenta de YouTube para que la extensión funcione correctamente
- La extensión no puede saltarse la confirmación de suscripción si YouTube la requiere
- Si ya estás suscrito a un canal, la extensión lo detectará y pasará al siguiente
