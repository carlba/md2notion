import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { initConfig } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { envSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')) as {
  name: string;
};

const PACKAGE_NAME = packageJson.name;

export const bootstrapLogger = createLogger(undefined, 'production').child({
  name: PACKAGE_NAME,
});

export const config = initConfig(envSchema, bootstrapLogger);

export const LOGGER = createLogger(undefined, config.NODE_ENV).child({
  name: PACKAGE_NAME,
});
