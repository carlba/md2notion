import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { md2notionMarkdownContent } from './md2notion-markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 3701);
const STARTUP_NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
const STARTUP_DEFAULT_PAGE_ID = (process.env.NOTION_DEFAULT_PAGE_ID || '').trim();
const WEB_UI_DIR = [join(__dirname, 'webui'), resolve(__dirname, '../src/webui')].find(existsSync);

if (!WEB_UI_DIR) {
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
  const parentPageIdFromForm = String(req.body.parentPageId || '').trim();
  const parentPageId = parentPageIdFromForm || STARTUP_DEFAULT_PAGE_ID;
  const apiKeyFromForm = String(req.body.apiKey || '').trim();
  const apiKey = apiKeyFromForm || STARTUP_NOTION_API_KEY;

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

  const files = (req.files || []) as Express.Multer.File[];
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

  const successCount = results.filter(r => r.ok).length;
  const failedCount = results.length - successCount;

  return res.json({
    total: results.length,
    successCount,
    failedCount,
    results,
  });
});

app.listen(PORT, () => {
  console.log(`md2notion web UI is running at http://localhost:${PORT}`);
});
