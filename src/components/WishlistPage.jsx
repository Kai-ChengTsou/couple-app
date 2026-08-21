import {useEffect,useMemo,useState} from 'react';
import {CalendarPlus,Camera,Check,Clipboard,ExternalLink,Film,Gift,HandHeart,Heart,Link2,LoaderCircle,MapPin,Pencil,Plane,Plus,Search,ShoppingBag,Sparkles,Trash2,Upload,Utensils,X} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {compressMemoryPhoto} from '../lib/images';
import PickerField from './PickerField';

const blank={title:'',category:'date idea',url:'',estimated_price:'',status:'idea',notes:'',image_path:'',image_url:''};
const categoryMeta={'date idea':{label:'約會',tone:'rose',Icon:Heart},place:{label:'地點',tone:'sky',Icon:MapPin},trip:{label:'旅行',tone:'sage',Icon:Plane},gift:{label:'禮物',tone:'lilac',Icon:Gift},food:{label:'美食',tone:'apricot',Icon:Utensils},movie:{label:'電影',tone:'navy',Icon:Film},'shared purchase':{label:'共同購買',tone:'gold',Icon:ShoppingBag}};
const statusLabels={idea:'想法',accepted:'已答應',planned:'已計畫',completed:'已完成'};

export default function WishlistPage({items,members,couple,user,onRefresh,onNotify}){
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState(blank),[formOpen,setFormOpen]=useState(false),[actionOpen,setActionOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [photoFile,setPhotoFile]=useState(null),[photoPreview,setPhotoPreview]=useState(''),[removePhoto,setRemovePhoto]=useState(false),[planning,setPlanning]=useState(false),[schedule,setSchedule]=useState({date:'',time:'19:00'});
  const [createMode,setCreateMode]=useState('manual'),[importUrl,setImportUrl]=useState(''),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState(''),[importPreview,setImportPreview]=useState(null);
  const shown=useMemo(()=>items.filter(item=>(filter==='all'||item.status===filter)&&item.title.toLowerCase().includes(query.toLowerCase())),[items,filter,query]);
  const counts=Object.fromEntries(Object.keys(statusLabels).map(status=>[status,items.filter(item=>item.status===status).length]));
  const progress=items.length?Math.round(counts.completed/items.length*100):0;
  const memberNames=Object.fromEntries((members||[]).map(member=>[member.user_id,member.profile?.display_name||'另一半']));
  useEffect(()=>{if(!photoFile)return setPhotoPreview('');const url=URL.createObjectURL(photoFile);setPhotoPreview(url);return()=>URL.revokeObjectURL(url);},[photoFile]);

  function openEditor(item=null){setEditing(item);setCreateMode('manual');setError('');setImportError('');setImportPreview(null);setPhotoFile(null);setRemovePhoto(false);setForm(item?{title:item.title,category:item.category,url:item.url||'',estimated_price:item.estimated_price||'',status:item.status,notes:item.notes||'',image_path:item.image_path||'',image_url:item.image_url||''}:{...blank});setFormOpen(true);}
  function closeEditor(){if(importBusy)return;setFormOpen(false);setEditing(null);setCreateMode('manual');setForm({...blank});setError('');setImportError('');setImportPreview(null);setPhotoFile(null);setRemovePhoto(false);}
  function openActions(item){setEditing(item);setError('');setPlanning(false);setSchedule({date:'',time:'19:00'});setActionOpen(true);}
  function closeActions(){setActionOpen(false);setEditing(null);setError('');setPlanning(false);}
  function choosePhoto(event){const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return setError('請選擇照片檔案。');if(file.size>20*1024*1024)return setError('照片太大，請選擇小於 20 MB 的照片。');setError('');setRemovePhoto(false);setPhotoFile(file);}
  async function showInstagramImporter(){setCreateMode('instagram');setImportError('');setImportPreview(null);try{const text=await navigator.clipboard?.readText();if(/https:\/\/(?:[^/]+\.)?instagram\.com\//i.test(text))setImportUrl(text.trim());}catch{}}
  async function inspectInstagram(){
    if(!importUrl.trim())return setImportError('請貼上 Instagram 連結。');
    setImportBusy(true);setImportError('');setImportPreview(null);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('登入狀態已失效，請重新開啟 Duet。');
      const response=await fetch('/api/instagram-preview',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({url:importUrl.trim()})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'無法讀取 Instagram 內容。');
      setImportPreview(result);
    }catch(importFailure){setImportError(importFailure.message||'無法讀取 Instagram 內容。');}
    finally{setImportBusy(false);}
  }
  async function useInstagramPreview(){
    if(!importPreview)return;
    let importedPhoto=null;
    if(importPreview.imageDataUrl){
      const imageResponse=await fetch(importPreview.imageDataUrl);
      const blob=await imageResponse.blob();
      importedPhoto=new File([blob],'instagram-photo',{type:blob.type||'image/jpeg'});
    }
    setEditing(null);setError('');setRemovePhoto(false);setPhotoFile(importedPhoto);
    setForm({...blank,title:importPreview.title||'',category:importPreview.category||'place',url:importPreview.canonicalUrl||importUrl.trim(),notes:importPreview.description||''});
    setCreateMode('manual');setImportPreview(null);
  }
  function useInstagramLinkManually(){setEditing(null);setError('');setPhotoFile(null);setRemovePhoto(false);setForm({...blank,category:'place',url:importUrl.trim()});setCreateMode('manual');setImportPreview(null);}

  async function save(event){event.preventDefault();if(!supabase||!couple||!user)return setError('目前無法連接資料庫。');setSaving(true);setError('');let uploadedPath=null;try{let imagePath=removePhoto?null:(form.image_path||null);if(photoFile){const compressed=await compressMemoryPhoto(photoFile);uploadedPath=`${couple.id}/${user.id}/${crypto.randomUUID()}.jpg`;const upload=await supabase.storage.from('wishlist-photos').upload(uploadedPath,compressed,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});if(upload.error)throw upload.error;imagePath=uploadedPath;}const payload={title:form.title.trim(),category:form.category,status:editing?.status||'idea',estimated_price:form.estimated_price?Number(form.estimated_price):null,url:form.url.trim()||null,notes:form.notes.trim()||null,image_path:imagePath,image_url:null};const result=editing?await supabase.from('wishlist_items').update(payload).eq('id',editing.id):await supabase.from('wishlist_items').insert({...payload,couple_id:couple.id,created_by:user.id});if(result.error)throw result.error;if(editing?.image_path&&(removePhoto||uploadedPath)&&editing.image_path!==uploadedPath)await supabase.storage.from('wishlist-photos').remove([editing.image_path]);const wasEditing=Boolean(editing);closeEditor();await onRefresh();onNotify(wasEditing?'願望已更新':'願望已新增');}catch(saveError){if(uploadedPath)await supabase.storage.from('wishlist-photos').remove([uploadedPath]);setError(saveError.message||'儲存失敗，請再試一次。');}finally{setSaving(false);}}
  async function remove(){if(!editing)return;setSaving(true);setError('');const result=await supabase.from('wishlist_items').delete().eq('id',editing.id);if(result.error){setSaving(false);return setError(result.error.message);}if(editing.image_path)await supabase.storage.from('wishlist-photos').remove([editing.image_path]);setSaving(false);closeEditor();await onRefresh();onNotify('願望已刪除');}
  async function updateStatus(status){
    if(!editing)return;
    const cancelling=editing.status===status;
    const nextStatus=cancelling?'idea':status;
    setSaving(true);setError('');
    const payload=nextStatus==='accepted'
      ?{status:'accepted',accepted_by:user.id,accepted_at:new Date().toISOString()}
      :{status:nextStatus,accepted_by:null,accepted_at:null};
    const {error:statusError}=await supabase.from('wishlist_items').update(payload).eq('id',editing.id);
    setSaving(false);
    if(statusError)return setError(statusError.message);
    await onRefresh();closeActions();
    onNotify(cancelling?(status==='accepted'?'已取消答應':'已取消完成'):(status==='accepted'?'已答應這個願望':'願望已完成'));
  }
  async function createSchedule(){if(!schedule.date||!schedule.time)return setError('請選擇行程日期與時間。');setSaving(true);setError('');let eventId=null;try{const startsAt=new Date(`${schedule.date}T${schedule.time}`).toISOString();const eventResult=await supabase.from('events').insert({couple_id:couple.id,created_by:user.id,title:editing.title,starts_at:startsAt,category:'date',event_scope:'shared',visibility:'shared',notes:`從願望清單「${editing.title}」安排`}).select('id').single();if(eventResult.error)throw eventResult.error;eventId=eventResult.data.id;const wishResult=await supabase.from('wishlist_items').update({status:'planned',scheduled_event_id:eventId,accepted_by:null,accepted_at:null}).eq('id',editing.id);if(wishResult.error)throw wishResult.error;await onRefresh();closeActions();onNotify('已加入共同日曆');}catch(scheduleError){if(eventId)await supabase.from('events').delete().eq('id',eventId);setError(scheduleError.message||'無法建立行程。');}finally{setSaving(false);}}
  async function cancelSchedule(){
    if(!editing?.scheduled_event_id)return;
    const eventId=editing.scheduled_event_id;
    setSaving(true);setError('');
    try{
      const wishResult=await supabase.from('wishlist_items').update({status:'idea',scheduled_event_id:null,accepted_by:null,accepted_at:null}).eq('id',editing.id);
      if(wishResult.error)throw wishResult.error;
      const eventResult=await supabase.from('events').delete().eq('id',eventId);
      if(eventResult.error){
        await supabase.from('wishlist_items').update({status:'planned',scheduled_event_id:eventId}).eq('id',editing.id);
        throw eventResult.error;
      }
      await onRefresh();closeActions();onNotify('已取消安排');
    }catch(scheduleError){setError(scheduleError.message||'無法取消安排。');}
    finally{setSaving(false);}
  }

  const currentPhoto=photoPreview||(!removePhoto?form.image_url:'');
  return <section className="feature-page wishlist-page">
    <header className="page-title-row"><div><p className="eyebrow">總有一天</p><h1>我們的願望清單</h1><p>收藏想一起去的地方、想要的禮物和小小冒險。</p></div><button className="add-button" onClick={()=>openEditor()}><Plus size={19}/>新增願望</button></header>
    <section className="wishlist-overview"><div className="wishlist-overview-copy"><span><Sparkles size={23}/></span><div><small>我們想一起完成</small><strong>{items.length} 個願望</strong><p>{items.length?'每一個想法，都是未來的一段故事。':'先收藏第一個想一起實現的小願望。'}</p></div></div><div className="wishlist-stats four"><span><b>{counts.idea}</b><small>想法</small></span><span><b>{counts.accepted}</b><small>已答應</small></span><span><b>{counts.planned}</b><small>計畫中</small></span><span><b>{counts.completed}</b><small>已完成</small></span></div><div className="wishlist-progress"><span><i style={{width:`${progress}%`}}/></span><small>{progress}% 的願望已成真</small></div></section>
    <div className="filter-bar"><label><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜尋我們的想法"/></label><div>{[['all','全部'],...Object.entries(statusLabels)].map(([value,label])=><button key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div></div>
    {shown.length?<div className="wish-grid">{shown.map((item,index)=>{const meta=categoryMeta[item.category]||categoryMeta.gift,Icon=meta.Icon;return <article role="button" tabIndex="0" onClick={()=>openActions(item)} onKeyDown={event=>(event.key==='Enter'||event.key===' ')&&openActions(item)} className={`wish-card wish-${meta.tone} ${item.status==='completed'?'completed':''}`} key={item.id} aria-label={`${item.title}，開啟願望動作`}><button className="wish-edit" aria-label={`編輯 ${item.title}`} onClick={event=>{event.stopPropagation();openEditor(item)}}><Pencil size={16}/></button><span className={`wish-card-art wish-art-${meta.tone}`}>{item.image_url?<img src={item.image_url} alt="" loading="lazy"/>:<><small>{String(index+1).padStart(2,'0')}</small><Icon size={31}/><b>{meta.label}</b></>}</span><div className="wish-card-body"><div className="wish-card-topline"><span className="wish-category">{meta.label}</span><em className={item.status}>{item.status==='completed'?<Check size={12}/>:item.status==='accepted'?<HandHeart size={12}/>:<Sparkles size={12}/>} {statusLabels[item.status]||item.status}</em></div><h2>{item.title}</h2>{item.notes&&<p>{item.notes}</p>}<footer><strong>{item.estimated_price?`NT$${Number(item.estimated_price).toLocaleString()}`:'無價的想法'}</strong>{item.url&&<a href={item.url} onClick={event=>event.stopPropagation()} target="_blank" rel="noreferrer" aria-label={`開啟 ${item.title} 的連結`}><ExternalLink size={14}/></a>}</footer></div></article>})}</div>:<div className="big-empty"><span><Heart size={28}/></span><h2>{items.length?'找不到符合的願望':'還沒有願望'}</h2><p>{items.length?'試試其他關鍵字或篩選條件。':'可以從餐廳、週末旅行，或一份想收到的禮物開始。'}</p>{!items.length&&<button onClick={()=>openEditor()}><Plus size={17}/>新增第一個願望</button>}</div>}

    {actionOpen&&editing&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&closeActions()}><section className="modal wish-action-modal"><button className="icon-button close" onClick={closeActions} aria-label="關閉"><X size={20}/></button><p className="eyebrow">選擇下一步</p><h2>{editing.title}</h2><p>你想如何處理這個願望？</p><div className="wish-action-choices"><button type="button" className={editing.status==='accepted'?'active':''} onClick={()=>updateStatus('accepted')} disabled={saving}><span><HandHeart size={21}/></span><strong>{editing.status==='accepted'?'取消答應':'答應'}</strong><small>{editing.status==='accepted'?'再點一次，取消答應':'告訴對方你接受這個願望'}</small></button><button type="button" className={editing.scheduled_event_id||planning?'active':''} onClick={()=>editing.scheduled_event_id?cancelSchedule():setPlanning(value=>!value)} disabled={saving}><span><CalendarPlus size={21}/></span><strong>{editing.scheduled_event_id?'取消安排':'安排'}</strong><small>{editing.scheduled_event_id?'移除共同日曆中的行程':'挑選日期並加入共同日曆'}</small></button><button type="button" className={editing.status==='completed'?'active':''} onClick={()=>updateStatus('completed')} disabled={saving}><span><Check size={21}/></span><strong>{editing.status==='completed'?'取消完成':'完成'}</strong><small>{editing.status==='completed'?'再點一次，取消完成':'將這個願望標記為已完成'}</small></button></div>{planning&&!editing.scheduled_event_id&&<div className="wish-schedule"><div><CalendarPlus size={20}/><span><strong>加入共同日曆</strong><small>選好時間後，願望會變成「已計畫」</small></span></div><label>日期<PickerField type="date" value={schedule.date} onChange={event=>setSchedule({...schedule,date:event.target.value})} required ariaLabel="行程日期"/></label><label>時間<PickerField type="time" value={schedule.time} onChange={event=>setSchedule({...schedule,time:event.target.value})} required ariaLabel="行程時間"/></label><button type="button" className="auth-submit" onClick={createSchedule} disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><CalendarPlus size={17}/>建立行程</>}</button></div>}{editing.status==='accepted'&&editing.accepted_by&&<p className="wish-accepted-note"><HandHeart size={14}/>{memberNames[editing.accepted_by]||'另一半'} 已答應這個願望</p>}{error&&<p className="auth-message">{error}</p>}</section></div>}

    {formOpen&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&closeEditor()}><section className="modal event-modal wishlist-modal" role="dialog" aria-modal="true"><button className="icon-button close" onClick={closeEditor} aria-label="關閉" disabled={saving||importBusy}><X size={20}/></button>{!editing&&<div className="wishlist-create-switch" aria-label="新增願望方式"><button type="button" className={createMode==='manual'?'selected':''} aria-pressed={createMode==='manual'} onClick={()=>setCreateMode('manual')}><Pencil size={16}/>手動新增</button><button type="button" className={createMode==='instagram'?'selected':''} aria-pressed={createMode==='instagram'} onClick={showInstagramImporter}><Link2 size={16}/>IG 匯入</button></div>}{!editing&&createMode==='instagram'?<div className="instagram-import-pane"><p className="eyebrow">快速收藏</p><h2>從 Instagram 加入願望</h2><p>在 Instagram 選擇「複製連結」，回到這裡貼上即可。</p><label className="instagram-url-field"><span>Instagram 連結</span><div><Link2 size={18}/><input type="url" inputMode="url" value={importUrl} onChange={event=>{setImportUrl(event.target.value);setImportPreview(null);setImportError('')}} placeholder="https://www.instagram.com/reel/…" autoCapitalize="none" autoCorrect="off"/></div></label><button type="button" className="auth-submit instagram-inspect-button" onClick={inspectInstagram} disabled={importBusy}>{importBusy?<><LoaderCircle className="spin" size={18}/>正在辨識內容…</>:<><Search size={17}/>讀取貼文內容</>}</button>{importPreview&&<article className="instagram-import-preview">{importPreview.imageDataUrl?<img src={importPreview.imageDataUrl} alt="Instagram 貼文預覽"/>:<span><Link2 size={28}/></span>}<div><small>{importPreview.storeName?'辨識到店名':importPreview.location?'辨識到地點':'辨識結果，可再修改'}</small><h3>{importPreview.title}</h3>{importPreview.location&&<p><MapPin size={13}/>{importPreview.location}</p>}<em>{categoryMeta[importPreview.category]?.label||'地點'}</em></div></article>}{importError&&<p className="auth-message" role="alert">{importError}</p>}<div className="instagram-import-actions"><button type="button" className="cancel-button" onClick={useInstagramLinkManually} disabled={importBusy||!importUrl.trim()}><Clipboard size={16}/>手動填寫</button>{importPreview&&<button type="button" className="auth-submit" onClick={useInstagramPreview}><Check size={17}/>使用這個結果</button>}</div></div>:<><p className="eyebrow">願望資料</p><h2>{editing?'編輯願望':'想一起完成什麼？'}</h2><form className="event-form" onSubmit={save}><label className="full">願望名稱<input required maxLength="160" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="地點、禮物或約會靈感"/></label><label className="full">類別<select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{Object.entries(categoryMeta).map(([value,meta])=><option key={value} value={value}>{meta.label}</option>)}</select></label><fieldset className="full photo-field"><legend>照片 <small>選填</small></legend>{currentPhoto?<div className="photo-preview"><img src={currentPhoto} alt="願望照片預覽"/><label className="photo-change"><Camera size={17}/><span>更換照片</span><input type="file" accept="image/*" onChange={choosePhoto}/></label><button type="button" className="photo-remove" onClick={()=>{setPhotoFile(null);setRemovePhoto(true)}}><Trash2 size={16}/>移除</button></div>:<label className="photo-picker"><Upload size={23}/><strong>選擇照片</strong><small>從相簿選擇或直接拍照</small><input type="file" accept="image/*" onChange={choosePhoto}/></label>}<p>照片會自動壓縮，只有你們兩人能查看。</p></fieldset><label>預估價格<input type="number" min="0" step="1" value={form.estimated_price} onChange={event=>setForm({...form,estimated_price:event.target.value})} placeholder="選填"/></label><label>連結<input type="url" value={form.url} onChange={event=>setForm({...form,url:event.target.value})} placeholder="https://"/></label><label className="full">備註<textarea rows="3" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="為什麼想收藏它？"/></label>{error&&<p className="auth-message full">{error}</p>}<div className="event-form-actions full">{editing&&<button type="button" className="delete-button" onClick={remove} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={closeEditor}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><Check size={17}/>儲存願望</>}</button></div></form></>}</section></div>}
  </section>;
}
