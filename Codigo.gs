const API_KEY_FOOTBALL = 'b49f90c2f278946fa93176ae1d283ffd';

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'register') {
    const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
    const users = sheetUsuarios.getDataRange().getValues();
    if (users.some((row, i) => i > 0 && (row[0] === e.parameter.email || row[1] === e.parameter.username))) {
      return jsonResponse({ success: false, message: 'El correo o usuario ya existe' });
    }
    sheetUsuarios.appendRow([e.parameter.email, e.parameter.username, e.parameter.password, 0]);
    return jsonResponse({ success: true, message: 'Registrado con éxito' });
  }
  
  if (action === 'login') {
    const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
    const users = sheetUsuarios.getDataRange().getValues();
    const user = users.find((row, i) => i > 0 && row[0] === e.parameter.email && row[2] === e.parameter.password);
    if (user) return jsonResponse({ success: true, username: user[1], puntos: user[3] || 0 });
    return jsonResponse({ success: false, message: 'Credenciales inválidas' });
  }
  
  if (action === 'predict') {
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const sheetPronosticos = SpreadsheetApp.getActive().getSheetByName('Pronosticos');
    const partidoData = sheetResultados.getDataRange().getValues().find(row => row[0] == e.parameter.partidoId);
    
    // Server-side time check
    if (partidoData) {
      const status = partidoData[5];
      const matchDate = new Date(partidoData[7]); // Column H: Fecha
      const now = new Date();
      if (status === 'FINISHED' || status === 'IN_PLAY' || now >= matchDate) {
         return jsonResponse({ success: false, message: 'El partido ya inició o terminó' });
      }
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
      golesLocal: row[3], golesVisitante: row[4], status: row[5], date: row[7]
    }));
    return jsonResponse({ success: true, matches });
  }
  
  if (action === 'getPodio') {
    const data = SpreadsheetApp.getActive().getSheetByName('Usuarios').getDataRange().getValues();
    const podio = data.slice(1).map(row => ({ username: row[0], puntos: row[2] || 0 })).sort((a, b) => b.puntos - a.puntos);
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
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
}

// ================= AUTOMATIZACIÓN ZERO-TOUCH =================
function normalizeName(name) {
  if (!name) return "";
  let n = name.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const translations = {
    "inglaterra": "england", "paises bajos": "netherlands", "holanda": "netherlands",
    "estados unidos": "usa", "gales": "wales", "polonia": "poland", "francia": "france",
    "dinamarca": "denmark", "tunez": "tunisia", "espana": "spain", "alemania": "germany",
    "japon": "japan", "belgica": "belgium", "canada": "canada", "marruecos": "morocco",
    "croacia": "croatia", "brasil": "brazil", "suiza": "switzerland", "camerun": "cameroon",
    "corea del sur": "south korea", "arabia saudita": "saudi arabia"
  };
  return translations[n] || n;
}

function fetchResultadosMundial() {
  const url = 'https://v3.football.api-sports.io/fixtures?league=1&season=2026';
  try {
    const res = UrlFetchApp.fetch(url, { headers: { 'x-apisports-key': API_KEY_FOOTBALL }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return;
    
    const data = JSON.parse(res.getContentText());
    if (!data.response) return;
    const apiMatches = data.response;
    
    const sheetResultados = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
    const resData = sheetResultados.getDataRange().getValues();
    
    for (let i = 1; i < resData.length; i++) {
      const matchId = resData[i][0];
      const sheetHome = normalizeName(resData[i][1]);
      const sheetAway = normalizeName(resData[i][2]);
      
      const apiMatch = apiMatches.find(m => 
        normalizeName(m.teams.home.name) === sheetHome && 
        normalizeName(m.teams.away.name) === sheetAway
      );
      
      if (apiMatch) {
        const statusShort = apiMatch.fixture.status.short;
        let status = 'SCHEDULED';
        if (['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(statusShort)) status = 'IN_PLAY';
        if (['FT', 'AET', 'PEN'].includes(statusShort)) status = 'FINISHED';
        if (['PST', 'CANC', 'ABD'].includes(statusShort)) status = 'POSTPONED';
        
        const hScore = apiMatch.goals.home !== null ? apiMatch.goals.home : "";
        const aScore = apiMatch.goals.away !== null ? apiMatch.goals.away : "";
        const matchDate = apiMatch.fixture.date;
        
        sheetResultados.getRange(i + 1, 4).setValue(hScore);
        sheetResultados.getRange(i + 1, 5).setValue(aScore);
        sheetResultados.getRange(i + 1, 6).setValue(status);
        sheetResultados.getRange(i + 1, 8).setValue(matchDate);
        
        if (status === 'FINISHED' && resData[i][6] !== 'SI') {
          calcularYOtorgarPuntos(matchId, hScore, aScore);
          sheetResultados.getRange(i + 1, 7).setValue('SI');
        }
      }
    }
  } catch (error) {}
}

function calcularYOtorgarPuntos(partidoId, resHome, resAway) {
  const sheetUsuarios = SpreadsheetApp.getActive().getSheetByName('Usuarios');
  const pronosData = SpreadsheetApp.getActive().getSheetByName('Pronosticos').getDataRange().getValues();
  const usersData = sheetUsuarios.getDataRange().getValues();
  let userRowMap = {};
  for (let i = 1; i < usersData.length; i++) userRowMap[usersData[i][1]] = i + 1;
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
        sheetUsuarios.getRange(rIdx, 4).setValue((sheetUsuarios.getRange(rIdx, 4).getValue() || 0) + pts);
      }
    }
  });
}

function instalarAutomatizacion() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("fetchResultadosMundial").timeBased().everyHours(2).create();
  // Fetch now for immediate effect
  fetchResultadosMundial();
}

function cargarPartidosOficiales() {
  const rawText = `
[2026-06-11 13:00:00] Grupo A - J1: México vs Sudáfrica
[2026-06-11 20:00:00] Grupo A - J1: Corea del Sur vs República Checa
[2026-06-12 13:00:00] Grupo B - J1: Canadá vs Bosnia y Herzegovina
[2026-06-12 19:00:00] Grupo D - J1: Estados Unidos vs Paraguay
[2026-06-13 13:00:00] Grupo B - J1: Catar vs Suiza
[2026-06-13 16:00:00] Grupo C - J1: Brasil vs Marruecos
[2026-06-13 19:00:00] Grupo C - J1: Haití vs Escocia
[2026-06-13 22:00:00] Grupo D - J1: Australia vs Turquía
[2026-06-14 11:00:00] Grupo E - J1: Alemania vs Curazao
[2026-06-14 14:00:00] Grupo F - J1: Países Bajos vs Japón
[2026-06-14 17:00:00] Grupo E - J1: Costa de Marfil vs Ecuador
[2026-06-14 20:00:00] Grupo F - J1: Suecia vs Túnez
[2026-06-15 10:00:00] Grupo H - J1: España vs Cabo Verde
[2026-06-15 13:00:00] Grupo G - J1: Bélgica vs Egipto
[2026-06-15 16:00:00] Grupo H - J1: Arabia Saudita vs Uruguay
[2026-06-15 19:00:00] Grupo G - J1: Irán vs Nueva Zelanda
[2026-06-16 13:00:00] Grupo I - J1: Francia vs Senegal
[2026-06-16 16:00:00] Grupo I - J1: Irak vs Noruega
[2026-06-16 19:00:00] Grupo J - J1: Argentina vs Argelia
[2026-06-16 22:00:00] Grupo J - J1: Austria vs Jordania
[2026-06-17 11:00:00] Grupo K - J1: Portugal vs RD Congo
[2026-06-17 14:00:00] Grupo L - J1: Inglaterra vs Croacia
[2026-06-17 17:00:00] Grupo L - J1: Ghana vs Panamá
[2026-06-17 20:00:00] Grupo K - J1: Uzbekistán vs Colombia
[2026-06-18 10:00:00] Grupo A - J2: República Checa vs Sudáfrica
[2026-06-18 13:00:00] Grupo B - J2: Suiza vs Bosnia y Herzegovina
[2026-06-18 16:00:00] Grupo B - J2: Canadá vs Catar
[2026-06-18 19:00:00] Grupo A - J2: México vs Corea del Sur
[2026-06-19 13:00:00] Grupo D - J2: Estados Unidos vs Australia
[2026-06-19 16:00:00] Grupo C - J2: Escocia vs Marruecos
[2026-06-19 18:30:00] Grupo C - J2: Brasil vs Haití
[2026-06-19 21:00:00] Grupo D - J2: Turquía vs Paraguay
[2026-06-20 11:00:00] Grupo F - J2: Países Bajos vs Suecia
[2026-06-20 14:00:00] Grupo E - J2: Alemania vs Costa de Marfil
[2026-06-20 18:00:00] Grupo E - J2: Ecuador vs Curazao
[2026-06-20 22:00:00] Grupo F - J2: Túnez vs Japón
[2026-06-21 10:00:00] Grupo H - J2: España vs Arabia Saudita
[2026-06-21 13:00:00] Grupo G - J2: Bélgica vs Irán
[2026-06-21 16:00:00] Grupo H - J2: Uruguay vs Cabo Verde
[2026-06-21 19:00:00] Grupo G - J2: Nueva Zelanda vs Egipto
[2026-06-22 11:00:00] Grupo J - J2: Argentina vs Austria
[2026-06-22 15:00:00] Grupo I - J2: Francia vs Irak
[2026-06-22 18:00:00] Grupo I - J2: Noruega vs Senegal
[2026-06-22 21:00:00] Grupo J - J2: Jordania vs Argelia
[2026-06-23 11:00:00] Grupo K - J2: Portugal vs Uzbekistán
[2026-06-23 14:00:00] Grupo L - J2: Inglaterra vs Ghana
[2026-06-23 17:00:00] Grupo L - J2: Panamá vs Croacia
[2026-06-23 20:00:00] Grupo K - J2: Colombia vs RD Congo
[2026-06-24 13:00:00] Grupo B - J3: Suiza vs Canadá
[2026-06-24 13:00:00] Grupo B - J3: Bosnia y Herzegovina vs Catar
[2026-06-24 16:00:00] Grupo C - J3: Escocia vs Brasil
[2026-06-24 16:00:00] Grupo C - J3: Marruecos vs Haití
[2026-06-24 19:00:00] Grupo A - J3: República Checa vs México
[2026-06-24 19:00:00] Grupo A - J3: Sudáfrica vs Corea del Sur
[2026-06-25 14:00:00] Grupo E - J3: Curazao vs Costa de Marfil
[2026-06-25 14:00:00] Grupo E - J3: Ecuador vs Alemania
[2026-06-25 17:00:00] Grupo F - J3: Japón vs Suecia
[2026-06-25 17:00:00] Grupo F - J3: Túnez vs Países Bajos
[2026-06-25 20:00:00] Grupo D - J3: Turquía vs Estados Unidos
[2026-06-25 20:00:00] Grupo D - J3: Paraguay vs Australia
[2026-06-26 13:00:00] Grupo I - J3: Noruega vs Francia
[2026-06-26 13:00:00] Grupo I - J3: Senegal vs Irak
[2026-06-26 18:00:00] Grupo H - J3: Cabo Verde vs Arabia Saudita
[2026-06-26 18:00:00] Grupo H - J3: Uruguay vs España
[2026-06-26 21:00:00] Grupo G - J3: Egipto vs Irán
[2026-06-26 21:00:00] Grupo G - J3: Nueva Zelanda vs Bélgica
[2026-06-27 15:00:00] Grupo L - J3: Panamá vs Inglaterra
[2026-06-27 15:00:00] Grupo L - J3: Croacia vs Ghana
[2026-06-27 17:30:00] Grupo K - J3: Colombia vs Portugal
[2026-06-27 17:30:00] Grupo K - J3: RD Congo vs Uzbekistán
[2026-06-27 20:00:00] Grupo J - J3: Argelia vs Austria
[2026-06-27 20:00:00] Grupo J - J3: Jordania vs Argentina
[2026-06-28 13:00:00] Partido 73: 2A vs 2B
[2026-06-29 11:00:00] Partido 76: 1E vs 3ABCDF
[2026-06-29 14:30:00] Partido 74: 1F vs 2C
[2026-06-29 19:00:00] Partido 75: 1C vs 2F
[2026-06-30 11:00:00] Partido 78: 1I vs 3CDFGH
[2026-06-30 15:00:00] Partido 77: 2E vs 2I
[2026-06-30 19:00:00] Partido 79: 1A vs 3CEFHI
[2026-07-01 10:00:00] Partido 80: 1L vs 3EHIJK
[2026-07-01 14:00:00] Partido 82: 1D vs 3BEFIJ
[2026-07-01 18:00:00] Partido 81: 1G vs 3AEHIJ
[2026-07-02 13:00:00] Partido 84: 2K vs 2L
[2026-07-02 17:00:00] Partido 83: 1H vs 2J
[2026-07-02 21:00:00] Partido 85: 1B vs 3EFGIJ
[2026-07-03 12:00:00] Partido 88: 1J vs 2H
[2026-07-03 16:00:00] Partido 86: 1K vs 3DEIJL
[2026-07-03 19:30:00] Partido 87: 2D vs 2G
[2026-07-04 11:00:00] Partido 90: Ganador 74 vs Ganador 77
[2026-07-04 15:00:00] Partido 89: Ganador 73 vs Ganador 75
[2026-07-05 14:00:00] Partido 91: Ganador 76 vs Ganador 78
[2026-07-05 18:00:00] Partido 92: Ganador 79 vs Ganador 80
[2026-07-06 13:00:00] Partido 93: Ganador 83 vs Ganador 84
[2026-07-06 18:00:00] Partido 94: Ganador 81 vs Ganador 82
[2026-07-07 10:00:00] Partido 95: Ganador 86 vs Ganador 88
[2026-07-07 14:00:00] Partido 96: Ganador 85 vs Ganador 87
[2026-07-09 14:00:00] Partido 97: Ganador 89 vs Ganador 90
[2026-07-10 13:00:00] Partido 98: Ganador 93 vs Ganador 94
[2026-07-11 15:00:00] Partido 99: Ganador 91 vs Ganador 92
[2026-07-11 19:00:00] Partido 100: Ganador 95 vs Ganador 96
[2026-07-14 13:00:00] Partido 101: Ganador 97 vs Ganador 98
[2026-07-15 13:00:00] Partido 102: Ganador 99 vs Ganador 100
[2026-07-18 15:00:00] Partido 103: Perdedor 101 vs Perdedor 102
[2026-07-19 13:00:00] Partido 104: Ganador 101 vs Ganador 102
  `;

  const sheet = SpreadsheetApp.getActive().getSheetByName('ResultadosReales');
  if(sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  const lines = rawText.trim().split('\\n');
  let partidoId = 1;

  lines.forEach(line => {
    if(!line.includes('[')) return;
    const dateMatch = line.match(/\\[(.*?)\\]/);
    if(!dateMatch) return;
    // Agregamos -06:00 asumiendo hora central de México por los horarios
    const dateStr = dateMatch[1].replace(' ', 'T') + ':00-06:00';
    
    const parts = line.split(': ');
    if(parts.length < 2) return;
    const teams = parts[1].trim().split(' vs ');
    const home = teams[0].trim();
    const away = teams[1] ? teams[1].trim() : 'Por Definir';
    
    sheet.appendRow([partidoId++, home, away, "", "", "SCHEDULED", "NO", dateStr]);
  });
}
