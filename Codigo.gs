/**
 * QUINIELA MUNDIAL 2026 - BACKEND (Google Apps Script)
 * 
 * =========================================================
 * INSTRUCCIONES DE INSTALACIÓN Y CONFIGURACIÓN DEL SHEET:
 * =========================================================
 * 1. Crea un Google Sheet nuevo y abre Extensiones > Apps Script.
 * 2. Pega todo este código en el archivo `Código.gs`.
 * 3. Crea exactamente estas 3 hojas (pestañas) en el Google Sheet respetando MAYÚSCULAS/minúsculas:
 * 
 * HOJA 1: "Usuarios"
 * - Fila 1 (Cabeceras): A1: Usuario | B1: Password_Hash | C1: Puntos
 * 
 * HOJA 2: "Pronosticos"
 * - Fila 1 (Cabeceras): A1: Usuario | B1: Partido_ID | C1: Goles_Local | D1: Goles_Visitante
 * 
 * HOJA 3: "ResultadosReales"
 * - Fila 1 (Cabeceras): A1: Partido_ID | B1: Equipo_Local | C1: Equipo_Visitante | D1: Goles_Local | E1: Goles_Visitante | F1: Status | G1: Calculado
 * - Rellena los partidos (o deja que la API lo haga si es un endpoint que lista fixtures).
 * 
 * 4. Configura tu API KEY gratuita de football-data.org (u otra de tu preferencia) en la variable API_KEY_FOOTBALL.
 * 5. Haz click en Implementar > Nueva Implementación > Aplicación Web.
 *    - Ejecutar como: "Tú"
 *    - Quién tiene acceso: "Cualquier persona"
 *    - Copia la URL de la aplicación web y ponla en tu app.js del Frontend.
 * 6. Ejecuta la función `instalarAutomatizacion()` desde el editor (dará permisos la primera vez) 
 *    para que los resultados se actualicen automáticamente cada 2 horas.
 */

const API_KEY_FOOTBALL = 'TU_API_KEY_AQUI'; // Ej: De https://www.football-data.org/
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// --- 1. ENDPOINTS DE LA APLICACIÓN WEB (Frontend) ---

function doPost(e) {
  const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
  const sheetPronosticos = SpreadsheetApp.getActive().getSheetByName('Pronosticos');
  
  let req = {};
  try {
    req = JSON.parse(e.postData.contents);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = req.action;
  
  // REGISTRO
  if (action === 'register') {
    const { username, passwordHash } = req;
    const users = sheetUsuarios.getDataRange().getValues();
    const userExists = users.some((row, i) => i > 0 && row[0] === username);
    
    if (userExists) {
      return jsonResponse({ success: false, message: 'El usuario ya existe' });
    }
    
    sheetUsuarios.appendRow([username, passwordHash, 0]);
    return jsonResponse({ success: true, message: 'Registrado con éxito' });
  }
  
  // LOGIN
  if (action === 'login') {
    const { username, passwordHash } = req;
    const users = sheetUsuarios.getDataRange().getValues();
    const user = users.find((row, i) => i > 0 && row[0] === username && row[1] === passwordHash);
    
    if (user) {
      return jsonResponse({ success: true, username: user[0], puntos: user[2] });
    } else {
      return jsonResponse({ success: false, message: 'Credenciales inválidas' });
    }
  }
  
  // GUARDAR PRONOSTICO
  if (action === 'predict') {
    const { username, partidoId, golesLocal, golesVisitante } = req;
    
    // Validar si el partido ya terminó o empezó (en ResultadosReales)
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const resData = sheetResultados.getDataRange().getValues();
    const partidoRow = resData.find(row => row[0] == partidoId);
    
    if (partidoRow && (partidoRow[5] === 'FINISHED' || partidoRow[5] === 'IN_PLAY')) {
       return jsonResponse({ success: false, message: 'El partido ya inició o terminó' });
    }

    // Buscar si ya existe el pronóstico para actualizarlo
    const pronosData = sheetPronosticos.getDataRange().getValues();
    let updated = false;
    for (let i = 1; i < pronosData.length; i++) {
      if (pronosData[i][0] === username && pronosData[i][1] == partidoId) {
        sheetPronosticos.getRange(i + 1, 3).setValue(golesLocal);
        sheetPronosticos.getRange(i + 1, 4).setValue(golesVisitante);
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      sheetPronosticos.appendRow([username, partidoId, golesLocal, golesVisitante]);
    }
    
    return jsonResponse({ success: true, message: 'Pronóstico guardado' });
  }

  return jsonResponse({ error: 'Action not found' });
}

function doGet(e) {
  const action = e.parameter.action;
  
  // OBTENER PARTIDOS Y RESULTADOS REALES
  if (action === 'getPartidos') {
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const data = sheetResultados.getDataRange().getValues();
    const headers = data[0];
    const matches = [];
    
    for (let i = 1; i < data.length; i++) {
      matches.push({
        partidoId: data[i][0],
        equipoLocal: data[i][1],
        equipoVisitante: data[i][2],
        golesLocal: data[i][3],
        golesVisitante: data[i][4],
        status: data[i][5]
      });
    }
    return jsonResponse({ success: true, matches });
  }
  
  // OBTENER PODIO / CLASIFICACIÓN
  if (action === 'getPodio') {
    const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
    const data = sheetUsuarios.getDataRange().getValues();
    const podio = [];
    
    for (let i = 1; i < data.length; i++) {
      podio.push({
        username: data[i][0],
        puntos: data[i][2] || 0
      });
    }
    
    // Ordenar de mayor a menor
    podio.sort((a, b) => b.puntos - a.puntos);
    return jsonResponse({ success: true, podio });
  }

  // OBTENER MIS PRONOSTICOS
  if (action === 'getMisPronosticos') {
    const username = e.parameter.username;
    const sheetPronosticos = SpreadsheetApp.getActive().getSheetByName('Pronosticos');
    const data = sheetPronosticos.getDataRange().getValues();
    const misPronosticos = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === username) {
        misPronosticos.push({
          partidoId: data[i][1],
          golesLocal: data[i][2],
          golesVisitante: data[i][3]
        });
      }
    }
    return jsonResponse({ success: true, pronosticos: misPronosticos });
  }
  
  return jsonResponse({ success: false, message: 'Ruta no encontrada' });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
}


// --- 2. AUTOMATIZACIÓN Y CONEXIÓN CON API ---

/**
 * Función vital que pide la API, parsea el JSON y escribe los resultados.
 */
function fetchResultadosMundial() {
  // EJEMPLO CON FOOTBALL-DATA.ORG (Competition 2000 = World Cup)
  // Nota: Deberás ajustar la URL y los campos según la API que elijas usar.
  const url = 'https://api.football-data.org/v4/competitions/2000/matches';
  
  const options = {
    method: 'GET',
    headers: {
      'X-Auth-Token': API_KEY_FOOTBALL
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log('Error en API: ' + response.getContentText());
      return;
    }
    
    const data = JSON.parse(response.getContentText());
    const matches = data.matches;
    
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const resData = sheetResultados.getDataRange().getValues();
    
    // Mapa para buscar la fila de cada partido rápidamente
    const matchRowMap = {};
    for (let i = 1; i < resData.length; i++) {
      matchRowMap[resData[i][0]] = i + 1; // 1-based index, saltando cabecera
    }
    
    matches.forEach(match => {
      const matchId = match.id;
      const status = match.status; // SCHEDULED, TIMED, IN_PLAY, FINISHED
      const homeTeam = match.homeTeam.name || 'Por Definir';
      const awayTeam = match.awayTeam.name || 'Por Definir';
      const homeScore = match.score.fullTime.home !== null ? match.score.fullTime.home : "";
      const awayScore = match.score.fullTime.away !== null ? match.score.fullTime.away : "";
      
      const rowIndex = matchRowMap[matchId];
      
      if (rowIndex) {
        // Actualizar partido existente
        sheetResultados.getRange(rowIndex, 2).setValue(homeTeam);
        sheetResultados.getRange(rowIndex, 3).setValue(awayTeam);
        sheetResultados.getRange(rowIndex, 4).setValue(homeScore);
        sheetResultados.getRange(rowIndex, 5).setValue(awayScore);
        sheetResultados.getRange(rowIndex, 6).setValue(status);
        
        // Verificar si acaba de terminar para calcular puntos
        const calculado = resData[rowIndex - 1][6]; // Columna G
        if (status === 'FINISHED' && calculado !== 'SI') {
          calcularYOtorgarPuntos(matchId, homeScore, awayScore);
          sheetResultados.getRange(rowIndex, 7).setValue('SI');
        }
      } else {
        // Insertar nuevo partido
        sheetResultados.appendRow([matchId, homeTeam, awayTeam, homeScore, awayScore, status, 'NO']);
      }
    });
    
  } catch (error) {
    Logger.log('Excepción en fetch: ' + error.toString());
  }
}

/**
 * Calcula los puntos (1 pt ganador, 2 pts marcador exacto)
 */
function calcularYOtorgarPuntos(partidoId, resHome, resAway) {
  const sheetPronosticos = SpreadsheetApp.getActive().getSheetByName('Pronosticos');
  const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
  
  const pronosData = sheetPronosticos.getDataRange().getValues();
  const usersData = sheetUsuarios.getDataRange().getValues();
  
  // Mapa de usuarios a índices para actualizar puntos
  const userRowMap = {};
  for (let i = 1; i < usersData.length; i++) {
    userRowMap[usersData[i][0]] = i + 1;
  }
  
  // Determinar ganador real (1 = local, -1 = visitante, 0 = empate)
  let ganadorReal = 0;
  if (resHome > resAway) ganadorReal = 1;
  else if (resHome < resAway) ganadorReal = -1;
  
  for (let i = 1; i < pronosData.length; i++) {
    if (pronosData[i][1] == partidoId) {
      const username = pronosData[i][0];
      const pronoHome = pronosData[i][2];
      const pronoAway = pronosData[i][3];
      
      if (pronoHome === "" || pronoAway === "") continue;
      
      let puntosGanados = 0;
      
      // 2 Puntos: Marcador exacto
      if (pronoHome == resHome && pronoAway == resAway) {
        puntosGanados = 2;
      } 
      // 1 Punto: Acertar ganador/empate
      else {
        let ganadorProno = 0;
        if (pronoHome > pronoAway) ganadorProno = 1;
        else if (pronoHome < pronoAway) ganadorProno = -1;
        
        if (ganadorReal === ganadorProno) {
          puntosGanados = 1;
        }
      }
      
      // Sumar puntos al usuario
      if (puntosGanados > 0 && userRowMap[username]) {
        const rowIdx = userRowMap[username];
        const puntosActuales = sheetUsuarios.getRange(rowIdx, 3).getValue() || 0;
        sheetUsuarios.getRange(rowIdx, 3).setValue(puntosActuales + puntosGanados);
      }
    }
  }
}

/**
 * Función "Zero-Touch" para automatizar la solicitud cada 2 horas.
 * Ejecuta esta función UNA SOLA VEZ manualmente desde el editor de Google Apps Script.
 */
function instalarAutomatizacion() {
  // Eliminar triggers anteriores para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Crear nuevo trigger que se ejecute cada 2 horas
  ScriptApp.newTrigger("fetchResultadosMundial")
           .timeBased()
           .everyHours(2)
           .create();
           
  Logger.log("Automatización instalada exitosamente. El fetch se ejecutará cada 2 horas.");
}
