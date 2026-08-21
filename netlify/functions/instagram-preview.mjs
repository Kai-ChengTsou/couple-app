import { createClient } from '@supabase/supabase-js';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

function decodeHtml(value=''){
  const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(_,entity)=>{
    if(entity[0]==='#'){
      const hex=entity[1]?.toLowerCase()==='x';
      return String.fromCodePoint(Number.parseInt(entity.slice(hex?2:1),hex?16:10));
    }
    return named[entity.toLowerCase()]??`&${entity};`;
  }).replace(/\\n/g,'\n').trim();
}

function meta(html,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')
  ];
  for(const pattern of patterns){const match=html.match(pattern);if(match)return decodeHtml(match[1]);}
  return '';
}

function validInstagramUrl(value){
  let parsed;
  try{parsed=new URL(value);}catch{return null;}
  const host=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:'||!(host==='instagram.com'||host.endsWith('.instagram.com')))return null;
  parsed.hash='';
  return parsed;
}

function cleanCaption(title,description){
  const quoted=title.match(/on Instagram:\s*[“"]([\s\S]+?)[”"]\s*$/i)?.[1];
  let caption=quoted||description||title;
  caption=caption.replace(/^\s*[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*[-–—]\s*[^:]+:\s*/i,'');
  caption=caption.replace(/^[“"]|[”"]$/g,'').trim();
  return caption;
}

function locationFrom(caption){
  const match=caption.match(/(?:📍|店名|地點|地址|位置|location|address)\s*[:：]?\s*([^\n#|]{2,80})/i);
  return match?.[1]?.replace(/[。,.，;；]+$/,'').trim()||'';
}

function categoryFrom(text){
  if(/餐廳|咖啡|甜點|美食|早餐|午餐|晚餐|料理|restaurant|cafe|coffee|food|brunch|dessert/i.test(text))return 'food';
  if(/旅遊|旅行|飯店|住宿|景點|trip|travel|hotel|resort/i.test(text))return 'trip';
  if(/電影|影城|movie|cinema/i.test(text))return 'movie';
  return 'place';
}

function suggestedTitle(caption,location,title){
  if(location)return location;
  const firstLine=caption.split('\n').map(line=>line.replace(/^[-•·\s]+/,'').trim()).find(line=>line.length>1&&!/^\d+\s+(likes?|comments?)/i.test(line));
  const fallback=firstLine||title.replace(/\s*•\s*Instagram.*$/i,'').replace(/\s+on Instagram.*$/i,'')||'Instagram 收藏';
  return fallback.length>72?`${fallback.slice(0,69)}…`:fallback;
}

async function imageDataUrl(url){
  if(!url)return '';
  let parsed;
  try{parsed=new URL(url);}catch{return '';}
  if(parsed.protocol!=='https:'||['localhost','127.0.0.1','::1'].includes(parsed.hostname))return '';
  const response=await fetch(parsed,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15','Referer':'https://www.instagram.com/'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return '';
  const type=response.headers.get('content-type')||'';
  if(!type.startsWith('image/'))return '';
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>2.5*1024*1024)return '';
  return `data:${type.split(';')[0]};base64,${Buffer.from(bytes).toString('base64')}`;
}

export default async req=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const supabaseUrl=Netlify.env.get('SUPABASE_URL');
  const serviceKey=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return json({error:'伺服器尚未完成設定。'},500);
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'請重新開啟 Duet 後再試一次。'},401);
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:{user},error:userError}=await db.auth.getUser(token);
  if(userError||!user)return json({error:'登入狀態已失效，請重新開啟 Duet。'},401);
  let body;
  try{body=await req.json();}catch{return json({error:'資料格式不正確。'},400);}
  const instagramUrl=validInstagramUrl(body?.url?.trim());
  if(!instagramUrl)return json({error:'請貼上有效的 Instagram 貼文或 Reel 連結。'},400);
  try{
    const response=await fetch(instagramUrl,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Instagram returned ${response.status}`);
    if(!validInstagramUrl(response.url))throw new Error('Unexpected redirect');
    const html=(await response.text()).slice(0,1500000);
    const rawTitle=meta(html,'og:title')||meta(html,'twitter:title');
    const description=meta(html,'og:description')||meta(html,'description');
    if(!rawTitle&&!description)return json({error:'Instagram 沒有提供這則內容的公開資料。你仍可以保留連結並手動輸入店名。'},422);
    const caption=cleanCaption(rawTitle,description);
    const location=locationFrom(caption);
    const imageUrl=meta(html,'og:image')||meta(html,'twitter:image');
    let image='';
    try{image=await imageDataUrl(imageUrl);}catch{}
    return json({
      title:suggestedTitle(caption,location,rawTitle),
      description:caption.slice(0,1200),
      location,
      category:categoryFrom(`${caption} ${rawTitle}`),
      canonicalUrl:response.url,
      imageDataUrl:image
    });
  }catch(error){
    console.error('Instagram preview failed',error.message);
    return json({error:'目前無法讀取這則 Instagram 內容。可能是私人貼文或 Instagram 暫時限制讀取，你仍可以手動收藏連結。'},422);
  }
};

export const config={path:'/api/instagram-preview',method:['POST']};
