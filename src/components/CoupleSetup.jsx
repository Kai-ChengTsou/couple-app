import { useState } from 'react';
import { ArrowRight, Heart, KeyRound, LoaderCircle, Plus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CoupleSetup({ onReady }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('Our duet');
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
      <p className="eyebrow">Choose your space</p><h1>How will your duet begin?</h1>
      <p>Create a shared space and invite your partner, or join one they already made.</p>
      <div className="setup-tabs">
        <button className={tab === 'create' ? 'selected' : ''} onClick={()=>setTab('create')}><Plus size={17}/>Create</button>
        <button className={tab === 'join' ? 'selected' : ''} onClick={()=>setTab('join')}><Users size={17}/>Join</button>
      </div>
      <form onSubmit={submit}>
        {tab === 'create' ? <label>Couple space name<span className="input-wrap"><Heart size={17}/><input value={name} onChange={e=>setName(e.target.value)} required maxLength="50"/></span></label>
          : <label>Partner’s invite code<span className="input-wrap"><KeyRound size={17}/><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required maxLength="8" placeholder="8-character code"/></span></label>}
        {error && <p className="auth-message" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={19}/> : <>{tab === 'create' ? 'Create our space' : 'Join my partner'}<ArrowRight size={18}/></>}</button>
      </form>
    </section>
  </div>;
}
