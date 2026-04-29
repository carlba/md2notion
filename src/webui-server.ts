import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { md2notionMarkdownContent } from './md2notion-markdown.js';
import { config, LOGGER } from './registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = config.PORT;
const STARTUP_NOTION_API_KEY = config.NOTION_API_KEY ?? '';
const STARTUP_DEFAULT_PAGE_ID = config.NOTION_DEFAULT_PAGE_ID ?? '';

function getStringFormField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
const WEB_UI_DIR = [join(__dirname, 'webui'), resolve(__dirname, '../src/webui')].find(existsSync);

if (!WEB_UI_DIR) {
  LOGGER.fatal('Unable to find web UI assets. Expected webui under dist or src.');
  throw new Error('Unable to find web UI assets. Expected webui under dist or src.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(WEB_UI_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

interface UploadResult {
  fileName: string;
  pageId?: string;
  ok: boolean;
  error?: string;
}

app.post('/api/upload', upload.array('markdownFiles'), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const parentPageIdFromForm = getStringFormField(body.parentPageId);
  const parentPageId =
    parentPageIdFromForm.length > 0 ? parentPageIdFromForm : STARTUP_DEFAULT_PAGE_ID;
  const apiKeyFromForm = getStringFormField(body.apiKey);
  const apiKey = apiKeyFromForm.length > 0 ? apiKeyFromForm : STARTUP_NOTION_API_KEY;

  if (!parentPageId) {
    return res.status(400).json({
      error: 'parentPageId is required (or set NOTION_DEFAULT_PAGE_ID in the environment).',
    });
  }
  if (!apiKey) {
    return res
      .status(400)
      .json({ error: 'apiKey is required (or set NOTION_API_KEY in the environment).' });
  }

  const files = (req.files ?? []) as Express.Multer.File[];
  const markdownFiles = files.filter(file => file.originalname.toLowerCase().endsWith('.md'));

  if (markdownFiles.length === 0) {
    return res.status(400).json({ error: 'No .md files were uploaded.' });
  }

  const results: UploadResult[] = [];
  for (const file of markdownFiles) {
    const fileName = file.originalname;
    const markdown = file.buffer.toString('utf-8');

    try {
      const pageId = await md2notionMarkdownContent(markdown, parentPageId, apiKey);
      results.push({ fileName, pageId, ok: true });
    } catch (err: unknown) {
      results.push({
        fileName,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successCount = results.filter(result => result.ok).length;
  const failedCount = results.length - successCount;

  return res.json({
    total: results.length,
    successCount,
    failedCount,
    results,
  });
});

app.listen(PORT, () => {
  LOGGER.info(`md2notion web UI is running at http://localhost:${PORT}`);
});
