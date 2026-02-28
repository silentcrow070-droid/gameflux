export default async function handler(req, res) {
  // 設置 CORS 與快取
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const allSources = [
    // 1. 官方平台 (原生 RSS)
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss" },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss" },
    { name: "Steam News", url: "https://store.steampowered.com/feeds/news.xml", type: "rss" },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss" },
    // 2. 國際權威 (原生 RSS)
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all", type: "rss" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/game-news/", type: "rss" },
    // 3. 台灣媒體 (混合模式)
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss" }, 
    { name: "巴哈姆特", url: "https://news.google.com/rss/search?q=site:gnn.gamer.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", type: "gnews" }, // 唯獨此項用 GNews
    { name: "遊戲基地", url: "https://news.gamebase.com.tw/", type: "html" }
  ];

  // 雜訊關鍵字過濾 (確保純淨遊戲資訊)
  const JUNK = ['筆電', '顯卡', 'RTX', 'CPU', 'Deals', 'Sale', '開箱', '電競椅', '電競桌'];

  try {
    const results = await Promise.allSettled(allSources.map(s => 
      fetch(s.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, 
        signal: AbortSignal.timeout(12000) 
      }).then(r => r.text())
    ));

    let finalArticles = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const source = allSources[i];
        let items = [];

        if (source.type === "html") {
          // 遊戲基地：HTML 爬蟲邏輯
          const rawItems = result.value.split('<li class="NewsList_item').slice(1, 15);
          rawItems.forEach(item => {
            let title = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || "").replace(/<[^>]*>/g, '').trim();
            if (JUNK.some(k => title.includes(k))) return;
            items.push({
              title, 
              url: item.match(/href="([^"]+)"/)?.[1],
              image: item.match(/src="([^"]+)"/)?.[1] || "",
              source: source.name, 
              ts: Date.now()
            });
          });
        } else {
          // RSS 與 GNews 共通 XML 解析
          const rawItems = result.value.split('<item>').slice(1);
          rawItems.forEach(item => {
            let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
            let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
            
            if (source.type === "gnews") title = title.split(' - ')[0]; // GNews 標題淨化
            if (JUNK.some(k => title.toUpperCase().includes(k.toUpperCase()))) return;

            let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
            let img = (item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i) || 
                      (desc + item).match(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/i))?.[1] || "";

            items.push({ 
              title, 
              url: link, 
              image: img, 
              source: source.name,
              ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now() 
            });
          });
        }
        // 強制每站只取前 5 則
        finalArticles.push(...items.slice(0, 5));
      }
    });

    // 依時間戳排序，混合顯示
    finalArticles.sort((a, b) => b.ts - a.ts);
    res.status(200).json({ articles: finalArticles });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
