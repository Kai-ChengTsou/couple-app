import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const TIME_ZONE='Asia/Taipei';

function localDateKey(date=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function nextOccurrence(targetDate,repeatsYearly,today){
  if(!repeatsYearly)return targetDate;
  const [,month,day]=targetDate.split('-');
  const currentYear=Number(today.slice(0,4));
  const thisYear=`${currentYear}-${month}-${day}`;
  return thisYear>=today?thisYear:`${currentYear+1}-${month}-${day}`;
}

function daysBetween(target,today){
  const toUtc=value=>{const [year,month,day]=value.split('-').map(Number);return Date.UTC(year,month-1,day);};
  return Math.round((toUtc(target)-toUtc(today))/86400000);
}

async function subscriptionsFor(db,userIds,preference=null){
  if(!userIds.length)return [];
  let query=db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id',userIds);
  if(preference)query=query.eq(preference,true);
  const {data,error}=await query;
  if(error)throw error;
  return data||[];
}

async function deliver(db,subscriptions,payload,ttl=3600){
  let sent=0;
  await Promise.all(subscriptions.map(async subscription=>{
    try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{TTL:ttl});
      sent+=1;
    }catch(pushError){
      if(pushError.statusCode===404||pushError.statusCode===410)await db.from('push_subscriptions').delete().eq('id',subscription.id);
      else console.error('Push failed',payload.tag,pushError.statusCode||pushError.message);
    }
  }));
  return sent;
}

async function sendEventReminders(db,now){
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
    const subscriptions=await subscriptionsFor(db,userIds,'notify_schedule');
    const starts=new Date(event.starts_at);
    const dateKey=localDateKey(starts);
    const time=new Intl.DateTimeFormat('zh-TW',{timeZone:TIME_ZONE,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(starts);
    sent+=await deliver(db,subscriptions,{title:'Duet 行程提醒',body:`${event.title} · ${time}`,tag:`event-${event.id}`,url:`/?open=calendar&date=${dateKey}`});
    await db.from('events').update({reminder_sent_at:now.toISOString()}).eq('id',event.id).is('reminder_sent_at',null);
  }
  return {checked:events?.length||0,due:due.length,sent};
}

async function enqueueDateReminders(db,now){
  const today=localDateKey(now);
  const [{data:couples,error:coupleError},{data:countdowns,error:countdownError}]=await Promise.all([
    db.from('couples').select('id,anniversary').not('anniversary','is',null),
    db.from('countdowns').select('id,couple_id,title,target_date,repeats_yearly')
  ]);
  if(coupleError)throw coupleError;
  if(countdownError)throw countdownError;
  const dateItems=[
    ...(couples||[]).map(couple=>({id:`anniversary-${couple.id}`,couple_id:couple.id,title:'我們的紀念日',target_date:couple.anniversary,repeats_yearly:true,kind:'anniversary'})),
    ...(countdowns||[]).map(item=>({...item,kind:'countdown'}))
  ];
  const due=dateItems.map(item=>{const resolved=nextOccurrence(item.target_date,item.repeats_yearly,today);return {...item,resolved,days:daysBetween(resolved,today)};}).filter(item=>[7,1,0].includes(item.days));
  if(!due.length)return 0;
  const coupleIds=[...new Set(due.map(item=>item.couple_id))];
  const {data:members,error:memberError}=await db.from('couple_members').select('couple_id,user_id').in('couple_id',coupleIds);
  if(memberError)throw memberError;
  const rows=[];
  due.forEach(item=>{
    const timing=item.days===0?'就是今天':item.days===1?'就在明天':'還有 7 天';
    (members||[]).filter(member=>member.couple_id===item.couple_id).forEach(member=>rows.push({
      couple_id:item.couple_id,recipient_id:member.user_id,kind:item.kind,
      title:item.kind==='anniversary'?'紀念日提醒':'重要日子提醒',
      body:`${item.title}${timing==='就是今天'?'，就是今天！':`，${timing}`}`,
      url:'/?open=home',tag:`${item.kind}-${item.id}-${item.resolved}`,
      dedupe_key:`date:${item.kind}:${item.id}:${item.resolved}:${item.days}:${member.user_id}`
    }));
  });
  if(rows.length){
    const {error}=await db.from('notification_outbox').upsert(rows,{onConflict:'dedupe_key',ignoreDuplicates:true});
    if(error)throw error;
  }
  return rows.length;
}

async function sendActivityNotifications(db,now){
  const {data:messages,error}=await db.from('notification_outbox').select('*').is('sent_at',null).lte('scheduled_for',now.toISOString()).order('scheduled_for').limit(100);
  if(error)throw error;
  let sent=0;
  for(const message of messages||[]){
    const {data:claimed,error:claimError}=await db.from('notification_outbox').update({sent_at:now.toISOString()}).eq('id',message.id).is('sent_at',null).select('id').maybeSingle();
    if(claimError)throw claimError;
    if(!claimed)continue;
    const preference=message.kind==='wish_accepted'?'notify_wishes':message.kind==='task_progress'?'notify_tasks':'notify_schedule';
    const subscriptions=await subscriptionsFor(db,[message.recipient_id],preference);
    sent+=await deliver(db,subscriptions,{title:message.title,body:message.body,tag:message.tag,url:message.url},86400);
  }
  return {checked:messages?.length||0,sent};
}

export default async () => {
  const supabaseUrl=Netlify.env.get('SUPABASE_URL');
  const serviceKey=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey=Netlify.env.get('VAPID_PUBLIC_KEY');
  const privateKey=Netlify.env.get('VAPID_PRIVATE_KEY');
  if(!supabaseUrl||!serviceKey||!publicKey||!privateKey)return new Response('Missing notification configuration',{status:500});
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  webpush.setVapidDetails('mailto:duet-notifications@example.com',publicKey,privateKey);
  const now=new Date();
  const eventReminders=await sendEventReminders(db,now);
  const dateQueued=await enqueueDateReminders(db,now);
  const activity=await sendActivityNotifications(db,now);
  return Response.json({eventReminders,dateQueued,activity});
};

export const config={schedule:'*/5 * * * *'};
