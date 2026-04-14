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
        "다중 선택": {
          multi_select: tags.map(tag => ({ name: tag.trim() })),
        },
        "텍스트": {
          rich_text: [
            {
              text: { content: markdownContent.substring(0, 2000) },
            },
          ],
        },
      },
      children: chunks.slice(0, 100),
    });

    return response;
  }, 3, 5000); // 3 retries, starting with 5s delay (Notion is sensitive to rate limits)
}

module.exports = { createNotionPage };
