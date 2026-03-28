import { Client, type BlockObjectResponse, type RichTextItemResponse } from '@notionhq/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

function readMarkdownFile(filePath: string): string {
  const absolutePath = resolve(filePath);
  return readFileSync(absolutePath, 'utf-8');
}

/**
 * Create a new Notion page using the markdown parameter so Notion does the parsing.
 * parentPageId should be an existing page ID under which the new page will be created.
 */
export async function md2notionMarkdown(filePath: string, parentPageId: string, apiKey: string) {
  const notion = new Client({ auth: apiKey });
  const markdown = readMarkdownFile(filePath);

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
}

async function sanitizeRichTextArray(rich_text: RichTextItemResponse) {
  if (!Array.isArray(rich_text)) return rich_text;
  return rich_text.map(richText => {
    if (richText && richText.annotations && richText.annotations.code === true) {
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

  function hasRichTextArray(obj: unknown): obj is { rich_text: RichTextItemResponse } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      Array.isArray((obj as Record<string, unknown>).rich_text)
    );
  }

  if (hasRichTextArray(content)) {
    const sanitized = await sanitizeRichTextArray(content.rich_text);
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
  const [, , filePath, parentPageId] = process.argv;
  const apiKey = process.env.NOTION_API_KEY;

  if (!filePath || !parentPageId) {
    console.error('Usage: md2notion-markdown <file.md> <parent-page-id>');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Error: NOTION_API_KEY environment variable is not set.');
    process.exit(1);
  }

  md2notionMarkdown(filePath, parentPageId, apiKey).catch((err: unknown) => {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
