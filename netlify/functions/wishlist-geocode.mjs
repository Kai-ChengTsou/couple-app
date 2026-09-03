import {createClient} from '@supabase/supabase-js';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, max-age=86400'}});

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
      const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.location'},body:JSON.stringify({textQuery:`${item.title||''} ${item.location} 台灣`,pageSize:1,languageCode:'zh-TW',regionCode:'TW'}),signal:AbortSignal.timeout(8000)});
      if(!response.ok)return null;
      const place=(await response.json()).places?.[0],latitude=Number(place?.location?.latitude),longitude=Number(place?.location?.longitude);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<21.5||latitude>26.5||longitude<118||longitude>123)return null;
      return {id:item.id,latitude,longitude};
    }catch{return null;}
  }));
  return json({locations:results.filter(Boolean)});
};

export const config={path:'/api/wishlist-geocode',method:['POST']};
