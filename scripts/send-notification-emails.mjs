import { pathToFileURL } from 'node:url';
import { renderNotificationEmail } from './notification-email-template.mjs';

export async function sendNotificationEmails(env=process.env,request=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key,RESEND_API_KEY:resend,RESEND_FROM_EMAIL:from}=env;
  if(!url || !key || !resend || !from) throw new Error('Activity email service configuration is incomplete');
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  async function rpc(name,body) {
    const response=await request(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Activity email ${name} failed (${response.status})`);
    const text=await response.text();return text?JSON.parse(text):null;
  }
  let sent=0,failed=0;
  // Bound each run; remaining work is picked up by the next hourly execution.
  for(let page=0;page<10;page++) {
    const batch=await rpc('get_notification_email_batch',{batch_size:50});
    if(!batch.length)break;
    for(const item of batch) {
      const delivery=await rpc('claim_notification_email',{outbox_id:item.outboxId,candidate_message:{from,to:[item.email],...renderNotificationEmail(item)}});
      if(!delivery)continue;
      let succeeded=false,error=null;
      try {
        const response=await request('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json','Idempotency-Key':`notification/${delivery.notification_id}`},body:JSON.stringify(delivery.message)});
        succeeded=response.ok;error=succeeded?null:`Resend ${response.status}`;
      }catch{error='Delivery request interrupted';}
      await rpc('complete_notification_email',{outbox_id:delivery.id,claim_lease:delivery.lease,succeeded,error_message:error});
      if(succeeded)sent++;else failed++;
      await pause(600);
    }
  }
  return {sent,failed};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await sendNotificationEmails();console.log('Activity emails:',result);
  if(result.failed)process.exitCode=1;
}
