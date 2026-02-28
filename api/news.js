import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy } = req.query;

  // 終極圖片代理邏輯：解決巴哈姆特圖片顯示問題
  if (proxy) {
    try {
      const imgRes = await fetch(decodeURIComponent(proxy), {
        headers: { 
          'Referer': 'https://gnn.gamer.com.tw/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!imgRes.ok) throw new Error('Proxy error');
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return imgRes.body.pipe(res);
    } catch (e) { return res.status(404).end(); }
  }

  const twSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" }
  ];
  const globalSources = [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ];

  let selected = region === 'tw' ? twSources : (region === 'global' ? globalSources : [...twSources, ...globalSources]);

  try {
    // 這裡使用 Promise.allSettled 替代 Promise.all，確保就算一個網站掛掉，其他網站依然能顯示
    const results = await Promise.allSettled(selected.map(s => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(s.url)}&api_key=00000000000000000000000000000000`) // 使用預設 Key 增加穩定性
      .then(r => r.json())
    ));

    let topPicks = []; 
    let others = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.status === 'ok') {
        const data = result.value;
        data.items.forEach((item, idx) => {
          let img = item.enclosure?.link || item.thumbnail || "";
          
          // 如果沒圖，嘗試從內容挖掘
          if (!img && item.description) {
            const m = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (m) img = m[1];
          }
          
          // 針對巴哈姆特圖片的特殊處理
          if (img && img.includes('gamer.com.tw')) {
            img = `/api/news?proxy=${encodeURIComponent(img.replace('/S/', '/B/'))}`;
          }

          const art = {
            title: item.title,
            url: item.link,
            image: img,
            source: selected[i].name,
            ts: new Date(item.pubDate).getTime(),
            time: item.pubDate.slice(5, 16)
          };
          if (idx === 0) topPicks.push(art); else others.push(art);
        });
      }
    });

    topPicks.sort((a, b) => b.ts - a.ts);
    others.sort((a, b) => b.ts - a.ts);

    return res.status(200).json({ articles: [...topPicks, ...others] });
  } catch (err) {
    return res.status(500).json({ error: "RSS 服務暫時無法連線" });
  }
}
