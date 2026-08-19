import { useEffect, useState } from 'react';
import { Camera, Check, Circle, Clock3, Heart, Image, LoaderCircle, Pencil, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressMemoryPhoto } from '../lib/images';
import PickerField from './PickerField';

export default function OurSpacePage({ memories, tasks, couple, user, onRefresh, onNotify }) {
  const [tab,setTab]=useState('memories');
  const [kind,setKind]=useState(null);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({});
  const [photoFile,setPhotoFile]=useState(null);
  const [photoPreview,setPhotoPreview]=useState('');
  const [removePhoto,setRemovePhoto]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(() => {
    if (!photoFile) return setPhotoPreview('');
    const url=URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  },[photoFile]);

  function open(type,item=null){
    setKind(type);setEditing(item);setError('');setPhotoFile(null);setRemovePhoto(false);
    setForm(type==='memory'
      ? {title:item?.title||'',happened_on:item?.happened_on||new Date().toLocaleDateString('en-CA'),note:item?.note||'',image_path:item?.image_path||'',image_url:item?.image_url||''}
      : {title:'',due_at:''});
  }
  function close(){setKind(null);setEditing(null);setForm({});setPhotoFile(null);setRemovePhoto(false);setError('');}

  function choosePhoto(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith('image/')){event.target.value='';return setError('請選擇照片檔案。');}
    if(file.size>20*1024*1024){event.target.value='';return setError('照片太大，請選擇小於 20 MB 的照片。');}
    setError('');setRemovePhoto(false);setPhotoFile(file);
  }

  async function save(event){
    event.preventDefault();
    if(!supabase||!couple||!user)return setError('目前無法連接資料庫。');
    setSaving(true);setError('');
    let uploadedPath=null;
    try{
      const table=kind==='memory'?'memories':'tasks';
      let payload;
      if(kind==='memory'){
        let imagePath=removePhoto?null:(form.image_path||null);
        if(photoFile){
          const compressed=await compressMemoryPhoto(photoFile);
          uploadedPath=`${couple.id}/${user.id}/${crypto.randomUUID()}.jpg`;
          const upload=await supabase.storage.from('memory-photos').upload(uploadedPath,compressed,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
          if(upload.error)throw upload.error;
          imagePath=uploadedPath;
        }
        payload={title:form.title.trim(),happened_on:form.happened_on,note:form.note.trim()||null,image_path:imagePath,image_url:null};
      }else{
        payload={title:form.title.trim(),due_at:form.due_at?new Date(form.due_at).toISOString():null};
      }
      const result=editing
        ? await supabase.from(table).update(payload).eq('id',editing.id)
        : await supabase.from(table).insert({...payload,couple_id:couple.id,created_by:user.id});
      if(result.error)throw result.error;
      const oldPath=editing?.image_path;
      if(kind==='memory'&&oldPath&&(removePhoto||uploadedPath)&&oldPath!==uploadedPath){
        await supabase.storage.from('memory-photos').remove([oldPath]);
      }
      const wasEditing=Boolean(editing),savedKind=kind;
      close();await onRefresh();
      onNotify(savedKind==='memory'?(wasEditing?'回憶已更新':'回憶已收藏'):'任務已新增');
    }catch(saveError){
      if(uploadedPath)await supabase.storage.from('memory-photos').remove([uploadedPath]);
      setError(saveError.message||'儲存失敗，請再試一次。');
    }finally{setSaving(false);}
  }

  async function removeMemory(){
    if(!editing)return;
    setSaving(true);setError('');
    const result=await supabase.from('memories').delete().eq('id',editing.id);
    if(result.error){setSaving(false);return setError(result.error.message);}
    if(editing.image_path)await supabase.storage.from('memory-photos').remove([editing.image_path]);
    setSaving(false);close();await onRefresh();onNotify('回憶已刪除');
  }
  async function toggleTask(task){const result=await supabase.from('tasks').update({completed_at:task.completed_at?null:new Date().toISOString()}).eq('id',task.id);if(result.error)return onNotify(result.error.message);await onRefresh();}
  async function removeTask(task){const result=await supabase.from('tasks').delete().eq('id',task.id);if(result.error)return onNotify(result.error.message);await onRefresh();onNotify('任務已刪除');}

  const currentPhoto=photoPreview||(!removePhoto?form.image_url:'');
  return <section className="feature-page our-page">
    <header className="page-title-row"><div><p className="eyebrow">一起創造</p><h1>我們的小世界</h1><p>收藏喜歡的時刻，也讓每天的合作更輕鬆。</p></div><button className="add-button" onClick={()=>open(tab==='memories'?'memory':'task')}><Plus size={19}/>{tab==='memories'?'新增回憶':'新增任務'}</button></header>
    <div className="section-tabs"><button className={tab==='memories'?'selected':''} onClick={()=>setTab('memories')}><Heart size={17}/>回憶 <span>{memories.length}</span></button><button className={tab==='tasks'?'selected':''} onClick={()=>setTab('tasks')}><Check size={17}/>共同任務 <span>{tasks.filter(task=>!task.completed_at).length}</span></button></div>
    {tab==='memories'?(memories.length?<div className="memory-timeline">{memories.map((memory,index)=><article className="memory-card" key={memory.id}><button className="wish-edit" aria-label={`編輯 ${memory.title}`} onClick={()=>open('memory',memory)}><Pencil size={16}/></button>{memory.image_url?<img src={memory.image_url} alt={memory.title} loading="lazy"/>:<span className={`memory-placeholder mp-${index%3}`}><Image size={29}/></span>}<div><small>{new Date(`${memory.happened_on}T12:00`).toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric'})}</small><h2>{memory.title}</h2>{memory.note&&<p>{memory.note}</p>}</div></article>)}</div>:<Empty icon={<Sparkles size={28}/>} title="你們的故事從這裡開始" text="收藏一張照片、一個日期，或讓你微笑的小時刻。" action="新增第一個回憶" onClick={()=>open('memory')}/>):(tasks.length?<div className="task-board">{tasks.map(task=><article className={task.completed_at?'task-row done':'task-row'} key={task.id}><button aria-label={task.completed_at?'標記為未完成':'標記為完成'} onClick={()=>toggleTask(task)}>{task.completed_at?<Check size={17}/>:<Circle size={17}/>}</button><div><strong>{task.title}</strong>{task.due_at&&<small><Clock3 size={12}/>{new Date(task.due_at).toLocaleString('zh-TW',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small>}</div><button className="task-delete" aria-label={`刪除 ${task.title}`} onClick={()=>removeTask(task)}><Trash2 size={16}/></button></article>)}</div>:<Empty icon={<Check size={28}/>} title="目前沒有共同任務" text="新增採買、家事，或任何一起做會更輕鬆的事情。" action="新增第一個任務" onClick={()=>open('task')}/>) }

    {kind&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&close()}><section className="modal memory-modal" role="dialog" aria-modal="true"><button className="icon-button close" aria-label="關閉" onClick={close} disabled={saving}><X size={20}/></button><p className="eyebrow">{kind==='memory'?'值得珍藏的時刻':'一起分工'}</p><h2>{kind==='memory'?(editing?'編輯回憶':'新增回憶'):'新增共同任務'}</h2><form className="event-form" onSubmit={save}>
      <label className="full">名稱<input required maxLength="160" value={form.title||''} onChange={event=>setForm({...form,title:event.target.value})}/></label>
      {kind==='memory'?<><label className="full">日期<PickerField type="date" required value={form.happened_on} onChange={event=>setForm({...form,happened_on:event.target.value})} ariaLabel="回憶日期"/></label>
        <fieldset className="full photo-field"><legend>照片 <small>選填</small></legend>{currentPhoto?<div className="photo-preview"><img src={currentPhoto} alt="照片預覽"/><label className="photo-change"><Camera size={17}/><span>更換照片</span><input type="file" accept="image/*" onChange={choosePhoto}/></label><button type="button" className="photo-remove" onClick={()=>{setPhotoFile(null);setRemovePhoto(true)}}><Trash2 size={16}/>移除</button></div>:<label className="photo-picker"><Upload size={23}/><strong>選擇照片</strong><small>從相簿選擇或直接拍照</small><input type="file" accept="image/*" onChange={choosePhoto}/></label>}<p>上傳前會自動壓縮，節省儲存空間。</p></fieldset>
        <label className="full">想說的話<textarea rows="4" value={form.note} onChange={event=>setForm({...form,note:event.target.value})}/></label></>:<label className="full"><span className="field-label">截止時間 <small>選填</small></span><PickerField type="datetime-local" value={form.due_at} onChange={event=>setForm({...form,due_at:event.target.value})} ariaLabel="截止時間"/></label>}
      {error&&<p className="auth-message full" role="alert">{error}</p>}
      <div className="event-form-actions full">{editing&&kind==='memory'&&<button type="button" className="delete-button" onClick={removeMemory} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={close} disabled={saving}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<><LoaderCircle className="spin" size={18}/>處理中</>:<><Check size={17}/>儲存</>}</button></div>
    </form></section></div>}
  </section>;
}

function Empty({icon,title,text,action,onClick}){return <div className="big-empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button onClick={onClick}><Plus size={17}/>{action}</button></div>;}
