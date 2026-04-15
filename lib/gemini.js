const axios = require('axios');
const { withRetry } = require('./utils');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-lite';
const BASE_URL = `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${API_KEY}`;

/**
 * Generates content using the Gemini REST API with retry logic.
 */
async function callGemini(prompt) {
  return await withRetry(async () => {
    const response = await axios.post(BASE_URL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000 // 15s timeout
    });

    if (!response.data.candidates || response.data.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini");
    }

    return response.data.candidates[0].content.parts[0].text.trim();
  }, 3, 3000); // 3 retries, starting with 3s delay
}

async function generateSummary(content) {
  if (!content.trim()) return "내용이 없는 문서입니다.";
  
  const prompt = `
    다음은 마크다운 문서의 내용입니다. 
    이 내용을 분석하여 핵심 내용을 관통하는 '정확히 한 문장'의 한국어 요약을 작성해 주세요. 
    말투는 "~합니다" 체로 끝내 주세요.

    문서 내용:
    ${content.substring(0, 10000)} 
  `;

  const result = await callGemini(prompt);
  return result || "요약을 생성할 수 없습니다.";
}

async function generateTags(content) {
  if (!content.trim()) return ["General"];

  const prompt = `
    다음 문서의 내용을 바탕으로 가장 적절한 태그 3~5개를 추천해 주세요.
    결과는 쉼표로 구분된 단어들로만 출력해 주세요. (예: IT, 프로그래밍, 노트)

    문서 내용:
    ${content.substring(0, 5000)}
  `;

  const result = await callGemini(prompt);
  if (!result) return ["General"];
  return result.split(",").map(t => t.trim().replace(/^#/, ''));
}

module.exports = { generateSummary, generateTags };
