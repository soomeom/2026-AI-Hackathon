// .env와 환경 변수에서 서버 설정을 읽는다 (담당: 지훈)
// API 키는 여기서만 읽고 브라우저로 보내지 않는다 (PRD 10.1)

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_GEMINI_MODEL, createGeminiProvider } from './ai/gemini.mjs';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig() {
  try {
    process.loadEnvFile(path.join(APP_ROOT, '.env'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    host: process.env.HOST?.trim() || '127.0.0.1',
    port: Number(process.env.PORT) || 3000,
    publicDir: path.join(APP_ROOT, 'public'),
    provider: apiKey ? createGeminiProvider({ apiKey, model }) : null,
    aiStatus: { configured: Boolean(apiKey), provider: apiKey ? 'gemini' : null, model: apiKey ? model : null },
  };
}
