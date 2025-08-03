const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const app = express();
const PORT = 3001;

app.use(bodyParser.json());

// Отдача config.html
app.get('/', (req, res) => {
  fs.readFile(path.join(__dirname, 'config.html'), 'utf-8', (err, data) => {
    if (err) {
      res.status(500).send('Ошибка загрузки config.html');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.send(data);
    }
  });
});

// Получение конфига
app.get('/config', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: 'Не удалось прочитать config.json' });
  }
});

// Сохранение
app.post('/config', (req, res) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Не удалось сохранить config.json' });
  }
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🛠 Редактор конфигурации доступен по адресу: ${url}`);

  // 👉 Автоматически открыть браузер
  const platform = process.platform;
  if (platform === 'win32') {
    exec(`start ${url}`);
  } else if (platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
});
