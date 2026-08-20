import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export default async () => {
  const supabaseUrl=Netlify.env.get('SUPABASE_URL');
  const serviceKey=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey=Netlify.env.get('VAPID_PUBLIC_KEY');
  const privateKey=Netlify.env.get('VAPID_PRIVATE_KEY');
  if(!supabaseUrl||!serviceKey||!publicKey||!privateKey)return new Response('Missing notification configuration',{status:500});

  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  webpush.setVapidDetails('mailto:duet-notifications@example.com',publicKey,privateKey);
  const now=new Date();
  const latestStart=new Date(now.getTime()+1440*60000).toISOString();
  const earliestStart=new Date(now.getTime()-10*60000).toISOString();
  const {data:events,error}=await db.from('events').select('id,couple_id,created_by,title,starts_at,event_scope,visibility,reminder_minutes').not('reminder_minutes','is',null).is('reminder_sent_at',null).gte('starts_at',earliestStart).lte('starts_at',latestStart);
  if(error)throw error;

  const due=(events||[]).filter(event=>{
    const reminderTime=new Date(event.starts_at).getTime()-event.reminder_minutes*60000;
    return reminderTime<=now.getTime()&&reminderTime>now.getTime()-10*60000;
  });

  let sent=0;
  for(const event of due){
    let userIds=[event.created_by];
    if(event.event_scope==='shared'&&event.visibility==='shared'){
      const {data:members}=await db.from('couple_members').select('user_id').eq('couple_id',event.couple_id);
      userIds=(members||[]).map(member=>member.user_id);
    }
    const {data:subscriptions}=await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id',userIds);
    const starts=new Date(event.starts_at);
    const dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(starts);
    const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(starts);
    const payload=JSON.stringify({title:'Duet 行程提醒',body:`${event.title} · ${time}`,tag:`event-${event.id}`,url:`/?open=calendar&date=${dateKey}`});
    await Promise.all((subscriptions||[]).map(async subscription=>{
      try{
        await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:3600});
        sent+=1;
      }catch(pushError){
        if(pushError.statusCode===404||pushError.statusCode===410)await db.from('push_subscriptions').delete().eq('id',subscription.id);
        else console.error('Push failed',event.id,pushError.statusCode||pushError.message);
      }
    }));
    await db.from('events').update({reminder_sent_at:now.toISOString()}).eq('id',event.id).is('reminder_sent_at',null);
  }
  return Response.json({checked:events?.length||0,due:due.length,sent});
};

export const config={schedule:'*/5 * * * *'};
