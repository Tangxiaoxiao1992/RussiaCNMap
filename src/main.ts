import {Map,Marker,NavigationControl,GeolocateControl,type StyleSpecification} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css"; import "./style.css"; import {searchPlaces,type SearchResult} from "./services/search";
const app=document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML=`<main class="shell"><header><div class="brand"><strong>俄罗斯中文地图</strong><span>RussiaCNMap · 开源预览版</span></div><form id="search"><input id="q" autocomplete="off" placeholder="搜索中文 / 俄文 / 英文，例如：莫航、红场、SVO"/><button>搜索</button></form><div id="results" class="results"></div></header><div id="map"></div><aside id="card" class="card hidden"></aside><footer>中文优先 · 俄文兜底 · 数据源 OpenStreetMap</footer></main>`;
const STYLE_URL="https://tiles.openfreemap.org/styles/liberty";
const map=new Map({container:"map",style:STYLE_URL,center:[37.6173,55.7558],zoom:10.8,attributionControl:{}});
map.addControl(new NavigationControl(),"bottom-right"); map.addControl(new GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true}),"bottom-right");
function localizeMapLabels(){
 const style=map.getStyle() as StyleSpecification;
 for(const layer of style.layers??[]){
  if(layer.type!=="symbol"||!layer.layout||!("text-field" in layer.layout))continue;
  const field=(layer.layout as Record<string,unknown>)["text-field"];
  if(field===undefined)continue;
  try{map.setLayoutProperty(layer.id,"text-field",["coalesce",["get","name:zh-Hans"],["get","name:zh"],["get","name:ru"],["get","name"],field]);}catch{}
 }
}
map.on("style.load",localizeMapLabels);
let marker:Marker|undefined;
function selectPlace(p:SearchResult){marker?.remove();marker=new Marker({color:"#d63b31"}).setLngLat(p.center).addTo(map);map.flyTo({center:p.center,zoom:15});const card=document.querySelector<HTMLDivElement>("#card")!;card.classList.remove("hidden");card.innerHTML=`<button class="close" aria-label="关闭">×</button><span class="tag">${p.subtitle}</span><h2>${p.zh}</h2><p class="ru">${p.ru}</p><p class="coords">${p.center[1].toFixed(5)}, ${p.center[0].toFixed(5)}</p><small>来源：${p.source==="alias"?"RussiaCNMap 中文别名库":"OpenStreetMap / Nominatim"}</small>`;card.querySelector(".close")?.addEventListener("click",()=>card.classList.add("hidden"));}
const form=document.querySelector<HTMLFormElement>("#search")!,input=document.querySelector<HTMLInputElement>("#q")!,results=document.querySelector<HTMLDivElement>("#results")!;
form.addEventListener("submit",async e=>{e.preventDefault();results.innerHTML='<div class="loading">正在搜索…</div>';const found=await searchPlaces(input.value);results.innerHTML=found.length?found.map((p,i)=>`<button data-i="${i}"><b>${p.zh}</b><span>${p.ru}</span></button>`).join(""):'<div class="loading">没有找到结果</div>';results.querySelectorAll<HTMLButtonElement>("button").forEach(b=>b.addEventListener("click",()=>{selectPlace(found[Number(b.dataset.i)]);results.innerHTML="";}));});
map.on("click",()=>results.innerHTML="");