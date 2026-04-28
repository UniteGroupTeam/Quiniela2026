const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwx6tFz-U96YO6HVlVh5rTAH23IffaX_uPp5_5UJHsevCgHTXfmVSr5za7JXWGBekf_ZA/exec';

// --- ESTADO GLOBAL ---
let currentUser = null;
let currentPoints = 0;
let matchesData = [];
let userPredictions = [];

// --- THEME TOGGLE (Light/Dark Material 3) ---
const themeBtn = document.getElementById('theme-btn');
const body = document.body;
const savedTheme = localStorage.getItem('theme') || 'light';
body.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeBtn.addEventListener('click', () => {
  const currentTheme = body.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
  themeBtn.innerHTML = theme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
}

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
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (!isMobile) {
  installBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Instalar en teléfono';
  installBtn.classList.remove('hide');
  installBtn.addEventListener('click', () => {
    document.getElementById('qr-modal').classList.remove('hide');
  });
  document.getElementById('close-qr').addEventListener('click', () => {
    document.getElementById('qr-modal').classList.add('hide');
  });
} else {
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
}

// --- UTILIDADES ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = type === 'error' ? 'var(--danger)' : (type === 'warning' ? 'var(--warning)' : 'var(--success)');
  toast.style.color = type === 'warning' ? '#000' : '#fff';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(isoString) {
  if (!isoString) return 'Fecha por definir';
  const d = new Date(isoString);
  return d.toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hrs';
}

// --- PASSWORD TOGGLE ---
const togglePassword = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');
if (togglePassword && passwordInput) {
  togglePassword.addEventListener('click', (e) => {
    e.preventDefault();
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePassword.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
  });
}

// --- NAVEGACIÓN ---
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

// --- AUTO LOGIN & LOGOUT ---
const savedEmail = localStorage.getItem('quiniela_email');
const savedPass = localStorage.getItem('quiniela_pass');
if (savedEmail && savedPass) {
  document.getElementById('loading-overlay').classList.remove('hide');
  autoLogin(savedEmail, savedPass);
}

async function autoLogin(email, pass) {
  try {
    const queryParams = new URLSearchParams({ action: 'login', email: email, password: pass }).toString();
    const res = await fetch(`${SCRIPT_URL}?${queryParams}`);
    const data = await res.json();
    document.getElementById('loading-overlay').classList.add('hide');
    if (data.success) {
      currentUser = data.username;
      currentPoints = data.puntos;
      initApp();
    } else {
      showToast('Sesión expirada. Inicia de nuevo.', 'error');
      localStorage.removeItem('quiniela_email');
      localStorage.removeItem('quiniela_pass');
    }
  } catch (e) {
    document.getElementById('loading-overlay').classList.add('hide');
    showToast('Error de conexión automático.', 'error');
  }
}

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('quiniela_email');
  localStorage.removeItem('quiniela_pass');
  location.reload();
});

// --- AUTHENTICATION ---
const authForm = document.getElementById('auth-form');
const authMsg = document.getElementById('auth-msg');

document.getElementById('btn-login').addEventListener('click', (e) => handleAuth(e, 'login'));
document.getElementById('btn-register').addEventListener('click', (e) => handleAuth(e, 'register'));

async function handleAuth(e, action) {
  e.preventDefault();
  const emailInput = document.getElementById('email').value.trim();
  const usernameInput = document.getElementById('username') ? document.getElementById('username').value.trim() : '';
  const passwordInputValue = document.getElementById('password').value;
  
  if (!emailInput || !passwordInputValue) {
    showToast('Llena correo y contraseña', 'warning');
    return;
  }
  
  if (action === 'register') {
    if (!usernameInput) {
      showToast('Debes poner un nombre de usuario', 'warning');
      return;
    }
    if (!emailInput.endsWith('@notaria134.com.mx')) {
      showToast('Solo correos @notaria134.com.mx permitidos', 'error');
      return;
    }
  }
  
  document.getElementById('loading-overlay').classList.remove('hide');
  
  try {
    const queryParams = new URLSearchParams({ action, email: emailInput, username: usernameInput, password: passwordInputValue }).toString();
    const res = await fetch(`${SCRIPT_URL}?${queryParams}`);
    const data = await res.json();
    
    document.getElementById('loading-overlay').classList.add('hide');
    
    if (data.success) {
      if (action === 'login') {
        currentUser = data.username;
        currentPoints = data.puntos;
        localStorage.setItem('quiniela_email', emailInput);
        localStorage.setItem('quiniela_pass', passwordInputValue);
        initApp();
      } else {
        showToast('¡Cuenta creada exitosamente!', 'success');
        authMsg.textContent = '¡Listo! Tu cuenta fue creada. Haz clic en "Entrar".';
        authMsg.style.color = 'var(--success)';
      }
    } else {
      showToast(data.message, 'error');
    }
  } catch (error) {
    document.getElementById('loading-overlay').classList.add('hide');
    showToast('Error de conexión. Revisa tu internet.', 'error');
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
    const resPartidos = await fetch(`${SCRIPT_URL}?action=getPartidos`);
    const dataPartidos = await resPartidos.json();
    if (dataPartidos.success) matchesData = dataPartidos.matches;
    
    const resPronos = await fetch(`${SCRIPT_URL}?action=getMisPronosticos&username=${currentUser}`);
    const dataPronos = await resPronos.json();
    if (dataPronos.success) userPredictions = dataPronos.pronosticos;
    
    renderQuiniela();
  } catch (error) {
    showToast('Error cargando datos reales', 'error');
  }
}

function renderQuiniela() {
  const container = document.getElementById('quiniela-list');
  container.innerHTML = '';
  
  const upcomingMatches = matchesData.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED');
  
  if (upcomingMatches.length === 0) {
    container.innerHTML = '<div class="m-card" style="text-align:center; color:var(--text-muted);">No hay partidos próximos.</div>';
    return;
  }
  
  // Ordenar por fecha
  upcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const now = new Date();

  upcomingMatches.forEach(match => {
    const prono = userPredictions.find(p => p.partidoId == match.partidoId);
    const pLocal = prono ? prono.golesLocal : '';
    const pVisit = prono ? prono.golesVisitante : '';
    
    const matchDate = match.date ? new Date(match.date) : null;
    // Si la fecha actual es mayor a la del partido, se bloquea la edición
    const isLocked = matchDate && now >= matchDate;
    
    const card = document.createElement('div');
    card.className = 'm-card match-card';
    card.innerHTML = `
      <div class="match-header">
        <span class="match-date"><i class="fa-regular fa-calendar"></i> ${formatDate(match.date)}</span>
        <span class="match-status"><i class="fa-regular fa-clock"></i> Pendiente</span>
      </div>
      <div class="teams-container">
        <div class="team">
          <span class="team-name">${match.equipoLocal}</span>
          <input type="number" id="hl-${match.partidoId}" class="score-input" min="0" max="15" value="${pLocal}" ${isLocked ? 'disabled' : ''}>
        </div>
        <div class="vs">VS</div>
        <div class="team">
          <span class="team-name">${match.equipoVisitante}</span>
          <input type="number" id="al-${match.partidoId}" class="score-input" min="0" max="15" value="${pVisit}" ${isLocked ? 'disabled' : ''}>
        </div>
      </div>
      <div class="match-action">
        <button class="btn-save-prono ${prono ? 'saved' : ''}" onclick="savePrediction('${match.partidoId}')" ${isLocked ? 'disabled' : ''}>
          ${isLocked ? '<i class="fa-solid fa-lock"></i> Tiempo Agotado' : (prono ? '<i class="fa-solid fa-check"></i> Actualizar' : 'Guardar Pronóstico')}
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
    showToast('Ingresa ambos resultados', 'warning');
    return;
  }
  
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  

  
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
      showToast('Pronóstico guardado exitosamente');
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

  
  container.innerHTML = '<div style="text-align:center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i></div>';
  
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getPodio`);
    const data = await res.json();
    
    if (data.success) {
      container.innerHTML = '';
      if (data.podio.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center;">Aún no hay puntos.</div>';
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
    container.innerHTML = '<div class="m-card" style="text-align:center; color:var(--text-muted);">No hay resultados aún.</div>';
    return;
  }
  
  pastMatches.forEach(match => {
    const statusText = match.status === 'IN_PLAY' ? 'En Vivo' : 'Finalizado';
    const statusClass = match.status === 'IN_PLAY' ? 'live' : 'finished';
    const sIcon = match.status === 'IN_PLAY' ? '<i class="fa-solid fa-circle-dot"></i>' : '<i class="fa-solid fa-check-double"></i>';
    
    // Calcular feedback del pronóstico del usuario
    let feedbackHtml = '';
    const prono = userPredictions.find(p => p.partidoId == match.partidoId);
    
    if (prono && match.status === 'FINISHED') {
      let pts = 0;
      const rh = parseInt(match.golesLocal), ra = parseInt(match.golesVisitante);
      const ph = parseInt(prono.golesLocal), pa = parseInt(prono.golesVisitante);
      
      let rGanador = rh > ra ? 1 : (rh < ra ? -1 : 0);
      let pGanador = ph > pa ? 1 : (ph < pa ? -1 : 0);
      
      if (ph === rh && pa === ra) pts = 2;
      else if (rGanador === pGanador) pts = 1;
      
      let msg = pts === 2 ? '¡Marcador Exacto! +2 Pts' : (pts === 1 ? '¡Acertaste al ganador! +1 Pt' : 'No acertaste. 0 Pts');
      feedbackHtml = `
        <div class="feedback-box pts-${pts}">
          Tu pronóstico: ${prono.golesLocal} - ${prono.golesVisitante} <br>
          <small>${msg}</small>
        </div>
      `;
    } else if (!prono && match.status === 'FINISHED') {
      feedbackHtml = `<div class="feedback-box pts-0">No enviaste pronóstico. 0 Pts</div>`;
    }

    const card = document.createElement('div');
    card.className = 'm-card match-card';
    card.innerHTML = `
      <div class="match-header">
        <span class="match-date">${formatDate(match.date)}</span>
        <span class="match-status ${statusClass}">${sIcon} ${statusText}</span>
      </div>
      <div class="teams-container" style="margin-top: 15px;">
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
      ${feedbackHtml}
    `;
    container.appendChild(card);
  });
}
