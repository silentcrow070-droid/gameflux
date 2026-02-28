export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { region, category } = req.query;

  const sources = {
    tw: [
      { name: "遊戲基地", url: "https://news.gamebase.com.tw/", type: "html" },
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss" },
      { name: "UDN遊戲", url: "https://game.udn.com/rss/news/2003/2004", type: "rss" }
    ],
    global: [
      { name: "遊民星空", url: "https://www.gamersky.com/rssfeed/01.xml", type: "rss" },
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all", type: "rss" }
    ]
  };

  // 雜訊關鍵字黑名單 (過濾非遊戲本體內容)
  const JUNK_WORDS = [
    '筆電', '顯卡', '處理器', '開箱', '周邊', '滑鼠', '鍵盤', '螢幕', '電競椅', 
    '股價', '營收', '併購', '法說會', '聯名', '快閃店', '一番賞', '公仔', '模型'
  ];

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

        if (source.name === "遊戲基地") {
          const items = html.split('<li class="NewsList_item').slice(1, 15);
          items.forEach(item => {
            let title = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || "").replace(/<[^>]*>/g, '').trim();
            // 過濾雜訊
            if (JUNK_WORDS.some(word => title.includes(word))) return;

            let link = item.match(/href="([^"]+)"/)?.[1];
            let img = item.match(/src="([^"]+)"/)?.[1];
            if (title && link) {
              allArticles.push({
                title,
                url: link.startsWith('http') ? link : `https://news.gamebase.com.tw${link}`,
                image: img || "",
                source: "遊戲基地",
                ts: now - (allArticles.length * 1000),
                time: "今日精選"
              });
            }
          });
        } else {
          const items = html.split('<item>').slice(1);
          items.forEach(item => {
            let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
            if (source.name === "遊民星空") title = s2t(title);
            
            // 過濾雜訊
            if (JUNK_WORDS.some(word => title.includes(word))) return;

            let link = item.match(/<link>(.*?)<\/link>/)?.[1];
            let pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
            let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
            let img = "";
            const media = item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i);
            if (media) img = media[1];
            else {
              const imgTags = (desc + item).match(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/i);
              if (imgTags) img = imgTags[1];
            }

            allArticles.push({
              title, url: link.trim(), image: img, source: source.name,
              ts: new Date(pubDate).getTime() || now,
              time: pubDate ? pubDate.slice(5, 16) : ""
            });
          });
        }
      }
    });

    allArticles.sort((a, b) => b.ts - a.ts);
    res.status(200).json({ articles: allArticles.slice(0, 45) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
