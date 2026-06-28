const express = require('express');
const path = require('path');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

// ===== GitHub 作为持久化存储 =====
// 从环境变量读取 GitHub Token 和仓库信息
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_OWNER = process.env.GITHUB_OWNER || 'nomaxchan';
const GH_REPO = process.env.GITHUB_REPO || 'hk-immigration-tool';
const GH_FILE_PATH = 'data/submissions.json';

function getGitHubHeaders() {
  return {
    'User-Agent': 'hk-immigration-backend',
    'Authorization': `token ${GH_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  };
}

// 从 GitHub 读取提交记录
async function readSubmissionsFromGitHub() {
  if (!GH_TOKEN) {
    // 降级：使用本地文件
    const fs = require('fs');
    const DATA_FILE = path.join(__dirname, 'submissions.json');
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE_PATH}`,
      method: 'GET',
      headers: getGitHubHeaders()
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 404) {
          // 文件不存在，返回空数组
          resolve({ content: [], sha: null });
        } else if (res.statusCode === 200) {
          const json = JSON.parse(data);
          const content = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
          resolve({ content, sha: json.sha });
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 写入提交记录到 GitHub
async function writeSubmissionsToGitHub(records, sha) {
  if (!GH_TOKEN) {
    // 降级：使用本地文件
    const fs = require('fs');
    const DATA_FILE = path.join(__dirname, 'submissions.json');
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
    return;
  }

  const content = Buffer.from(JSON.stringify(records, null, 2)).toString('base64');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      message: '更新: 新的移民评估提交',
      content: content,
      sha: sha || undefined
    });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE_PATH}`,
      method: 'PUT',
      headers: {
        ...getGitHubHeaders(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub write error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 读取所有记录（供自动化读取）
app.get('/api/records', async (req, res) => {
  try {
    const result = await readSubmissionsFromGitHub();
    res.json(result.content || []);
  } catch (err) {
    console.error('[读取错误]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 提交表单数据
app.post('/api/submit', async (req, res) => {
  try {
    const record = {
      ...req.body,
      _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      _submittedAt: new Date().toISOString()
    };

    // 读取现有记录
    const result = await readSubmissionsFromGitHub();
    const records = result.content || [];
    records.push(record);

    // 写入 GitHub
    await writeSubmissionsToGitHub(records, result.sha);

    console.log(`[提交] 记录 #${records.length}: ${record.name} - ${record.phone}`);
    res.json({ success: true, count: records.length });
  } catch (err) {
    console.error('[提交错误]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 健康检查
app.get('/api/health', async (req, res) => {
  try {
    const result = await readSubmissionsFromGitHub();
    res.json({ status: 'ok', records: (result.content || []).length, github: !!GH_TOKEN });
  } catch (err) {
    res.json({ status: 'ok', records: 0, github: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🇭🇭🇰 香港移民计划匹配工具 已启动: http://localhost:${PORT}`);
  console.log(`GitHub 存储: ${GH_TOKEN ? '已启用' : '未配置（使用本地文件）'}`);
});
