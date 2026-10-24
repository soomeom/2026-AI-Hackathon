import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { createInitialState, validateAIInput } from './public/src/domain/contracts.js';
import { listAssignableQuestions, mergeCatalogParts } from './public/src/content/catalog.js';
import { validateAIOutput } from './public/src/ai/contracts.js';
import { createModelProvider, withDeadline, AIProviderError } from './server/ai-provider.mjs';
import { createPracticeProvider, validatePracticeInput } from './server/practice-provider.mjs';
import { validateLinearPractice } from './public/src/learning/linear-practice.js';

const DEFAULT_PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const ERROR_MESSAGES = {
  invalid_practice_input: '보충 연습 요청을 확인해 주세요.', ai_busy: '다른 문제를 준비하고 있어요. 기존 문제로 연습할 수 있어요.',
  invalid_ai_input: 'AI 입력 형식을 확인해 주세요.', invalid_json: 'JSON 요청을 확인해 주세요.', payload_too_large: '요청 데이터가 너무 큽니다.',
  ai_not_configured: '서버의 AI 키와 모델 설정이 필요합니다. 수동 작성은 계속할 수 있습니다.',
  ai_timeout: 'AI 응답 시간이 초과되었습니다. 직접 작성하거나 다시 시도해 주세요.',
  ai_rate_limited: 'AI 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  ai_invalid_output: '근거와 형식을 확인할 수 없는 AI 응답입니다. 직접 작성해 주세요.',
  ai_unavailable: 'AI 연결에 실패했습니다. 수동 작성은 계속할 수 있습니다.',
  forbidden_origin: '이 앱의 화면에서 요청해 주세요.', not_found: '요청한 자료를 찾을 수 없습니다.', method_not_allowed: '지원하지 않는 요청 방식입니다.',
};
function readCatalog() {
  const content = new URL('./public/src/content/', import.meta.url);
  return mergeCatalogParts(['questions.json', 'concepts.json', 'routes.json', 'review.json', 'exam-bank.json'].map(name => JSON.parse(readFileSync(new URL(name, content), 'utf8'))));
}
function json(res, status, value) {
  if (res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function fail(res, code, status, requestId = null) {
  json(res, status, { status: 'failed', requestId, error: { code, message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.ai_unavailable } });
}
async function readJSON(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512 * 1024) throw new AIProviderError('payload_too_large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AIProviderError('invalid_json', 400); }
}
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
// 모든 요청: 허용한 Host 만 받는다 (DNS 재바인딩 방지). 기본은 이 PC 안(로컬)뿐이고,
// 같은 와이파이 모드에서는 이 PC 자신의 네트워크 IP만 추가로 허용한다.
// API 요청만 다른 사이트 출처를 거부한다. 화면(정적 파일)은 다른 사이트의 링크로 열 수 있어야 한다.
function requestAllowed(req, { api, allowedHosts }) {
  const host = req.headers.host ?? '';
  let local;
  try { local = new URL(`http://${host}`); } catch { return false; }
  if (!allowedHosts.includes(local.hostname)) return false;
  if (!api) return true;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true;
  return req.headers.origin === local.origin;
}
async function staticFile(req, res, publicDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return fail(res, 'not_found', 404); }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) return fail(res, 'not_found', 404);
  try {
    const root = await realpath(publicDir);
    const target = await realpath(resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded)));
    const child = relative(root, target);
    if (child.startsWith('..') || isAbsolute(child)) return fail(res, 'not_found', 404);
    const data = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { fail(res, 'not_found', 404); }
}

/** 로컬 시연 서버. 저장 원본은 브라우저이며 실제 DB·인증 API를 가장하지 않는다. */
export function createAppServer({ publicDir = DEFAULT_PUBLIC, catalog = readCatalog(), provider = createModelProvider(), aiTimeoutMs = 15000, extraHosts = [], practiceProvider = createPracticeProvider({catalog}), practiceTimeoutMs = 5000 } = {}) {
  const allowedHosts = [...LOCAL_HOSTS, ...extraHosts];
  let practiceInFlight = 0;
  return createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!requestAllowed(req, { api: pathname.startsWith('/api/'), allowedHosts })) return fail(res, 'forbidden_origin', 403);
    try {
      if (pathname === '/api/practice' && req.method === 'POST') {
        const input = await readJSON(req);
        if (!validatePracticeInput(input,catalog)) return fail(res,'invalid_practice_input',400);
        if (!practiceProvider.configured) return fail(res,'ai_not_configured',503,input.requestId);
        if (practiceInFlight >= 4) return fail(res,'ai_busy',429,input.requestId);
        const controller=new AbortController(),disconnect=()=>{if(!res.writableEnded)controller.abort();};
        res.once('close',disconnect);practiceInFlight++;
        try {
          const output=await withDeadline(signal=>practiceProvider.generate(input,{signal}),{signal:controller.signal,timeoutMs:practiceTimeoutMs});
          const verified=validateLinearPractice(output.spec,{conceptId:input.conceptId});
          if(!verified.ok)throw new AIProviderError('ai_invalid_output');
          return json(res,200,{status:'ok',requestId:input.requestId,inputRevision:input.inputRevision,assessmentId:input.assessmentId,cardId:input.cardId,...verified,model:output.model??null,source:'live'});
        } catch(error) { return fail(res,error instanceof AIProviderError?error.code:'ai_unavailable',error instanceof AIProviderError?error.status:502,input.requestId); }
        finally {practiceInFlight--;res.removeListener('close',disconnect);}
      }
      if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', storage: 'browser-local', authentication: 'demo-role-switch', ai: { configured: provider.configured === true, provider: 'gemini', model: provider.model ?? null } });
      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        const assignableQuestions = listAssignableQuestions(catalog);
        const state = createInitialState({ assignments: assignableQuestions[0] ? [{ id: 'assignment-1', learnerId: 'learner-1', mentorId: 'mentor-1', questionId: assignableQuestions[0].id }] : [], paths: assignableQuestions[0] ? [{ id: 'path-1', assignmentId: 'assignment-1', stage: 'original_attempt' }] : [] });
        return json(res, 200, { state, catalog, assignableQuestions, source: 'demo', storage: 'browser-local' });
      }
      if (pathname === '/api/ai' && req.method === 'POST') {
        const input = await readJSON(req);
        if (!validateAIInput(input).ok) return fail(res, 'invalid_ai_input', 400);
        if (provider.configured !== true) return fail(res, 'ai_not_configured', 503, input.requestId);
        const controller = new AbortController();
        const disconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', disconnect);
        try {
          const output = await withDeadline(signal => provider.generate(input, { signal }), { signal: controller.signal, timeoutMs: aiTimeoutMs });
          const validation = validateAIOutput(input, output);
          if (!validation.ok) throw new AIProviderError('ai_invalid_output');
          return json(res, 200, { status: 'ok', output: validation.value, requestId: input.requestId ?? null, inputRevision: input.inputRevision ?? null, source: 'live' });
        } catch (error) {
          return fail(res, error instanceof AIProviderError ? error.code : 'ai_unavailable', error instanceof AIProviderError ? error.status : 502, input.requestId);
        } finally { res.removeListener('close', disconnect); }
      }
      if (pathname.startsWith('/api/')) return fail(res, 'method_not_allowed', 405);
      if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 'method_not_allowed', 405);
      return await staticFile(req, res, publicDir, pathname);
    } catch (error) {
      return fail(res, error instanceof AIProviderError ? error.code : 'ai_unavailable', error instanceof AIProviderError ? error.status : 500);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.BAEUMGIL_PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BAEUMGIL_PORT must be between 1 and 65535');
  // --lan 또는 BAEUMGIL_LAN=1: 같은 와이파이의 팀원도 이 PC의 IP 주소로 접속할 수 있게 연다 (시연용, 기본은 꺼짐)
  const lan = process.env.BAEUMGIL_LAN === '1' || process.argv.includes('--lan');
  const lanIps = lan ? Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address) : [];
  const server = createAppServer({ extraHosts: lanIps });
  server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`배움길 로컬 서버: http://127.0.0.1:${port} (상태: /api/health)`);
    for (const ip of lanIps) console.log(`같은 와이파이 접속 주소: http://${ip}:${port}`);
  });
}
