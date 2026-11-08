import { localChat } from './src/local-ollama-chat.js';
const model='qwen3.5:2b', controller=new AbortController();
const started=Date.now(); let first=false;
try {
  await localChat({model, messages:[{role:'user',content:'Count from 1 to 10000, one integer per line. Continue counting without stopping.'}],options:{num_gpu:0,num_thread:2,num_ctx:4096,num_predict:2048}}, {
    signal:controller.signal,onContent:()=>{if(!first){first=true; console.log('Inference started; canceling',Date.now()-started);controller.abort();}}
  });
  throw new Error('Inference unexpectedly completed before canceling');
} catch(error) { if(error.name!=='AbortError')throw error; }
for(let i=0;i<40;i++){
  const {models}=await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  if(!models.some(m=>m.name===model)){console.log('Canceled model unloaded',Date.now()-started);process.exit(0);}
  await new Promise(resolve=>setTimeout(resolve,250));
}
throw new Error('Model remained loaded after cancellation');
