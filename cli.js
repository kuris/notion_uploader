#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const glob = require('glob');
const matter = require('gray-matter');
const chalk = require('chalk');
const ora = require('ora');
require('dotenv').config();

const { generateSummary, generateTags } = require('./lib/gemini');
const { createNotionPage } = require('./lib/notion');
const { sleep, saveLog } = require('./lib/utils');

const LOG_FILE = 'upload-history.json';

program
  .version('1.0.0')
  .description('Robust Notion Markdown Uploader (Production Grade)')
  .option('-f, --folder <path>', 'Path to the folder containing .md files')
  .option('-l, --limit <number>', 'Limit number of files to process', parseInt)
  .option('-d, --dry-run', 'Analyze and summarize without uploading to Notion')
  .option('-s, --skip', 'Skip files that have notion_page_id in frontmatter')
  .option('--delay <ms>', 'Delay between files (default: 1200ms)', parseInt, 1200)
  .parse(process.argv);

const options = program.opts();

if (!options.folder) {
  console.log(chalk.red('❌ Error: Please specify a folder path using -f or --folder.'));
  process.exit(1);
}

async function run() {
  const folderPath = path.resolve(options.folder);
  if (!fs.existsSync(folderPath)) {
    console.log(chalk.red(`❌ Error: Folder not found at ${folderPath}`));
    process.exit(1);
  }

  // 1. Find and Sort Files
  let files = glob.sync('**/*.md', { cwd: folderPath, absolute: true }).sort();
  if (options.limit) {
    files = files.slice(0, options.limit);
  }

  if (files.length === 0) {
    console.log(chalk.yellow('ℹ️ No Markdown files found to process.'));
    return;
  }

  console.log(chalk.cyan(`\n🚀 Processing ${files.length} files... ${options.dry-run ? chalk.bold.yellow('(DRY RUN)') : ''}\n`));

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const fileName = path.basename(filePath);
    const spinner = ora(`[${i + 1}/${files.length}] Checking ${chalk.bold(fileName)}...`).start();

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      // Skip logic
      if (options.skip && data.notion_page_id) {
        spinner.info(chalk.gray(`Skipped (Already uploaded): ${fileName}`));
        continue;
      }

      if (!content.trim()) {
        spinner.warn(chalk.yellow(`Skipped (Empty file): ${fileName}`));
        continue;
      }

      // Title/Tags Logic
      const title = data.title || fileName.replace('.md', '');
      let tags = data.tags || [];
      if (!Array.isArray(tags)) tags = typeof tags === 'string' ? tags.split(',') : [tags];

      // Summary Generation
      spinner.text = `Analyzing ${chalk.bold(fileName)} with AI...`;
      const summary = await generateSummary(content);

      // Tag Enhancement
      if (tags.length === 0) {
        spinner.text = `Generating tags for ${chalk.bold(fileName)}...`;
        tags = await generateTags(content);
      }
      tags = [...new Set(tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean))];

      if (options.dryRun) {
        spinner.succeed(chalk.yellow(`(Dry Run) Ready: ${chalk.bold(title)} | Tags: ${tags.join(', ')}`));
        continue;
      }

      // 4. Upload to Notion
      spinner.text = `Uploading ${chalk.bold(fileName)} to Notion...`;
      const response = await createNotionPage({ title, tags, summary }, content);
      const pageId = response.id;

      // 5. Update Frontmatter
      const updatedContent = matter.stringify(content, { ...data, notion_page_id: pageId, uploaded_at: new Date().toISOString() });
      fs.writeFileSync(filePath, updatedContent);

      // 6. Log success
      saveLog(LOG_FILE, { file: fileName, title, pageId, status: 'success' });
      
      spinner.succeed(chalk.green(`Uploaded: ${chalk.bold(fileName)}`));

      // Rate limit protection
      if (i < files.length - 1) {
        await sleep(options.delay);
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${fileName} | ${error.message}`));
      saveLog(LOG_FILE, { file: fileName, error: error.message, status: 'error' });
    }
  }

  console.log(chalk.bold.cyan(`\n✨ Done! processed ${files.length} files. See ${LOG_FILE} for details.\n`));
}

// Validation
if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID || !process.env.GEMINI_API_KEY) {
  console.log(chalk.yellow('\n⚠️  Error: .env file is missing critical API keys.'));
  process.exit(1);
}

run();
