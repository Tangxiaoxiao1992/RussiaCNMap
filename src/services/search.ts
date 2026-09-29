import { aliasPlaces, type AliasPlace } from "../data/aliases";
export type SearchResult={id:string;zh:string;ru:string;subtitle:string;center:[number,number];source:"alias"|"nominatim"};
const normalize=(s:string)=>s.trim().toLocaleLowerCase();
const memory=new Map<string,SearchResult[]>();
export async function searchPlaces(query:string):Promise<SearchResult[]>{
 const q=normalize(query); if(!q)return [];
 const local=aliasPlaces.filter((p:AliasPlace)=>[p.zh,p.ru,p.en??"",...p.aliases].some(x=>normalize(x).includes(q))).map(p=>({id:p.id,zh:p.zh,ru:p.ru,subtitle:p.category,center:p.center,source:"alias" as const}));
 const cached=memory.get(q); if(cached)return [...local,...cached].slice(0,8);
 const saved=localStorage.getItem("search:"+q); if(saved){try{const hit=JSON.parse(saved) as SearchResult[];memory.set(q,hit);return [...local,...hit].slice(0,8);}catch{}}
 try{
  const url=new URL("https://nominatim.openstreetmap.org/search"); url.searchParams.set("q",query); url.searchParams.set("format","jsonv2"); url.searchParams.set("limit","5"); url.searchParams.set("accept-language","zh-CN,zh,ru,en"); url.searchParams.set("countrycodes","ru"); url.searchParams.set("addressdetails","0");
  const res=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(2800)}); if(!res.ok)throw new Error("search failed");
  const data=await res.json() as Array<{place_id:number;display_name:string;lat:string;lon:string;name?:string}>;
  const remote=data.map(x=>({id:`osm-${x.place_id}`,zh:x.name||x.display_name.split(",")[0],ru:x.display_name,subtitle:"OpenStreetMap",center:[Number(x.lon),Number(x.lat)] as [number,number],source:"nominatim" as const}));
  memory.set(q,remote); localStorage.setItem("search:"+q,JSON.stringify(remote));
  return [...local,...remote.filter(r=>!local.some(l=>Math.abs(l.center[0]-r.center[0])<0.0001&&Math.abs(l.center[1]-r.center[1])<0.0001))].slice(0,8);
 }catch{return local.slice(0,8);}
}