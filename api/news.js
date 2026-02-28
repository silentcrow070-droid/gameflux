export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, category, sort } = req.query;

  // 1. 數據來源 (移除巴哈，加入台灣穩定來源與中國前三大)
  const sources = {
    tw: [
      { name: "UDN 遊戲", url: "https://game.udn.com/rss/news/2003/2004" },
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
      { name: "鏡遊戲", url: "https://www.mirrormedia.mg/rss/category/game" }
    ],
    global: [
      { name: "遊民星空", url: "https://www.gamersky.com/rssfeed/01.xml" },
      { name: "3DM單機", url: "https://www.3dmgame.com/sitemap/news.xml" },
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" }
    ]
  };

  // 簡易簡轉繁字典 (針對常見字)
  const s2t = (str) => {
    const dict = { '游': '遊', '戏': '戲', '电': '電', '竞': '競', '发': '發', '机': '機', '体': '體', '个': '個', '后': '後', '里': '裡', '开': '開', '关': '關' };
    return str.replace(/[游戏电竞发机体个后里开关]/g, m => dict[m] || m);
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
    ));

    let articles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const xml = result.value;
        const items = xml.split('<item>').slice(1);
        items.forEach(item => {
          let title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
          let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
          const link = item.match(/<link>(.*?)<\/link>/)?.[1];
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];

          // 如果是中國網站，進行簡轉繁
          if (selected[i].name === "遊民星空" || selected[i].name === "3DM單機") {
            title = s2t(title);
            desc = s2t(desc);
          }

          let img = desc.match(/<img[^>]+src="([^">]+)"/)?.[1] || "";
          
          articles.push({
            title, url: link, image: img,
            source: selected[i].name,
            ts: new Date(pubDate).getTime() || Date.now(),
            time: pubDate ? pubDate.slice(5, 16) : "",
            desc: desc.replace(/<[^>]*>/g, '').slice(0, 80)
          });
        });
      }
    });

    // 關鍵字過濾 (保持原有的中英雙語邏輯)
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'Switch', 'Xbox', 'Console', '家機', '主機'],
        pc: ['PC', 'Steam', 'Epic', 'RTX', '電腦', '顯卡'],
        mobile: ['Mobile', 'iOS', 'Android', '手遊', '手機'],
        esports: ['Esports', '電競', '比賽', '賽事', '選手']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => keys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    }

    res.status(200).json({ articles: articles.sort((a,b) => b.ts - a.ts).slice(0, 45) });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch news" });
  }
}
