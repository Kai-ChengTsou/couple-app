import { useMemo, useState } from 'react';
import { CalendarClock, Check, Heart, LoaderCircle, Pencil, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PickerField from './PickerField';

const blank={title:'',target_date:new Date().toLocaleDateString('en-CA'),repeats_yearly:false};

function localDate(value){return new Date(`${value}T12:00:00`);}
function resolvedDate(item){
  const original=localDate(item.target_date);
  if(!item.repeats_yearly)return original;
  const today=new Date();today.setHours(0,0,0,0);
  const next=new Date(today.getFullYear(),original.getMonth(),original.getDate(),12);
  if(next<today)next.setFullYear(next.getFullYear()+1);
  return next;
}
function daysUntil(date){const today=new Date();today.setHours(0,0,0,0);const target=new Date(date);target.setHours(0,0,0,0);return Math.round((target-today)/86400000);}
function dayCopy(days){if(days===0)return '就是今天';if(days===1)return '明天';if(days>1)return `還有 ${days} 天`;return `已過 ${Math.abs(days)} 天`;}

export default function CountdownPanel({items,couple,user,onRefresh,onNotify}){
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(blank),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const allItems=useMemo(()=>{
    const anniversary=couple?.anniversary?[{id:'couple-anniversary',title:'我們的紀念日',target_date:couple.anniversary,repeats_yearly:true,system:true}]:[];
    return [...anniversary,...(items||[])].map(item=>({...item,resolved:resolvedDate(item)})).sort((a,b)=>{
      const aDays=daysUntil(a.resolved),bDays=daysUntil(b.resolved);
      if(aDays>=0&&bDays<0)return -1;if(aDays<0&&bDays>=0)return 1;return a.resolved-b.resolved;
    });
  },[items,couple?.anniversary]);
  const shown=allItems.slice(0,3);
  const togetherDays=couple?.anniversary?1-daysUntil(localDate(couple.anniversary)):null;
  function show(item=null){setEditing(item);setForm(item?{title:item.title,target_date:item.target_date,repeats_yearly:item.repeats_yearly}:{...blank});setError('');setOpen(true);}
  function close(){setOpen(false);setEditing(null);setError('');}
  async function save(event){event.preventDefault();setSaving(true);setError('');const payload={title:form.title.trim(),target_date:form.target_date,repeats_yearly:form.repeats_yearly};const result=editing?await supabase.from('countdowns').update(payload).eq('id',editing.id):await supabase.from('countdowns').insert({...payload,couple_id:couple.id,created_by:user.id});setSaving(false);if(result.error)return setError(result.error.message);close();await onRefresh();onNotify(editing?'倒數日已更新':'倒數日已新增');}
  async function remove(){setSaving(true);const result=await supabase.from('countdowns').delete().eq('id',editing.id);setSaving(false);if(result.error)return setError(result.error.message);close();await onRefresh();onNotify('倒數日已刪除');}
  return <section className="panel countdown-panel">
    <div className="panel-heading"><div><p className="eyebrow">一起期待</p><h3>重要倒數</h3></div><button className="icon-button countdown-add" aria-label="新增倒數日" onClick={()=>show()}><Plus size={18}/></button></div>
    {togetherDays!==null&&<div className="together-card"><span><Heart fill="currentColor" size={19}/></span><div><small>我們在一起</small>{togetherDays>0?<strong>第 <b>{togetherDays.toLocaleString()}</b> 天</strong>:<strong>還有 <b>{Math.abs(togetherDays)+1}</b> 天開始</strong>}<em>從 {localDate(couple.anniversary).toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric'})} 開始</em></div></div>}
    {shown.length?<div className="countdown-list">{shown.map((item,index)=>{const days=daysUntil(item.resolved);return <button key={item.id} className={`countdown-row tone-${index%3}`} onClick={()=>!item.system&&show(item)}><span className="countdown-number">{days===0?'今':Math.abs(days)}</span><span><strong>{item.title}</strong><small>{item.resolved.toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric'})}{item.repeats_yearly&&<><Repeat2 size={11}/>每年</>}</small></span><b>{dayCopy(days)}</b>{!item.system&&<Pencil size={14}/>}</button>})}</div>:<button className="countdown-empty" onClick={()=>show()}><CalendarClock size={22}/><span><strong>新增值得期待的日子</strong><small>旅行、生日或下一個特別約會</small></span></button>}
    {open&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&close()}><section className="modal countdown-modal" role="dialog" aria-modal="true"><button className="icon-button close" aria-label="關閉" onClick={close}><X size={20}/></button><p className="eyebrow">值得期待的日子</p><h2>{editing?'編輯倒數':'新增倒數'}</h2><form className="event-form" onSubmit={save}><label className="full">名稱<input required maxLength="100" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="生日、旅行、特別約會…"/></label><label className="full">日期<PickerField type="date" required value={form.target_date} onChange={event=>setForm({...form,target_date:event.target.value})} ariaLabel="倒數日期"/></label><label className="full repeat-toggle"><input type="checkbox" checked={form.repeats_yearly} onChange={event=>setForm({...form,repeats_yearly:event.target.checked})}/><span><strong>每年重複</strong><small>適合生日、週年或固定節日</small></span></label>{error&&<p className="auth-message full" role="alert">{error}</p>}<div className="event-form-actions full">{editing&&<button type="button" className="delete-button" onClick={remove} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={close}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><Check size={17}/>儲存</>}</button></div></form></section></div>}
  </section>;
}
