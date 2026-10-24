// 배움길 로컬 서버 진입점 (담당: 지훈)
// 실행: npm start  →  http://localhost:3000

import { createAiHandler } from './server/ai/handler.mjs';
import { createApp } from './server/app.mjs';
import { loadConfig } from './server/config.mjs';

const config = loadConfig();

const aiHandler = createAiHandler({
  provider: config.provider,
  log: (entry) => console.log('[ai]', JSON.stringify(entry)),
});

const app = createApp({ publicDir: config.publicDir, aiHandler, aiStatus: config.aiStatus });

app.listen(config.port, config.host, () => {
  console.log(`배움길 서버: http://localhost:${config.port}`);
  console.log(
    config.aiStatus.configured
      ? `AI: ${config.aiStatus.provider} (${config.aiStatus.model})`
      : 'AI: GEMINI_API_KEY가 없어 /api/ai는 ai_not_configured로 응답해요 (.env.example 참고)',
  );
});
