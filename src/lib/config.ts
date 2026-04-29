import { z } from 'zod';
export type { Config } from '../schema.js';

export interface ConfigLogger {
  info(message: unknown, ...args: unknown[]): void;
  error(message: unknown, ...args: unknown[]): void;
}

export const parseConfig = <Schema extends z.ZodType>(schema: Schema, env = process.env) =>
  schema.safeParse(env);

export const getConfig = <Schema extends z.ZodType>(
  schema: Schema,
  env = process.env
): z.infer<Schema> => {
  const result = parseConfig(schema, env);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

export const initConfig = <Schema extends z.ZodType>(
  schema: Schema,
  logger: ConfigLogger
): z.infer<Schema> => {
  const result = parseConfig(schema);

  if (!result.success) {
    logger.error({ issues: result.error.issues }, 'Failed to read the config');
    process.exit(1);
  }

  return result.data;
};
