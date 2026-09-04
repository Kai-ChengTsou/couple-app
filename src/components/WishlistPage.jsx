import {useEffect,useMemo,useRef,useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPortal} from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import {CalendarPlus,Camera,Check,Clipboard,ExternalLink,Film,Gift,HandHeart,Heart,Link2,LoaderCircle,Map as MapIcon,MapPin,Pencil,Plane,Plus,Search,ShoppingBag,SlidersHorizontal,Sparkles,Trash2,Upload,Utensils,X} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {compressMemoryPhoto} from '../lib/images';
import PickerField from './PickerField';

const blank={title:'',category:'date idea',location:'',url:'',estimated_price:'',status:'idea',notes:'',image_path:'',image_url:''};
const categoryMeta={'date idea':{label:'約會',tone:'rose',Icon:Heart},place:{label:'地點',tone:'sky',Icon:MapPin},trip:{label:'旅行',tone:'sage',Icon:Plane},gift:{label:'禮物',tone:'lilac',Icon:Gift},food:{label:'美食',tone:'apricot',Icon:Utensils},movie:{label:'電影',tone:'navy',Icon:Film},'shared purchase':{label:'共同購買',tone:'gold',Icon:ShoppingBag}};
const statusLabels={idea:'想法',accepted:'已答應',planned:'已計畫',completed:'已完成'};
const categorySearchTerms={'date idea':'約會 行程 活動 體驗 一起做','place':'地點 地方 店家 景點','trip':'旅行 旅遊 出遊 住宿 飯店 民宿 露營','gift':'禮物 禮品 想要 買','food':'美食 食物 吃飯 餐廳 料理 小吃 甜點 飲料 咖啡','movie':'電影 影片 戲院 影城','shared purchase':'共同購買 一起買 購物'};
const taiwanRegions=['台北','新北','桃園','新竹','苗栗','台中','彰化','南投','雲林','嘉義','台南','高雄','屏東','宜蘭','花蓮','台東','澎湖','金門','連江','基隆'];
const regionCoordinates={台北:[25.045,121.53],新北:[25.01,121.46],基隆:[25.13,121.74],桃園:[24.99,121.3],新竹:[24.81,120.97],苗栗:[24.56,120.82],台中:[24.15,120.68],彰化:[24.08,120.54],南投:[23.92,120.69],雲林:[23.71,120.43],嘉義:[23.48,120.45],台南:[22.99,120.21],高雄:[22.63,120.3],屏東:[22.67,120.49],宜蘭:[24.76,121.75],花蓮:[23.99,121.61],台東:[22.76,121.15],澎湖:[23.57,119.58],金門:[24.44,118.32],連江:[26.16,119.95]};
const normalizeSearch=value=>(value||'').toString().normalize('NFKC').toLowerCase().replaceAll('臺','台').replace(/\s+/g,' ').trim();
const regionFromLocation=location=>taiwanRegions.find(region=>normalizeSearch(location).includes(region))||'';
const distanceKm=(from,to)=>{const radians=value=>value*Math.PI/180,dLat=radians(to[0]-from[0]),dLon=radians(to[1]-from[1]),a=Math.sin(dLat/2)**2+Math.cos(radians(from[0]))*Math.cos(radians(to[0]))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};

export default function WishlistPage({items,members,couple,user,onRefresh,onNotify}){
  const [statusFilter,setStatusFilter]=useState('all'),[kindFilter,setKindFilter]=useState('all'),[categoryFilter,setCategoryFilter]=useState('all'),[regionFilter,setRegionFilter]=useState('all'),[filterOpen,setFilterOpen]=useState(false),[query,setQuery]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState(blank),[formOpen,setFormOpen]=useState(false),[actionOpen,setActionOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [photoFile,setPhotoFile]=useState(null),[photoPreview,setPhotoPreview]=useState(''),[removePhoto,setRemovePhoto]=useState(false),[planning,setPlanning]=useState(false),[schedule,setSchedule]=useState({date:'',time:'19:00'});
  const [createMode,setCreateMode]=useState('choose'),[importUrl,setImportUrl]=useState(''),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState(''),[importPreview,setImportPreview]=useState(null);
  const [detailDrag,setDetailDrag]=useState(0),[detailOrigin,setDetailOrigin]=useState('list'),detailDragStart=useRef(null);
  const [swipedWishId,setSwipedWishId]=useState(null),cardSwipeStart=useRef(null),cardSwipeJustEnded=useRef(false);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [aiSearch,setAiSearch]=useState({query:'',ids:null}),[aiSearching,setAiSearching]=useState(false);
  const [searchLocation,setSearchLocation]=useState({status:'idle',coordinates:null,error:''});
  const [viewMode,setViewMode]=useState('list'),[selectedMapWish,setSelectedMapWish]=useState(null);
  const [geocodedLocations,setGeocodedLocations]=useState({});
  const mapElementRef=useRef(null),mapInstanceRef=useRef(null),mapMarkersRef=useRef(null);
  const memberNames=useMemo(()=>Object.fromEntries((members||[]).map(member=>[member.user_id,member.profile?.display_name||'另一半'])),[members]);
  const availableRegions=useMemo(()=>[...new Set(items.map(item=>regionFromLocation(item.location)).filter(Boolean))],[items]);
  const filteredItems=useMemo(()=>items.filter(item=>{const itemKind=['gift','shared purchase'].includes(item.category)?'wanted':'experience';return (statusFilter==='all'||item.status===statusFilter)&&(kindFilter==='all'||itemKind===kindFilter)&&(categoryFilter==='all'||item.category===categoryFilter)&&(regionFilter==='all'||regionFromLocation(item.location)===regionFilter);}),[items,statusFilter,kindFilter,categoryFilter,regionFilter]);
  const localShown=useMemo(()=>{const searchTokens=normalizeSearch(query).split(' ').filter(Boolean);return filteredItems.filter(item=>{const creatorName=memberNames[item.created_by]||'';const searchText=normalizeSearch([item.title,item.location,item.notes,categoryMeta[item.category]?.label,categorySearchTerms[item.category],statusLabels[item.status],creatorName].filter(Boolean).join(' '));return searchTokens.every(token=>searchText.includes(token));});},[filteredItems,query,memberNames]);
  const normalizedQuery=normalizeSearch(query);
  const nearbyIntent=/我附近|附近|離我近|near\s*me/i.test(normalizedQuery);
  const shown=useMemo(()=>{if(!normalizedQuery||aiSearch.query!==normalizedQuery||!Array.isArray(aiSearch.ids))return localShown;const byId=new Map(filteredItems.map(item=>[item.id,item]));return aiSearch.ids.map(id=>byId.get(id)).filter(Boolean);},[normalizedQuery,aiSearch,localShown,filteredItems]);
  const counts=Object.fromEntries(Object.keys(statusLabels).map(status=>[status,items.filter(item=>item.status===status).length]));
  const progress=items.length?Math.round(counts.completed/items.length*100):0;
  const activeFilterCount=[statusFilter,categoryFilter,regionFilter].filter(value=>value!=='all').length;
  const mappedWishes=useMemo(()=>shown.filter(item=>regionCoordinates[regionFromLocation(item.location)]),[shown]);
  useEffect(()=>{if(selectedMapWish&&!mappedWishes.some(item=>item.id===selectedMapWish.id))setSelectedMapWish(null);},[mappedWishes,selectedMapWish]);
  useEffect(()=>{
    if(viewMode!=='map'||!mappedWishes.length)return;
    const geocodeCacheKey='duet-wishlist-geocodes-v2';let cached={};try{cached=JSON.parse(localStorage.getItem(geocodeCacheKey)||'{}');}catch{}const missing=mappedWishes.filter(item=>!cached[item.id]||cached[item.id].key!==`${item.title}|${item.location}`);
    setGeocodedLocations(Object.fromEntries(Object.entries(cached).map(([id,value])=>[id,value.coordinates])));
    if(!missing.length)return;
    let cancelled=false;
    (async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session)return;const response=await fetch('/api/wishlist-geocode',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({items:missing.map(item=>({id:item.id,title:item.title,location:item.location}))})});if(!response.ok)return;const result=await response.json();for(const place of result.locations||[])cached[place.id]={key:`${missing.find(item=>item.id===place.id)?.title}|${missing.find(item=>item.id===place.id)?.location}`,coordinates:[place.latitude,place.longitude]};localStorage.setItem(geocodeCacheKey,JSON.stringify(cached));if(!cancelled)setGeocodedLocations(Object.fromEntries(Object.entries(cached).map(([id,value])=>[id,value.coordinates])));}catch{}})();
    return()=>{cancelled=true;};
  },[viewMode,mappedWishes]);
  useEffect(()=>{
    if(viewMode!=='map'||!mapElementRef.current)return;
    if(!mapInstanceRef.current){
      const taiwanCenter=[23.72,120.96];
      const overviewZoom=7.75;
      const map=L.map(mapElementRef.current,{zoomControl:false,attributionControl:true,minZoom:7.25,maxZoom:17,zoomSnap:.25,zoomDelta:.5,scrollWheelZoom:true,dragging:false,touchZoom:true,doubleClickZoom:false,boxZoom:false,keyboard:false,maxBounds:[[21.55,119.7],[25.6,122.35]],maxBoundsViscosity:1}).setView(taiwanCenter,overviewZoom);
      L.control.zoom({position:'bottomright'}).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
      map.on('dblclick',event=>{if(map.getZoom()>overviewZoom)map.setView(taiwanCenter,overviewZoom,{animate:true});else map.setView(event.latlng,Math.min(overviewZoom+1.5,map.getMaxZoom()),{animate:true});});
      map.on('zoomend',()=>{if(map.getZoom()<=overviewZoom){map.dragging.disable();map.setView(taiwanCenter,overviewZoom,{animate:false});}else map.dragging.enable();});
      mapInstanceRef.current=map;mapMarkersRef.current=L.markerClusterGroup({showCoverageOnHover:false,zoomToBoundsOnClick:true,spiderfyOnMaxZoom:true,spiderfyDistanceMultiplier:1.45,removeOutsideVisibleBounds:true,maxClusterRadius:zoom=>zoom<9?48:34,iconCreateFunction:cluster=>L.divIcon({className:'wishlist-cluster-wrap',html:`<span class="wishlist-cluster"><b>${cluster.getChildCount()}</b><small>個願望</small></span>`,iconSize:[52,52],iconAnchor:[26,26]})}).addTo(map);
    }
    const map=mapInstanceRef.current,layer=mapMarkersRef.current;layer.clearLayers();
    const regionCounts={},regionTotals=mappedWishes.reduce((totals,item)=>{const region=regionFromLocation(item.location);totals[region]=(totals[region]||0)+1;return totals;},{});
    mappedWishes.forEach(item=>{
      const region=regionFromLocation(item.location),base=geocodedLocations[item.id]||regionCoordinates[region],sequence=regionCounts[region]||0;regionCounts[region]=sequence+1;
      const total=geocodedLocations[item.id]?1:regionTotals[region],angle=((sequence/Math.min(total,7))*Math.PI*2)-Math.PI/2,ring=Math.floor(sequence/7),radius=total>1?.14+(ring*.08):0;
      const coordinates=[base[0]+Math.sin(angle)*radius,base[1]+Math.cos(angle)*radius];
      const meta=categoryMeta[item.category]||categoryMeta.place,Icon=meta.Icon;
      const iconMarkup=renderToStaticMarkup(<Icon size={14} strokeWidth={2.2}/>);
      const icon=L.divIcon({className:'wishlist-leaflet-marker-wrap',html:`<span class="wishlist-leaflet-marker ${meta.tone}">${iconMarkup}</span>`,iconSize:[34,42],iconAnchor:[17,39]});
      L.marker(coordinates,{icon,keyboard:true,title:item.title}).on('click',()=>setSelectedMapWish(item)).addTo(layer);
    });
    window.setTimeout(()=>map.invalidateSize(),0);
    return()=>{};
  },[viewMode,mappedWishes,geocodedLocations]);
  useEffect(()=>()=>{mapInstanceRef.current?.remove();mapInstanceRef.current=null;mapMarkersRef.current=null;},[]);
  useEffect(()=>{
    if(viewMode!=='map')return;
    const bodyOverflow=document.body.style.overflow,htmlOverflow=document.documentElement.style.overflow;
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
    return()=>{document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=htmlOverflow;mapInstanceRef.current?.remove();mapInstanceRef.current=null;mapMarkersRef.current=null;};
  },[viewMode]);
  useEffect(()=>{if(!photoFile)return setPhotoPreview('');const url=URL.createObjectURL(photoFile);setPhotoPreview(url);return()=>URL.revokeObjectURL(url);},[photoFile]);
  useEffect(()=>{if(!filterOpen)return;const closeOnEscape=event=>event.key==='Escape'&&setFilterOpen(false);window.addEventListener('keydown',closeOnEscape);return()=>window.removeEventListener('keydown',closeOnEscape);},[filterOpen]);
  useEffect(()=>{
    if(normalizedQuery.length<2){setAiSearch({query:'',ids:null});setAiSearching(false);return;}
    if(nearbyIntent&&!searchLocation.coordinates){setAiSearch({query:'',ids:null});setAiSearching(false);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{setAiSearching(true);try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('No session');let coordinates={...geocodedLocations};if(nearbyIntent){const geocodeCacheKey='duet-wishlist-geocodes-v2';let cached={};try{cached=JSON.parse(localStorage.getItem(geocodeCacheKey)||'{}');}catch{}const missing=filteredItems.filter(item=>item.location&&(!cached[item.id]||cached[item.id].key!==`${item.title}|${item.location}`));if(missing.length){const geocodeResponse=await fetch('/api/wishlist-geocode',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({items:missing.map(item=>({id:item.id,title:item.title,location:item.location}))}),signal:controller.signal});if(geocodeResponse.ok){const geocodeResult=await geocodeResponse.json();for(const place of geocodeResult.locations||[])cached[place.id]={key:`${missing.find(item=>item.id===place.id)?.title}|${missing.find(item=>item.id===place.id)?.location}`,coordinates:[place.latitude,place.longitude]};localStorage.setItem(geocodeCacheKey,JSON.stringify(cached));coordinates=Object.fromEntries(Object.entries(cached).map(([id,value])=>[id,value.coordinates]));setGeocodedLocations(coordinates);}}else coordinates=Object.fromEntries(Object.entries(cached).map(([id,value])=>[id,value.coordinates]));}const response=await fetch('/api/wishlist-search',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({query:normalizedQuery,items:filteredItems.slice(0,120).map(item=>({id:item.id,title:item.title,location:item.location||'',category:categoryMeta[item.category]?.label||item.category,notes:(item.notes||'').slice(0,500),status:statusLabels[item.status]||item.status,estimatedPrice:item.estimated_price||null,distanceKm:nearbyIntent&&coordinates[item.id]?distanceKm(searchLocation.coordinates,coordinates[item.id]):null}))}),signal:controller.signal});if(!response.ok)throw new Error('AI search unavailable');const result=await response.json();if(Array.isArray(result.ids))setAiSearch({query:normalizedQuery,ids:result.ids});}catch(searchError){if(searchError.name!=='AbortError')setAiSearch({query:'',ids:null});}finally{if(!controller.signal.aborted)setAiSearching(false);}},550);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[normalizedQuery,filteredItems,nearbyIntent,searchLocation.coordinates]);
  useEffect(()=>{
    if(!actionOpen)return;
    const sheet=document.querySelector('.wish-action-modal');
    if(!sheet)return;
    const locationRow=sheet.querySelector('.wish-detail-location');
    const openLocation=()=>{if(!editing)return;const mapQuery=[editing.title,editing.location].filter(Boolean).join(' ');window.location.assign(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`);};
    const openLocationWithKeyboard=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLocation();}};
    if(locationRow){locationRow.setAttribute('role','link');locationRow.setAttribute('tabindex','0');locationRow.setAttribute('aria-label',`在 Google 地圖搜尋 ${[editing.title,editing.location].filter(Boolean).join(' ')}`);locationRow.setAttribute('title','以店名和地點在 Google 地圖搜尋');locationRow.addEventListener('click',openLocation);locationRow.addEventListener('keydown',openLocationWithKeyboard);}
    let startY=null,lastY=null,tracking=false;
    const start=event=>{if(event.touches.length!==1||sheet.scrollTop>2)return;startY=event.touches[0].clientY;lastY=startY;tracking=true;};
    const move=event=>{if(!tracking||startY===null)return;const touch=event.touches[0];if(!touch)return;lastY=touch.clientY;const distance=lastY-startY;if(distance<=0){setDetailDrag(0);return;}if(distance>8)event.preventDefault();setDetailDrag(distance);};
    const finish=()=>{if(!tracking)return;const distance=(lastY??startY)-startY;tracking=false;startY=null;lastY=null;if(distance>70)closeActions();else setDetailDrag(0);};
    sheet.addEventListener('touchstart',start,{passive:true});
    sheet.addEventListener('touchmove',move,{passive:false});
    sheet.addEventListener('touchend',finish,{passive:true});
    sheet.addEventListener('touchcancel',finish,{passive:true});
    return()=>{if(locationRow){locationRow.removeEventListener('click',openLocation);locationRow.removeEventListener('keydown',openLocationWithKeyboard);}sheet.removeEventListener('touchstart',start);sheet.removeEventListener('touchmove',move);sheet.removeEventListener('touchend',finish);sheet.removeEventListener('touchcancel',finish);};
  },[actionOpen]);
  useEffect(()=>{
    const move=event=>{const start=cardSwipeStart.current,touch=event.touches?.[0];if(!start||!touch)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)<=Math.abs(dy)*1.15)return;event.preventDefault();const offset=Math.max(-96,Math.min(0,start.base+dx));start.element.style.transform=`translate3d(${offset}px,0,0)`;};
    window.addEventListener('touchmove',move,{passive:false});
    return()=>window.removeEventListener('touchmove',move);
  },[]);

  function clearFilters(){setStatusFilter('all');setCategoryFilter('all');setRegionFilter('all');}
  function requestSearchLocation(){
    if(!navigator.geolocation)return setSearchLocation({status:'error',coordinates:null,error:'這個瀏覽器不支援定位。'});
    setSearchLocation({status:'requesting',coordinates:null,error:''});
    navigator.geolocation.getCurrentPosition(position=>setSearchLocation({status:'ready',coordinates:[position.coords.latitude,position.coords.longitude],error:''}),locationFailure=>setSearchLocation({status:'error',coordinates:null,error:locationFailure.code===1?'你尚未允許位置權限，可在瀏覽器設定中開啟。':'目前無法取得位置，請稍後再試。'}),{enableHighAccuracy:false,timeout:10000,maximumAge:5*60*1000});
  }
  function openMapSearch(item){const mapQuery=[item.title,item.location].filter(Boolean).join(' ');window.location.assign(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`);}

  function openEditor(item=null){setEditing(item);setCreateMode(item?'manual':'choose');setError('');setImportError('');setImportPreview(null);setPhotoFile(null);setRemovePhoto(false);setForm(item?{title:item.title,category:item.category,location:item.location||'',url:item.url||'',estimated_price:item.estimated_price||'',status:item.status,notes:item.notes||'',image_path:item.image_path||'',image_url:item.image_url||''}:{...blank});setFormOpen(true);}
  function closeEditor(){if(importBusy)return;setFormOpen(false);setEditing(null);setCreateMode('choose');setForm({...blank});setError('');setImportError('');setImportPreview(null);setPhotoFile(null);setRemovePhoto(false);}
  function openActions(item,origin='list'){setEditing(item);setDetailOrigin(origin);setError('');setPlanning(false);setDetailDrag(0);setSchedule({date:'',time:'19:00'});setActionOpen(true);}
  function startCardSwipe(event,itemId){const touch=event.touches?.[0];if(touch)cardSwipeStart.current={itemId,x:touch.clientX,y:touch.clientY,base:swipedWishId===itemId?-88:0,element:event.currentTarget};}
  function endCardSwipe(event,itemId){const start=cardSwipeStart.current,touch=event.changedTouches?.[0];cardSwipeStart.current=null;if(!start||!touch||start.itemId!==itemId)return;start.element.style.transform='';const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)<32||Math.abs(dx)<=Math.abs(dy)*1.15)return;if(dx<0)setSwipedWishId(itemId);else if(swipedWishId===itemId)setSwipedWishId(null);cardSwipeJustEnded.current=true;window.setTimeout(()=>{cardSwipeJustEnded.current=false;},0);}
  function openWishCard(item){if(cardSwipeJustEnded.current)return;if(swipedWishId){setSwipedWishId(null);return;}openActions(item);}
  function closeActions(){const restoreMap=detailOrigin==='map';setActionOpen(false);setEditing(null);setDetailOrigin('list');setError('');setPlanning(false);setDetailDrag(0);detailDragStart.current=null;if(restoreMap)setViewMode('map');}
  function startDetailDrag(event){detailDragStart.current={start:event.clientY,last:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);}
  function moveDetailDrag(event){if(!detailDragStart.current)return;detailDragStart.current.last=event.clientY;setDetailDrag(Math.max(0,event.clientY-detailDragStart.current.start));}
  function endDetailDrag(event){if(!detailDragStart.current)return;const endY=event?.clientY||detailDragStart.current.last;const distance=endY-detailDragStart.current.start;detailDragStart.current=null;if(distance>70)closeActions();else setDetailDrag(0);}
  function choosePhoto(event){const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return setError('請選擇照片檔案。');if(file.size>20*1024*1024)return setError('照片太大，請選擇小於 20 MB 的照片。');setError('');setRemovePhoto(false);setPhotoFile(file);}
  function showInstagramImporter(){setCreateMode('link');setImportError('');setImportPreview(null);}
  async function pasteInstagramUrl(){
    setImportError('');
    try{
      const text=(await navigator.clipboard?.readText())?.trim()||'';
      try{const pasted=new URL(text);if(!['http:','https:'].includes(pasted.protocol))throw new Error();}catch{return setImportError('剪貼簿裡沒有有效的網頁連結，請重新複製。');}
      setImportUrl(text);setImportPreview(null);
    }catch{return setImportError('無法讀取剪貼簿，請長按連結欄後選擇「貼上」。');}
  }
  async function inspectInstagram(){
    if(!importUrl.trim())return setImportError('請貼上想收藏的連結。');
    setImportBusy(true);setImportError('');setImportPreview(null);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('登入狀態已失效，請重新開啟 Duet。');
      const response=await fetch('/api/link-preview',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({url:importUrl.trim()})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'無法讀取連結內容。');
      setImportPreview(result);
    }catch(importFailure){setImportError(importFailure.message||'無法讀取連結內容。');}
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
    setForm({...blank,title:importPreview.title||'',category:importPreview.category||'place',location:importPreview.location||'',estimated_price:importPreview.estimatedPrice||'',url:importPreview.canonicalUrl||importUrl.trim(),notes:importPreview.description||''});
    setCreateMode('manual');setImportPreview(null);
  }
  function useInstagramLinkManually(){setEditing(null);setError('');setPhotoFile(null);setRemovePhoto(false);setForm({...blank,category:'place',url:importUrl.trim()});setCreateMode('manual');setImportPreview(null);}

  async function save(event){event.preventDefault();if(!supabase||!couple||!user)return setError('目前無法連接資料庫。');setSaving(true);setError('');let uploadedPath=null;try{let imagePath=removePhoto?null:(form.image_path||null);if(photoFile){const compressed=await compressMemoryPhoto(photoFile);uploadedPath=`${couple.id}/${user.id}/${crypto.randomUUID()}.jpg`;const upload=await supabase.storage.from('wishlist-photos').upload(uploadedPath,compressed,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});if(upload.error)throw upload.error;imagePath=uploadedPath;}const payload={title:form.title.trim(),category:form.category,location:form.location.trim()||null,status:editing?.status||'idea',estimated_price:form.estimated_price?Number(form.estimated_price):null,url:form.url.trim()||null,notes:form.notes.trim()||null,image_path:imagePath,image_url:null};const result=editing?await supabase.from('wishlist_items').update(payload).eq('id',editing.id):await supabase.from('wishlist_items').insert({...payload,couple_id:couple.id,created_by:user.id});if(result.error)throw result.error;if(editing?.image_path&&(removePhoto||uploadedPath)&&editing.image_path!==uploadedPath)await supabase.storage.from('wishlist-photos').remove([editing.image_path]);const wasEditing=Boolean(editing);closeEditor();await onRefresh();onNotify(wasEditing?'願望已更新':'願望已新增');}catch(saveError){if(uploadedPath)await supabase.storage.from('wishlist-photos').remove([uploadedPath]);setError(saveError.message||'儲存失敗，請再試一次。');}finally{setSaving(false);}}
  function remove(){if(editing)setDeleteTarget(editing);}
  function removeFromCard(item){setDeleteTarget(item);}
  async function confirmRemove(){if(!deleteTarget)return;const item=deleteTarget;setSaving(true);setError('');const result=await supabase.from('wishlist_items').delete().eq('id',item.id);if(result.error){setSaving(false);setDeleteTarget(null);return setError(result.error.message);}if(item.image_path)await supabase.storage.from('wishlist-photos').remove([item.image_path]);setDeleteTarget(null);setSwipedWishId(null);setSaving(false);if(formOpen)closeEditor();if(actionOpen)closeActions();await onRefresh();onNotify('願望已刪除');}
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
  const actionMeta=editing?(categoryMeta[editing.category]||categoryMeta.gift):categoryMeta.gift;
  const ActionDetailIcon=actionMeta.Icon;
  const actionCreator=editing?(memberNames[editing.created_by]||'我們'):'我們';
  let selectedMapPreview=null;
  if(selectedMapWish){
    const item=selectedMapWish,meta=categoryMeta[item.category]||categoryMeta.place,PreviewIcon=meta.Icon;
    selectedMapPreview=(
      <article className="wishlist-map-preview">
        <span className="wishlist-map-preview-handle"/>
        <div className={`wishlist-map-preview-art wish-art-${meta.tone}`}>{item.image_url?<img src={item.image_url} alt=""/>:<PreviewIcon size={28}/>}</div>
        <div>
          <div className="wishlist-map-preview-tags"><span className={`wish-category ${meta.tone}`}>{meta.label}</span><span className="wish-map-status"><Sparkles size={11}/>{statusLabels[item.status]||item.status}</span></div>
          <h3>{item.title}</h3><p><MapPin size={13}/>{item.location}</p>
          <div><button type="button" onClick={()=>{setViewMode('list');openActions(item,'map')}}>查看詳情</button><button type="button" onClick={()=>openMapSearch(item)}><ExternalLink size={14}/>Google 地圖</button></div>
        </div>
        <button type="button" className="wishlist-map-preview-close" onClick={()=>setSelectedMapWish(null)} aria-label="關閉地點預覽"><X size={17}/></button>
      </article>
    );
  }
  const mapOverlay=viewMode==='map'?(
    <section className="wishlist-map-overlay" role="dialog" aria-modal="true" aria-label="我們的願望地圖">
      <header className="wishlist-overlay-heading"><div><p className="eyebrow">想去的地方</p><h1>我們的願望地圖</h1></div><button type="button" onClick={()=>{setViewMode('list');setSelectedMapWish(null)}} aria-label="關閉願望地圖"><X size={21}/></button></header>
      <div className="filter-bar wishlist-search-row wishlist-overlay-search"><label><Search size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜尋地點、美食或想做的事" aria-label="搜尋願望"/></label><button type="button" className={`wishlist-filter-trigger ${activeFilterCount?'active':''}`} onClick={()=>{setViewMode('list');setFilterOpen(true)}} aria-label="篩選"><SlidersHorizontal size={19}/>{activeFilterCount>0&&<b>{activeFilterCount}</b>}</button></div>
      {nearbyIntent&&!searchLocation.coordinates&&<div className="wishlist-location-search overlay" role="status"><MapPin size={15}/><span><strong>搜尋你附近的收藏</strong><small>{searchLocation.error||'需要使用你目前的位置。'}</small></span><button type="button" onClick={requestSearchLocation} disabled={searchLocation.status==='requesting'}>{searchLocation.status==='requesting'?'取得位置中…':'允許定位'}</button></div>}
      <section className="wishlist-map-section">
        <div className="wishlist-map-layout"><aside className="wishlist-map-legend">{Object.entries(categoryMeta).filter(([value])=>mappedWishes.some(item=>item.category===value)).map(([value,meta])=><span key={value}><i className={meta.tone}/>{meta.label}</span>)}</aside><div className="wishlist-map-canvas" ref={mapElementRef}/></div>
        {selectedMapPreview}
      </section>
    </section>
  ):null;
  return <section className={`feature-page wishlist-page ${viewMode==='map'?'map-mode':''}`}>
    {mapOverlay ? createPortal(mapOverlay,document.querySelector('.app')||document.body) : null}
    {deleteTarget&&<div className="modal-backdrop wish-delete-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&setDeleteTarget(null)}><section className="modal wish-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="wish-delete-title" aria-describedby="wish-delete-description"><span className="wish-delete-icon"><Trash2 size={24}/></span><p className="eyebrow">刪除願望</p><h2 id="wish-delete-title">確定要刪除嗎？</h2><p id="wish-delete-description">「{deleteTarget.title}」將從你們的願望清單中永久移除，這個動作無法復原。</p><div><button type="button" className="cancel-button" onClick={()=>setDeleteTarget(null)} disabled={saving}>先保留</button><button type="button" className="wish-delete-confirm-button" onClick={confirmRemove} disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<Trash2 size={17}/>}確認刪除</button></div></section></div>}
    <header className="page-title-row"><div><p className="eyebrow">總有一天</p><h1>我們的願望清單</h1><p>收藏想一起去的地方、想要的禮物和小小冒險。</p></div><button className="add-button" onClick={()=>openEditor()}><Plus size={19}/>新增願望</button></header>
    <section className="wishlist-overview"><div className="wishlist-overview-copy"><span><Sparkles size={23}/></span><div><small>我們想一起完成</small><strong>{items.length} 個願望</strong><p>{items.length?'每一個想法，都是未來的一段故事。':'先收藏第一個想一起實現的小願望。'}</p></div></div><div className="wishlist-stats four"><span><b>{counts.idea}</b><small>想法</small></span><span><b>{counts.accepted}</b><small>已答應</small></span><span><b>{counts.planned}</b><small>計畫中</small></span><span><b>{counts.completed}</b><small>已完成</small></span></div><div className="wishlist-progress"><span><i style={{width:`${progress}%`}}/></span><small>{progress}% 的願望已成真</small></div></section>
    <div className="wishlist-kind-filter" aria-label="願望類型">{[['all','全部'],['experience','想一起做'],['wanted','想要的東西']].map(([value,label])=><button key={value} className={kindFilter===value?'selected':''} aria-pressed={kindFilter===value} onClick={()=>setKindFilter(value)}>{label}</button>)}</div>
    {viewMode==='map'&&<header className="wishlist-full-map-heading"><p className="eyebrow">想去的地方</p><h1>我們的願望地圖</h1></header>}
    <div className="filter-bar wishlist-search-row"><label><Search size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜尋地點、美食或想做的事" aria-label="搜尋願望"/></label><button type="button" className={`wishlist-view-trigger ${viewMode==='map'?'active':''}`} onClick={()=>{const next=viewMode==='map'?'list':'map';setViewMode(next);setSelectedMapWish(next==='map'?mappedWishes[0]||null:null)}} aria-label={viewMode==='map'?'切換願望清單':'顯示願望地圖'} aria-pressed={viewMode==='map'}><MapIcon size={19}/><span>{viewMode==='map'?'清單':'地圖'}</span></button><button type="button" className={`wishlist-filter-trigger ${activeFilterCount?'active':''}`} onClick={()=>setFilterOpen(true)} aria-label={activeFilterCount?`篩選，已套用 ${activeFilterCount} 個條件`:'篩選'} aria-haspopup="dialog" aria-expanded={filterOpen}><SlidersHorizontal size={19}/><span>篩選</span>{activeFilterCount>0&&<b aria-hidden="true">{activeFilterCount}</b>}</button></div>
    {normalizedQuery.length>=2&&(nearbyIntent&&!searchLocation.coordinates?<div className="wishlist-location-search" role="status"><MapPin size={15}/><span><strong>搜尋你附近的收藏</strong><small>{searchLocation.error||'需要使用你目前的位置，只會在這次附近搜尋中使用。'}</small></span><button type="button" onClick={requestSearchLocation} disabled={searchLocation.status==='requesting'}>{searchLocation.status==='requesting'?'取得位置中…':'允許定位'}</button></div>:<p className="wishlist-ai-search-status" aria-live="polite">{aiSearching?<><LoaderCircle className="spin" size={13}/>AI 正在理解條件與語意…</>:aiSearch.query===normalizedQuery?<><Sparkles size={13}/>AI 智慧搜尋結果</>:<><Search size={13}/>先顯示文字搜尋結果</>}</p>)}
    {shown.length?(viewMode==='inline-map-disabled'?<section className="wishlist-map-section" aria-label="台灣願望地圖"><div className="wishlist-map-heading"><div><p className="eyebrow">想去的地方</p><h2>我們的願望地圖</h2></div><span><MapPin size={14}/>{mappedWishes.length} 個地點</span></div><div className="wishlist-map-layout"><aside className="wishlist-map-legend" aria-label="地圖分類">{Object.entries(categoryMeta).filter(([value])=>mappedWishes.some(item=>item.category===value)).map(([value,meta])=><span key={value}><i className={meta.tone}/>{meta.label}</span>)}</aside><div className="wishlist-map-canvas" ref={mapElementRef}/></div>{selectedMapWish?(()=>{const item=selectedMapWish,meta=categoryMeta[item.category]||categoryMeta.place,Icon=meta.Icon;return <article className="wishlist-map-preview"><span className="wishlist-map-preview-handle"/><div className={`wishlist-map-preview-art wish-art-${meta.tone}`}>{item.image_url?<img src={item.image_url} alt=""/>:<Icon size={28}/>}</div><div><div className="wishlist-map-preview-tags"><span className={`wish-category ${meta.tone}`}>{meta.label}</span><span className="wish-map-status"><Sparkles size={11}/>{statusLabels[item.status]||item.status}</span></div><h3>{item.title}</h3><p><MapPin size={13}/>{item.location}</p><div><button type="button" onClick={()=>openActions(item)}>查看詳情</button><button type="button" onClick={()=>openMapSearch(item)}><ExternalLink size={14}/>Google 地圖</button></div></div><button type="button" className="wishlist-map-preview-close" onClick={()=>setSelectedMapWish(null)} aria-label="關閉地點預覽"><X size={17}/></button></article>})():<p className="wishlist-map-hint"><MapPin size={15}/>點一下地圖上的標記查看願望</p>}{shown.length>mappedWishes.length&&<p className="wishlist-map-unmapped">另有 {shown.length-mappedWishes.length} 個願望尚未填寫可辨識的台灣縣市，因此沒有顯示在地圖上。</p>}</section>:<div className="wish-grid">{shown.map((item,index)=>{const meta=categoryMeta[item.category]||categoryMeta.gift,Icon=meta.Icon;const isWanted=['gift','shared purchase'].includes(item.category),creatorName=memberNames[item.created_by]||'我們',sourceText=/instagram\.com/i.test(item.url||'')?`${creatorName} 從 IG 收藏`:`${creatorName} 收藏`,footerText=isWanted?(item.estimated_price?`NT$${Number(item.estimated_price).toLocaleString()}`:'尚未填寫價格'):sourceText;return <div className={`wish-swipe-row ${swipedWishId===item.id?'revealed':''}`} key={item.id}><button type="button" className="wish-swipe-delete" onClick={()=>removeFromCard(item)} disabled={saving} aria-label={`刪除 ${item.title}`}><Trash2 size={20}/><span>刪除</span></button><article role="button" tabIndex="0" onTouchStart={event=>startCardSwipe(event,item.id)} onTouchEnd={event=>endCardSwipe(event,item.id)} onClick={()=>openWishCard(item)} onKeyDown={event=>(event.key==='Enter'||event.key===' ')&&openActions(item)} className={`wish-card wish-${meta.tone} ${item.status==='completed'?'completed':''}`} aria-label={`${item.title}，開啟願望詳情；向左滑動可刪除`}><span className={`wish-card-art wish-art-${meta.tone}`}>{item.image_url?<img src={item.image_url} alt="" loading="lazy"/>:<><small>{String(index+1).padStart(2,'0')}</small><Icon size={31}/><b>{meta.label}</b></>}</span><div className="wish-card-body"><div className="wish-card-topline"><span className="wish-category">{meta.label}</span><em className={item.status}>{item.status==='completed'?<Check size={12}/>:item.status==='accepted'?<HandHeart size={12}/>:<Sparkles size={12}/>} {statusLabels[item.status]||item.status}</em></div><h2>{item.title}</h2>{item.notes&&<p>{item.notes}</p>}<footer><strong>{footerText}</strong>{item.url&&<a href={item.url} onClick={event=>event.stopPropagation()} target="_blank" rel="noreferrer" aria-label={`開啟 ${item.title} 的連結`}><ExternalLink size={14}/></a>}</footer></div></article></div>})}</div>):<div className="big-empty"><span><Heart size={28}/></span><h2>{items.length?'找不到符合的願望':'還沒有願望'}</h2><p>{items.length?'試試其他關鍵字或篩選條件。':'可以從餐廳、週末旅行，或一份想收到的禮物開始。'}</p>{!items.length&&<button onClick={()=>openEditor()}><Plus size={17}/>新增第一個願望</button>}</div>}

    {filterOpen&&<div className="modal-backdrop wishlist-filter-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setFilterOpen(false)}><section className="modal wishlist-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="wishlist-filter-title"><div className="wishlist-filter-heading"><div><p className="eyebrow">願望清單</p><h2 id="wishlist-filter-title">篩選</h2></div><button className="icon-button" onClick={()=>setFilterOpen(false)} aria-label="關閉篩選"><X size={20}/></button></div><div className="wishlist-filter-groups"><fieldset><legend>狀態</legend><div>{[['all','全部'],...Object.entries(statusLabels)].map(([value,label])=><button type="button" key={value} className={statusFilter===value?'selected':''} aria-pressed={statusFilter===value} onClick={()=>setStatusFilter(value)}>{label}</button>)}</div></fieldset><fieldset><legend>分類</legend><div>{[['all',{label:'全部'}],...Object.entries(categoryMeta)].map(([value,meta])=><button type="button" key={value} className={categoryFilter===value?'selected':''} aria-pressed={categoryFilter===value} onClick={()=>setCategoryFilter(value)}>{meta.label}</button>)}</div></fieldset>{availableRegions.length>0&&<fieldset><legend>地區</legend><div>{['all',...availableRegions].map(value=><button type="button" key={value} className={regionFilter===value?'selected':''} aria-pressed={regionFilter===value} onClick={()=>setRegionFilter(value)}>{value==='all'?'全部地區':value}</button>)}</div></fieldset>}</div><div className="wishlist-filter-actions"><button type="button" className="wishlist-filter-clear" onClick={clearFilters} disabled={!activeFilterCount}>清除全部</button><button type="button" className="auth-submit" onClick={()=>setFilterOpen(false)}><Check size={17}/>顯示 {shown.length} 個願望</button></div></section></div>}

    {actionOpen&&editing&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&closeActions()}><section className={`modal wish-action-modal ${detailDrag?'dragging':''}`} style={{transform:detailDrag?`translateY(${detailDrag}px)`:undefined}} role="dialog" aria-modal="true" aria-labelledby="wish-detail-title"><button type="button" className="wish-detail-drag-handle" aria-label="向下滑動關閉願望詳情" onPointerDown={startDetailDrag} onPointerMove={moveDetailDrag} onPointerUp={endDetailDrag} onPointerCancel={endDetailDrag}><span/></button><button className="icon-button close" onClick={closeActions} aria-label="關閉"><X size={20}/></button><div className={`wish-detail-hero wish-art-${actionMeta.tone}`}>{editing.image_url?<img src={editing.image_url} alt={editing.title}/>:<ActionDetailIcon size={42}/>}<span className="wish-detail-category"><ActionDetailIcon size={13}/>{actionMeta.label}</span></div><div className="wish-detail-heading"><div><p className="eyebrow">願望詳情</p><h2 id="wish-detail-title">{editing.title}</h2><div className="wish-detail-tags"><span className={`category ${actionMeta.tone}`}><ActionDetailIcon size={12}/>{actionMeta.label}</span><span className={`status ${editing.status}`}>{editing.status==='completed'?<Check size={12}/>:editing.status==='accepted'?<HandHeart size={12}/>:<Sparkles size={12}/>} {statusLabels[editing.status]||editing.status}</span><span className="creator">{actionCreator} 收藏</span>{editing.estimated_price&&<span className="price">NT$ {Number(editing.estimated_price).toLocaleString()}</span>}</div></div><button type="button" className="wish-detail-edit" onClick={()=>{closeActions();openEditor(editing)}} aria-label={`編輯 ${editing.title}`}><Pencil size={18}/></button></div>{editing.location&&<div className="wish-detail-location"><MapPin size={17}/><span><small>地點</small><strong>{editing.location}</strong></span></div>}<section className="wish-detail-description"><small>描述與備註</small><p>{editing.notes||'目前沒有加入描述。'}</p></section>{editing.url&&<a className="wish-detail-link" href={editing.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/><span><small>原始連結</small><strong>{/instagram\.com/i.test(editing.url)?'在 Instagram 查看':'開啟相關網頁'}</strong></span></a>}<div className="wish-detail-action-heading"><strong>下一步</strong><small>選擇要如何處理這個願望</small></div><div className="wish-action-choices"><button type="button" className={editing.status==='accepted'?'active':''} onClick={()=>updateStatus('accepted')} disabled={saving}><span><HandHeart size={21}/></span><strong>{editing.status==='accepted'?'取消答應':'答應'}</strong><small>{editing.status==='accepted'?'取消目前狀態':'告訴對方你接受'}</small></button><button type="button" className={editing.scheduled_event_id||planning?'active':''} onClick={()=>editing.scheduled_event_id?cancelSchedule():setPlanning(value=>!value)} disabled={saving}><span><CalendarPlus size={21}/></span><strong>{editing.scheduled_event_id?'取消安排':'安排'}</strong><small>{editing.scheduled_event_id?'移除日曆行程':'加入共同日曆'}</small></button><button type="button" className={editing.status==='completed'?'active':''} onClick={()=>updateStatus('completed')} disabled={saving}><span><Check size={21}/></span><strong>{editing.status==='completed'?'取消完成':'完成'}</strong><small>{editing.status==='completed'?'取消目前狀態':'標記已經完成'}</small></button></div>{planning&&!editing.scheduled_event_id&&<div className="wish-schedule"><div><CalendarPlus size={20}/><span><strong>加入共同日曆</strong><small>選好時間後，願望會變成「已計畫」</small></span></div><label>日期<PickerField type="date" value={schedule.date} onChange={event=>setSchedule({...schedule,date:event.target.value})} required ariaLabel="行程日期"/></label><label>時間<PickerField type="time" value={schedule.time} onChange={event=>setSchedule({...schedule,time:event.target.value})} required ariaLabel="行程時間"/></label><button type="button" className="auth-submit" onClick={createSchedule} disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><CalendarPlus size={17}/>建立行程</>}</button></div>}{editing.status==='accepted'&&editing.accepted_by&&<p className="wish-accepted-note"><HandHeart size={14}/>{memberNames[editing.accepted_by]||'另一半'} 已答應這個願望</p>}{error&&<p className="auth-message">{error}</p>}</section></div>}

    {formOpen&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!saving&&closeEditor()}><section className="modal event-modal wishlist-modal" role="dialog" aria-modal="true"><button className="icon-button close" onClick={closeEditor} aria-label="關閉" disabled={saving||importBusy}><X size={20}/></button>{!editing&&createMode==='choose'&&<div className="wishlist-create-choices" aria-label="選擇新增願望方式"><p className="eyebrow">新增願望</p><h2>你想怎麼加入？</h2><p>先選擇加入方式，下一步仍可確認和修改所有資料。</p><div><button type="button" onClick={showInstagramImporter}><span><Sparkles size={21}/></span><strong>AI 分析連結</strong><small>支援 Instagram、Threads、RedNote 與一般網站</small><em>下一步</em></button><button type="button" onClick={()=>setCreateMode('manual')}><span><Pencil size={21}/></span><strong>手動新增</strong><small>自己填寫名稱、分類、地點和備註</small><em>下一步</em></button></div></div>}{!editing&&createMode==='choose'?null:!editing&&createMode==='link'?<div className="instagram-import-pane"><button type="button" className="wishlist-create-back" onClick={()=>setCreateMode('choose')}>← 返回選擇方式</button><p className="eyebrow">AI 快速收藏</p><h2>分析一個連結</h2><p>貼上 Instagram、Threads、RedNote 或一般網站連結，AI 會整理名稱、地點、分類、描述與來源中明確提到的價格。</p><label className="instagram-url-field"><span>收藏連結</span><div><Link2 size={18}/><input type="url" inputMode="url" value={importUrl} onChange={event=>{setImportUrl(event.target.value);setImportPreview(null);setImportError('')}} placeholder="貼上 Instagram、Threads、RedNote 或網站連結" autoCapitalize="none" autoCorrect="off"/><button type="button" className="instagram-paste-button" onClick={pasteInstagramUrl} aria-label="貼上收藏連結"><Clipboard size={15}/>貼上</button></div></label><button type="button" className="auth-submit instagram-inspect-button" onClick={inspectInstagram} disabled={importBusy}>{importBusy?<><LoaderCircle className="spin" size={18}/>AI 正在分析內容…</>:<><Search size={17}/>開始 AI 分析</>}</button>{importPreview&&<article className="instagram-import-preview">{importPreview.imageDataUrl?<img src={importPreview.imageDataUrl} alt="連結內容預覽"/>:<span><Link2 size={28}/></span>}<div><small>{importPreview.storeName?'辨識到店名':importPreview.location?'辨識到地點':'辨識結果，可再修改'}</small><h3>{importPreview.title}</h3>{importPreview.location&&<p><MapPin size={13}/>{importPreview.location}</p>}<em>{categoryMeta[importPreview.category]?.label||'地點'}</em></div></article>}{importError&&<p className="auth-message" role="alert">{importError}</p>}<div className="instagram-import-actions"><button type="button" className="cancel-button" onClick={useInstagramLinkManually} disabled={importBusy||!importUrl.trim()}><Clipboard size={16}/>手動填寫</button>{importPreview&&<button type="button" className="auth-submit" onClick={useInstagramPreview}><Check size={17}/>使用這個結果</button>}</div></div>:<>{!editing&&<button type="button" className="wishlist-create-back" onClick={()=>setCreateMode('choose')}>← 返回選擇方式</button>}<p className="eyebrow">願望資料</p><h2>{editing?'編輯願望':'手動新增願望'}</h2><form className="event-form" onSubmit={save}><label className="full">願望名稱<input required maxLength="160" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="地點、禮物或約會靈感"/></label><label className="full">類別<select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{Object.entries(categoryMeta).map(([value,meta])=><option key={value} value={value}>{meta.label}</option>)}</select></label><fieldset className="full photo-field"><legend>照片 <small>選填</small></legend>{currentPhoto?<div className="photo-preview"><img src={currentPhoto} alt="願望照片預覽"/><label className="photo-change"><Camera size={17}/><span>更換照片</span><input type="file" accept="image/*" onChange={choosePhoto}/></label><button type="button" className="photo-remove" onClick={()=>{setPhotoFile(null);setRemovePhoto(true)}}><Trash2 size={16}/>移除</button></div>:<label className="photo-picker"><Upload size={23}/><strong>選擇照片</strong><small>從相簿選擇或直接拍照</small><input type="file" accept="image/*" onChange={choosePhoto}/></label>}<p>照片會自動壓縮，只有你們兩人能查看。</p></fieldset><label>預估價格<input type="number" min="0" step="1" value={form.estimated_price} onChange={event=>setForm({...form,estimated_price:event.target.value})} placeholder="選填"/></label><label>連結<input type="url" value={form.url} onChange={event=>setForm({...form,url:event.target.value})} placeholder="https://"/></label><label className="full">備註<textarea rows="3" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="為什麼想收藏它？"/></label>{error&&<p className="auth-message full">{error}</p>}<div className="event-form-actions full">{editing&&<button type="button" className="delete-button" onClick={remove} disabled={saving}><Trash2 size={17}/>刪除</button>}<span/><button type="button" className="cancel-button" onClick={closeEditor}>取消</button><button className="auth-submit save-event" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<><Check size={17}/>儲存願望</>}</button></div></form></>}</section></div>}
  </section>;
}
