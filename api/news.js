export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, category, sort, proxy } = req.query;

  // 1. 圖片代理（解決巴哈圖片防盜連）
  if (proxy) {
    try {
      const imgRes = await fetch(decodeURIComponent(proxy), { 
        headers: { 
          'Referer': 'https://gnn.gamer.com.tw/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        } 
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
    // 強化抓取標頭，模擬真實瀏覽器，避開 403 錯誤
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'text/xml,application/xml,application/xhtml+xml',
          'Cache-Control': 'no-cache'
        } 
      }).then(async r => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.text();
      })
    ));

    let articles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const xml = result.value;
        const items = xml.split('<item>').slice(1);
        items.forEach(item => {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/)?.[1];
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
          const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
          
          let img = "";
          const imgMatch = desc.match(/<img[^>]+src="([^">]+)"/) || item.match(/<media:content[^>]+url="([^">]+)"/);
          if (imgMatch) img = imgMatch[1];

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

    // 篩選與排序邏輯（維持中英雙語）
    // ... (此處保留之前的過濾代碼) ...

    res.status(200).json({ articles: articles.slice(0, 45) });
  } catch (e) {
    res.status(500).json({ error: "抓取失敗，可能是媒體伺服器暫時阻擋", detail: e.message });
  }
}
