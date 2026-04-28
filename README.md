# Quiniela Mundial 2026

Aplicación interactiva y fluida para gestionar una quiniela del Mundial 2026.
Construida con Frontend en Vanilla JS (HTML/CSS) simulando Material You + Liquid Glass, alojable en **GitHub Pages**.
El backend funciona 100% de manera gratuita en **Google Apps Script** conectado a un **Google Sheet** y se actualiza de forma automática con una API.

## Pasos para el Despliegue

### 1. Frontend (GitHub Pages)
1. Sube todos estos archivos (`index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`) a un nuevo repositorio en tu GitHub.
2. Ve a la pestaña **Settings** > **Pages**.
3. Selecciona la rama `main` y guarda. En unos minutos tendrás tu enlace en vivo (ej: `https://tuusuario.github.io/quiniela2026/`).

### 2. Base de Datos (Google Sheets)
1. Crea un Google Sheet vacío en tu Drive.
2. Debes crear **exactamente 3 pestañas (hojas)** con los siguientes nombres y columnas en la **Fila 1**:

#### Hoja 1: `Usuarios`
- A1: `Usuario`
- B1: `Password_Hash`
- C1: `Puntos`

#### Hoja 2: `Pronosticos`
- A1: `Usuario`
- B1: `Partido_ID`
- C1: `Goles_Local`
- D1: `Goles_Visitante`

#### Hoja 3: `ResultadosReales`
- A1: `Partido_ID`
- B1: `Equipo_Local`
- C1: `Equipo_Visitante`
- D1: `Goles_Local`
- E1: `Goles_Visitante`
- F1: `Status`
- G1: `Calculado`

### 3. Backend (Google Apps Script)
1. En tu Google Sheet, ve a **Extensiones > Apps Script**.
2. Pega todo el contenido del archivo `Codigo.gs` ahí.
3. Consigue una API Key gratuita (ej: en `football-data.org`) y pégala en la variable `API_KEY_FOOTBALL` en la línea 20 del script.
4. Haz clic en **Implementar > Nueva implementación**.
   - Selecciona el tipo de engranaje **Aplicación Web**.
   - Ejecutar como: **Tú**.
   - Quién tiene acceso: **Cualquier persona**.
5. Clic en "Implementar" y autoriza los permisos de Google.
6. Copia la URL que te da al final (termina en `/exec`).
7. Abre el archivo `app.js` de este proyecto y pega esa URL en la línea 3: `const SCRIPT_URL = '.../exec';`

### 4. Automatización Zero-Touch
Para que el sistema se actualice solo sin que tú hagas nada:
1. En el editor de Apps Script, busca la función `instalarAutomatizacion()`.
2. Dale a "Ejecutar" (Run). Te pedirá permisos adicionales por los Triggers.
3. ¡Listo! A partir de ahora, cada 2 horas el servidor se conectará a la API de fútbol, actualizará los marcadores de la pestaña `ResultadosReales`, y si un partido terminó, repartirá los puntos (1 o 2 pts) en la pestaña `Usuarios` automáticamente.
