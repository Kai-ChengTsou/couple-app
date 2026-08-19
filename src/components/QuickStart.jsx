import { useState } from 'react';
import { ArrowRight, Heart, KeyRound, LoaderCircle, Plus, Sparkles, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function QuickStart() {
  const params = new URLSearchParams(window.location.search);
  const initialCode = (params.get('invite') || '').toUpperCase();
  const [mode, setMode] = useState(initialCode ? 'join' : 'create');
  const [displayName, setDisplayName] = useState('');
  const [spaceName, setSpaceName] = useState('我們的小天地');
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    const { data, error: authError } = await supabase.auth.signInAnonymously({ options: { data: { display_name: displayName.trim() } } });
    if (authError) { setLoading(false); return setError(authError.message); }
    const { error: setupError } = mode === 'create'
      ? await supabase.rpc('create_couple', { couple_name: spaceName.trim() })
      : await supabase.rpc('join_couple', { code: code.trim().toUpperCase() });
    if (setupError) {
      await supabase.auth.signOut(); setLoading(false); return setError(setupError.message);
    }
    if (data.session) window.location.replace('/');
  }

  return <div className="quick-shell">
    <section className="quick-visual">
      <a className="brand auth-brand" href="/"><span className="brand-mark"><Heart size={18} fill="currentColor"/></span><span>duet</span></a>
      <div className="quick-message"><span className="pill"><Sparkles size={14}/> 只屬於兩個人的空間</span><h1><span className="desktop-copy">不需要密碼，<br/>這裡就是<em>你們的家。</em></span><span className="mobile-copy">你們的<em>小天地。</em></span></h1><p>建立一個溫暖的小天地，傳送私人邀請，就能在各自的手機上一直相伴。</p></div>
      <div className="quick-hearts" aria-hidden="true"><span><Heart fill="currentColor"/></span><span><Heart fill="currentColor"/></span></div>
    </section>
    <main className="quick-main">
      <section className="quick-card">
        <p className="eyebrow">開始吧</p><h2>{mode === 'create' ? '建立我們的小天地' : '加入另一半的空間'}</h2>
        <p className="form-intro">{mode === 'create' ? '完成後會得到一個私人邀請連結，可以傳給另一半。' : '使用另一半分享給你的私人邀請。'}</p>
        <div className="quick-choice">
          <button type="button" className={mode==='create'?'selected':''} onClick={()=>{setMode('create');setError('')}}><Plus size={18}/><span><strong>建立空間</strong><small>開始我們的生活</small></span></button>
          <button type="button" className={mode==='join'?'selected':''} onClick={()=>{setMode('join');setError('')}}><Users size={18}/><span><strong>加入空間</strong><small>我有邀請連結</small></span></button>
        </div>
        <form onSubmit={submit}>
          <label>你的名字<span className="input-wrap"><Heart size={17}/><input value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength="50" autoComplete="name" placeholder="想讓我們怎麼稱呼你？"/></span></label>
          {mode === 'create' ? <label>為共同空間取個名字<span className="input-wrap"><Sparkles size={17}/><input value={spaceName} onChange={e=>setSpaceName(e.target.value)} required maxLength="50"/></span></label>
            : <label>私人邀請碼<span className="input-wrap"><KeyRound size={17}/><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required maxLength="8" placeholder="8 位數邀請碼"/></span></label>}
          {error&&<p className="auth-message" role="alert">{error}</p>}
          <button className="auth-submit" disabled={loading}>{loading?<LoaderCircle className="spin" size={19}/>:<>{mode==='create'?'建立我們的空間':'加入共同空間'}<ArrowRight size={18}/></>}</button>
        </form>
      </section>
    </main>
  </div>;
}
