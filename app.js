// --- CONFIGURACIÓN ---
// Reemplaza esta URL con la que te da Google Apps Script al hacer "Nueva Implementación"
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwx6tFz-U96YO6HVlVh5rTAH23IffaX_uPp5_5UJHsevCgHTXfmVSr5za7JXWGBekf_ZA/exec';

// --- ESTADO GLOBAL ---
let currentUser = null;
let currentPoints = 0;
let matchesData = [];
let userPredictions = [];

// --- PWA SETUP ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado', reg))
      .catch(err => console.log('SW error', err));
  });
}

let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hide');
});

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hide');
    }
    deferredPrompt = null;
  }
});

// --- UTILIDADES ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = type === 'error' ? 'var(--danger)' : 'var(--primary-color)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Simple SHA-256 Hashing (Frontend Basic Security)
async function hashPassword(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- NAVEGACIÓN (Liquid Glass Tabs) ---
const navItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    tabs.forEach(tab => tab.classList.add('hide'));
    
    item.classList.add('active');
    const target = item.getAttribute('data-target');
    document.getElementById(target).classList.remove('hide');
    
    if (target === 'tab-podio') loadPodio();
    if (target === 'tab-resultados') renderResultados();
  });
});

// --- AUTHENTICATION ---
const authForm = document.getElementById('auth-form');
const authMsg = document.getElementById('auth-msg');

document.getElementById('btn-login').addEventListener('click', (e) => handleAuth(e, 'login'));
document.getElementById('btn-register').addEventListener('click', (e) => handleAuth(e, 'register'));

async function handleAuth(e, action) {
  e.preventDefault();
  const usernameInput = document.getElementById('username').value.trim();
  const passwordInput = document.getElementById('password').value;
  
  if (!usernameInput || !passwordInput) {
    authMsg.textContent = 'Llena ambos campos';
    authMsg.className = 'message error';
    return;
  }
  
  authMsg.textContent = 'Procesando...';
  authMsg.className = 'message';
  
  const passwordHash = await hashPassword(passwordInput);
  
  try {
    const queryParams = new URLSearchParams({ action, username: usernameInput, passwordHash }).toString();
    const res = await fetch(`${SCRIPT_URL}?${queryParams}`);
    
    const data = await res.json();
    
    if (data.success) {
      if (action === 'login') {
        currentUser = data.username;
        currentPoints = data.puntos;
        initApp();
      } else {
        showToast('Registro exitoso. Ahora inicia sesión.');
        authMsg.textContent = '';
      }
    } else {
      authMsg.textContent = data.message;
      authMsg.className = 'message error';
    }
  } catch (error) {
    authMsg.textContent = 'Error de conexión. Intenta de nuevo.';
    authMsg.className = 'message error';
  }
}

// --- APP INITIALIZATION ---
async function initApp() {
  document.getElementById('auth-view').classList.remove('active-view');
  document.getElementById('main-view').classList.add('active-view');
  document.getElementById('bottom-nav').classList.remove('hide');
  
  document.getElementById('display-user').textContent = currentUser;
  document.getElementById('display-pts').textContent = currentPoints + ' pts';
  
  await loadMatchesData();
}

async function loadMatchesData() {
  try {
    // 1. Obtener Partidos y Resultados
    const resPartidos = await fetch(`${SCRIPT_URL}?action=getPartidos`);
    const dataPartidos = await resPartidos.json();
    
    if (dataPartidos.success) {
      matchesData = dataPartidos.matches;
      // Mock data in case sheet is empty for visual demo
      if (matchesData.length === 0) {
         matchesData = [
           { partidoId: '1', equipoLocal: 'México', equipoVisitante: 'Polonia', status: 'SCHEDULED', golesLocal: '', golesVisitante: '' },
           { partidoId: '2', equipoLocal: 'Argentina', equipoVisitante: 'Arabia', status: 'FINISHED', golesLocal: 1, golesVisitante: 2 }
         ];
      }
    }
    
    // 2. Obtener Mis Pronósticos
    const resPronos = await fetch(`${SCRIPT_URL}?action=getMisPronosticos&username=${currentUser}`);
    const dataPronos = await resPronos.json();
    
    if (dataPronos.success) {
      userPredictions = dataPronos.pronosticos;
    }
    
    renderQuiniela();
    
  } catch (error) {
    showToast('Error cargando datos', 'error');
  }
}

function renderQuiniela() {
  const container = document.getElementById('quiniela-list');
  container.innerHTML = '';
  
  const upcomingMatches = matchesData.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED');
  
  if (upcomingMatches.length === 0) {
    container.innerHTML = '<div class="glass-panel" style="padding:20px; text-align:center;">No hay partidos disponibles para pronosticar.</div>';
    return;
  }
  
  upcomingMatches.forEach(match => {
    // Buscar si ya hay pronóstico
    const prono = userPredictions.find(p => p.partidoId == match.partidoId);
    const pLocal = prono ? prono.golesLocal : '';
    const pVisit = prono ? prono.golesVisitante : '';
    
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div class="match-header">
        <span>Próximo</span>
        <span class="match-status"><i class="fa-regular fa-clock"></i> Pendiente</span>
      </div>
      <div class="teams-container">
        <div class="team">
          <span class="team-name">${match.equipoLocal}</span>
          <input type="number" id="hl-${match.partidoId}" class="score-input" min="0" max="15" value="${pLocal}">
        </div>
        <div class="vs">VS</div>
        <div class="team">
          <span class="team-name">${match.equipoVisitante}</span>
          <input type="number" id="al-${match.partidoId}" class="score-input" min="0" max="15" value="${pVisit}">
        </div>
      </div>
      <div class="match-action">
        <button class="btn-save-prono ${prono ? 'saved' : ''}" onclick="savePrediction('${match.partidoId}')">
          ${prono ? '<i class="fa-solid fa-check"></i> Actualizar' : 'Guardar'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.savePrediction = async function(partidoId) {
  const hInput = document.getElementById(`hl-${partidoId}`).value;
  const aInput = document.getElementById(`al-${partidoId}`).value;
  
  if (hInput === '' || aInput === '') {
    showToast('Ingresa ambos resultados', 'error');
    return;
  }
  
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  
  try {
    const queryParams = new URLSearchParams({
      action: 'predict',
      username: currentUser,
      partidoId: partidoId,
      golesLocal: hInput,
      golesVisitante: aInput
    }).toString();
    const res = await fetch(`${SCRIPT_URL}?${queryParams}`);
    const data = await res.json();
    
    if (data.success) {
      showToast('Pronóstico guardado');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Actualizado';
      btn.classList.add('saved');
    } else {
      showToast(data.message, 'error');
      btn.innerHTML = originalHtml;
    }
  } catch (error) {
    showToast('Error al guardar', 'error');
    btn.innerHTML = originalHtml;
  }
}

async function loadPodio() {
  const container = document.getElementById('podio-list');
  container.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin"></i> Cargando podio...</div>';
  
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getPodio`);
    const data = await res.json();
    
    if (data.success) {
      container.innerHTML = '';
      
      if (data.podio.length === 0) {
        container.innerHTML = '<div style="padding:15px; text-align:center;">Aún no hay puntos.</div>';
        return;
      }
      
      data.podio.forEach((user, index) => {
        const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        const icon = index === 0 ? '<i class="fa-solid fa-crown"></i>' : (index + 1);
        
        container.innerHTML += `
          <div class="rank-item ${topClass}">
            <div class="rank-pos">${icon}</div>
            <div class="rank-user">${user.username}</div>
            <div class="rank-pts">${user.puntos} pts</div>
          </div>
        `;
      });
    }
  } catch (error) {
    container.innerHTML = '<div style="padding:15px; text-align:center; color:var(--danger);">Error cargando podio.</div>';
  }
}

function renderResultados() {
  const container = document.getElementById('resultados-list');
  container.innerHTML = '';
  
  const pastMatches = matchesData.filter(m => m.status === 'FINISHED' || m.status === 'IN_PLAY');
  
  if (pastMatches.length === 0) {
    container.innerHTML = '<div class="glass-panel" style="padding:20px; text-align:center;">No hay resultados aún.</div>';
    return;
  }
  
  pastMatches.forEach(match => {
    const statusText = match.status === 'IN_PLAY' ? 'En Vivo' : 'Finalizado';
    const statusClass = match.status === 'IN_PLAY' ? 'live' : 'finished';
    const sIcon = match.status === 'IN_PLAY' ? '<i class="fa-solid fa-circle-dot"></i>' : '<i class="fa-solid fa-check-double"></i>';
    
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div class="match-header">
        <span>Marcador Oficial</span>
        <span class="match-status ${statusClass}">${sIcon} ${statusText}</span>
      </div>
      <div class="teams-container" style="margin-top: 10px;">
        <div class="team">
          <span class="team-name">${match.equipoLocal}</span>
          <span class="real-score">${match.golesLocal !== '' ? match.golesLocal : '-'}</span>
        </div>
        <div class="vs">VS</div>
        <div class="team">
          <span class="team-name">${match.equipoVisitante}</span>
          <span class="real-score">${match.golesVisitante !== '' ? match.golesVisitante : '-'}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
