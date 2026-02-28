export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy, category, sort } = req.query;

  // 1. 圖片代理：解決巴哈圖片防盜連
  if (proxy) {
    try {
      const targetUrl = decodeURIComponent(proxy);
      const imgRes = await fetch(targetUrl, {
        headers: { 'Referer': 'https://gnn.gamer.com.tw/', 'User-Agent': 'Mozilla/5.0' }
      });
      const arrayBuffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      return res.send(Buffer.from(arrayBuffer));
    } catch (e) { return res.status(404).end(); }
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
    const results = await Promise.allSettled(selected.map(s => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(s.url)}`).then(r => r.json())
    ));

    let articles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.status === 'ok') {
        result.value.items.forEach(item => {
          let img = item.enclosure?.link || item.thumbnail || "";
          if (!img && item.description) {
            const m = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (m) img = m[1];
          }
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
            desc: item.description || ""
          });
        });
      }
    });

    // --- 實質功能：上方分類 (Category) + 中英雙語關鍵字 ---
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'PS4', 'PlayStation', 'Switch', 'Nintendo', 'NS', 'Xbox', 'Console', '家機', '主機', '任天堂'],
        pc: ['PC', 'Steam', 'Epic', 'GPU', 'NVIDIA', 'RTX', 'AMD', 'Desktop', '電腦', '顯卡', '光追', 'Ray Tracing'],
        mobile: ['Mobile', 'iOS', 'Android', 'iPhone', 'iPad', 'App Store', 'Google Play', '手遊', '手機遊戲', '行動遊戲'],
        esports: ['Esports', 'Tournament', 'League', 'Pro Player', 'Team', 'Match', '電競', '比賽', '選手', '賽事', '聯賽', '戰隊', '冠軍', '奪冠']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => {
        const fullText = (a.title + a.desc).toUpperCase();
        return keys.some(k => fullText.includes(k.toUpperCase()));
      });
    }

    // --- 實質功能：左側欄位邏輯 (Sort) + 中英雙語關鍵字 ---
    if (sort === 'gossip') {
      const gossipKeys = ['Rumor', 'Leak', 'Insider', 'Unconfirmed', 'Reported', '疑似', '傳聞', '爆料', '據傳', '內幕', '外洩', '神祕'];
      articles = articles.filter(a => {
        const fullText = (a.title + a.desc).toUpperCase();
        return gossipKeys.some(k => fullText.includes(k.toUpperCase()));
      });
    } else if (sort === 'hot') {
      const hotKeys = ['Hot', 'Top', 'Best', 'Must Play', 'Exclusive', 'First Look', '熱門', '必玩', '排行', '大作', '首發', '獨佔', '強檔', '期待'];
      articles.sort((a, b) => {
        const scoreA = hotKeys.filter(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())).length;
        const scoreB = hotKeys.filter(k => (b.title + b.desc).toUpperCase().includes(k.toUpperCase())).length;
        return scoreB - scoreA || b.ts - a.ts;
      });
    } else {
      articles.sort((a, b) => b.ts - a.ts);
    }

    return res.status(200).json({ articles: articles.slice(0, 40) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
