import { useMemo, useState } from 'react';
import { Check, ExternalLink, Film, Gift, Heart, LoaderCircle, MapPin, Pencil, Plane, Plus, Search, ShoppingBag, Sparkles, Trash2, Utensils, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const blank={title:'',category:'date idea',url:'',estimated_price:'',status:'idea',notes:''};
const categoryMeta={
  'date idea':{label:'約會',tone:'rose',Icon:Heart},place:{label:'地點',tone:'sky',Icon:MapPin},trip:{label:'旅行',tone:'sage',Icon:Plane},
  gift:{label:'禮物',tone:'lilac',Icon:Gift},food:{label:'美食',tone:'apricot',Icon:Utensils},movie:{label:'電影',tone:'navy',Icon:Film},
  'shared purchase':{label:'共同購買',tone:'gold',Icon:ShoppingBag}
};
const statusLabels={idea:'想法',planned:'已計畫',completed:'已完成'};

export default function WishlistPage({items,couple,user,onRefresh,onNotify}){
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState(blank),[formOpen,setFormOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const shown=useMemo(()=>items.filter(x=>(filter==='all'||x.status===filter)&&x.title.toLowerCase().includes(query.toLowerCase())),[items,filter,query]);
  const completed=items.filter(item=>item.status==='completed').length;
  const planned=items.filter(item=>item.status==='planned').length;
  const progress=items.length?Math.round(completed/items.length*100):0;
  function open(item=null){setEditing(item);setError('');setForm(item?{title:item.title,category:item.category,url:item.url||'',estimated_price:item.estimated_price||'',status:item.status,notes:item.notes||''}:{...blank});setFormOpen(true)}
  function close(){setFormOpen(false);setEditing(null);setForm({...blank});setError('')}
  async function save(e){e.preventDefault();if(!supabase||!couple||!user)return setError('目前無法連接資料庫。');setSaving(true);setError('');const payload={...form,title:form.title.trim(),estimated_price:form.estimated_price?Number(form.estimated_price):null,url:form.url.trim()||null,notes:form.notes.trim()||null};const r=editing?await supabase.from('wishlist_items').update(payload).eq('id',editing.id):await supabase.from('wishlist_items').insert({...payload,couple_id:couple.id,created_by:user.id});setSaving(false);if(r.error)return setError(r.error.message);const wasEditing=Boolean(editing);close();await onRefresh();onNotify(wasEditing?'願望已更新':'願望已新增')}
  async function remove(){if(!editing)return;setSaving(true);setError('');const r=await supabase.from('wishlist_items').delete().eq('id',editing.id);setSaving(false);if(r.error)return setError(r.error.message);close();await onRefresh();onNotify('願望已刪除')}
  return <section className="feature-page wishlist-page">
    <header className="page-title-row"><div><p className="eyebrow">總有一天</p><h1>我們的願望清單</h1><p>收藏想一起去的地方、想要的禮物和小小冒險。</p></div><button className="add-button" onClick={()=>open()}><Plus size={19}/>新增願望</button></header>
    <section className="wishlist-overview">
      <div className="wishlist-overview-copy"><span><Sparkles size={23}/></span><div><small>我們想一起完成</small><strong>{items.length} 個願望</strong><p>{items.length?'每一個想法，都是未來的一段故事。':'先收藏第一個想一起實現的小願望。'}</p></div></div>
      <div className="wishlist-stats"><span><b>{items.length-completed-planned}</b><small>靈感</small></span><span><b>{planned}</b><small>計畫中</small></span><span><b>{completed}</b><small>已完成</small></span></div>
      <div className="wishlist-progress"><span><i style={{width:`${progress}%`}}/></span><small>{progress}% 的願望已成真</small></div>
    </section>
    <div className="filter-bar"><label><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋我們的想法"/></label><div>{[['all','全部'],['idea','想法'],['planned','已計畫'],['completed','已完成']].map(([v,label])=><button key={v} className={filter===v?'selected':''} onClick={()=>setFilter(v)}>{label}</button>)}</div></div>
    {shown.length?<div className="wish-grid">{shown.map((item,i)=>{const meta=categoryMeta[item.category]||categoryMeta.gift;const Icon=meta.Icon;return <article className={`wish-card wish-${meta.tone} ${item.status==='completed'?'completed':''}`} key={item.id}>
      <button className="wish-edit" aria-label={`編輯 ${item.title}`} onClick={()=>open(item)}><Pencil size={16}/></button>
      <span className={`wish-card-art wish-art-${meta.tone}`}><small>{String(i+1).padStart(2,'0')}</small><Icon size={31}/><b>{meta.label}</b></span>
      <div className="wish-card-body"><div className="wish-card-topline"><span className="wish-category">{meta.label}</span><em className={item.status}>{item.status==='completed'?<Check size={12}/>:<Sparkles size={12}/>} {statusLabels[item.status]||item.status}</em></div><h2>{item.title}</h2>{item.notes&&<p>{item.notes}</p>}<footer><strong>{item.estimated_price?`NT$${Number(item.estimated_price).toLocaleString()}`:'無價的想法'}</strong>{item.url&&<a href={item.url} target="_blank" rel="noreferrer" aria-label={`開啟 ${item.title} 的連結`}><ExternalLink size={14}/></a>}</footer></div>
    </article>})}</div>:<div className="big-empty"><span><Heart size={28}/></span><h2>{items.length?'找不到符合的願望':'還沒有願望'}</h2><p>{items.length?'試試其他關鍵字或篩選條件。':'可以從餐廳、週末旅行，或一份想收到的禮物開始。'}</p>{!items.length&&<button onClick={()=>open()}><Plus size={17}/>新增第一個願望</button>}</div>}
    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="modal event-modal"><button className="icon-button close" onClick={close} aria-label="關閉"><X size={20}/></button><p className="eyebrow">一個小小夢想</p><h2>{editing?'編輯願望':'想一起完成什麼？'}</h2><form className="event-form" onSubmit={save}><label className="full">願望名稱<input required maxLength="160" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="地點、禮物或約會靈感"/></label><label>類別<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(categoryMeta).map(([v,m])=><option key={v} value={v}>{m.label}</option>)}</select></label><label>狀態<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>預估價格<input type="number" min="0" step="1" value={form.estimated_price} onChange={e=>setForm({...form,estimated_price:e.target.value})} placeholder="選填"/></label><label>連結<input type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://"/></label><label className="full">備註<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="為什麼想收藏它？"/></label>{error&&<p className="auth-message full">{error}</p>}<div className="event-form-actions full">{editing&&<button type="button" className="delete-button" onClick={remove} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={close}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><Check size={17}/>儲存願望</>}</button></div></form></section></div>}
  </section>
}
