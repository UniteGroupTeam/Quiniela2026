const API_KEY_FOOTBALL = 'b49f90c2f278946fa93176ae1d283ffd';

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'register') {
    const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
    const users = sheetUsuarios.getDataRange().getValues();
    if (users.some((row, i) => i > 0 && row[0] === e.parameter.username)) {
      return jsonResponse({ success: false, message: 'El usuario ya existe' });
    }
    sheetUsuarios.appendRow([e.parameter.username, e.parameter.passwordHash, 0]);
    return jsonResponse({ success: true, message: 'Registrado con éxito' });
  }
  
  if (action === 'login') {
    const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
    const users = sheetUsuarios.getDataRange().getValues();
    const user = users.find((row, i) => i > 0 && row[0] === e.parameter.username && row[1] === e.parameter.passwordHash);
    if (user) return jsonResponse({ success: true, username: user[0], puntos: user[2] });
    return jsonResponse({ success: false, message: 'Credenciales inválidas' });
  }
  
  if (action === 'predict') {
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const sheetPronosticos = SpreadsheetApp.getActive().getSheetByName('Pronosticos');
    
    const partidoData = sheetResultados.getDataRange().getValues().find(row => row[0] == e.parameter.partidoId);
    
    if (partidoData && (partidoData[5] === 'FINISHED' || partidoData[5] === 'IN_PLAY')) {
       return jsonResponse({ success: false, message: 'El partido ya inició o terminó' });
    }

    const pronosData = sheetPronosticos.getDataRange().getValues();
    let updated = false;
    for (let i = 1; i < pronosData.length; i++) {
      if (pronosData[i][0] === e.parameter.username && pronosData[i][1] == e.parameter.partidoId) {
        sheetPronosticos.getRange(i + 1, 3).setValue(e.parameter.golesLocal);
        sheetPronosticos.getRange(i + 1, 4).setValue(e.parameter.golesVisitante);
        updated = true; break;
      }
    }
    if (!updated) sheetPronosticos.appendRow([e.parameter.username, e.parameter.partidoId, e.parameter.golesLocal, e.parameter.golesVisitante]);
    return jsonResponse({ success: true, message: 'Pronóstico guardado' });
  }
  
  if (action === 'getPartidos') {
    const data = SpreadsheetApp.getActive().getSheetByName('ResultadosReales').getDataRange().getValues();
    const matches = data.slice(1).map(row => ({
      partidoId: row[0], equipoLocal: row[1], equipoVisitante: row[2],
      golesLocal: row[3], golesVisitante: row[4], status: row[5]
    }));
    return jsonResponse({ success: true, matches });
  }
  
  if (action === 'getPodio') {
    const data = SpreadsheetApp.getActive().getSheetByName('Usuarios').getDataRange().getValues();
    const podio = data.slice(1).map(row => ({ username: row[0], puntos: row[2] || 0 }))
                      .sort((a, b) => b.puntos - a.puntos);
    return jsonResponse({ success: true, podio });
  }

  if (action === 'getMisPronosticos') {
    const data = SpreadsheetApp.getActive().getSheetByName('Pronosticos').getDataRange().getValues();
    const pronosticos = data.slice(1).filter(row => row[0] === e.parameter.username)
                            .map(row => ({ partidoId: row[1], golesLocal: row[2], golesVisitante: row[3] }));
    return jsonResponse({ success: true, pronosticos });
  }
  
  return jsonResponse({ success: false, message: 'Ruta no encontrada' });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================= AUTOMATIZACIÓN ZERO-TOUCH =================
function fetchResultadosMundial() {
  // league=1 es el Mundial de la FIFA. season=2026 es el año.
  // (Si quieres probar con datos en vivo hoy, cambia league a 39 y season a 2023 para la Premier League)
  const url = 'https://v3.football.api-sports.io/fixtures?league=1&season=2026';
  try {
    const res = UrlFetchApp.fetch(url, { headers: { 'x-apisports-key': API_KEY_FOOTBALL }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return;
    
    const data = JSON.parse(res.getContentText());
    if (!data.response) return;
    const matches = data.response;
    
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const resData = sheetResultados.getDataRange().getValues();
    
    let matchRowMap = {};
    for (let i = 1; i < resData.length; i++) matchRowMap[resData[i][0]] = i + 1;
    
    matches.forEach(match => {
      const id = match.fixture.id;
      
      // Mapear los status de API-Football a nuestro formato
      const statusShort = match.fixture.status.short;
      let status = 'SCHEDULED';
      if (['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(statusShort)) status = 'IN_PLAY';
      if (['FT', 'AET', 'PEN'].includes(statusShort)) status = 'FINISHED';
      
      const hTeam = match.teams.home.name || 'Por Definir';
      const aTeam = match.teams.away.name || 'Por Definir';
      const hScore = match.goals.home !== null ? match.goals.home : "";
      const aScore = match.goals.away !== null ? match.goals.away : "";
      
      if (matchRowMap[id]) {
        const row = matchRowMap[id];
        sheetResultados.getRange(row, 2, 1, 5).setValues([[hTeam, aTeam, hScore, aScore, status]]);
        if (status === 'FINISHED' && resData[row - 1][6] !== 'SI') {
          calcularYOtorgarPuntos(id, hScore, aScore);
          sheetResultados.getRange(row, 7).setValue('SI');
        }
      } else {
        sheetResultados.appendRow([id, hTeam, aTeam, hScore, aScore, status, 'NO']);
      }
    });
  } catch (error) {}
}

function calcularYOtorgarPuntos(partidoId, resHome, resAway) {
  const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
  const pronosData = SpreadsheetApp.getActive().getSheetByName('Pronosticos').getDataRange().getValues();
  const usersData = sheetUsuarios.getDataRange().getValues();
  
  let userRowMap = {};
  for (let i = 1; i < usersData.length; i++) userRowMap[usersData[i][0]] = i + 1;
  
  let ganadorReal = resHome > resAway ? 1 : (resHome < resAway ? -1 : 0);
  
  pronosData.slice(1).forEach(row => {
    if (row[1] == partidoId && row[2] !== "" && row[3] !== "") {
      let pts = 0;
      if (row[2] == resHome && row[3] == resAway) pts = 2;
      else {
        let ganadorProno = row[2] > row[3] ? 1 : (row[2] < row[3] ? -1 : 0);
        if (ganadorReal === ganadorProno) pts = 1;
      }
      if (pts > 0 && userRowMap[row[0]]) {
        let rIdx = userRowMap[row[0]];
        sheetUsuarios.getRange(rIdx, 3).setValue((sheetUsuarios.getRange(rIdx, 3).getValue() || 0) + pts);
      }
    }
  });
}

function instalarAutomatizacion() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("fetchResultadosMundial").timeBased().everyHours(2).create();
}
