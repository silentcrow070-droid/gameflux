export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const allSources = [
    // --- 1. 官方平台 (RSS, Weight: 2 優先置頂) ---
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss", weight: 2 },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss", weight: 2 },
    { name: "Steam News", url: "https://store.steampowered.com/feeds/news.xml", type: "rss", weight: 2 },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss", weight: 2 },
    
    // --- 2. 國際媒體 (IGN 使用 GNews 繞過封鎖並過濾雜訊) ---
    { 
      name: "IGN", 
      url: "https://news.google.com/rss/search?q=site:ign.com+game+-phone+-tablet+-deals+-lego&hl=en-US&gl=US&ceid=US:en", 
      type: "gnews", 
      weight: 1 
    },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/game-news/", type: "rss", weight: 1 },
    
    // --- 3. 台灣媒體 ---
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss", weight: 1 }, 
    { name: "巴哈姆特", url: "https://news.google.com/rss/search?q=site:gnn.gamer.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", type: "gnews", weight: 1 },
    { name: "遊戲基地", url: "https://news.gamebase.com.tw/", type: "html", weight: 1 }
  ];

  // 二次過濾清單 (防止漏網之魚)
  const JUNK = ['SAMSUNG', 'GALAXY', 'IPHONE', 'SONOS', 'SOUNDBAR', '筆電', '顯卡', '開箱', '樂高', 'LEGO'];

  try {
    const results = await Promise.allSettled(allSources.map(s => 
      fetch(s.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, 
        signal: AbortSignal.timeout(12000) 
      }).then(r => r.text())
    ));

    let finalArticles = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const source = allSources[i];
        let items = [];

        if (source.type === "html") {
          // 遊戲基地 HTML 爬蟲
          const rawItems = result.value.split('<li class="NewsList_item').slice(1, 15);
          rawItems.forEach(item => {
            let title = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || "").replace(/<[^>]*>/g, '').trim();
            if (JUNK.some(k => title.toUpperCase().includes(k))) return;
            items.push({
              title, url: item.match(/href="([^"]+)"/)?.[1],
              image: item.match(/src="([^"]+)"/)?.[1] || "",
              source: source.name, ts: Date.now(), weight: source.weight
            });
          });
        } else {
          // RSS 與 GNews 解析
          const rawItems = result.value.split('<item>').slice(1);
          rawItems.forEach(item => {
            let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
            let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
            
            if (source.type === "gnews") title = title.split(' - ')[0];
            if (JUNK.some(k => title.toUpperCase().includes(k))) return;

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
        finalArticles.push(...items.slice(0, 5));
      }
    });

    // 優先按權重排序 (2 > 1)，其次按時間排序 (最新優先)
    finalArticles.sort((a, b) => b.weight - a.weight || b.ts - a.ts);
    res.status(200).json({ articles: finalArticles });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
