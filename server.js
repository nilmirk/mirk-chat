const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const readline = require('readline');
const WebSocket = require('ws');
const tmi = require('tmi.js');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

function ask(question, defaultValue = '') {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

function getAccessToken(refreshToken) {
  const url = `https://twitchtokengenerator.com/api/refresh/${refreshToken}`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.token) return reject(new Error('Не удалось получить access token'));
          resolve({
            accessToken: json.token,
            username: json.login || 'unknown',
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function loadOrCreateConfig() {
  let config = { refreshToken: '', channel: '', commands: {} };

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      console.error('⚠️ Ошибка чтения config.json, используем пустой конфиг');
    }
  }

  config.channel = (await ask('Введите канал', config.channel)).toLowerCase();
  config.refreshToken = await ask('Введите refresh token', config.refreshToken);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

async function waitForExit() {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('Нажмите Enter для выхода...', () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const config = await loadOrCreateConfig();

  let accessToken;
  try {
    const tokenInfo = await getAccessToken(config.refreshToken);
    accessToken = tokenInfo.accessToken;
  } catch (e) {
    console.error('❌ Ошибка получения access token:', e.message);
    await waitForExit();
    return;
  }

  const username = config.channel;

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
    channels: [config.channel],
  });

  try {
    await client.connect();
    console.log(`✅ Подключено к чату Twitch: ${config.channel} как ${username}`);
    require('child_process').exec(`start http://localhost:3000`);
  } catch (e) {
    console.error('❌ Ошибка подключения к Twitch:', e.message);
    await waitForExit();
    return;
  }

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

    if (message.startsWith('!') && config.commands && config.commands[message]) {
      const response = config.commands[message].replace('{user}', tags['display-name']);
      client.say(channel, response);
    }

  });

  server.listen(3000, () => {
    console.log('🟢 Чат доступен на http://localhost:3000');
  });
}


main().catch(async err => {
  console.error('❌ Критическая ошибка:', err.message);
  await waitForExit();
});