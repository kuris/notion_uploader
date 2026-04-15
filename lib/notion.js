const { Client } = require("@notionhq/client");
const { markdownToBlocks } = require("@tryfabric/martian");
const { withRetry } = require('./utils');
require("dotenv").config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * Creates a page in the specified Notion database with retry logic.
 */
async function createNotionPage({ title, tags, summary }, markdownContent) {
  return await withRetry(async () => {
    // Convert markdown to blocks
    // Martian handles character limits and chunking. 
    // We slice to 100 blocks for the initial create request (Notion API limit).
    const chunks = markdownToBlocks(markdownContent);
    
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        "제목": {
          title: [
            {
              text: { content: title },
            },
          ],
        },
        "해시태그": {
          multi_select: tags.map(tag => ({ name: tag.trim() })),
        },
        "원문텍스트": {
          rich_text: [
            {
              text: { content: markdownContent.substring(0, 2000) },
            },
          ],
        },
        "한줄요약": {
          rich_text: [
            {
              text: { content: summary },
            },
          ],
        },
      },
      children: chunks.slice(0, 100),
    });

    return response;
  }, 3, 5000); // 3 retries, starting with 5s delay (Notion is sensitive to rate limits)
}

/**
 * Updates an existing notion page's summary (Patch).
 */
async function updateNotionPageSummary(pageId, summary) {
  return await withRetry(async () => {
    return await notion.pages.update({
      page_id: pageId,
      properties: {
        "한줄요약": {
          rich_text: [
            {
              text: { content: summary },
            },
          ],
        },
      },
    });
  }, 3, 3000);
}

module.exports = { createNotionPage, updateNotionPageSummary };
