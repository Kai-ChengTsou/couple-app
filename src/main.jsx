import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Gift,
  Copy, Heart, Home, Plus, RefreshCw, Settings2, Sparkles, Star
} from 'lucide-react';
import './styles.css';
import QuickStart from './components/QuickStart';
import CoupleSetup from './components/CoupleSetup';
import CalendarPage from './components/CalendarPage';
import WishlistPage from './components/WishlistPage';
import OurSpacePage from './components/OurSpacePage';
import SettingsPage from './components/SettingsPage';
import CountdownPanel from './components/CountdownPanel';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { useDuetData } from './hooks/useDuetData';

const nav = [
  ['home', '首頁', Home], ['calendar', '行事曆', CalendarDays],
  ['wishlist', '願望清單', Star], ['us', '我們', Heart]
];
const wishCategoryLabels = {'date idea':'約會',place:'地點',trip:'旅行',gift:'禮物',food:'美食',movie:'電影','shared purchase':'共同購買'};
const wishStatusLabels = {idea:'想法',accepted:'已答應',planned:'已計畫',completed:'已完成'};
const eventCategoryLabels = {date:'約會',personal:'個人',work:'工作',family:'家庭',friends:'朋友',anniversary:'紀念日'};
const eventScopeLabels = {shared:'共同安排'};
const themeCanvas = {blush:'#f8f4f0',tiffany:'#f0f8f7',midnight:'#f1f4f9',sky:'#f2f8fb',lilac:'#f7f3f8',cherry:'#faf3f5',sage:'#f3f7f3',sunset:'#faf4ef',latte:'#f6f1eb',butter:'#faf7ed'};

function storedTheme(userId, fallback = 'blush') {
  try {
    const saved = localStorage.getItem(`duet-theme:${userId}`) || localStorage.getItem('duet-theme');
    return themeCanvas[saved] ? saved : (themeCanvas[fallback] ? fallback : 'blush');
  } catch { return themeCanvas[fallback] ? fallback : 'blush'; }
}

function applySystemTheme(theme) {
  const color = themeCanvas[theme] || themeCanvas.blush;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.setProperty('--launch-canvas', color);
  document.body.style.backgroundColor = color;
}

function App({ user = null, duet = null }) {
  const [theme, setTheme] = useState(() => storedTheme(user?.id, duet?.profile?.theme));
  const initialParams=new URLSearchParams(window.location.search);
  const [active, setActive] = useState(initialParams.get('open')==='calendar'?'calendar':'home');
  const [calendarTarget,setCalendarTarget]=useState(initialParams.get('date'));
  const [toast, setToast] = useState('');
  const [pullDistance,setPullDistance]=useState(0);
  const [refreshing,setRefreshing]=useState(false);
  const pullStart=useRef(null),pullValue=useRef(0),themeSaveQueue=useRef(Promise.resolve());
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>window.clearInterval(timer);},[]);
  const today = useMemo(() => new Intl.DateTimeFormat('zh-TW', { weekday: 'long', month: 'long', day: 'numeric' }).format(now), [now]);
  const hour=now.getHours();
  const greeting=hour>=5&&hour<11?'早安':hour>=11&&hour<14?'午安':hour>=14&&hour<18?'下午好':hour>=18&&hour<23?'晚安':'夜深了';
  const displayName = duet?.profile?.display_name || '你';
  const firstName = displayName.split(' ')[0];
  const memberNames = Object.fromEntries((duet?.members || []).map(member => [member.user_id, member.profile?.display_name || '成員']));
  const memberTones = Object.fromEntries((duet?.members || []).map((member,index) => [member.user_id,index%2===0?'avatar-b':'avatar-a']));
  const liveSchedule = (duet?.events || []).filter(event => new Date(event.starts_at) >= new Date()).slice(0, 3).map(event => {
    const date = new Date(event.starts_at);
    const creatorName=memberNames[event.created_by] || (event.created_by===user?.id ? displayName : '另一半');
    const scopeLabel=event.event_scope==='personal'?(event.created_by===user?.id?'我的行程':`${creatorName} 的行程`):eventScopeLabels.shared;
    return { id:event.id, dateKey:date.toLocaleDateString('en-CA'), day: String(date.getDate()).padStart(2, '0'), month: date.toLocaleString('zh-TW', {month:'short'}), title:event.title, time:date.toLocaleTimeString('zh-TW',{hour:'numeric',minute:'2-digit'}), creatorName, creatorTone:memberTones[event.created_by]||'avatar-a', category:event.category||'date', categoryLabel:eventCategoryLabels[event.category]||'其他', scopeLabel, icon:CalendarDays };
  });
  const liveWishes = (duet?.wishes || []).slice(0, 3).map((wish, index) => ({ id:wish.id, title:wish.title, meta:`${wishCategoryLabels[wish.category]||wish.category} · ${wishStatusLabels[wish.status]||wish.status}`, tone:['forest','coral','sky'][index%3], icon:Star }));
  const coupleName = duet?.couple?.name || '我們的空間';
  const inviteCode = duet?.couple?.invite_code;

  useEffect(() => {
    applySystemTheme(theme);
    try {
      localStorage.setItem('duet-theme', theme);
      if (user?.id) localStorage.setItem(`duet-theme:${user.id}`, theme);
    } catch {}
  }, [theme, user?.id]);

  async function changeTheme(nextTheme) {
    if (!themeCanvas[nextTheme]) return;
    setTheme(nextTheme);
    applySystemTheme(nextTheme);
    try {
      localStorage.setItem('duet-theme', nextTheme);
      if (user?.id) localStorage.setItem(`duet-theme:${user.id}`, nextTheme);
    } catch {}
    if (user && supabase) {
      themeSaveQueue.current = themeSaveQueue.current.catch(() => {}).then(async () => {
        const { error } = await supabase.from('profiles').update({ theme: nextTheme }).eq('id', user.id);
        if (error) throw error;
      });
      try { await themeSaveQueue.current; }
      catch { notify('主題已保存在這台裝置，雲端同步稍後再試'); }
    }
  }

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  async function copyInvite() {
    const inviteUrl = `${window.location.origin}/?invite=${inviteCode}`;
    await navigator.clipboard.writeText(inviteUrl);
    notify('已複製伴侶邀請連結');
  }

  function updatePull(value){pullValue.current=value;setPullDistance(value);}
  function handleTouchStart(event){
    if(refreshing||window.scrollY>1||event.target.closest('.modal-backdrop,input,textarea,select'))return;
    pullStart.current=event.touches[0].clientY;
  }
  function handleTouchMove(event){
    if(pullStart.current===null)return;
    const movement=event.touches[0].clientY-pullStart.current;
    updatePull(movement>0?Math.min(96,movement*.46):0);
  }
  async function handleTouchEnd(){
    pullStart.current=null;
    if(pullValue.current<68)return updatePull(0);
    setRefreshing(true);updatePull(56);
    try{await duet?.refresh?.();setNow(new Date());}
    finally{window.setTimeout(()=>{setRefreshing(false);updatePull(0);},450);}
  }

  return (
    <div className={`app theme-${theme} ${active === 'settings' ? 'settings-active' : ''}`} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={()=>{pullStart.current=null;updatePull(0)}}>
      <div className={`pull-refresh ${pullDistance>2||refreshing?'visible':''} ${refreshing?'refreshing':''}`} style={{transform:`translate(-50%, ${pullDistance-56}px)`}} role="status" aria-live="polite"><RefreshCw size={17}/><span>{refreshing?'正在更新…':pullDistance>=68?'放開即可更新':'下拉重新整理'}</span></div>
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#home" onClick={() => setActive('home')} aria-label="Duet home">
          <span className="brand-mark"><Heart size={18} fill="currentColor" /></span>
          <span>duet</span>
        </a>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button key={id} className={active === id ? 'nav-item active' : 'nav-item'} onClick={() => setActive(id)}>
              <Icon size={20} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="couple-mini">
            <div className="avatar avatar-a">{firstName.slice(0,1).toUpperCase()}</div><div className="avatar avatar-b"><Heart size={11} fill="currentColor"/></div>
            <div><strong>{coupleName}</strong><small>{inviteCode ? `邀請碼 · ${inviteCode}` : '私人共同空間'}</small></div>
          </div>
          {inviteCode&&<button className="copy-invite" onClick={copyInvite}><Copy size={15}/>複製伴侶邀請</button>}
          <button className={active === 'settings' ? 'nav-item active' : 'nav-item'} onClick={()=>setActive('settings')}><Settings2 size={20} /><span>設定</span></button>
        </div>
      </aside>

      <main>
        <div className={`page-transition transition-${active}`} key={active}>
        {active === 'calendar' ? <CalendarPage initialDate={calendarTarget} events={duet?.events || []} members={duet?.members || []} couple={duet?.couple} user={user} onRefresh={duet?.refresh || (()=>{})} onNotify={notify}/>
        : active === 'wishlist' ? <WishlistPage items={duet?.wishes || []} members={duet?.members || []} couple={duet?.couple} user={user} onRefresh={duet?.refresh || (()=>{})} onNotify={notify}/>
        : active === 'us' ? <OurSpacePage memories={duet?.memories || []} tasks={duet?.tasks || []} couple={duet?.couple} user={user} onRefresh={duet?.refresh || (()=>{})} onNotify={notify}/>
        : active === 'settings' ? <SettingsPage members={duet?.members || []} couple={duet?.couple} user={user} theme={theme} onRefresh={duet?.refresh || (()=>{})} onNotify={notify} onTheme={changeTheme}/>
        : <>
        <header className="topbar">
          <div><p className="eyebrow">{today}</p><h1>{greeting}，{firstName}。</h1></div>
        </header>

        <section className="hero-card">
          <div className="hero-copy">
            <span className="pill"><Sparkles size={14} /> 屬於你們的小天地</span>
            <h2>一起規劃生活，<br />每一天都更<em>輕鬆。</em></h2>
            <p>{liveSchedule.length ? `接下來有 ${liveSchedule.length} 件事情，正等著你們一起完成。` : '目前沒有安排，新增第一個值得期待的計畫吧。'}</p>
            <button onClick={() => setActive('calendar')}>看看這一週 <ChevronRight size={17} /></button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
            <div className="moon"><Heart fill="currentColor" /></div>
            <span className="spark s1"/><span className="spark s2"/><span className="spark s3"/>
            {liveSchedule[0]&&<div className="note-card"><span>下一個行程</span><strong>{liveSchedule[0].month} {liveSchedule[0].day} · {liveSchedule[0].time}</strong></div>}
          </div>
        </section>

        <section className="content-grid">
          <div className="panel schedule-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">接下來</p><h3>我們的行程</h3></div>
              <button className="text-button" onClick={() => setActive('calendar')}>完整行事曆 <ChevronRight size={16}/></button>
            </div>
            <div className="schedule-list">
              {liveSchedule.map(({id,dateKey,day,month,title,time,creatorName,creatorTone,category,categoryLabel,scopeLabel,icon:Icon}) => (
                <button className="event-row" key={id} onClick={() => {setCalendarTarget(dateKey);setActive('calendar');window.scrollTo({top:0,behavior:'smooth'})}}>
                  <div className="date-tile"><strong>{day}</strong><span>{month}</span></div>
                  <div className={`event-icon category-${category}`}><Icon size={18}/></div>
                  <div className="event-copy"><strong>{title}</strong><span><Clock3 size={14}/>{time}</span><small><b className={`category-text category-${category}`}>{categoryLabel}</b> · {scopeLabel} · 由 {creatorName} 建立</small></div>
                  <div className="owner-dots" aria-label={`由 ${creatorName} 建立`}><i className={`avatar ${creatorTone}`}>{creatorName.slice(0,1).toUpperCase()}</i></div>
                  <ChevronRight className="row-arrow" size={18}/>
                </button>
              ))}
              {!liveSchedule.length&&<div className="home-empty"><CalendarDays size={22}/><span><strong>還沒有即將到來的行程</strong><small>建立你們的第一個共同計畫。</small></span></div>}
            </div>
            <button className="outline-button" onClick={() => setActive('calendar')}><Plus size={18}/> 新增行程</button>
          </div>

          <aside className="right-stack">
            <CountdownPanel items={duet?.countdowns||[]} couple={duet?.couple} user={user} onRefresh={duet?.refresh||(()=>{})} onNotify={notify}/>
            <div className="panel wish-panel">
              <div className="panel-heading"><div><p className="eyebrow">總有一天</p><h3>我們的願望</h3></div><span className="count">{duet?.wishes?.length || 0} 個想法</span></div>
              <div className="wish-list">
                {liveWishes.map(({id,title,meta,tone,icon:Icon}) => (
                  <button className="wish-row" key={id} onClick={() => setActive('wishlist')}>
                    <span className={`wish-icon ${tone}`}><Icon size={19}/></span>
                    <span><strong>{title}</strong><small>{meta}</small></span>
                    <Heart className="wish-heart" size={18}/>
                  </button>
                ))}
                {!liveWishes.length&&<div className="home-empty"><Gift size={22}/><span><strong>願望清單還是空的</strong><small>收藏想一起完成的小夢想。</small></span></div>}
              </div>
              <button className="text-button wide" onClick={() => setActive('wishlist')}>打開願望清單 <ChevronRight size={16}/></button>
            </div>
          </aside>
        </section>
        </>}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0,4).map(([id,label,Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={21}/><span>{label}</span></button>)}
        <button className={active === 'settings' ? 'active' : ''} onClick={()=>setActive('settings')}><Settings2 size={21}/><span>設定</span></button>
      </nav>

      {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    </div>
  );
}

function ConnectedApp({ user }) {
  const duet = useDuetData(user);
  if (duet.loading) return <div className="loading-screen"><Heart fill="currentColor"/><p>正在打開你們的小天地…</p></div>;
  if (!duet.couple) return <CoupleSetup onReady={duet.refresh}/>;
  return <App user={user} duet={duet}/>;
}

function Root() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);
  const setupStartedAt = Number(sessionStorage.getItem('duet-setup-pending') || 0);
  const setupPending = Boolean(session && setupStartedAt && Date.now() - setupStartedAt < 120000);
  if (!ready || setupPending) return <div className="loading-screen"><Heart fill="currentColor"/><p>{setupPending?'正在建立你們的小天地…':'正在打開你們的小天地…'}</p></div>;
  if (!isSupabaseConfigured) return <div className="loading-screen"><Heart fill="currentColor"/><p>尚未連接 Supabase，請先設定環境變數。</p></div>;
  if (!session) return <QuickStart/>;
  return <ConnectedApp user={session.user}/>;
}

createRoot(document.getElementById('root')).render(<Root />);
