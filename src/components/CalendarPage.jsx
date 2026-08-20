import { useMemo, useState } from 'react';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Eye,
  EyeOff, Heart, LoaderCircle, MapPin, Pencil, Plus, Sparkles, Trash2, UserRound, Users, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PickerField from './PickerField';

const categories = [['date','約會'],['personal','個人'],['work','工作'],['family','家庭'],['friends','朋友'],['anniversary','紀念日']];
const categoryLabels = Object.fromEntries(categories);
const visibilityLabels = { shared:'兩人都看得到', private:'只有我看得到', surprise:'驚喜' };
const scopeLabels = { shared:'共同安排' };
const emptyForm = { title:'', date:'', time:'19:00', endTime:'', location:'', notes:'', category:'date', eventScope:'shared', visibility:'shared', reminderMinutes:'' };
const lunarDateFormatter = new Intl.DateTimeFormat('zh-TW-u-ca-chinese',{month:'numeric',day:'numeric'});
const annualHolidays = {
  '01-01': ['新年第一天','一起迎接新的一年。'],
  '02-14': ['西洋情人節','留一點時間給彼此。'],
  '03-14': ['白色情人節','回應心意的甜蜜日子。'],
  '05-20': ['520 告白日','把喜歡大聲說出來。'],
  '12-24': ['平安夜','一起度過溫暖的夜晚。'],
  '12-25': ['聖誕節','交換祝福與小驚喜。'],
  '12-31': ['跨年夜','一起倒數迎接明年。'],
};

function holidayForDate(date,couple){
  const monthDay=`${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const holidays=[];
  if(annualHolidays[monthDay])holidays.push({id:`holiday-${monthDay}`,title:annualHolidays[monthDay][0],description:annualHolidays[monthDay][1],isHoliday:true});
  const lunarParts=Object.fromEntries(lunarDateFormatter.formatToParts(date).filter(part=>part.type==='month'||part.type==='day').map(part=>[part.type,part.value]));
  if(Number(lunarParts.month)===7&&Number(lunarParts.day)===7)holidays.push({id:`qixi-${date.getFullYear()}`,title:'七夕情人節',description:'屬於彼此的浪漫日子。',isHoliday:true});
  if(couple?.anniversary){
    const anniversary=String(couple.anniversary).slice(5,10);
    if(anniversary===monthDay)holidays.push({id:`anniversary-${monthDay}`,title:'我們的紀念日',description:'記得一起慶祝這個重要的日子。',isHoliday:true});
  }
  return holidays;
}

function toForm(event) {
  const starts = new Date(event.starts_at);
  const ends = event.ends_at ? new Date(event.ends_at) : null;
  const localDate = new Date(starts.getTime() - starts.getTimezoneOffset()*60000).toISOString();
  return { title:event.title, date:localDate.slice(0,10), time:localDate.slice(11,16), endTime:ends ? new Date(ends.getTime()-ends.getTimezoneOffset()*60000).toISOString().slice(11,16) : '', location:event.location||'', notes:event.notes||'', category:event.category||'date', eventScope:event.event_scope||'shared', visibility:event.visibility||'shared', reminderMinutes:event.reminder_minutes?String(event.reminder_minutes):'' };
}

export default function CalendarPage({ initialDate, events, members, couple, user, onRefresh, onNotify }) {
  const startingDate=()=>initialDate?new Date(`${initialDate}T12:00:00`):new Date();
  const [cursor, setCursor] = useState(startingDate);
  const [selectedDate, setSelectedDate] = useState(startingDate);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const monthLabel = cursor.toLocaleDateString('zh-TW', {month:'long',year:'numeric'});
  const days = useMemo(() => {
    const year=cursor.getFullYear(), month=cursor.getMonth();
    const first=new Date(year,month,1), start=new Date(year,month,1-first.getDay());
    return Array.from({length:42},(_,i)=>{const date=new Date(start);date.setDate(start.getDate()+i);return date;});
  },[cursor]);
  const byDate = useMemo(() => events.reduce((map,event)=>{
    const key=new Date(event.starts_at).toLocaleDateString('en-CA');
    (map[key] ||= []).push(event); return map;
  },{}),[events]);
  const selectedKey=selectedDate.toLocaleDateString('en-CA');
  const selectedEvents=(byDate[selectedKey]||[]).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
  const selectedHolidays=holidayForDate(selectedDate,couple);
  const memberNames=Object.fromEntries((members||[]).map(member=>[member.user_id,member.profile?.display_name||'成員']));
  const creatorName=item=>memberNames[item.created_by]||(item.created_by===user?.id?'你':'另一半');
  const scopeName=item=>item.event_scope==='personal'?(item.created_by===user?.id?'我的行程':`${creatorName(item)} 的行程`):scopeLabels.shared;

  function moveMonth(amount){setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+amount,1));}
  function openNew(date=selectedDate){setEditing(null);setError('');setForm({...emptyForm,date:date.toLocaleDateString('en-CA')});}
  function openEdit(event){setEditing(event);setError('');setForm(toForm(event));}
  function close(){setEditing(null);setForm(emptyForm);setError('');}
  const formOpen=Boolean(form.date);

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const startsAt=new Date(`${form.date}T${form.time}`).toISOString();
    const endsAt=form.endTime ? new Date(`${form.date}T${form.endTime}`).toISOString() : null;
    if(endsAt && new Date(endsAt)<=new Date(startsAt)){setSaving(false);return setError('結束時間必須晚於開始時間。');}
    const payload={title:form.title.trim(),starts_at:startsAt,ends_at:endsAt,location:form.location.trim()||null,notes:form.notes.trim()||null,category:form.category,event_scope:form.eventScope,visibility:form.visibility,reminder_minutes:form.reminderMinutes?Number(form.reminderMinutes):null,reminder_sent_at:null};
    if(!supabase || !user || !couple){setSaving(false);return setError('目前無法連接資料庫。');}
    const result=editing
      ? await supabase.from('events').update(payload).eq('id',editing.id)
      : await supabase.from('events').insert({...payload,couple_id:couple.id,created_by:user.id});
    setSaving(false);
    if(result.error)return setError(result.error.message);
    const wasEditing=Boolean(editing); close(); await onRefresh(); onNotify(wasEditing?'行程已更新':'行程已新增');
  }

  async function remove() {
    if(!editing || !supabase)return;
    setSaving(true); const {error:deleteError}=await supabase.from('events').delete().eq('id',editing.id); setSaving(false);
    if(deleteError)return setError(deleteError.message);
    close(); await onRefresh(); onNotify('行程已刪除');
  }

  return <section className="calendar-page">
    <header className="page-title-row">
      <div><p className="eyebrow">兩個人的時光</p><h1>我們的行事曆</h1><p>收藏每個值得期待的約會、行程與悠閒夜晚。</p></div>
      <button className="add-button" onClick={()=>openNew()}><Plus size={19}/>新增行程</button>
    </header>
    <div className="calendar-layout">
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <div><button className="icon-button" aria-label="上個月" onClick={()=>moveMonth(-1)}><ChevronLeft size={19}/></button><button className="today-button" onClick={()=>{setCursor(new Date());setSelectedDate(new Date())}}>今天</button><button className="icon-button" aria-label="下個月" onClick={()=>moveMonth(1)}><ChevronRight size={19}/></button></div>
          <h2>{monthLabel}</h2><span className="calendar-legend"><span><i className="plan-dot"/>有安排</span><span><i className="holiday-dot"/>節日</span></span>
        </div>
        <div className="weekday-row">{['日','一','二','三','四','五','六'].map(day=><span key={day}>{day}</span>)}</div>
        <div className="month-grid">
          {days.map(date=>{
            const key=date.toLocaleDateString('en-CA'), dayEvents=byDate[key]||[], inMonth=date.getMonth()===cursor.getMonth(), isToday=key===new Date().toLocaleDateString('en-CA'), selected=key===selectedKey;
            const dayHolidays=holidayForDate(date,couple), cellItems=[...dayHolidays,...dayEvents];
            const statusLabel=[dayEvents.length&&`${dayEvents.length} 個安排`,dayHolidays.length&&dayHolidays.map(item=>item.title).join('、')].filter(Boolean).join('，');
            return <button key={key} aria-label={`${date.toLocaleDateString('zh-TW')}${statusLabel?`，${statusLabel}`:''}`} className={`calendar-day ${!inMonth?'muted-day':''} ${isToday?'today':''} ${selected?'selected':''} ${dayEvents.length?'has-events':''} ${dayHolidays.length?'has-holiday':''}`} onClick={()=>setSelectedDate(date)} onDoubleClick={()=>openNew(date)}>
              <span className="day-number">{date.getDate()}</span>
              {cellItems.length>0&&<span className="day-status-icons" aria-hidden="true">{dayEvents.length>0&&<CalendarDays/>}{dayHolidays.length>0&&<Sparkles/>}</span>}
              <span className="day-events">{cellItems.slice(0,3).map(item=><i key={item.id} className={`event-chip ${item.isHoliday?'holiday':`category-${item.category}`}`}>{!item.isHoliday&&<span>{new Date(item.starts_at).toLocaleTimeString('zh-TW',{hour:'numeric'})}</span>}{item.title}</i>)}{cellItems.length>3&&<small>還有 {cellItems.length-3} 項</small>}</span>
            </button>;
          })}
        </div>
      </div>
      <aside className="day-agenda panel">
        <div className="agenda-date"><span>{selectedDate.toLocaleDateString('en',{weekday:'long'})}</span><strong>{selectedDate.getDate()}</strong><small>{selectedDate.toLocaleDateString('en',{month:'long',year:'numeric'})}</small></div>
        <div className="agenda-heading"><h3>當天的安排</h3><button className="icon-button" aria-label="新增當日行程" onClick={()=>openNew(selectedDate)}><Plus size={18}/></button></div>
        {(selectedEvents.length||selectedHolidays.length) ? <div className="agenda-list">{selectedHolidays.map(item=><article className="agenda-event holiday-event" key={item.id}>
          <i className="agenda-line holiday"/><span><strong>{item.title}</strong><small>{item.description}</small><em><Heart size={12}/> 特別節日</em></span><Heart size={15}/>
        </article>)}{selectedEvents.map(item=><button className="agenda-event" key={item.id} onClick={()=>openEdit(item)}>
          <i className={`agenda-line ${item.category}`}/><span><strong>{item.title}</strong><span className="event-tags"><b className={`category-badge category-${item.category}`}>{categoryLabels[item.category]||'其他'}</b><b className="scope-badge">{scopeName(item)}</b></span><small><Clock3 size={13}/>{new Date(item.starts_at).toLocaleTimeString('zh-TW',{hour:'numeric',minute:'2-digit'})}{item.location&&<><MapPin size={13}/>{item.location}</>}</small><small className="event-creator"><UserRound size={12}/>由 {creatorName(item)} 建立</small><em>{item.visibility==='shared'?<Eye size={12}/>:item.visibility==='surprise'?<Sparkles size={12}/>:<EyeOff size={12}/>} {visibilityLabels[item.visibility]||item.visibility}</em></span><Pencil size={15}/>
        </button>)}</div>:<div className="agenda-empty"><span><CalendarDays size={25}/></span><strong>今天還沒有安排</strong><p>新增一個計畫，或留白給意想不到的美好。</p><button onClick={()=>openNew(selectedDate)}><Plus size={16}/>新增計畫</button></div>}
      </aside>
    </div>

    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}>
      <section className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <button className="icon-button close" aria-label="Close" onClick={close}><X size={20}/></button>
        <p className="eyebrow">{editing?'調整一下':'一起安排'}</p><h2 id="event-form-title">{editing?'編輯行程':'新增到行事曆'}</h2>
        <form className="event-form" onSubmit={save}>
          <label className="full">行程名稱<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required maxLength="120" placeholder="晚餐、電影夜、約會…"/></label>
          <label>日期<PickerField type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required ariaLabel="日期"/></label>
          <label>開始時間<PickerField type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required ariaLabel="開始時間"/></label>
          <label><span className="field-label">結束時間 <small>選填</small></span><PickerField type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} ariaLabel="結束時間"/></label>
          <label>類別<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>提醒<select value={form.reminderMinutes} onChange={e=>setForm({...form,reminderMinutes:e.target.value})}><option value="">不提醒</option><option value="30">30 分鐘前</option><option value="60">1 小時前</option><option value="1440">1 天前</option></select></label>
          <fieldset className="full scope-picker"><legend>這是誰的行程？</legend>{[['shared','共同安排',Users],['personal',editing&&editing.created_by!==user?.id?`${creatorName(editing)} 的行程`:'我的行程',UserRound]].map(([value,label,Icon])=><button type="button" key={value} className={form.eventScope===value?'selected':''} onClick={()=>setForm({...form,eventScope:value})}><Icon size={17}/><span>{label}</span></button>)}</fieldset>
          <label className="full"><span className="field-label">地點 <small>選填</small></span><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} maxLength="180" placeholder="新增地點"/></label>
          <fieldset className="full visibility-picker"><legend>對方能看到嗎？</legend>{[['shared','兩人都看得到',Eye],['private','只有我',EyeOff],['surprise','驚喜',Sparkles]].map(([value,label,Icon])=><button type="button" key={value} className={form.visibility===value?'selected':''} onClick={()=>setForm({...form,visibility:value})}><Icon size={16}/><span>{label}</span></button>)}</fieldset>
          <label className="full"><span className="field-label">備註 <small>選填</small></span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows="3" maxLength="1000" placeholder="有什麼想記住的嗎？"/></label>
          {error&&<p className="auth-message full" role="alert">{error}</p>}
          <div className="event-form-actions full">{editing&&<button type="button" className="delete-button" onClick={remove} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={close}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><Check size={17}/>儲存行程</>}</button></div>
        </form>
      </section>
    </div>}
  </section>;
}
