import {createClient} from '@supabase/supabase-js';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, max-age=86400'}});

const validTaiwanPoint=point=>Number.isFinite(point?.latitude)&&Number.isFinite(point?.longitude)&&point.latitude>=21.5&&point.latitude<=26.5&&point.longitude>=118&&point.longitude<=123;

async function searchPlace(apiKey,item){
  const query=`${item.title||''} ${item.location||''} 台灣`.trim();
  const modern=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.location'},body:JSON.stringify({textQuery:query,pageSize:1,languageCode:'zh-TW',regionCode:'TW'}),signal:AbortSignal.timeout(8000)});
  if(modern.ok){const location=(await modern.json()).places?.[0]?.location;if(validTaiwanPoint(location))return {...location,source:'places-new'};}
  const legacy=await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=zh-TW&region=tw&key=${encodeURIComponent(apiKey)}`,{signal:AbortSignal.timeout(8000)});
  if(legacy.ok){const location=(await legacy.json()).results?.[0]?.geometry?.location,point={latitude:Number(location?.lat),longitude:Number(location?.lng)};if(validTaiwanPoint(point))return {...point,source:'places-legacy'};}
  return null;
}

async function geocodeAddress(apiKey,address){
  const response=await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=zh-TW&region=tw&components=country:TW&key=${encodeURIComponent(apiKey)}`,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;
  const location=(await response.json()).results?.[0]?.geometry?.location,point={latitude:Number(location?.lat),longitude:Number(location?.lng)};
  return validTaiwanPoint(point)?{...point,source:'geocoding'}:null;
}

export default async req=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const apiKey=Netlify.env.get('GOOGLE_PLACES_API_KEY');
  const supabaseUrl=Netlify.env.get('SUPABASE_URL');
  const serviceKey=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!apiKey||!supabaseUrl||!serviceKey)return json({error:'Location service is not configured'},503);
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Unauthorized'},401);
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:{user}}=await db.auth.getUser(token);
  if(!user)return json({error:'Unauthorized'},401);
  let body;
  try{body=await req.json();}catch{return json({error:'Invalid request'},400);}
  const items=Array.isArray(body?.items)?body.items.slice(0,30):[];
  const results=await Promise.all(items.map(async item=>{
    if(!item?.id||!item?.location)return null;
    try{
      const detailedAddress=/\d|號|路|街|巷|弄/.test(item.location);
      const place=detailedAddress?(await geocodeAddress(apiKey,item.location)||await searchPlace(apiKey,item)):(await searchPlace(apiKey,item)||await geocodeAddress(apiKey,item.location));
      return place?{id:item.id,...place}:null;
    }catch{return null;}
  }));
  const locations=results.filter(Boolean);
  console.log(`Wishlist geocode resolved ${locations.length}/${items.length}`,locations.map(item=>`${item.id}:${item.source}`).join(','));
  return json({locations,unresolved:items.filter(item=>!locations.some(location=>location.id===item.id)).map(item=>item.id)});
};

export const config={path:'/api/wishlist-geocode',method:['POST']};
