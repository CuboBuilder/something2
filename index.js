const express = require('express');
const path = require('path');
const fs = require('fs');
const { kv } = require('@vercel/kv');
const { getServerInfo } = require('./motd.js');

const app = express();
const port = 8080;
const serversFile = path.join(__dirname, 'servers.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const addServerCooldowns = {};

// ----------------------------
// Read from local servers.json
// ----------------------------
function readLocalServers() {
  if (!fs.existsSync(serversFile)) {
    console.warn('⚠️ servers.json not found, creating empty one.');
    fs.writeFileSync(serversFile, '[]', 'utf8');
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(serversFile, 'utf8'));
    console.log(`📂 Loaded ${data.length} servers from local servers.json`);
    return data;
  } catch (err) {
    console.error('❌ Failed to read servers.json:', err);
    return [];
  }
}

// ----------------------------
// KV + fallback loader/saver
// ----------------------------
async function loadServers() {
  try {
    const servers = await kv.get('servers');
    if (Array.isArray(servers)) {
      console.log(`☁️ Loaded ${servers.length} servers from Vercel KV`);
      return servers;
    } else {
      console.log('☁️ No data in KV yet, using local servers.json');
      return readLocalServers();
    }
  } catch (err) {
    console.warn('⚠️ KV unavailable, falling back to local servers.json');
    return readLocalServers();
  }
}

async function saveServers(servers) {
  try {
    await kv.set('servers', servers);
    console.log(`☁️ Saved ${servers.length} servers to KV`);
  } catch (err) {
    console.warn('⚠️ KV unavailable, saving locally.');
    fs.writeFileSync(serversFile, JSON.stringify(servers, null, 2), 'utf8');
  }
}

// ----------------------------
// Sync local → KV on startup
// ----------------------------
async function syncLocalToKV() {
  const localServers = readLocalServers();

  try {
    const kvServers = (await kv.get('servers')) || [];
    const newOnes = localServers.filter(
      s => !kvServers.some(k => k.ip === s.ip && k.port === s.port)
    );

    if (newOnes.length > 0) {
      const merged = [...kvServers, ...newOnes];
      await kv.set('servers', merged);
      console.log(`🔄 Synced ${newOnes.length} local servers to KV.`);
    } else {
      console.log('✅ KV already up to date with local data.');
    }
  } catch (err) {
    console.warn('⚠️ KV not available during sync, skipping.');
  }
}

// ----------------------------
// Validation (same as before)
// ----------------------------
function parseServerInput(input) {
  input = input.trim();
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

  let ip = input;
  let port = 6567;

  if (input.includes(':')) {
    const parts = input.split(':');
    ip = parts[0];
    const p = parseInt(parts[1], 10);
    if (isNaN(p) || p < 1 || p > 65535)
      throw new Error('Invalid port number');
    port = p;
  }

  if (!ipv4Regex.test(ip) && !domainRegex.test(ip))
    throw new Error('Invalid IP or domain format');

  return { ip, port };
}

// ----------------------------
// Routes
// ----------------------------
app.get('/servers', async (req, res) => {
  const servers = await loadServers();
  const results = await Promise.all(
    servers.map(async s => {
      try {
        const info = await getServerInfo(s.ip, s.port || 6567);
        return { ...s, online: true, info };
      } catch (err) {
        return { ...s, online: false, error: err.message };
      }
    })
  );
  res.json(results);
});

app.post('/servers', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (
    addServerCooldowns[clientIP] &&
    now - addServerCooldowns[clientIP] < 3600_000
  ) {
    const remaining = Math.ceil(
      (3600_000 - (now - addServerCooldowns[clientIP])) / 1000 / 60
    );
    return res.status(429).json({
      error: `Cooldown: You can add another server in ${remaining} minutes`,
    });
  }

  let { ip } = req.body;
  try {
    const { ip: parsedIP, port } = parseServerInput(ip);
    ip = parsedIP;

    let servers = await loadServers();
    if (servers.find(s => s.ip === ip && s.port === port)) {
      return res.status(400).json({ error: 'Server already exists' });
    }

    servers.push({ ip, port });
    await saveServers(servers);

    addServerCooldowns[clientIP] = now;
    res.json({ success: true, ip, port });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ----------------------------
// Start the server
// ----------------------------
app.listen(port, async () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  await syncLocalToKV();
});
