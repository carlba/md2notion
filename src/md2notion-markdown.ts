import 'dotenv/config';
import { Client, type BlockObjectResponse, type RichTextItemResponse } from '@notionhq/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { config, LOGGER } from './registry.js';

function readMarkdownFile(filePath: string): string {
  const absolutePath = resolve(filePath);
  return readFileSync(absolutePath, 'utf-8');
}

/**
 * Upload markdown content directly to Notion and sanitize resulting blocks.
 */
export async function md2notionMarkdownContent(
  markdown: string,
  parentPageId: string,
  apiKey: string
) {
  const notion = new Client({ auth: apiKey });

  const body = {
    parent: { page_id: parentPageId },
    markdown,
  } as unknown as Record<string, unknown>;

  // Use the low-level request API to ensure we can pass the `markdown` field
  const resp = await notion.request({ path: 'pages', method: 'post', body });
  const createdPageId = (resp as { id: string }).id;

  if (createdPageId) {
    await sanitizePageBlocks(notion, createdPageId);
  }

  return createdPageId;
}

/**
 * Create a new Notion page using the markdown parameter so Notion does the parsing.
 * parentPageId should be an existing page ID under which the new page will be created.
 */
export async function md2notionMarkdown(filePath: string, parentPageId: string, apiKey: string) {
  const markdown = readMarkdownFile(filePath);
  return md2notionMarkdownContent(markdown, parentPageId, apiKey);
}

function sanitizeRichTextArray(rich_text: RichTextItemResponse[]) {
  if (!Array.isArray(rich_text)) return rich_text;
  return rich_text.map(richText => {
    if (richText?.annotations?.code === true) {
      richText.annotations.color = 'default';
    }

    return richText;
  });
}

async function sanitizeBlockIfNeeded(notion: Client, block: BlockObjectResponse) {
  const type = block.type;
  if (type === 'unsupported') return;
  const content: unknown = (block as Record<string, unknown>)[type];
  if (!content) return;

  // Do not modify `code` blocks — leave them intact so Notion's syntax
  // highlighting is preserved. We only sanitize non-code block rich_text.
  if (type === 'code') return;

  const updateBody: Record<string, unknown> = {};
  let changed = false;

  function hasRichTextArray(obj: unknown): obj is { rich_text: RichTextItemResponse[] } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      Array.isArray((obj as Record<string, unknown>).rich_text)
    );
  }

  if (hasRichTextArray(content)) {
    const sanitized = sanitizeRichTextArray(content.rich_text);
    updateBody[type] = { rich_text: sanitized };
    changed = true;
  }

  if (changed) {
    try {
      await notion.request({ path: `blocks/${block.id}`, method: 'patch', body: updateBody });
    } catch {
      // best-effort sanitization; ignore errors
    }
  }
}

async function sanitizePageBlocks(notion: Client, rootBlockId: string) {
  const pageSize = 100;

  async function walk(blockId: string) {
    let cursor: string | null | undefined = undefined;
    do {
      const res = await notion.blocks.children.list({
        block_id: blockId,
        page_size: pageSize,
        start_cursor: cursor,
      });
      const results = res.results || [];
      for (const child of results) {
        await sanitizeBlockIfNeeded(notion, child as BlockObjectResponse);
        if ('has_children' in child && child.has_children) {
          await walk(child.id);
        }
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
  }

  await walk(rootBlockId);
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , filePath, parentPageIdArg] = process.argv;
  const parentPageId = parentPageIdArg || config.NOTION_DEFAULT_PAGE_ID;
  const apiKey = config.NOTION_API_KEY;

  if (!filePath || !parentPageId) {
    LOGGER.error('Usage: md2notion-markdown <file.md> <parent-page-id>');
    LOGGER.error('You can also set NOTION_DEFAULT_PAGE_ID in .env.');
    process.exit(1);
  }
  if (!apiKey) {
    LOGGER.error('Error: NOTION_API_KEY environment variable is not set.');
    process.exit(1);
  }

  md2notionMarkdown(filePath, parentPageId, apiKey).catch((err: unknown) => {
    LOGGER.error({ err }, 'Failed to upload markdown to Notion');
    process.exit(1);
  });
}
