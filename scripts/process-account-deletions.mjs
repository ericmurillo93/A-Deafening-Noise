import { pathToFileURL } from 'node:url';
import { clearMemoryFiles } from '../src/lib/memory-storage.js';

export async function processAccountDeletions(env=process.env, request=fetch) {
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=env;
  if(!url || !key) throw new Error('Account deletion service configuration is incomplete');
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  async function call(path,body,method='POST') {
    const response=await request(`${url}${path}`,{method,headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(`Account deletion service failed (${response.status})`);
    const text=await response.text();return text?JSON.parse(text):null;
  }
  const batch=await call('/rest/v1/rpc/claim_account_deletions',{});
  let failed=0;
  for(const item of batch) {
    try {
      for(const bucket of ['concert-memories','avatars']) {
        await clearMemoryFiles({
          list:async(prefix,options)=>({data:await call(`/storage/v1/object/list/${bucket}`,{prefix,...options})}),
          remove:async(prefixes)=>({data:await call(`/storage/v1/object/${bucket}`,{prefixes},'DELETE')})
        },item.user_id);
      }
      await call('/rest/v1/rpc/complete_account_deletion',{target_user:item.user_id,claim_lease:item.lease,succeeded:true});
    } catch {
      failed++;
      await call('/rest/v1/rpc/complete_account_deletion',{target_user:item.user_id,claim_lease:item.lease,succeeded:false,error_message:'Cleanup interrupted; retry required'});
    }
  }
  return {completed:batch.length-failed,failed};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await processAccountDeletions();console.log('Account cleanup:',result);
  if(result.failed)process.exitCode=1;
}
