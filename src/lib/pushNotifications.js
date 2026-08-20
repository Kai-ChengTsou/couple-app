import { supabase } from './supabase';

const publicKey=import.meta.env.VITE_VAPID_PUBLIC_KEY;

function decodeKey(value){
  const padding='='.repeat((4-value.length%4)%4);
  const raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}

export function pushSupport(){
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  return {supported,standalone,configured:Boolean(publicKey),permission:supported?Notification.permission:'unsupported'};
}

export async function currentPushSubscription(){
  if(!('serviceWorker' in navigator))return null;
  const registration=await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function enablePush(userId){
  if(!publicKey)throw new Error('通知服務尚未完成設定。');
  const registration=await navigator.serviceWorker.register('/sw.js');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('你尚未允許通知，請到 iPhone「設定 > 通知」開啟 Duet 通知。');
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
  const json=subscription.toJSON();
  const {error}=await supabase.from('push_subscriptions').upsert({user_id:userId,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,updated_at:new Date().toISOString()},{onConflict:'endpoint'});
  if(error)throw error;
  return subscription;
}

export async function disablePush(){
  const subscription=await currentPushSubscription();
  if(!subscription)return;
  const {error}=await supabase.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint);
  if(error)throw error;
  await subscription.unsubscribe();
}
