import type {StyleSpecification} from "maplibre-gl";
export const offlineStyle:StyleSpecification={
 version:8,
 sources:{moscow:{type:"vector",url:"pmtiles://./moscow.pmtiles",attribution:"© OpenStreetMap contributors"}},
 layers:[
  {id:"background",type:"background",paint:{"background-color":"#f4f1ea"}},
  {id:"landuse",type:"fill",source:"moscow","source-layer":"landuse",paint:{"fill-color":"#e5eadb","fill-opacity":0.65}},
  {id:"water",type:"fill",source:"moscow","source-layer":"water",paint:{"fill-color":"#b9d9e8"}},
  {id:"buildings",type:"fill",source:"moscow","source-layer":"buildings",minzoom:13,paint:{"fill-color":"#ddd9d2","fill-outline-color":"#c9c4bc"}},
  {id:"roads-minor",type:"line",source:"moscow","source-layer":"roads",paint:{"line-color":"#ffffff","line-width":["interpolate",["linear"],["zoom"],10,0.6,16,5]}},
  {id:"roads-major",type:"line",source:"moscow","source-layer":"roads",filter:["in",["get","kind"],["literal",["highway","major_road","medium_road"]]],paint:{"line-color":"#f0c879","line-width":["interpolate",["linear"],["zoom"],8,1,16,7]}}
 ]
};
