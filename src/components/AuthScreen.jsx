import { useState } from 'react';
import { ArrowRight, Heart, LoaderCircle, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === 'signup' && !result.data.session) setMessage('Check your inbox to confirm your email, then come back and sign in.');
  }

  return <div className="auth-shell">
    <section className="auth-story">
      <a className="brand auth-brand" href="/"><span className="brand-mark"><Heart size={18} fill="currentColor" /></span><span>duet</span></a>
      <div className="auth-quote"><span className="pill"><Sparkles size={14}/> Made for two</span><h1>One cozy place for<br/>the life you share.</h1><p>Plans, little wishes, and the moments you never want to forget.</p></div>
      <div className="auth-orbit" aria-hidden="true"><Heart fill="currentColor"/></div>
    </section>
    <main className="auth-form-wrap">
      <div className="auth-form-card">
        <p className="eyebrow">Welcome to your space</p>
        <h2>{mode === 'signin' ? 'Come back to us.' : 'Start your duet.'}</h2>
        <p className="form-intro">{mode === 'signin' ? 'Sign in to see what you two have planned.' : 'Create your account first. You can invite your partner next.'}</p>
        <form onSubmit={submit}>
          {mode === 'signup' && <label>Your name<span className="input-wrap"><Heart size={17}/><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required placeholder="What should we call you?"/></span></label>}
          <label>Email address<span className="input-wrap"><Mail size={17}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com"/></span></label>
          <label>Password<span className="input-wrap"><LockKeyhole size={17}/><input type="password" minLength="8" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required placeholder="At least 8 characters"/></span></label>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={19}/> : <>{mode === 'signin' ? 'Sign in' : 'Create my account'}<ArrowRight size={18}/></>}</button>
        </form>
        <button className="mode-toggle" onClick={()=>{setMode(mode === 'signin' ? 'signup' : 'signin');setMessage('')}}>{mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
      </div>
    </main>
  </div>;
}
