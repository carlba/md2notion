import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readMarkdownFile, convertMarkdownToNotionBlocks, appendBlocksToPage } from './md2notion.js';
import * as fs from 'fs';
import { Client } from '@notionhq/client';

vi.mock('fs');

describe('readMarkdownFile', () => {
  it('should read a markdown file and return its content', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('# Hello\n\nThis is a test.' as unknown as ReturnType<typeof fs.readFileSync>);
    const content = readMarkdownFile('/tmp/test.md');
    expect(content).toBe('# Hello\n\nThis is a test.');
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.md'), 'utf-8');
  });
});

describe('convertMarkdownToNotionBlocks', () => {
  it('should convert a heading to a heading_1 block', () => {
    const blocks = convertMarkdownToNotionBlocks('# Hello World');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading_1');
  });

  it('should convert a paragraph to a paragraph block', () => {
    const blocks = convertMarkdownToNotionBlocks('This is a paragraph.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('should convert multiple elements', () => {
    const markdown = '# Title\n\nA paragraph.\n\n- Item 1\n- Item 2';
    const blocks = convertMarkdownToNotionBlocks(markdown);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('should return an empty array for empty content', () => {
    const blocks = convertMarkdownToNotionBlocks('');
    expect(blocks).toEqual([]);
  });
});

describe('appendBlocksToPage', () => {
  let mockNotion: Client;

  beforeEach(() => {
    mockNotion = {
      blocks: {
        children: {
          append: vi.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Client;
  });

  it('should call blocks.children.append with the page ID and blocks', async () => {
    const blocks = convertMarkdownToNotionBlocks('# Hello');
    await appendBlocksToPage(mockNotion, 'page-id-123', blocks);
    expect(mockNotion.blocks.children.append).toHaveBeenCalledWith(
      expect.objectContaining({ block_id: 'page-id-123' })
    );
  });

  it('should split blocks into chunks of 100', async () => {
    const longMarkdown = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1}.`).join(
      '\n\n'
    );
    const blocks = convertMarkdownToNotionBlocks(longMarkdown);
    await appendBlocksToPage(mockNotion, 'page-id-123', blocks);
    // Should have been called twice for 150 blocks (100 + 50)
    expect(mockNotion.blocks.children.append).toHaveBeenCalledTimes(2);
  });

  it('should not call append when blocks array is empty', async () => {
    await appendBlocksToPage(mockNotion, 'page-id-123', []);
    expect(mockNotion.blocks.children.append).not.toHaveBeenCalled();
  });
});
