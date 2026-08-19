import { useState } from 'react';
import { AlertTriangle, Check, Copy, Heart, LoaderCircle, LogOut, Palette, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsPage({members,couple,user,onRefresh,onNotify,onTheme}){
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
        <section className="settings-card members-card"><span className="settings-icon"><UsersRound/></span><h2>我們</h2><p>空間裡的名字由加入時設定，這裡只顯示、不會被更改。</p>
          <div className="member-list">{(members||[]).map(member=>{const memberName=member.profile?.display_name||'成員';return <div className="member-row" key={member.user_id}><i>{memberName.slice(0,1).toUpperCase()}</i><span><strong>{memberName}</strong><small>{member.user_id===user?.id?'你':'另一半'}</small></span></div>})}{(members||[]).length<2&&<div className="member-row waiting"><i>＋</i><span><strong>等待另一半加入</strong><small>使用下方邀請連結</small></span></div>}</div>
        </section>
        <form className="settings-card" onSubmit={save}>
        <span className="settings-icon"><Heart/></span><h2>共同資料</h2>
        <label>空間名稱<input value={space} onChange={e=>setSpace(e.target.value)} required/></label>
        <label>紀念日<input type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)}/></label>
        <button className="auth-submit" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<><Check size={17}/>儲存變更</>}</button>
      </form>
      </div>
      <div className="settings-stack">
        <section className="settings-card"><span className="settings-icon"><Palette/></span><h2>你的主題</h2><p>兩個人都可以選擇自己喜歡的外觀。</p><div className="settings-themes"><button onClick={()=>onTheme('blush')}><i className="swatch blush"/>暖粉</button><button onClick={()=>onTheme('midnight')}><i className="swatch midnight"/>靜藍</button></div></section>
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
