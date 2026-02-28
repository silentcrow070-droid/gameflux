export default async function handler(req, res) {
  // 基礎 Header 設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy } = req.query;

  // 1. 圖片代理：解決巴哈圖片防盜連
  if (proxy) {
    try {
      const targetUrl = decodeURIComponent(proxy);
      const imgRes = await fetch(targetUrl, {
        headers: { 
          'Referer': 'https://gnn.gamer.com.tw/',
          'User-Agent': 'Mozilla/5.0' 
        }
      });
      const arrayBuffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return res.send(Buffer.from(arrayBuffer));
    } catch (e) {
      return res.status(404).end();
    }
  }

  // 2. RSS 來源定義
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
    // 3. 抓取資料 (加入 timeout 避免 500 錯誤)
    const results = await Promise.allSettled(selected.map(s => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(s.url)}`)
      .then(r => r.json())
    ));

    let articles = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.status === 'ok') {
        const data = result.value;
        data.items.forEach((item, idx) => {
          let img = item.enclosure?.link || item.thumbnail || "";
          
          // 從 Description 挖圖
          if (!img && item.description) {
            const m = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (m) img = m[1];
          }

          // 處理巴哈圖片代理
          if (img && img.includes('gamer.com.tw')) {
            img = `/api/news?proxy=${encodeURIComponent(img.replace('/S/', '/B/'))}`;
          }

          articles.push({
            title: item.title,
            url: item.link,
            image: img,
            source: selected[i].name,
            ts: new Date(item.pubDate || Date.now()).getTime(),
            time: (item.pubDate || "").slice(5, 16),
            isTop: idx === 0 // 標記為各站第一篇
          });
        });
      }
    });

    // 4. 排序：各站第一篇優先，剩下的按時間排
    const topPicks = articles.filter(a => a.isTop).sort((a, b) => b.ts - a.ts);
    const others = articles.filter(a => !a.isTop).sort((a, b) => b.ts - a.ts);

    return res.status(200).json({ articles: [...topPicks, ...others] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
