export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const allSources = [
    // --- 1. 官方平台 (權重最高) ---
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss", weight: 2 },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss", weight: 2 },
    { name: "Steam News", url: "https://store.steampowered.com/feeds/news.xml", type: "rss", weight: 2 },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss", weight: 2 },
    
    // --- 2. 國際媒體 (更換為純遊戲頻道) ---
    { name: "IGN", url: "https://www.ign.com/rss/articles/games/feed", type: "rss", weight: 1 }, // 改為純 Games 頻道
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/game-news/", type: "rss", weight: 1 },
    
    // --- 3. 台灣媒體 ---
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss", weight: 1 }, 
    { name: "巴哈姆特", url: "https://news.google.com/rss/search?q=site:gnn.gamer.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", type: "gnews", weight: 1 },
    { name: "遊戲基地", url: "https://news.gamebase.com.tw/", type: "html", weight: 1 }
  ];

  // 強化黑名單：徹底封殺 3C 與 非遊戲硬體
  const JUNK = [
    'Samsung', 'Galaxy', 'iPhone', 'iOS', 'Android', 'Sonos', 'Soundbar', 'TV', 
    'LEGO', '樂高', '筆電', '顯卡', 'RTX', 'CPU', 'Deals', 'Sale', '折扣', '特價', 
    '開箱', '電競椅', '桌子', '耳機', '螢幕', 'Monitor'
  ];

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
          const rawItems = result.value.split('<li class="NewsList_item').slice(1, 15);
          rawItems.forEach(item => {
            let title = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || "").replace(/<[^>]*>/g, '').trim();
            if (JUNK.some(k => title.toUpperCase().includes(k.toUpperCase()))) return;
            items.push({
              title, url: item.match(/href="([^"]+)"/)?.[1],
              image: item.match(/src="([^"]+)"/)?.[1] || "",
              source: source.name, ts: Date.now(), weight: source.weight
            });
          });
        } else {
          const rawItems = result.value.split('<item>').slice(1);
          rawItems.forEach(item => {
            let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
            let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
            if (source.type === "gnews") title = title.split(' - ')[0];
            
            // 執行過濾
            if (JUNK.some(k => title.toUpperCase().includes(k.toUpperCase()))) return;

            let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
            let img = (item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i) || 
                      (desc + item).match(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/i))?.[1] || "";

            items.push({ 
              title, url: link, image: img, source: source.name,
              ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now(),
              weight: source.weight
            });
          });
        }
        // 每站選 5 則
        finalArticles.push(...items.slice(0, 5));
      }
    });

    // 先按權重排序，權重相同則按時間排序 (讓官網大新聞更容易置頂)
    finalArticles.sort((a, b) => b.weight - a.weight || b.ts - a.ts);
    
    res.status(200).json({ articles: finalArticles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
