import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, BellOff, CalendarHeart, Check, Copy, Heart, LoaderCircle, LogOut, Palette, ShieldCheck, Smartphone, Sparkles, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { currentPushPreferences, currentPushSubscription, defaultPushPreferences, disablePush, enablePush, pushSupport, updatePushPreferences } from '../lib/pushNotifications';
import PickerField from './PickerField';

const themes=[['blush','暖粉'],['tiffany','蒂芬妮綠'],['midnight','靜藍'],['sky','晴空藍'],['lilac','夢紫'],['cherry','莓果紅'],['sage','森綠'],['sunset','蜜桃'],['latte','奶茶'],['butter','奶油黃']];

export default function SettingsPage({members,couple,user,theme,onRefresh,onNotify,onTheme}){
  const ownMember=(members||[]).find(member=>member.user_id===user?.id);
  const [ownName,setOwnName]=useState(ownMember?.profile?.display_name||'');
  const [savingName,setSavingName]=useState(false);
  const [editingName,setEditingName]=useState(false);
  const [anniversary,setAnniversary]=useState(couple?.anniversary||'');
  const [saving,setSaving]=useState(false);
  const [leaveOpen,setLeaveOpen]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const [leaveError,setLeaveError]=useState('');
  const [pushState,setPushState]=useState(()=>pushSupport());
  const [pushEnabled,setPushEnabled]=useState(false);
  const [pushBusy,setPushBusy]=useState(false);
  const [preferenceBusy,setPreferenceBusy]=useState('');
  const [pushPreferences,setPushPreferences]=useState({...defaultPushPreferences});
  const [pushError,setPushError]=useState('');

  useEffect(()=>{Promise.all([currentPushSubscription(),currentPushPreferences()]).then(([subscription,preferences])=>{setPushEnabled(Boolean(subscription));setPushPreferences(preferences);}).catch(()=>{});},[]);

  async function save(e){
    e.preventDefault();
    if(!supabase||!user||!couple)return onNotify('目前無法連接資料庫');
    setSaving(true);
    const {error}=await supabase.from('couples').update({anniversary:anniversary||null}).eq('id',couple.id);
    setSaving(false);
    if(error)return onNotify(error.message);
    await onRefresh();
    onNotify('設定已儲存');
  }

  async function saveOwnName(e){
    e.preventDefault();
    const nextName=ownName.trim();
    if(!nextName)return onNotify('請輸入你的名字');
    setSavingName(true);
    const {error}=await supabase.from('profiles').update({display_name:nextName}).eq('id',user.id);
    setSavingName(false);
    if(error)return onNotify(error.message);
    await onRefresh();
    setEditingName(false);
    onNotify('你的名字已更新');
  }

  async function copy(){
    if(!couple?.invite_code)return onNotify('建立空間後才會產生邀請碼');
    await navigator.clipboard.writeText(`${location.origin}/?invite=${couple.invite_code}`);
    onNotify('私人邀請連結已複製');
  }

  async function leaveSpace(){
    setLeaving(true);setLeaveError('');
    const {error}=await supabase.rpc('leave_couple');
    if(error){setLeaving(false);return setLeaveError(error.message);}
    const {error:signOutError}=await supabase.auth.signOut();
    if(signOutError){setLeaving(false);return setLeaveError(signOutError.message);}
    window.location.replace('/');
  }

  async function togglePush(){
    setPushBusy(true);setPushError('');
    try{
      if(pushEnabled){await disablePush();setPushEnabled(false);onNotify('Duet 通知已關閉');}
      else{await enablePush(user.id,pushPreferences);setPushEnabled(true);setPushState(pushSupport());onNotify('Duet 通知已開啟');}
    }catch(notificationError){setPushError(notificationError.message||'無法變更通知設定。');setPushState(pushSupport());}
    finally{setPushBusy(false);}
  }

  async function togglePushPreference(key,label){
    if(!pushEnabled)return;
    const next={...pushPreferences,[key]:!pushPreferences[key]};
    setPreferenceBusy(key);setPushError('');setPushPreferences(next);
    try{await updatePushPreferences({[key]:next[key]});onNotify(`${label}通知已${next[key]?'開啟':'關閉'}`);}
    catch(preferenceError){setPushPreferences(pushPreferences);setPushError(preferenceError.message||'無法更新通知選擇。');}
    finally{setPreferenceBusy('');}
  }

  return <section className="feature-page settings-page">
    <header className="page-title-row"><div><p className="eyebrow">你們的小天地</p><h1>設定</h1><p>管理共同空間、重要日期與你的個人主題。</p></div></header>
    <section className="settings-overview">
      <div className="settings-overview-mark"><Heart size={25} fill="currentColor"/></div>
      <div><small>DUET SPACE</small><strong>{couple?.name||'我們的小天地'}</strong><p>{members?.length===2?'兩個人的私人共同空間':'正在等待另一半加入'}</p></div>
      <span className="settings-private"><ShieldCheck size={15}/>私人空間</span>
      <Sparkles className="settings-overview-sparkle" size={42}/>
    </section>
    <div className="settings-grid">
      <div className="settings-stack">
        <section className="settings-card members-card"><div className="settings-card-heading"><span className="settings-icon"><UsersRound/></span><div><small>MEMBERS</small><h2>我們</h2></div></div><p>點一下自己的名字即可修改；另一半的名字只能查看。</p>
          <div className="member-list">{(members||[]).map(member=>{const memberName=member.profile?.display_name||'成員';return member.user_id===user?.id?(editingName?<form className="member-row member-edit-row" key={member.user_id} onSubmit={saveOwnName}><i>{(ownName||memberName).slice(0,1).toUpperCase()}</i><label><small>你的名字</small><input autoFocus value={ownName} onChange={e=>setOwnName(e.target.value)} required maxLength="80" aria-label="你的名字"/></label><button type="submit" aria-label="儲存你的名字" disabled={savingName}>{savingName?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>}</button></form>:<button type="button" className="member-row member-row-button" key={member.user_id} onClick={()=>setEditingName(true)}><i>{memberName.slice(0,1).toUpperCase()}</i><span><strong>{memberName}</strong><small>你 · 點一下修改名字</small></span></button>):<div className="member-row" key={member.user_id}><i>{memberName.slice(0,1).toUpperCase()}</i><span><strong>{memberName}</strong><small>另一半 · 僅供查看</small></span></div>})}{(members||[]).length<2&&<div className="member-row waiting"><i>＋</i><span><strong>等待另一半加入</strong><small>使用下方邀請連結</small></span></div>}</div>
        </section>
        <form className="settings-card anniversary-card" onSubmit={save}>
        <div className="settings-card-heading"><span className="settings-icon"><CalendarHeart/></span><div><small>OUR DAY</small><h2>在一起的日子</h2></div></div>
        <p>這一天會用來計算「我們在一起多久了」。</p>
        <label>紀念日<PickerField type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)} ariaLabel="在一起的日子"/></label>
        <button className="auth-submit settings-save" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<><Check size={17}/>儲存日期</>}</button>
      </form>
        <section className="settings-card notification-card"><div className="settings-card-heading"><span className="settings-icon">{pushEnabled?<Bell/>:<BellOff/>}</span><div><small>NOTIFICATIONS</small><h2>貼心提醒</h2></div></div>
          <p>{pushEnabled?'這台裝置會收到你們共同生活的重要更新。':'讓 Duet 在重要時刻主動提醒你。'}</p>
          <div className={`notification-topics ${pushEnabled?'':'disabled'}`} aria-label="選擇通知內容">
            <button type="button" className={pushPreferences.notify_schedule?'selected':''} aria-pressed={pushPreferences.notify_schedule} disabled={!pushEnabled||Boolean(preferenceBusy)} onClick={()=>togglePushPreference('notify_schedule','行程與重要日期')}>{preferenceBusy==='notify_schedule'?<LoaderCircle className="spin" size={14}/>:<CalendarHeart size={14}/>}<span>行程與重要日期</span><b>{pushPreferences.notify_schedule?'開啟':'關閉'}</b></button>
            <button type="button" className={pushPreferences.notify_wishes?'selected':''} aria-pressed={pushPreferences.notify_wishes} disabled={!pushEnabled||Boolean(preferenceBusy)} onClick={()=>togglePushPreference('notify_wishes','願望')}>{preferenceBusy==='notify_wishes'?<LoaderCircle className="spin" size={14}/>:<Heart size={14}/>}<span>願望被答應</span><b>{pushPreferences.notify_wishes?'開啟':'關閉'}</b></button>
            <button type="button" className={pushPreferences.notify_tasks?'selected':''} aria-pressed={pushPreferences.notify_tasks} disabled={!pushEnabled||Boolean(preferenceBusy)} onClick={()=>togglePushPreference('notify_tasks','共同任務')}>{preferenceBusy==='notify_tasks'?<LoaderCircle className="spin" size={14}/>:<Check size={14}/>}<span>共同任務進度</span><b>{pushPreferences.notify_tasks?'開啟':'關閉'}</b></button>
          </div>
          {!pushEnabled&&<small className="notification-topic-help">開啟這台裝置的通知後，即可個別選擇提醒。</small>}
          <div className={`notification-status ${pushEnabled?'enabled':''}`}><span>{pushEnabled?<Bell size={18}/>:<Smartphone size={18}/>}</span><div><strong>{pushEnabled?'這台裝置已開啟通知':!pushState.standalone?'請先加入 iPhone 主畫面':'尚未開啟通知'}</strong><small>{pushEnabled?'可在 iPhone「設定 > 通知 > Duet」管理':!pushState.standalone?'從 Safari 分享選單選擇「加入主畫面」':'點擊下方按鈕後允許通知'}</small></div></div>
          {!pushState.supported&&<p className="notification-help">這個瀏覽器不支援 Web Push 通知。</p>}
          {pushState.permission==='denied'&&<p className="notification-help">通知權限已被拒絕，請到 iPhone 設定中手動開啟。</p>}
          {pushError&&<p className="auth-message" role="alert">{pushError}</p>}
          <button type="button" className={pushEnabled?'notification-toggle disable':'auth-submit notification-toggle'} onClick={togglePush} disabled={pushBusy||!pushState.supported||(!pushEnabled&&!pushState.standalone)}>{pushBusy?<LoaderCircle className="spin" size={18}/>:pushEnabled?<><BellOff size={17}/>關閉這台裝置的通知</>:<><Bell size={17}/>開啟貼心提醒</>}</button>
        </section>
      </div>
      <div className="settings-stack">
        <section className="settings-card theme-card"><div className="settings-card-heading"><span className="settings-icon"><Palette/></span><div><small>APPEARANCE</small><h2>你的主題</h2></div></div><p>這是你自己的外觀，不會改變另一半的畫面。</p><div className="settings-themes">{themes.map(([value,label])=><button type="button" key={value} className={theme===value?'selected':''} aria-pressed={theme===value} onClick={()=>onTheme(value)}><i className={`theme-preview ${value}`}><b/><em/></i><span>{label}</span>{theme===value&&<Check size={14}/>}</button>)}</div></section>
        <section className="settings-card invite-card"><div className="settings-card-heading"><span className="settings-icon"><Heart/></span><div><small>INVITATION</small><h2>邀請另一半</h2></div></div><p>這個私人空間只能再加入一個人。</p><div className="invite-code-wrap"><small>私人邀請碼</small><strong>{couple?.invite_code||'邀請碼'}</strong></div><button className="outline-button" onClick={copy}><Copy size={17}/>複製私人邀請連結</button></section>
        <section className="settings-card leave-card"><div className="settings-card-heading"><span className="settings-icon"><LogOut/></span><div><small>SPACE ACCESS</small><h2>離開共同空間</h2></div></div><p>換裝置或想加入其他空間時，可以從這台裝置離開。</p><button className="leave-space-button" onClick={()=>{setLeaveError('');setLeaveOpen(true)}}><LogOut size={17}/>離開這個空間</button></section>
      </div>
    </div>

    {leaveOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!leaving&&setLeaveOpen(false)}>
      <section className="modal leave-modal" role="alertdialog" aria-modal="true" aria-labelledby="leave-title">
        <button className="icon-button close" aria-label="關閉" onClick={()=>setLeaveOpen(false)} disabled={leaving}><X size={20}/></button>
        <span className="leave-warning"><AlertTriangle size={24}/></span>
        <p className="eyebrow">離開前請確認</p><h2 id="leave-title">確定要離開嗎？</h2>
        <p>如果另一半仍在空間裡，所有行程、願望和回憶都會保留，也能再次邀請其他人。</p>
        <p><strong>如果你是最後一位成員，這個空間與所有資料將永久刪除。</strong></p>
        {leaveError&&<p className="auth-message" role="alert">{leaveError}</p>}
        <div className="leave-actions"><button className="cancel-button" onClick={()=>setLeaveOpen(false)} disabled={leaving}>取消</button><button className="leave-space-button" onClick={leaveSpace} disabled={leaving}>{leaving?<LoaderCircle className="spin" size={18}/>:<LogOut size={17}/>}確認離開</button></div>
      </section>
    </div>}
  </section>;
}
