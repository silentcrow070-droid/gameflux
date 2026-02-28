export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, category, sort, proxy } = req.query;

  // 1. 圖片代理邏輯 (維持不變，解決巴哈圖片防盜連)
  if (proxy) {
    try {
      const imgRes = await fetch(decodeURIComponent(proxy), { 
        headers: { 'Referer': 'https://gnn.gamer.com.tw/', 'User-Agent': 'Mozilla/5.0' } 
      });
      const arrayBuffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return res.send(Buffer.from(arrayBuffer));
    } catch (e) { return res.status(404).end(); }
  }

  // 2. 數據來源
  const sources = {
    tw: [
      { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" }
    ],
    global: [
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
      { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
    ]
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
        // 簡單但強大的 XML 正則提取 (不依賴第三方 API)
        const items = xml.split('<item>').slice(1);
        items.forEach(item => {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/)?.[1];
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
          const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
          
          let img = "";
          const imgMatch = desc.match(/<img[^>]+src="([^">]+)"/) || item.match(/<media:content[^>]+url="([^">]+)"/);
          if (imgMatch) img = imgMatch[1];

          // 巴哈圖片代理
          if (img && img.includes('gamer.com.tw')) {
            img = `/api/news?proxy=${encodeURIComponent(img.replace('/S/', '/B/'))}`;
          }

          articles.push({
            title: title || "無標題",
            url: link,
            image: img,
            source: selected[i].name,
            ts: new Date(pubDate).getTime(),
            time: pubDate ? pubDate.slice(5, 16) : "",
            desc: desc
          });
        });
      }
    });

    // 3. 中英雙語過濾邏輯
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'PlayStation', 'Switch', 'Nintendo', 'Xbox', 'Console', '家機', '任天堂'],
        pc: ['PC', 'Steam', 'Epic', 'GPU', 'NVIDIA', 'RTX', '電腦', '顯卡'],
        mobile: ['Mobile', 'iOS', 'Android', 'iPhone', '手遊', '手機遊戲'],
        esports: ['Esports', 'Tournament', 'League', '電競', '比賽', '選手', '戰隊', '冠軍']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => keys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    }

    // 4. 左側功能邏輯
    if (sort === 'gossip') {
      const gossipKeys = ['Rumor', 'Leak', 'Insider', '疑似', '傳聞', '爆料', '據傳', '內幕'];
      articles = articles.filter(a => gossipKeys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    } else if (sort === 'hot') {
      const hotKeys = ['Hot', 'Top', 'Best', '熱門', '必玩', '排行', '大作', '首發'];
      articles.sort((a, b) => {
        const score = (txt) => hotKeys.filter(k => txt.toUpperCase().includes(k.toUpperCase())).length;
        return score(b.title) - score(a.title) || b.ts - a.ts;
      });
    } else {
      articles.sort((a, b) => b.ts - a.ts);
    }

    res.status(200).json({ articles: articles.slice(0, 45) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
