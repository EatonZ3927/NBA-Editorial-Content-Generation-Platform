export type TeamInfo = { zh: string; short: string; conf: "East" | "West" };

export const TEAMS: Record<string, TeamInfo> = {
  ATL: { zh: "亚特兰大老鹰", short: "老鹰", conf: "East" },
  BOS: { zh: "波士顿凯尔特人", short: "凯尔特人", conf: "East" },
  BKN: { zh: "布鲁克林篮网", short: "篮网", conf: "East" },
  CHA: { zh: "夏洛特黄蜂", short: "黄蜂", conf: "East" },
  CHI: { zh: "芝加哥公牛", short: "公牛", conf: "East" },
  CLE: { zh: "克利夫兰骑士", short: "骑士", conf: "East" },
  DAL: { zh: "达拉斯独行侠", short: "独行侠", conf: "West" },
  DEN: { zh: "丹佛掘金", short: "掘金", conf: "West" },
  DET: { zh: "底特律活塞", short: "活塞", conf: "East" },
  GSW: { zh: "金州勇士", short: "勇士", conf: "West" },
  HOU: { zh: "休斯顿火箭", short: "火箭", conf: "West" },
  IND: { zh: "印第安纳步行者", short: "步行者", conf: "East" },
  LAC: { zh: "洛杉矶快船", short: "快船", conf: "West" },
  LAL: { zh: "洛杉矶湖人", short: "湖人", conf: "West" },
  MEM: { zh: "孟菲斯灰熊", short: "灰熊", conf: "West" },
  MIA: { zh: "迈阿密热火", short: "热火", conf: "East" },
  MIL: { zh: "密尔沃基雄鹿", short: "雄鹿", conf: "East" },
  MIN: { zh: "明尼苏达森林狼", short: "森林狼", conf: "West" },
  NOP: { zh: "新奥尔良鹈鹕", short: "鹈鹕", conf: "West" },
  NYK: { zh: "纽约尼克斯", short: "尼克斯", conf: "East" },
  OKC: { zh: "俄克拉荷马城雷霆", short: "雷霆", conf: "West" },
  ORL: { zh: "奥兰多魔术", short: "魔术", conf: "East" },
  PHI: { zh: "费城76人", short: "76人", conf: "East" },
  PHX: { zh: "菲尼克斯太阳", short: "太阳", conf: "West" },
  POR: { zh: "波特兰开拓者", short: "开拓者", conf: "West" },
  SAC: { zh: "萨克拉门托国王", short: "国王", conf: "West" },
  SAS: { zh: "圣安东尼奥马刺", short: "马刺", conf: "West" },
  TOR: { zh: "多伦多猛龙", short: "猛龙", conf: "East" },
  UTA: { zh: "犹他爵士", short: "爵士", conf: "West" },
  WAS: { zh: "华盛顿奇才", short: "奇才", conf: "East" },
};

/** ESPN 接口当前使用的短缩写（SA/GS/NY/PH/NO/WSH…）到标准缩写的映射 */
export const TEAM_ALIASES: Record<string, string> = {
  SA: "SAS",
  SAN: "SAS",
  GS: "GSW",
  NY: "NYK",
  PH: "PHX",
  NO: "NOP",
  NOR: "NOP",
  WSH: "WAS",
  UTA: "UTA",
  BKN: "BKN",
  OKC: "OKC",
  LAL: "LAL",
  LAC: "LAC",
};

function canon(abbr: string): string {
  const upper = abbr.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
}

export function teamZh(abbr?: string | null): string {
  if (!abbr) return "";
  return TEAMS[canon(abbr)]?.zh ?? abbr;
}

export function teamShort(abbr?: string | null): string {
  if (!abbr) return "";
  return TEAMS[canon(abbr)]?.short ?? abbr;
}

/** 常用球星中文名（用于中文文案输出） */
export const PLAYER_ZH: Record<string, string> = {
  "LeBron James": "勒布朗·詹姆斯",
  "Stephen Curry": "斯蒂芬·库里",
  "Kevin Durant": "凯文·杜兰特",
  "Giannis Antetokounmpo": "扬尼斯·阿德托昆博",
  "Nikola Jokic": "尼古拉·约基奇",
  "Luka Doncic": "卢卡·东契奇",
  "Jayson Tatum": "杰森·塔图姆",
  "Shai Gilgeous-Alexander": "谢伊·吉尔杰斯-亚历山大",
  "Anthony Davis": "安东尼·戴维斯",
  "Kawhi Leonard": "科怀·伦纳德",
  "James Harden": "詹姆斯·哈登",
  "Kyrie Irving": "凯里·欧文",
  "Damian Lillard": "达米安·利拉德",
  "Devin Booker": "德文·布克",
  "Joel Embiid": "乔尔·恩比德",
  "Jimmy Butler": "吉米·巴特勒",
  "Zion Williamson": "锡安·威廉森",
  "Ja Morant": "贾·莫兰特",
  "Trae Young": "特雷·杨",
  "Donovan Mitchell": "多诺万·米切尔",
  "Russell Westbrook": "拉塞尔·威斯布鲁克",
  "Chris Paul": "克里斯·保罗",
  "Klay Thompson": "克莱·汤普森",
  "Draymond Green": "德雷蒙德·格林",
  "Anthony Edwards": "安东尼·爱德华兹",
  "Victor Wembanyama": "维克托·文班亚马",
  "Karl-Anthony Towns": "卡尔-安东尼·唐斯",
  "Paul George": "保罗·乔治",
  "DeMar DeRozan": "德玛尔·德罗赞",
  "Bradley Beal": "布拉德利·比尔",
  "Rudy Gobert": "鲁迪·戈贝尔",
  "Bam Adebayo": "巴姆·阿德巴约",
  "Jaylen Brown": "杰伦·布朗",
  "Tyrese Haliburton": "泰瑞斯·哈利伯顿",
  "Jalen Brunson": "杰伦·布伦森",
  "Cade Cunningham": "凯德·坎宁安",
  "Scottie Barnes": "斯科蒂·巴恩斯",
  "Evan Mobley": "埃文·莫布利",
  "Paolo Banchero": "保罗·班凯罗",
  "Cooper Flagg": "库珀·弗拉格",
  "Kevin Love": "凯文·乐福",
  "Derrick Rose": "德里克·罗斯",
  "Kobe Bryant": "科比·布莱恩特",
  "Tim Duncan": "蒂姆·邓肯",
  "Dirk Nowitzki": "德克·诺维茨基",
  "Dwyane Wade": "德维恩·韦德",
  "Carmelo Anthony": "卡梅罗·安东尼",
  "Kevin Garnett": "凯文·加内特",
  "Allen Iverson": "阿伦·艾弗森",
  "Vince Carter": "文斯·卡特",
  "Kawhi Leonard ": "科怀·伦纳德",
};

export function playerZh(name?: string | null): string | null {
  if (!name) return null;
  const clean = name.trim();
  return PLAYER_ZH[clean] ?? null;
}

export function displayNameZh(name?: string | null): string {
  if (!name) return "";
  const zh = playerZh(name);
  return zh ? `${zh}（${name.trim()}）` : name.trim();
}

/** 明星球星名单，用于首页/编辑器快捷选择 */
export const STAR_PICKS: { espnId: string; name: string; team: string }[] = [
  { espnId: "1966", name: "LeBron James", team: "PHI" },
  { espnId: "3975", name: "Stephen Curry", team: "GSW" },
  { espnId: "3202", name: "Kevin Durant", team: "HOU" },
  { espnId: "3032977", name: "Giannis Antetokounmpo", team: "MIA" },
  { espnId: "3112335", name: "Nikola Jokic", team: "DEN" },
  { espnId: "3945274", name: "Luka Doncic", team: "LAL" },
  { espnId: "4065648", name: "Jayson Tatum", team: "BOS" },
  { espnId: "4278073", name: "Shai Gilgeous-Alexander", team: "OKC" },
  { espnId: "6583", name: "Anthony Davis", team: "WAS" },
  { espnId: "5104157", name: "Victor Wembanyama", team: "SAS" },
  { espnId: "3908809", name: "Donovan Mitchell", team: "CLE" },
  { espnId: "3917376", name: "Jaylen Brown", team: "PHI" },
  { espnId: "4594268", name: "Anthony Edwards", team: "MIN" },
  { espnId: "4396993", name: "Tyrese Haliburton", team: "IND" },
  { espnId: "3934672", name: "Jalen Brunson", team: "NYK" },
  { espnId: "4432166", name: "Cade Cunningham", team: "DET" },
  { espnId: "5041939", name: "Cooper Flagg", team: "DAL" },
  { espnId: "3978", name: "DeMar DeRozan", team: "DEN" },
];
