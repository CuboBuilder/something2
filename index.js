const express = require('express');
const path = require('path');
const fs = require('fs');
const { getServerInfo } = require('./motd.js');

const app = express();
const port = 8080;
const serversFile = path.join(__dirname, 'servers.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cooldown store: { ip: timestamp }
const addServerCooldowns = {};

// Load/save servers
function loadServers() {
  if (!fs.existsSync(serversFile)) return [];
  return JSON.parse(fs.readFileSync(serversFile, 'utf8'));
}

function saveServers(servers) {
  fs.writeFileSync(serversFile, JSON.stringify(servers, null, 2), 'utf8');
}

// Validation
function parseServerInput(input) {
  input = input.trim();
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

  let ip = input;
  let port = 6567;

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

// GET /servers -> live info
app.get('/servers', async (req, res) => {
  const servers = loadServers();
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

// POST /servers -> add server
app.post('/servers', (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Check cooldown
  const now = Date.now();
  if (addServerCooldowns[clientIP] && now - addServerCooldowns[clientIP] < 3600_000) {
    const remaining = Math.ceil((3600_000 - (now - addServerCooldowns[clientIP])) / 1000 / 60);
    return res.status(429).json({ error: `Cooldown: You can add another server in ${remaining} minutes` });
  }

  let { ip } = req.body;
  try {
    const { ip: parsedIP, port } = parseServerInput(ip);
    ip = parsedIP;

    let servers = loadServers();
    if (servers.find(s => s.ip === ip && s.port === port)) {
      return res.status(400).json({ error: "Server already exists" });
    }

    // Save server
    servers.push({ ip, port });
    saveServers(servers);

    // Update cooldown
    addServerCooldowns[clientIP] = now;

    res.json({ success: true, ip, port });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
