export interface AliasPlace { id:string; zh:string; ru:string; en?:string; aliases:string[]; center:[number,number]; category:string; }
export const aliasPlaces:AliasPlace[]=[
{id:"red-square",zh:"红场",ru:"Красная площадь",en:"Red Square",aliases:["红场","Красная площадь","Red Square"],center:[37.6208,55.7539],category:"景点"},
{id:"kremlin",zh:"莫斯科克里姆林宫",ru:"Московский Кремль",en:"Moscow Kremlin",aliases:["克里姆林宫","莫斯科克里姆林宫","Московский Кремль","Moscow Kremlin"],center:[37.6173,55.7520],category:"景点"},
{id:"mai",zh:"莫斯科航空学院",ru:"Московский авиационный институт",en:"Moscow Aviation Institute",aliases:["莫航","莫斯科航空学院","МАИ","MAI","Moscow Aviation Institute"],center:[37.5034,55.8071],category:"大学"},
{id:"svo",zh:"谢列梅捷沃国际机场",ru:"Международный аэропорт Шереметьево",en:"Sheremetyevo International Airport",aliases:["谢列梅捷沃","谢列梅捷沃机场","SVO","Шереметьево","Sheremetyevo"],center:[37.4146,55.9726],category:"机场"},
{id:"sokol",zh:"索科尔",ru:"Сокол",en:"Sokol",aliases:["索科尔","sokol","Сокол","索科尔地铁站"],center:[37.5150,55.8050],category:"地铁站"},
{id:"leningradsky",zh:"列宁格勒大街",ru:"Ленинградский проспект",en:"Leningradsky Prospekt",aliases:["列宁格勒大街","列宁格勒大道","Ленинградский проспект","Leningradsky"],center:[37.518,55.802],category:"道路"},
{id:"peschanaya",zh:"佩夏纳亚街",ru:"Песчаная улица",aliases:["佩夏纳亚街","Песчаная улица","Peschanaya"],center:[37.516,55.801],category:"道路"}
];
export const labelTranslations:Record<string,string>=Object.fromEntries(aliasPlaces.flatMap(p=>[[p.ru,p.zh],[p.en??"",p.zh]]).filter(([k])=>k));
