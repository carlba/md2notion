import { Client } from '@notionhq/client';
import { markdownToBlocks } from '@tryfabric/martian';
import type { Block } from '@tryfabric/martian/build/src/notion/blocks.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const NOTION_BLOCK_CHUNK_SIZE = 100;

/**
 * Reads a markdown file and returns its content as a string.
 */
export function readMarkdownFile(filePath: string): string {
  const absolutePath = resolve(filePath);
  return readFileSync(absolutePath, 'utf-8');
}

/**
 * Converts markdown content into Notion blocks using @tryfabric/martian.
 */
export function convertMarkdownToNotionBlocks(markdownContent: string) {
  return markdownToBlocks(markdownContent);
}

/**
 * Uploads blocks to a Notion page in chunks (Notion API limit is 100 blocks per request).
 */
export async function appendBlocksToPage(
  notion: Client,
  pageId: string,
  blocks: Block[]
): Promise<void> {
  for (let i = 0; i < blocks.length; i += NOTION_BLOCK_CHUNK_SIZE) {
    const chunk = blocks.slice(i, i + NOTION_BLOCK_CHUNK_SIZE);
    await notion.blocks.children.append({
      block_id: pageId,
      // Type assertion needed due to version mismatch between @tryfabric/martian and @notionhq/client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: chunk as any,
    });
  }
}

/**
 * Converts a markdown file and uploads it to a Notion page.
 *
 * @param filePath Path to the markdown file
 * @param pageId   Notion page ID to append blocks to
 * @param apiKey   Notion integration API key
 */
export async function md2notion(
  filePath: string,
  pageId: string,
  apiKey: string
): Promise<void> {
  const notion = new Client({ auth: apiKey });
  const markdownContent = readMarkdownFile(filePath);
  const blocks = convertMarkdownToNotionBlocks(markdownContent);
  await appendBlocksToPage(notion, pageId, blocks);
  console.log(`Successfully uploaded ${blocks.length} block(s) to Notion page ${pageId}`);
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , filePath, pageId] = process.argv;
  const apiKey = process.env.NOTION_API_KEY;

  if (!filePath || !pageId) {
    console.error('Usage: md2notion <file.md> <notion-page-id>');
    console.error('Environment variable NOTION_API_KEY must be set.');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('Error: NOTION_API_KEY environment variable is not set.');
    process.exit(1);
  }

  md2notion(filePath, pageId, apiKey).catch((err: unknown) => {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
