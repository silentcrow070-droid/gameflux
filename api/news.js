export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, category, sort } = req.query;

  // 1. 數據來源：移除防護過嚴的巴哈，改用穩定且高品質的來源
  const sources = {
    tw: [
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
      { name: "UDN遊戲", url: "https://game.udn.com/rss/news/2003/2004" },
      { name: "ETtoday遊戲", url: "https://feeds.feedburner.com/ettoday/game" }
    ],
    global: [
      { name: "遊民星空", url: "https://www.gamersky.com/rssfeed/01.xml" },
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
      { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
    ]
  };

  // 簡轉繁字典 (處理中國來源)
  const s2t = (s) => {
    const d = { '游':'遊','戏':'戲','电':'電','竞':'競','发':'發','机':'機','体':'體','后':'後','里':'裡','开':'開','关':'關' };
    return s.replace(/[游戏电竞发机体后里开关]/g, m => d[m] || m);
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36' } 
      }).then(r => r.text())
    ));

    let articles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const xml = result.value;
        const items = xml.split('<item>').slice(1);
        
        items.forEach(item => {
          let title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
          let link = item.match(/<link>(.*?)<\/link>/)?.[1];
          let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
          let encoded = item.match(/<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/s)?.[1] || "";
          let pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];

          // --- 強化版圖片掃描邏輯 ---
          let img = "";
          const fullSearch = desc + encoded + item;
          const imgMatch = fullSearch.match(/src="([^">]+?\.(?:jpg|jpeg|png|webp|gif)[^">]*?)"/i) || 
                           item.match(/<media:content[^>]+url="([^">]+)"/i) ||
                           item.match(/<enclosure[^>]+url="([^">]+)"/i);
          if (imgMatch) img = imgMatch[1];
          if (img && img.startsWith('//')) img = 'https:' + img;

          // 中國來源處理
          if (["遊民星空", "PC Gamer"].includes(selected[i].name) && title) {
            title = s2t(title);
            desc = s2t(desc);
          }

          if (title && link) {
            articles.push({
              title: title.trim(),
              url: link.trim(),
              image: img,
              source: selected[i].name,
              ts: new Date(pubDate).getTime() || Date.now(),
              time: pubDate ? pubDate.slice(5, 16) : "",
              desc: desc.replace(/<[^>]*>/g, '').slice(0, 100)
            });
          }
        });
      }
    });

    // 關鍵字分類與八卦過濾
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'Switch', 'Nintendo', 'Xbox', 'Console', '家機', '任天堂'],
        pc: ['PC', 'Steam', 'Epic', 'RTX', 'GPU', '電腦', '顯卡'],
        mobile: ['Mobile', 'iOS', 'Android', '手機', '手遊', 'iPhone'],
        esports: ['Esports', 'Tournament', '電競', '比賽', '選手', '聯賽', '戰隊']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => keys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    }

    if (sort === 'gossip') {
      const gossipKeys = ['Rumor', 'Leak', 'Insider', '疑似', '傳聞', '爆料', '內幕'];
      articles = articles.filter(a => gossipKeys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    } else if (sort === 'hot') {
      const hotKeys = ['Hot', 'Top', 'Best', '熱門', '必玩', '排行', '大作', '首發'];
      articles.sort((a, b) => {
        const score = (t) => hotKeys.filter(k => t.toUpperCase().includes(k.toUpperCase())).length;
        return score(b.title) - score(a.title) || b.ts - a.ts;
      });
    } else {
      articles.sort((a, b) => b.ts - a.ts);
    }

    res.status(200).json({ articles: articles.slice(0, 40) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
