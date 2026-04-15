const express = require('express');
const cors = require('cors');
const { generateSummary, generateTags } = require('./lib/gemini');
const { createNotionPage, updateNotionPageSummary } = require('./lib/notion');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// 지수 백오프 재시도 로직
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // 429 Too Many Requests 또는 503 Service Unavailable일 경우만 재시도
      if ((error.status === 429 || error.status === 503) && attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(`⏳ Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

// Endpoint for Gemini Summarization (Used by Web UI)
app.post('/api/summarize', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const summary = await retryWithBackoff(
      () => generateSummary(content),
      3,
      500
    );
    const tags = await retryWithBackoff(
      () => generateTags(content),
      3,
      500
    );
    res.json({ summary, tags });
  } catch (error) {
    console.error('Summarize Error:', error.message);
    res.status(500).json({ error: `AI 분석 실패: ${error.message}` });
  }
});

// Endpoint for Notion Upload (Used by Web UI)
app.post('/api/upload', async (req, res) => {
  const { title, tags, summary, content } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: '제목과 본문은 필수입니다.' });
  }

  // Normalize tags
  const normalizedTags = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

  try {
    const response = await retryWithBackoff(
      () => createNotionPage(
        { title, tags: normalizedTags, summary }, 
        content
      ),
      3,
      500
    );
    res.json({ success: true, pageId: response.id });
  } catch (error) {
    console.error('Upload Error:', error.message);
    res.status(500).json({ error: `노션 업로드 실패: ${error.message}` });
  }
});

// Endpoint for Updating Summary on existing Notion Page
app.patch('/api/update-summary', async (req, res) => {
  const { pageId, summary } = req.body;
  
  if (!pageId || !summary) {
    return res.status(400).json({ error: 'Page ID와 요약은 필수입니다.' });
  }

  try {
    const response = await retryWithBackoff(
      () => updateNotionPageSummary(pageId, summary),
      3,
      500
    );
    res.json({ success: true, pageId: response.id });
  } catch (error) {
    console.error('Update Error:', error.message);
    res.status(500).json({ error: `노션 업데이트 실패: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}`);
});
