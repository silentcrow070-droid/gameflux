export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { region } = req.query;

  const sources = {
    tw: [
      { name: "遊戲基地", url: "https://news.gamebase.com.tw/", type: "html" },
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss" },
      { name: "UDN遊戲", url: "https://game.udn.com/rss/news/2003/2004", type: "rss" }
    ],
    global: [
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all", type: "rss" },
      { name: "GameSpot", url: "https://www.gamespot.com/feeds/game-news/", type: "rss" },
      { name: "Kotaku", url: "https://kotaku.com/rss", type: "rss" }
    ]
  };

  // 強化黑名單：徹底過濾 3C 硬體與促銷
  const JUNK_KEYWORDS = [
    '筆電', '顯卡', '處理器', 'CPU', 'GPU', 'RTX', 'Laptop', '螢幕', 'Monitor',
    '滑鼠', '鍵盤', '電競椅', '周邊', '開箱', 'Deals', 'Coupons', 'Discount',
    'Air Duster', 'Soundbar', 'Dell', 'Alienware', 'Sonos', 'Sale', 'Tech'
  ];

  const JUNK_PATHS = ['/tech/', '/deals/', '/shopping/', '/gift-guide/'];

  const s2t = (s) => {
    const d = { '游':'遊','戏':'戲','电':'電','竞':'競','发':'發','机':'機','体':'體','后':'後','里':'裡','开':'開','关':'關' };
    return s.replace(/[游戏电竞发机体后里开关]/g, m => d[m] || m);
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }).then(r => r.text())
    ));

    let allArticles = [];
    const now = Date.now();

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const source = selected[i];
        const html = result.value;
        let sourceCount = 0;

        if (source.type === "html") {
          // 遊戲基地爬蟲邏輯
          const items = html.split('<li class="NewsList_item').slice(1, 15);
          items.forEach(item => {
            if (sourceCount >= 8) return;
            let title = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || "").replace(/<[^>]*>/g, '').trim();
            let link = item.match(/href="([^"]+)"/)?.[1] || "";
            if (JUNK_KEYWORDS.some(k => title.includes(k))) return;
            allArticles.push({
              title, url: link.startsWith('http') ? link : `https://news.gamebase.com.tw${link}`,
              image: item.match(/src="([^"]+)"/)?.[1] || "",
              source: source.name, ts: now - (allArticles.length * 1000), time: "今日精選"
            });
            sourceCount++;
          });
        } else {
          // RSS 邏輯 (IGN, 4Gamers, GameSpot, Kotaku)
          const items = html.split('<item>').slice(1);
          items.forEach(item => {
            if (sourceCount >= 8) return;
            let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
            let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
            
            // 雜訊過濾
            if (JUNK_KEYWORDS.some(k => title.toUpperCase().includes(k.toUpperCase()))) return;
            if (JUNK_PATHS.some(p => link.toLowerCase().includes(p))) return;

            let pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
            let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
            let img = (item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i) || (desc + item).match(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/i))?.[1] || "";

            allArticles.push({ title, url: link, image: img, source: source.name, ts: new Date(pubDate).getTime() || now, time: pubDate ? pubDate.slice(5, 16) : "" });
            sourceCount++;
          });
        }
      }
    });

    allArticles.sort((a, b) => b.ts - a.ts);
    res.status(200).json({ articles: allArticles });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
