# EaseVerse ML Learning System

## Overview

EaseVerse uses a **rule-based machine learning system** that learns from user practice sessions to provide personalized recommendations. It's not traditional deep learning, but rather an **adaptive analytics engine** that improves over time.

## 🧠 How It Learns

### 1. **Data Collection** (Automatic)

#### Session Learning Events

When a user completes a singing session:

- **Location**: [app/(tabs)/index.tsx](<../app/(tabs)/index.tsx#L572>)
- **Triggers**: After session scoring
- **Data Captured**:
  - Lyrics (expected words)
  - Transcript (what was actually sung - from Whisper STT)
  - Text accuracy (word matching rate)
  - Pronunciation clarity
  - Timing consistency (low/medium/high)
  - Weak words (mismatches, coaching targets)
  - Strong words (correctly sung)
  - Phonetic patterns (plosives, fricatives, liquids, nasals, vowels)

#### EasePocket Learning Events

When user completes rhythm training:

- **Location**: [app/easepocket.tsx](../app/easepocket.tsx#L460)
- **Triggers**: After rhythm drill completion
- **Data Captured**:
  - Mode (subdivision/silent/consonant/pocket/slow)
  - BPM, grid (beat/8th/16th), beats per bar
  - Event count, on-time percentage
  - Mean absolute error (milliseconds)
  - Standard deviation, average offset

### 2. **Feature Extraction**

#### Word-Level Analysis

[server/learning/engine.ts](../server/learning/engine.ts#L199-L280) - `deriveSessionWordFeatures()`

**Algorithm**: Longest Common Subsequence (LCS) alignment

```typescript
// Expected: "The quick brown fox"
// Spoken:   "The qick brown fox"
// → Weak word: "quick" (missing 'u')
// → Strong words: "the", "brown", "fox"
```

**Phonetic Pattern Detection**:

```typescript
weakSounds: {
  "plosive_attack": 3,      // p, b, t, d, k, g
  "fricative_clarity": 2,   // f, v, s, z, x, h, j
  "liquid_control": 1,      // l, r
  "nasal_balance": 2,       // m, n, ng
  "vowel_transition": 1,    // consecutive vowels
  "final_consonant": 4      // ending consonants
}
```

#### Timing Analysis

[server/learning/engine.ts](../server/learning/engine.ts#L282-L380) - `buildUserLearningProfile()`

Tracks:

- **Session-level**: Timing consistency (low/medium/high)
- **EasePocket-level**: On-time %, mean error, standard deviation
- **Trends**: Recent vs baseline accuracy (last 6 sessions)

### 3. **User Profile Building**

[server/learning/engine.ts](../server/learning/engine.ts#L282-L470) - `buildUserLearningProfile()`

**Aggregates across all sessions**:

```typescript
UserLearningProfile = {
  sessionCount: 24,
  weakWords: [
    { word: "beautiful", count: 8, weakRate: 0.333 }, // Failed 1/3 of time
    { word: "rhythm", count: 6, weakRate: 0.25 },
  ],
  strongWords: [
    { word: "love", count: 15, strongRate: 0.625 }, // Nailed it 5/8 times
  ],
  trendSummary: {
    recentAvgAccuracy: 82.5, // Last 6 sessions
    baselineAvgAccuracy: 75.0, // Previous 6 sessions
    deltaAccuracy: +7.5, // IMPROVING! 🎉
  },
  tipSummary: [
    {
      tipKey: "vowel-shape:medium",
      shownCount: 12,
      improvedCount: 9,
      successScore: 0.75, // 75% success rate
    },
  ],
};
```

### 4. **Global Intelligence**

[server/learning/store.ts](../server/learning/store.ts#L251-L272) - Cross-user learning

**Collaborative Filtering**:

- Tracks which words are hard **across all users**
- Identifies which coaching tips are most effective **globally**

```typescript
GlobalModel = {
  words: [
    { word: "beautiful", attempts: 89, failures: 67, failureRate: 0.753 },
    { word: "rhythm", attempts: 72, failures: 58, failureRate: 0.806 },
  ],
  tips: [
    {
      tipKey: "consonant-precision:medium",
      shownCount: 145,
      improvedCount: 109,
      successScore: 0.752, // This tip works!
    },
  ],
};
```

### 5. **Smart Recommendations**

[server/learning/engine.ts](../server/learning/engine.ts#L472-L540) - `buildLearningRecommendations()`

**Algorithm**:

1. **Focus Words**: Top 5 personal weak words
2. **Global Challenge Words**: Top 5 hardest words across all users (min 4 attempts)
3. **Suggested Tips**: Match user's weak words with highest-success global tips
4. **Practice Plan**: Adaptive workout generation

**Practice Plan Logic**:

```typescript
// If you have weak words → "Word Repair Drill"
if (focusWords.length > 0) {
  practicePlan.push({
    type: "lyrics",
    title: "Word Repair Drill",
    reason: "Target weak words: beautiful, rhythm, technique"
  });
}

// If timing consistency < 45% → Silent Beat Challenge
if (timingHighRate < 0.45 || avgEasePocketOnTime < 70) {
  practicePlan.push({
    type: "timing",
    title: "Silent Beat Challenge",
    targetMode: "silent"
  });
}

// If consonant problems detected → Consonant Precision
if (weakSounds includes "plosive_attack" or "fricative_clarity") {
  practicePlan.push({
    type: "timing",
    title: "Consonant Precision",
    targetMode: "consonant"
  });
}
```

## 🔄 Complete Workflow

```text
User Sings → Session Complete
    ↓
Whisper STT transcribes audio
    ↓
Session Scoring (Gemini coaches pronunciation)
    ↓
[client] ingestSessionLearningEvent()
    ↓
[server] POST /api/v1/learning/session
    ↓
deriveSessionWordFeatures() → Extract weak/strong words
    ↓
Store in MemoryLearningStore or PostgresLearningStore
    ↓
buildUserLearningProfile() → Aggregate all user sessions
    ↓
Update Global Model (if new weak words/tips)
    ↓
buildLearningRecommendations()
    ↓
Return { profile, recommendations }
    ↓
[client] GET /api/v1/learning/recommendations
    ↓
Display personalized practice plan to user
```

## 📊 Storage Options

### Memory Store (Default)

- In-memory Maps
- Fast, no database needed
- Data lost on server restart
- Perfect for development/testing

### PostgreSQL Store (Production)

- Persistent storage
- Scales across users
- Tables: `learning_session_events`, `learning_easepocket_events`, `learning_user_profiles`
- Auto-deduplication

## 🎯 What Makes It "ML"?

While not traditional neural networks, this system exhibits **machine learning characteristics**:

1. **Learns from data**: Each session improves recommendations
2. **Adaptive**: Recommendations change based on user progress
3. **Pattern recognition**: Identifies phonetic weak points (fricatives, plosives, etc.)
4. **Collaborative filtering**: Uses global data to improve individual recommendations
5. **Feedback loop**: Tips that help users improve get prioritized
6. **Trend analysis**: Detects improvement/decline over time

## 🔧 Key Files

| File                                                      | Purpose                                            |
| --------------------------------------------------------- | -------------------------------------------------- |
| [server/learning/engine.ts](../server/learning/engine.ts) | ML algorithms, feature extraction, recommendations |
| [server/learning/store.ts](../server/learning/store.ts)   | Data persistence (Memory & PostgreSQL)             |
| [lib/learning-client.ts](../lib/learning-client.ts)       | Client-side ingestion API                          |
| [server/routes.ts](../server/routes.ts#L1171-L1279)       | Learning API endpoints                             |

## 🚀 Usage

### Check User Progress

```bash
curl http://localhost:5059/api/v1/learning/profile?userId=user123
```

### Get Recommendations

```bash
curl http://localhost:5059/api/v1/learning/recommendations?userId=user123
```

### View Global Model

```bash
curl http://localhost:5059/api/v1/learning/global-model?limit=20
```

## 📈 Example Output

```json
{
  "userId": "user123",
  "focusWords": ["beautiful", "rhythm", "technique"],
  "globalChallengeWords": ["february", "particularly", "immediately"],
  "suggestedTips": [
    {
      "tipKey": "vowel-shape:medium",
      "successScore": 0.75,
      "rationale": "High-impact coaching pattern for \"beautiful\""
    }
  ],
  "practicePlan": [
    {
      "type": "lyrics",
      "title": "Word Repair Drill",
      "reason": "Target weak words: beautiful, rhythm, technique"
    },
    {
      "type": "timing",
      "title": "Silent Beat Challenge",
      "reason": "Internal pulse consistency is below target.",
      "targetMode": "silent"
    }
  ]
}
```

## ✅ Current Status

- ✅ **Working**: Full learning pipeline operational
- ✅ **Tested**: In-memory store working
- ✅ **Integrated**: Auto-ingestion after sessions/EasePocket
- ✅ **Smart**: Adaptive recommendations based on user + global data
- ⚠️ **PostgreSQL**: Available but optional (set DATABASE_URL)

## 🎓 Learning Effectiveness

The system improves by:

1. **Each session** adds data points for pattern recognition
2. **Tip effectiveness** tracked: successful tips get prioritized
3. **Global intelligence** shared: what works for others helps you
4. **Trend analysis** catches improvement/decline early
5. **Adaptive drills** target your specific weak points

This is a **self-improving system** - the more users practice, the smarter it gets!
