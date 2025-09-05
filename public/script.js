const addServerBtn = document.getElementById('addServerBtn');
const serverList = document.getElementById('serverList');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const autoRefreshToggleBtn = document.getElementById('autoRefreshToggleBtn');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');

let autoRefresh = true;
const refreshInterval = 10000;
let intervalId;

// Escape HTML
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
}

// Validate IP/domain + optional port
function parseServerInput(input) {
  input = input.trim();
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

  let ip = input, port = 6567;

  if (input.includes(":")) {
    const parts = input.split(":");
    ip = parts[0];
    const p = parseInt(parts[1], 10);
    if (isNaN(p) || p < 1 || p > 65535) throw new Error("Invalid port number");
    port = p;
  }

  if (!ipv4Regex.test(ip) && !domainRegex.test(ip)) throw new Error("Invalid IP or domain format");
  return { ip, port };
}

// Load servers
async function loadServers() {
  const res = await fetch('/servers');
  const servers = await res.json();
  renderServers(servers);
}

// Add server
addServerBtn.addEventListener('click', async () => {
  const input = prompt("Enter server (IP/domain with optional port, e.g. 149.40.3.138:6004 or exdustry.com:6004)");
  if (!input) return;

  try {
    const { ip, port } = parseServerInput(input);
    const res = await fetch('/servers', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ip: `${ip}:${port}` })
    });
    const data = await res.json();
    if (res.ok) loadServers();
    else alert("❌ " + data.error);
  } catch(err) {
    alert("❌ " + err.message);
  }
});

function cleanServerName(name) {
  // Remove all [ ... ] tags
  return name.replace(/\[[^\]]*]/g, '');
}

// Render servers in table
function renderServers(servers) {
  const tbody = document.querySelector('#serverList tbody');
  tbody.innerHTML = '';

  servers.forEach(s => {
    const tr = document.createElement('tr');

    // IP Address & Version
    const ipTd = document.createElement('td');
    ipTd.innerHTML = s.online
      ? `<span class="online-badge">Online</span> ${s.ip} <small class="version">v.${s.info.gameversion}</small>`
      : `<span class="offline-badge">Offline</span> ${s.ip}`;
    tr.appendChild(ipTd);

    // Name & Description
    const nameTd = document.createElement('td');
    nameTd.innerHTML = s.online
      ? cleanServerName(s.info.host || '') + (s.info.description ? ` <small>${escapeHTML(s.info.description)}</small>` : '')
      : '-';
    tr.appendChild(nameTd);

    // Players count
    const playersTd = document.createElement('td');
    playersTd.textContent = s.online ? `${s.info.players}/${s.info.limit}` : '-';
    playersTd.className = 'players';
    tr.appendChild(playersTd);

    // Map
    const mapTd = document.createElement('td');
    mapTd.textContent = s.online ? s.info.map : '-';
    mapTd.className = 'map';
    tr.appendChild(mapTd);

    tbody.appendChild(tr);
  });
}



// Theme toggle
themeToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('light');
  document.body.classList.toggle('dark');
});

// Auto-refresh toggle
autoRefreshToggleBtn.addEventListener('click', () => {
  autoRefresh = !autoRefresh;
  autoRefreshStatus.textContent = autoRefresh ? `Auto-refresh enabled (${refreshInterval/1000}s)` : `Auto-refresh disabled`;
  if (autoRefresh) startAutoRefresh();
  else clearInterval(intervalId);
});

// Auto-refresh every 10s
function startAutoRefresh() {
  clearInterval(intervalId);
  intervalId = setInterval(() => { if(autoRefresh) loadServers(); }, refreshInterval);
}

// Initial load
document.body.classList.add('dark'); 
loadServers();
startAutoRefresh();
