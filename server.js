const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'submissions.json');

// CORS 支持（允许前端跨域调用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 确保数据文件存在
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

// 读取所有提交记录
function readSubmissions() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// 追加记录
function addSubmission(record) {
  const data = readSubmissions();
  data.push(record);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  return data.length;
}

app.use(express.json());
app.use(express.static(__dirname));

// API: 提交表单数据
app.post('/api/submit', (req, res) => {
  try {
    const record = {
      ...req.body,
      _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      _submittedAt: new Date().toISOString()
    };
    const count = addSubmission(record);
    console.log(`[提交] 记录 #${count}: ${record.name} - ${record.phone}`);
    res.json({ success: true, count });
  } catch (err) {
    console.error('[错误]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: 查看所有记录
app.get('/api/records', (req, res) => {
  res.json(readSubmissions());
});

// 查询待同步记录（可以传给腾讯文档）
app.get('/api/pending-sync', (req, res) => {
  const records = readSubmissions();
  res.json(records);
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', records: readSubmissions().length });
});

app.listen(PORT, () => {
  console.log(`🇭🇰 香港移民计划匹配工具 已启动: http://localhost:${PORT}`);
});
