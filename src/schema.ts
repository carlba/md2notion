import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .string()
      .trim()
      .default('development')
      .pipe(z.enum(['production', 'development', 'test'])),
    PORT: z
      .string()
      .trim()
      .default('3701')
      .transform(value => Number(value)),
    NOTION_API_KEY: z.string().trim().optional(),
    NOTION_DEFAULT_PAGE_ID: z.string().trim().optional(),
  })
  .transform(raw => ({
    NODE_ENV: raw.NODE_ENV,
    PORT: raw.PORT,
    NOTION_API_KEY: raw.NOTION_API_KEY,
    NOTION_DEFAULT_PAGE_ID: raw.NOTION_DEFAULT_PAGE_ID,
    isDevelopment: raw.NODE_ENV !== 'production',
  }));

export type Config = z.infer<typeof envSchema>;
