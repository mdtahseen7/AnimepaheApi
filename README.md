# AnimePahe Scraper API 

## Features

- Search anime by query
- Get all episodes for a given anime session
- Retrieve source links for a specific episode
- Resolve `.m3u8` URLs from Kwik or embedded players
- FastAPI backend for easy integration with frontends or other tools
- Async, efficient, and capable of bypassing Cloudflare restrictions

---
## 📡 API Endpoints

Once deployed, your API will have these endpoints:

- `GET /` - API information
- `GET /health` - Health check
- `GET /search?q=naruto` - Search anime
- `GET /episodes?session=<session>` - Get episodes
- `GET /sources?anime_session=<session>&episode_session=<session>` - Get sources
- `GET /m3u8?url=<kwik-url>` - Resolve M3U8 URL
- `GET /player.html` - Video player demo



## 📝 Environment Variables

No environment variables needed! The app works out of the box.


**Note:** M3U8 resolution takes 2-3 seconds, well within the timeout.

## Example JSON

```http
GET /search?q=the%20fragrant%20flower%20blooms%20with%20dignity
```

Output:

```json
[
  {
    "id": 6234,
    "title": "The Fragrant Flower Blooms with Dignity",
    "url": "https://animepahe.si/anime/27a95751-0311-47ed-dbce-7f0680d5074a",
    "year": 2025,
    "poster": "https://i.animepahe.si/uploads/posters/7103371364ff1310373c89cf444ffc3e6de0b757694a0936ae80e65cfae400b5.jpg",
    "type": "TV",
    "session": "27a95751-0311-47ed-dbce-7f0680d5074a"
  },
  {
    "id": 279,
    "title": "The iDOLM@STER",
    "url": "https://animepahe.si/anime/b6b777aa-6827-3626-2b30-f0eaea4dbc29",
    "year": 2011,
    "poster": "https://i.animepahe.si/posters/c121185f6dadbe63ef45560032b41d2b5186e2ca39edfd0b2796c3cecaa552b0.jpg",
    "type": "TV",
    "session": "b6b777aa-6827-3626-2b30-f0eaea4dbc29"
  }
]
```

---

```http
GET /episodes?session=27a95751-0311-47ed-dbce-7f0680d5074a
```

Output:

```json
[
  {
    "id": 70730,
    "number": 1,
    "title": "Episode 1",
    "snapshot": "https://i.animepahe.si/uploads/snapshots/22c034f704a286b5ce17cc33a3dccf9258cc83038e5bafbcc5a196b2584c3454.jpg",
    "session": "800a1f7d29d6ebb94d2bfd320b2001b95d00decff4aaecaa6fbef5916379a762"
  },
  {
    "id": 70823,
    "number": 2,
    "title": "Episode 2",
    "snapshot": "https://i.animepahe.si/uploads/snapshots/baf28a9ea1fecf9bbee49844cf3b782632e487ff49d3ba5c93b56241719fab05.jpg",
    "session": "4dd535ded2d2773bb3285881839d018c5787619de262dffb801ab4f78cf20123"
  }
]
```

---

```http
GET /sources?anime_session=27a95751-0311-47ed-dbce-7f0680d5074a&episode_session=800a1f7d29d6ebb94d2bfd320b2001b95d00decff4aaecaa6fbef5916379a762
```

Output:

```json
[
  {
    "url": "https://kwik.si/e/KcfYGhr86Ww2",
    "quality": "1080p",
    "fansub": "KawaSubs",
    "audio": "jpn"
  },
  {
    "url": "https://kwik.si/e/Sr2gRRoVz6wy",
    "quality": "720p",
    "fansub": "KawaSubs",
    "audio": "jpn"
  },
  {
    "url": "https://kwik.si/e/J7jBHBSJhTEv",
    "quality": "360p",
    "fansub": "KawaSubs",
    "audio": "jpn"
  }
]
```

---

```http
GET /m3u8?url=https://kwik.si/e/uEPQKLMzFpaz
```

Output:

```json
{
  "m3u8": "https://vault-12.owocdn.top/stream/12/12/1478df0e98f767de547ac36d33bc92b73b9a5b7318fe3f3e81328fa31fc1eac3/uwu.m3u8"
}
```

## 🔗 After Deployment

1. You'll get a URL like: `https://your-project.vercel.app`

## 🎉 You're Ready!

