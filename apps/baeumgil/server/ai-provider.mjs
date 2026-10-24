import { buildGeminiRequest, validateAIOutput } from '../public/src/ai/contracts.js';
import { validateAIInput } from '../public/src/domain/contracts.js';
import { createGeminiTransport, AIProviderError, withDeadline } from './gemini-transport.mjs';
export { AIProviderError, withDeadline } from './gemini-transport.mjs';
export function createModelProvider({timeoutMs=15000,...options}={}) {
 const transport=createGeminiTransport(options);
 return {configured:transport.configured,name:'gemini',model:transport.model,async generate(input,{signal}={}) {
  if(!validateAIInput(input).ok)throw new AIProviderError('invalid_ai_input',400);
  return withDeadline(async activeSignal=>{
    const {text}=await transport.generate(buildGeminiRequest(input),{signal:activeSignal});
    const validation=validateAIOutput(input,text);
    if(!validation.ok)throw new AIProviderError('ai_invalid_output');
    return validation.value;
  },{signal,timeoutMs});
 }};
}
