// 英文词典。规则与 src/zh/dict.ts 对应：整名精确匹配 → 词干（人名）→ 通名；其余走 translit.ts。
// 只需收"音译得不对/有通行英文名"的；普通城市、地铁站音译出来就是对的，不用重复登记。

export const PLACES_EN: Record<string, string> = {
  "москва": "Moscow", "московская область": "Moscow Oblast", "новая москва": "New Moscow", "сергиев посад": "Sergiyev Posad",
  "электросталь": "Elektrostal", "зеленоград": "Zelenograd", "москва-сити": "Moscow City", "москва-река": "Moskva River",
  "шереметьево": "Sheremetyevo", "внуково": "Vnukovo", "домодедово": "Domodedovo", "быково": "Bykovo", "жуковский": "Zhukovsky",
  "красная площадь": "Red Square", "кремль": "Kremlin", "московский кремль": "Moscow Kremlin", "большой театр": "Bolshoi Theatre",
  "гум": "GUM Department Store", "цум": "TsUM Department Store", "третьяковская галерея": "Tretyakov Gallery",
  "государственная третьяковская галерея": "State Tretyakov Gallery", "останкинская башня": "Ostankino Tower",
  "храм христа спасителя": "Cathedral of Christ the Saviour", "собор василия блаженного": "Saint Basil's Cathedral",
  "храм василия блаженного": "Saint Basil's Cathedral", "новодевичий монастырь": "Novodevichy Convent",
  "царицыно": "Tsaritsyno", "коломенское": "Kolomenskoye", "измайлово": "Izmailovo", "воробьевы горы": "Sparrow Hills",
  "арбат": "Arbat", "патриаршие пруды": "Patriarch's Ponds", "лужники": "Luzhniki", "парк горького": "Gorky Park",
  "центральный парк культуры и отдыха имени горького": "Gorky Central Park of Culture and Leisure", "зарядье": "Zaryadye Park",
  "вднх": "VDNKh", "александровский сад": "Alexander Garden", "пушкинский музей": "Pushkin Museum of Fine Arts",
  "государственный исторический музей": "State Historical Museum", "музей космонавтики": "Memorial Museum of Cosmonautics",
  "московский государственный университет имени м. в. ломоносова": "Lomonosov Moscow State University",
  "мгу": "Moscow State University", "московский государственный университет": "Moscow State University",
  "мгту им. н. э. баумана": "Bauman Moscow State Technical University", "мгту имени н. э. баумана": "Bauman Moscow State Technical University",
  "рудн": "RUDN University", "мгимо": "MGIMO University", "вшэ": "HSE University", "мфти": "Moscow Institute of Physics and Technology",
  "мисис": "MISIS University of Science and Technology", "мифи": "MEPhI", "мириэа": "MIREA – Russian Technological University",
  "мади": "Moscow Automobile and Road Construction State Technical University", "мэи": "Moscow Power Engineering Institute",
  "московский авиационный институт": "Moscow Aviation Institute", "маи": "Moscow Aviation Institute",
  "мгсу": "Moscow State University of Civil Engineering", "рггу": "Russian State University for the Humanities",
  "мпгу": "Moscow State Pedagogical University", "сколково": "Skolkovo", "ленинские горы": "Lenin Hills",
  "дом на набережной": "House on the Embankment", "яуза": "Yauza River", "клязьма": "Klyazma River", "ока": "Oka River",
  // 地铁站 / 车站里有通行英文写法的
  "китай-город": "Kitay-gorod", "охотный ряд": "Okhotny Ryad", "чистые пруды": "Chistye Prudy", "красные ворота": "Krasnye Vorota",
  "библиотека имени ленина": "Biblioteka imeni Lenina", "парк культуры": "Park Kultury", "проспект мира": "Prospekt Mira",
  "площадь революции": "Ploshchad Revolyutsii", "университет": "Universitet", "деловой центр": "Delovoy Tsentr",
  "выставочная": "Vystavochnaya", "международная": "Mezhdunarodnaya", "александровский сад-метро": "Alexandrovsky Sad",
  "воробьевы горы-метро": "Vorobyovy Gory", "улица 1905 года": "Ulitsa 1905 Goda", "ботанический сад": "Botanichesky Sad",
  "речной вокзал": "Rechnoy Vokzal", "водный стадион": "Vodny Stadion", "теплый стан": "Teply Stan", "новые черемушки": "Novye Cheryomushki",
};

// 词干 → 英文（以词干开头且其余只是格尾/形容词尾时命中）
export const STEMS_EN: Record<string, string> = {
  "ленинград": "Leningrad", "ленин": "Lenin", "пушкин": "Pushkin", "гагарин": "Gagarin", "горьк": "Gorky", "чехов": "Chekhov",
  "маяковск": "Mayakovsky", "толст": "Tolstoy", "ломоносов": "Lomonosov", "гогол": "Gogol", "достоевск": "Dostoevsky",
  "королев": "Korolev", "жуков": "Zhukov", "киров": "Kirov", "калинин": "Kalinin", "вернадск": "Vernadsky", "кутузов": "Kutuzov",
  "сталин": "Stalin", "брежнев": "Brezhnev", "менделеев": "Mendeleev", "тимирязев": "Timiryazev", "курчатов": "Kurchatov",
  "циолковск": "Tsiolkovsky", "тургенев": "Turgenev", "лермонтов": "Lermontov", "некрасов": "Nekrasov", "суворов": "Suvorov",
  "багратион": "Bagration", "фрунзе": "Frunze", "дзержинск": "Dzerzhinsky", "свердлов": "Sverdlov", "москов": "Moscow",
  "победы": "Victory", "победа": "Victory", "мира": "Mira", "садов": "Garden", "садовое кольцо": "Garden Ring",
};

// 通名（放在名字之后）
export const GENERIC_EN: Record<string, string> = {
  "улица": "Street", "ул": "Street", "ул.": "Street", "проспект": "Prospekt", "пр-т": "Prospekt", "пр-кт": "Prospekt",
  "переулок": "Lane", "пер": "Lane", "пер.": "Lane", "шоссе": "Highway", "ш.": "Highway", "набережная": "Embankment",
  "наб.": "Embankment", "площадь": "Square", "пл.": "Square", "бульвар": "Boulevard", "б-р": "Boulevard", "проезд": "Proyezd",
  "пр-д": "Proyezd", "тупик": "Dead End", "аллея": "Alley", "мост": "Bridge", "тоннель": "Tunnel", "туннель": "Tunnel",
  "просека": "Cutting", "линия": "Line", "магистраль": "Highway", "кольцо": "Ring", "эстакада": "Overpass", "путепровод": "Overpass",
  "парк": "Park", "сад": "Garden", "пруд": "Pond", "пруды": "Ponds", "озеро": "Lake", "река": "River", "остров": "Island",
  "водохранилище": "Reservoir", "канал": "Canal", "ручей": "Stream", "болото": "Marsh", "кладбище": "Cemetery", "лес": "Forest",
  "гора": "Hill", "горы": "Hills", "монастырь": "Monastery", "собор": "Cathedral", "церковь": "Church", "храм": "Church",
  "вокзал": "Railway Station", "станция": "Station", "платформа": "Platform", "аэропорт": "Airport", "метро": "Metro Station",
  "деревня": "Village", "село": "Village", "посёлок": "Settlement", "поселок": "Settlement", "микрорайон": "Microdistrict",
  "мкр": "Microdistrict", "район": "District", "округ": "District", "область": "Oblast", "город": "City", "театр": "Theatre",
  "музей": "Museum", "университет": "University", "институт": "Institute", "академия": "Academy", "школа": "School",
  "больница": "Hospital", "поликлиника": "Clinic", "аптека": "Pharmacy", "магазин": "Shop", "универсам": "Supermarket",
  "рынок": "Market", "стадион": "Stadium", "отель": "Hotel", "гостиница": "Hotel", "библиотека": "Library", "почта": "Post Office",
  "банк": "Bank", "кафе": "Cafe", "ресторан": "Restaurant", "завод": "Factory", "фабрика": "Factory", "гараж": "Garage",
  "парковка": "Parking",
};
