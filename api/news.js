import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy } = req.query;

  // 核心功能：圖片代理，解決巴哈姆特防盜連
  if (proxy) {
    try {
      const imgRes = await fetch(decodeURIComponent(proxy), {
        headers: { 'Referer': 'https://gnn.gamer.com.tw/' }
      });
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return imgRes.body.pipe(res);
    } catch (e) { return res.status(404).end(); }
  }

  // 定義 RSS 來源 (完全免費)
  const twSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" }
  ];
  const globalSources = [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/news/" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ];

  let selected = region === 'tw' ? twSources : (region === 'global' ? globalSources : [...twSources, ...globalSources]);

  try {
    // 使用 rss2json 服務將 XML 轉為 JSON (這部分也是免費且額度極高)
    const results = await Promise.all(selected.map(s => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(s.url)}`).then(r => r.json())
    ));

    let topPicks = []; 
    let others = [];

    results.forEach((data, i) => {
      if (data.status === 'ok') {
        data.items.forEach((item, idx) => {
          let img = item.enclosure?.link || item.thumbnail || "";
          if (!img && item.description) {
            const m = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (m) img = m[1];
          }
          // 巴哈圖片修正
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
    return res.status(500).json({ error: "伺服器連線異常" });
  }
}
