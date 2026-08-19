import { useState } from 'react';
import { ArrowRight, Heart, KeyRound, LoaderCircle, Plus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CoupleSetup({ onReady }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('我們的小天地');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    const { error: requestError } = tab === 'create'
      ? await supabase.rpc('create_couple', { couple_name: name })
      : await supabase.rpc('join_couple', { code });
    setLoading(false);
    if (requestError) return setError(requestError.message);
    onReady();
  }

  return <div className="setup-shell">
    <section className="setup-card">
      <span className="setup-mark"><Heart fill="currentColor"/></span>
      <p className="eyebrow">選擇你們的空間</p><h1>從這裡開始。</h1>
      <p>建立共同空間並邀請另一半，或加入對方已經建立的空間。</p>
      <div className="setup-tabs">
        <button className={tab === 'create' ? 'selected' : ''} onClick={()=>setTab('create')}><Plus size={17}/>建立</button>
        <button className={tab === 'join' ? 'selected' : ''} onClick={()=>setTab('join')}><Users size={17}/>加入</button>
      </div>
      <form onSubmit={submit}>
        {tab === 'create' ? <label>共同空間名稱<span className="input-wrap"><Heart size={17}/><input value={name} onChange={e=>setName(e.target.value)} required maxLength="50"/></span></label>
          : <label>另一半的邀請碼<span className="input-wrap"><KeyRound size={17}/><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required maxLength="8" placeholder="8 位數邀請碼"/></span></label>}
        {error && <p className="auth-message" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={19}/> : <>{tab === 'create' ? '建立我們的空間' : '加入共同空間'}<ArrowRight size={18}/></>}</button>
      </form>
    </section>
  </div>;
}
