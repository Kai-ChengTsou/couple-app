import { useState } from 'react';
import { AlertTriangle, Check, Copy, Heart, LoaderCircle, LogOut, Palette, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PickerField from './PickerField';

const themes=[['blush','暖粉'],['midnight','靜藍'],['lilac','夢紫'],['sage','森綠'],['sunset','蜜桃'],['latte','奶茶']];

export default function SettingsPage({members,couple,user,theme,onRefresh,onNotify,onTheme}){
  const ownMember=(members||[]).find(member=>member.user_id===user?.id);
  const [ownName,setOwnName]=useState(ownMember?.profile?.display_name||'');
  const [savingName,setSavingName]=useState(false);
  const [editingName,setEditingName]=useState(false);
  const [space,setSpace]=useState(couple?.name||'');
  const [anniversary,setAnniversary]=useState(couple?.anniversary||'');
  const [saving,setSaving]=useState(false);
  const [leaveOpen,setLeaveOpen]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const [leaveError,setLeaveError]=useState('');

  async function save(e){
    e.preventDefault();
    if(!supabase||!user||!couple)return onNotify('目前無法連接資料庫');
    setSaving(true);
    const {error}=await supabase.from('couples').update({name:space.trim(),anniversary:anniversary||null}).eq('id',couple.id);
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

  return <section className="feature-page settings-page">
    <header className="page-title-row"><div><p className="eyebrow">你們的小天地</p><h1>設定</h1><p>管理共同空間、重要日期與你的個人主題。</p></div></header>
    <div className="settings-grid">
      <div className="settings-stack">
        <section className="settings-card members-card"><span className="settings-icon"><UsersRound/></span><h2>我們</h2><p>你可以修改自己的名字；另一半的名字只能查看。</p>
          <div className="member-list">{(members||[]).map(member=>{const memberName=member.profile?.display_name||'成員';return member.user_id===user?.id?(editingName?<form className="member-row member-edit-row" key={member.user_id} onSubmit={saveOwnName}><i>{(ownName||memberName).slice(0,1).toUpperCase()}</i><label><small>你的名字</small><input autoFocus value={ownName} onChange={e=>setOwnName(e.target.value)} required maxLength="80" aria-label="你的名字"/></label><button type="submit" aria-label="儲存你的名字" disabled={savingName}>{savingName?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>}</button></form>:<button type="button" className="member-row member-row-button" key={member.user_id} onClick={()=>setEditingName(true)}><i>{memberName.slice(0,1).toUpperCase()}</i><span><strong>{memberName}</strong><small>你 · 點一下修改名字</small></span></button>):<div className="member-row" key={member.user_id}><i>{memberName.slice(0,1).toUpperCase()}</i><span><strong>{memberName}</strong><small>另一半 · 僅供查看</small></span></div>})}{(members||[]).length<2&&<div className="member-row waiting"><i>＋</i><span><strong>等待另一半加入</strong><small>使用下方邀請連結</small></span></div>}</div>
        </section>
        <form className="settings-card" onSubmit={save}>
        <span className="settings-icon"><Heart/></span><h2>共同資料</h2>
        <label>空間名稱<input value={space} onChange={e=>setSpace(e.target.value)} required/></label>
        <label>在一起的日子<PickerField type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)} ariaLabel="在一起的日子"/></label>
        <button className="auth-submit" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<><Check size={17}/>儲存變更</>}</button>
      </form>
      </div>
      <div className="settings-stack">
        <section className="settings-card"><span className="settings-icon"><Palette/></span><h2>你的主題</h2><p>兩個人都可以選擇自己喜歡的外觀。</p><div className="settings-themes">{themes.map(([value,label])=><button type="button" key={value} className={theme===value?'selected':''} aria-pressed={theme===value} onClick={()=>onTheme(value)}><i className={`swatch ${value}`}/>{label}{theme===value&&<Check size={14}/>}</button>)}</div></section>
        <section className="settings-card invite-card"><span className="settings-icon"><Heart/></span><h2>邀請另一半</h2><p>這個私人空間只能再加入一個人。</p><strong>{couple?.invite_code||'邀請碼'}</strong><button className="outline-button" onClick={copy}><Copy size={17}/>複製私人邀請連結</button></section>
        <section className="settings-card leave-card"><span className="settings-icon"><LogOut/></span><h2>離開共同空間</h2><p>換裝置或想加入其他空間時，可以從這台裝置離開。</p><button className="leave-space-button" onClick={()=>{setLeaveError('');setLeaveOpen(true)}}><LogOut size={17}/>離開這個空間</button></section>
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
