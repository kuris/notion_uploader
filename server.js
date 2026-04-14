const express = require('express');
const cors = require('cors');
const { generateSummary, generateTags } = require('./lib/gemini');
const { createNotionPage } = require('./lib/notion');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// Endpoint for Gemini Summarization (Used by Web UI)
app.post('/api/summarize', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const summary = await generateSummary(content);
    const tags = await generateTags(content);
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
    const response = await createNotionPage(
      { title, tags: normalizedTags, summary }, 
      content
    );
    res.json({ success: true, pageId: response.id });
  } catch (error) {
    console.error('Upload Error:', error.message);
    res.status(500).json({ error: `노션 업로드 실패: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}`);
});
