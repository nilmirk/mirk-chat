const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const tmi = require('tmi.js');
const readline = require('readline');

// === Ввод данных в консоли ===
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const https = require('https');

function getAccessToken(refreshToken) {
  const url = `https://twitchtokengenerator.com/api/refresh/${refreshToken}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.token) {
            reject(new Error('Не удалось получить access token'));
          } else {
            resolve({
              accessToken: json.token,
              username: json.login || 'unknown'
            });
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}


async function waitForExit() {
  return new Promise(resolve => {
    const r = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    r.question("Нажмите Enter для выхода...", () => {
      r.close();
      resolve();
    });
  });
}


async function main() {
  const CHANNEL = (await ask("Введите название Twitch-канала (без @): ")).toLowerCase();
  const REFRESH_TOKEN = await ask("Введите ваш refresh token: ");
  rl.close();

  const accessToken = await getAccessToken(REFRESH_TOKEN);
  const username = CHANNEL;

  const server = http.createServer((req, res) => {
    const file = path.join(__dirname, 'chat.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Ошибка загрузки chat.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  });

  const wss = new WebSocket.Server({ server });

  const client = new tmi.Client({
    identity: {
      username: username,
      password: `oauth:${accessToken}`,
    },
    channels: [CHANNEL],
  });

  await client.connect();

  console.log(`✅ Подключено к чату канала "${CHANNEL}" как ${username}`);
  require('child_process').exec(`start http://localhost:3000`);

  client.on('message', (channel, tags, message, self) => {
    const data = {
      user: tags['display-name'],
      message,
      color: tags['color'] || '#ffffff',
    };
    const json = JSON.stringify(data);
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    });
  });

  server.listen(3000, () => {
    console.log("💬 Открой браузер: http://localhost:3000");
  });
}

main().catch(async (err) => {
  console.error("❌ Ошибка запуска:", err.message);
  await waitForExit();
});