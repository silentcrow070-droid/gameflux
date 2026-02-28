export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy, category, sort } = req.query;

  // 圖片代理邏輯 (維持不變)
  if (proxy) {
    try {
      const imgRes = await fetch(decodeURIComponent(proxy), { headers: { 'Referer': 'https://gnn.gamer.com.tw/', 'User-Agent': 'Mozilla/5.0' } });
      const arrayBuffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return res.send(Buffer.from(arrayBuffer));
    } catch (e) { return res.status(404).end(); }
  }

  const sources = {
    tw: [
      { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
      { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" }
    ],
    global: [
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
      { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
    ]
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(s.url)}`).then(r => r.json())));
    let articles = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.status === 'ok') {
        result.value.items.forEach(item => {
          let img = item.enclosure?.link || item.thumbnail || "";
          if (!img && item.description) {
            const m = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (m) img = m[1];
          }
          if (img && img.includes('gamer.com.tw')) img = `/api/news?proxy=${encodeURIComponent(img.replace('/S/', '/B/'))}`;

          articles.push({
            title: item.title,
            url: item.link,
            image: img,
            source: selected[i].name,
            ts: new Date(item.pubDate || Date.now()).getTime(),
            time: (item.pubDate || "").slice(5, 16),
            desc: item.description || ""
          });
        });
      }
    });

    // --- 實質功能 1：上方導覽列過濾 (Category) ---
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'Switch', 'Xbox', '家機', 'Console', '主機'],
        pc: ['PC', 'Steam', 'Epic', '顯卡', '電腦'],
        mobile: ['手遊', 'Android', 'iOS', '手機遊戲', 'Mobile'],
        esports: ['電競', '比賽', '選手', '賽事', 'Esports', '大賽']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => keys.some(k => a.title.includes(k) || a.desc.includes(k)));
    }

    // --- 實質功能 2：左側欄位排序 (Sort) ---
    if (sort === 'hot') {
      // 模擬「討論度高」：隨機打亂或根據標題長度排序 (因 RSS 無點擊數據)
      articles.sort((a, b) => b.title.length - a.title.length);
    } else if (sort === 'gossip') {
      // 模擬「遊戲八卦」：過濾包含 爆料、傳聞、Rumor 等字眼
      articles = articles.filter(a => ['爆料', '傳聞', 'Rumor', '據傳', '內幕'].some(k => a.title.includes(k)));
    } else {
      articles.sort((a, b) => b.ts - a.ts);
    }

    return res.status(200).json({ articles: articles.slice(0, 50) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
