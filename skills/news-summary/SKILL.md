---
name: news-summary
description: This skill should be used when the user asks for news updates, daily briefings, or what's happening in the world. Fetches news from trusted international RSS feeds and can create voice summaries using OpenRouter for AI summarization and ElevenLabs for TTS.
---

# News Summary

## Overview

Fetch and summarize news from trusted international sources via RSS feeds. Uses OpenRouter API for AI-powered summarization and ElevenLabs for text-to-speech.

## Environment Variables

Uses `OPENROUTER_API_KEY` for AI summarization and `ELEVENLABS_API_KEY` for voice generation (already configured in system).

## RSS Feeds

### BBC (Primary)
```bash
# World news
curl -s "https://feeds.bbci.co.uk/news/world/rss.xml"

# Top stories
curl -s "https://feeds.bbci.co.uk/news/rss.xml"

# Business
curl -s "https://feeds.bbci.co.uk/news/business/rss.xml"

# Technology
curl -s "https://feeds.bbci.co.uk/news/technology/rss.xml"
```

### Reuters
```bash
# World news
curl -s "https://www.reutersagency.com/feed/?best-regions=world&post_type=best"
```

### NPR (US perspective)
```bash
curl -s "https://feeds.npr.org/1001/rss.xml"
```

### Al Jazeera (Global South perspective)
```bash
curl -s "https://www.aljazeera.com/xml/rss/all.xml"
```

## Parse RSS

Extract titles and descriptions:
```bash
curl -s "https://feeds.bbci.co.uk/news/world/rss.xml" | \
  grep -E "<title>|<description>" | \
  sed 's/<[^>]*>//g' | \
  sed 's/^[ \t]*//' | \
  head -30
```

## Workflow

### Text summary
1. Fetch BBC world headlines
2. Optionally supplement with Reuters/NPR
3. Use OpenRouter API to summarize key stories
4. Group by region or topic

### AI Summarization via OpenRouter

```bash
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://xvadur.com" \
  -H "X-Title: Chat News Summary" \
  -d '{
    "model": "openrouter/minimax/minimax-m2.5",
    "messages": [
      {
        "role": "system",
        "content": "You are a news summarizer. Create a concise summary of 5-8 top stories from the provided RSS feeds. Group by category: World, Business, Tech. Be objective and factual."
      },
      {
        "role": "user",
        "content": "<paste RSS content here>"
      }
    ]
  }'
```

### Voice summary
1. Create text summary
2. Generate voice with ElevenLabs TTS (using existing ELEVENLABS_API_KEY)
3. Send as audio message

```bash
curl -s https://api.elevenlabs.io/v1/text-to-speech/ME1zhyvtt0G1O9QOp0H4 \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "<news summary text>",
    "model_id": "eleven_monolingual_v1",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.5
    }
  }' \
  --output /tmp/news.mp3
```

## Example Output Format

```
📰 News Summary [date]

🌍 WORLD
- [headline 1]
- [headline 2]

💼 BUSINESS
- [headline 1]

💻 TECH
- [headline 1]
```

## Best Practices

- Keep summaries concise (5-8 top stories)
- Prioritize breaking news and major events
- For voice: ~2 minutes max
- Balance perspectives (Western + Global South)
- Cite source if asked
- Use OpenRouter for cost-effective AI summarization
