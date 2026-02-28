export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { region, category } = req.query;

  // 修正後的 RSS 來源清單
  const sources = {
    tw: [
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
      { name: "UDN遊戲", url: "https://game.udn.com/rss/news/2003/2004" },
      // 更換 ETtoday 原生連結，避免 403 錯誤
      { name: "ETtoday遊戲", url: "https://feeds.feedburner.com/ettoday/game" } 
    ],
    global: [
      { name: "遊民星空", url: "https://www.gamersky.com/rssfeed/01.xml" },
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
      { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
    ]
  };

  const s2t = (s) => {
    const d = { '游':'遊','戏':'戲','电':'電','竞':'競','发':'發','机':'機','体':'體','后':'後','里':'裡','开':'開','关':'關' };
    return s.replace(/[游戏电竞发机体后里开关]/g, m => d[m] || m);
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(5000) // 避免單一網站掛掉拖慢整體
      }).then(r => r.text())
    ));

    let allArticles = [];
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.includes('<item>')) {
        const sourceName = selected[i].name;
        const xml = result.value;
        const items = xml.split('<item>').slice(1);
        let sourceArticles = [];

        items.forEach(item => {
          let title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
          let link = item.match(/<link>(.*?)<\/link>/)?.[1];
          let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
          let pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
          let ts = new Date(pubDate).getTime() || now;

          if (ts < threeDaysAgo) return;

          let img = "";
          // 強化圖片抓取：優先找 enclosure 或 media:content
          const media = item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i);
          if (media) {
            img = media[1];
          } else {
            const imgTags = (desc + item).matchAll(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/gi);
            for (let match of imgTags) {
              if (!/logo|icon|avatar|pixel|fb|line|ads/i.test(match[1])) {
                img = match[1]; break;
              }
            }
          }
          
          if (img && img.startsWith('//')) img = 'https:' + img;
          if (sourceName === "遊民星空") { title = s2t(title); desc = s2t(desc); }

          const hotScore = title.length + (['限時', '免費', '首發', '大作'].some(k => title.includes(k)) ? 50 : 0);

          sourceArticles.push({
            title: title.trim(), url: link.trim(), image: img, source: sourceName,
            ts, hotScore, time: pubDate ? pubDate.slice(5, 16) : ""
          });
        });

        sourceArticles.sort((a, b) => b.hotScore - a.hotScore);
        allArticles.push(...sourceArticles.slice(0, 6));
      }
    });

    allArticles.sort((a, b) => b.ts - a.ts);
    res.status(200).json({ articles: allArticles });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
