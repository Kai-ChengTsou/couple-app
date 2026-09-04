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

function visiblePageText(html=''){
  return decodeHtml(html
    .replace(/<(script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>|<\/div>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter((line,index,lines)=>line.length>1&&lines.indexOf(line)===index).join('\n').slice(0,8000);
}

function structuredProduct(html=''){
  const documents=[];
  for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{documents.push(JSON.parse(match[1].trim()));}catch{try{documents.push(JSON.parse(decodeHtml(match[1]).trim()));}catch{}}
  }
  const queue=[...documents];let product=null;
  while(queue.length){const value=queue.shift();if(Array.isArray(value)){queue.push(...value);continue;}if(!value||typeof value!=='object')continue;const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];if(types.some(type=>String(type).toLowerCase()==='product')){product=value;break;}if(Array.isArray(value['@graph']))queue.push(...value['@graph']);}
  if(!product)return {name:'',description:'',price:null};
  const offers=Array.isArray(product.offers)?product.offers[0]:product.offers||{};
  const rawPrice=offers.price??offers.lowPrice??offers.priceSpecification?.price;
  const price=Number(String(rawPrice??'').replace(/[^0-9.]/g,''));
  return {name:String(product.name||'').trim().slice(0,180),description:String(product.description||'').trim().slice(0,1500),price:Number.isFinite(price)&&price>0&&price<=10000000?price:null};
}

function productMetaPrice(html=''){
  const raw=meta(html,'product:price:amount')||meta(html,'og:price:amount')||meta(html,'twitter:data1');
  const price=Number(String(raw).replace(/[^0-9.]/g,''));
  return Number.isFinite(price)&&price>0&&price<=10000000?price:null;
}

function validPublicUrl(value){
  let parsed;
  try{parsed=new URL(value);}catch{return null;}
  const host=parsed.hostname.toLowerCase();
  if(!['http:','https:'].includes(parsed.protocol)||!host||host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||host==='127.0.0.1'||host==='::1'||/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host))return null;
  parsed.hash='';
  return parsed;
}

const isInstagram=parsed=>/(^|\.)instagram\.com$/i.test(parsed.hostname);

function instagramEmbedUrl(parsed){
  const match=parsed.pathname.match(/^\/(?:p|reel|tv)\/([^/]+)/i);
  return match?new URL(`https://www.instagram.com/p/${match[1]}/embed/captioned/`):null;
}

function genericInstagramPage(title='',description=''){
  return /welcome back to instagram|log in to see photos|sign up to see photos|登入以查看|歡迎回到 instagram/i.test(`${title} ${description}`);
}

async function fetchInstagramHtml(url){
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Instagram returned ${response.status}`);
  return {response,html:(await response.text()).slice(0,1500000)};
}

async function fetchPageHtml(url){
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Accept':'text/html,application/xhtml+xml','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(12000)});
  const finalUrl=validPublicUrl(response.url);
  if(!response.ok||!finalUrl)throw new Error(`Website returned ${response.status}`);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))throw new Error('Unsupported page');
  return {response,html:(await response.text()).slice(0,1500000),finalUrl};
}

function cleanCaption(title,description){
  const quoted=title.match(/on Instagram:\s*[“"]([\s\S]+?)[”"]\s*$/i)?.[1];
  let caption=quoted||description||title;
  caption=caption.replace(/^\s*[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*[-–—]\s*[^:]+:\s*/i,'');
  caption=caption.replace(/^[“"]|[”"]$/g,'').trim();
  return caption;
}

function locationFrom(caption){
  const match=caption.match(/(?:📍|地點|地址|位置|location|address)\s*[:：]?\s*([^\n#|]{2,80})/i);
  return match?.[1]?.replace(/[。,.，;；]+$/,'').trim()||'';
}

function storeNameFrom(caption){
  const patterns=[
    /《\s*([^》\n]{2,80})\s*》/,
    /「\s*([^」\n]{2,80})\s*」/,
    /(?:店名|店家|餐廳|咖啡廳|venue|restaurant)\s*[:：]\s*([^\n#|]{2,80})/i
  ];
  for(const pattern of patterns){
    const name=caption.match(pattern)?.[1]?.replace(/^[《「“"]|[》」”"]$/g,'').trim();
    if(name)return name;
  }
  return '';
}

function priceFrom(caption=''){
  const patterns=[
    /(?:NT\$|NTD|新台幣|售價|價格|價錢|套餐|每人)\s*[:：]?\s*\$?\s*([0-9]{2,6}(?:,[0-9]{3})*)/i,
    /\$\s*([0-9]{2,6}(?:,[0-9]{3})*)/
  ];
  for(const pattern of patterns){
    const value=Number((caption.match(pattern)?.[1]||'').replace(/,/g,''));
    if(Number.isFinite(value)&&value>0&&value<=10000000)return value;
  }
  return null;
}

function categoryFrom(text){
  if(/餐廳|咖啡|甜點|美食|早餐|午餐|晚餐|料理|restaurant|cafe|coffee|food|brunch|dessert/i.test(text))return 'food';
  if(/旅遊|旅行|飯店|住宿|景點|trip|travel|hotel|resort/i.test(text))return 'trip';
  if(/電影|影城|movie|cinema/i.test(text))return 'movie';
  if(/商品|購物|服飾|衣服|針織|毛衣|鞋|包|禮物|product|shop|clothing|shirt|sweater|shoes|bag/i.test(text))return 'gift';
  return 'place';
}

function suggestedTitle(caption,storeName,location,title){
  if(storeName)return storeName;
  const firstLine=caption.split('\n').map(line=>line.replace(/^[-•·\s]+/,'').trim()).find(line=>line.length>1&&!/^\d+\s+(likes?|comments?)/i.test(line)&&!/(?:📍|地址|地點|位置|address|location)/i.test(line)&&line!==location);
  const fallback=firstLine||title.replace(/\s*•\s*Instagram.*$/i,'').replace(/\s+on Instagram.*$/i,'')||location||'Instagram 收藏';
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

function parseAiJson(text=''){
  const candidate=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const start=candidate.indexOf('{'),end=candidate.lastIndexOf('}');
  if(start<0||end<=start)return null;
  try{return JSON.parse(candidate.slice(start,end+1));}catch{return null;}
}

async function recognizeWithAi({caption,rawTitle,image,pageText='',sourceLabel='網頁'}){
  const baseUrl=Netlify.env.get('ANTHROPIC_BASE_URL')?.replace(/\/$/,'');
  const authToken=Netlify.env.get('ANTHROPIC_AUTH_TOKEN');
  const model=Netlify.env.get('ANTHROPIC_MODEL')||'claude-sonnet-4-6';
  if(!baseUrl||!authToken)return null;
  const content=[{type:'text',text:`你正在分析一個來自${sourceLabel}的收藏連結。請從頁面標題、摘要、可見內容與預覽圖片找出真正的店名、活動／商品名稱、地點或地址；不要把宣傳句、帳號名稱或 Hashtag 當成名稱。另寫一段適合放在情侶願望清單「備註」欄的繁體中文摘要，最多兩句、120 個中文字，保留特色、推薦內容或體驗重點。只有來源明確寫出價格、售價、套餐價或每人費用時，才回傳純數字 estimatedPrice；不可猜測。不可杜撰來源沒有的資訊。只輸出 JSON，不要 Markdown：{"storeName":"","location":"","category":"food|place|trip|movie|gift|shared purchase|date idea","summary":"","estimatedPrice":null,"confidence":0.0}。無法確認的文字欄位用空字串，價格用 null。\n\n頁面標題：${rawTitle.slice(0,500)}\n頁面摘要：${caption.slice(0,2500)}\n頁面可見內容：${pageText.slice(0,6000)}`}];
  const imageMatch=image.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s);
  if(imageMatch)content.push({type:'image',source:{type:'base64',media_type:imageMatch[1],data:imageMatch[2]}});
  const endpoint=baseUrl.endsWith('/v1')?`${baseUrl}/messages`:`${baseUrl}/v1/messages`;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${authToken}`,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:340,temperature:0,messages:[{role:'user',content}]}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`AI returned ${response.status}`);
  const result=await response.json();
  const parsed=parseAiJson(result.content?.find(block=>block.type==='text')?.text);
  if(!parsed)return null;
  const allowedCategories=new Set(['food','place','trip','movie','gift','shared purchase','date idea']);
  const estimatedPrice=Number(parsed.estimatedPrice);
  return {storeName:String(parsed.storeName||'').trim().slice(0,120),location:String(parsed.location||'').trim().slice(0,180),category:allowedCategories.has(parsed.category)?parsed.category:'place',summary:String(parsed.summary||'').trim().slice(0,300),estimatedPrice:Number.isFinite(estimatedPrice)&&estimatedPrice>0&&estimatedPrice<=10000000?estimatedPrice:null,confidence:Math.max(0,Math.min(1,Number(parsed.confidence)||0))};
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
  const sourceUrl=validPublicUrl(body?.url?.trim());
  if(!sourceUrl)return json({error:'請貼上有效的公開網頁連結。'},400);
  try{
    let response,html,finalUrl=sourceUrl;
    if(isInstagram(sourceUrl)){({response,html}=await fetchInstagramHtml(sourceUrl));finalUrl=validPublicUrl(response.url);}
    else ({response,html,finalUrl}=await fetchPageHtml(sourceUrl));
    if(!finalUrl)throw new Error('Unexpected redirect');
    let rawTitle=meta(html,'og:title')||meta(html,'twitter:title');
    let description=meta(html,'og:description')||meta(html,'description');
    if((!rawTitle&&!description)||genericInstagramPage(rawTitle,description)){
      const embedUrl=isInstagram(sourceUrl)?instagramEmbedUrl(sourceUrl):null;
      if(embedUrl){
        try{
          const embed=await fetchInstagramHtml(embedUrl);
          const embedTitle=meta(embed.html,'og:title')||meta(embed.html,'twitter:title');
          const embedDescription=meta(embed.html,'og:description')||meta(embed.html,'description');
          if(!genericInstagramPage(embedTitle,embedDescription)&&(embedTitle||embedDescription)){response=embed.response;html=embed.html;rawTitle=embedTitle;description=embedDescription;}
        }catch(embedError){console.warn('Instagram embed fallback unavailable',embedError.message);}
      }
    }
    if(!rawTitle&&!description)return json({error:'這個網站沒有提供可讀取的標題或摘要，請改用手動新增。'},422);
    if(isInstagram(sourceUrl)&&genericInstagramPage(rawTitle,description))return json({error:'Instagram 只回傳登入頁，無法讀取這則貼文。請確認是公開貼文，或改用手動新增。'},422);
    const product=structuredProduct(html);
    const pageText=visiblePageText(html);
    if(product.name&&!rawTitle)rawTitle=product.name;
    if(product.description&&!description)description=product.description;
    const caption=cleanCaption(rawTitle,description);
    const ruleLocation=locationFrom(caption);
    const ruleStoreName=storeNameFrom(caption);
    const rulePrice=product.price||productMetaPrice(html)||priceFrom(`${caption}\n${pageText}`);
    const imageUrl=meta(html,'og:image')||meta(html,'twitter:image');
    let image='';
    try{image=await imageDataUrl(imageUrl);}catch{}
    let aiResult=null;
    const sourceLabel=isInstagram(sourceUrl)?'Instagram':/(^|\.)threads\.net$/i.test(sourceUrl.hostname)?'Threads':/(xiaohongshu|xhslink|rednote)/i.test(sourceUrl.hostname)?'小紅書／RedNote':'一般網站';
    try{aiResult=await recognizeWithAi({caption,rawTitle,image,pageText,sourceLabel});}catch(aiError){console.warn('AI recognition unavailable; using rules',aiError.message);}
    const useAi=Boolean(aiResult&&aiResult.confidence>=0.55&&(aiResult.storeName||aiResult.location));
    const storeName=useAi&&aiResult.storeName?aiResult.storeName:(ruleStoreName||product.name);
    const location=useAi&&aiResult.location?aiResult.location:ruleLocation;
    return json({
      title:suggestedTitle(caption,storeName,location,rawTitle),
      description:useAi&&aiResult.summary?aiResult.summary:caption.slice(0,1200),
      storeName,
      location,
      estimatedPrice:useAi&&aiResult.estimatedPrice?aiResult.estimatedPrice:rulePrice,
      category:useAi?aiResult.category:categoryFrom(`${caption} ${rawTitle}`),
      recognition:useAi?'ai':'rules',
      canonicalUrl:finalUrl.href,
      imageDataUrl:image
    });
  }catch(error){
    console.error('Link preview failed',error.message);
    return json({error:'目前無法讀取這個連結。它可能需要登入或阻擋外部讀取，你仍可以手動收藏連結。'},422);
  }
};

export const config={path:['/api/link-preview','/api/instagram-preview'],method:['POST']};
