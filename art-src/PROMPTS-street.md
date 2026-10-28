# 健康素食保衛戰：要生成的圖

遊戲已經可以用「程式畫的替代圖」玩（`/?stage=street`）。圖放進 `art-src/` 後執行對應的 `tools/` 腳本，遊戲就會自動換成新圖。
風格跟現有的一樣：16 位元像素風、粗黑邊、洋紅底（#FF00FF）、格線用黑色。

| 檔名（放 `art-src/`） | 內容 | 之後執行 |
|---|---|---|
| `bg-street.png` | 一整個畫面的山間素食街背景 | `python3 tools/build_street.py` |
| `bandit-design.jpg`、`bandit-a.jpg`、`bandit-b.jpg` | 山賊（小兵）設計圖和兩張動作表 | `python3 tools/build_enemies.py` |
| `chief-design.jpg`、`chief-a.jpg`、`chief-b.jpg` | 山賊頭目設計圖和兩張動作表 | 同上 |
| `owner-design.jpg`、`owner-a.jpg` | 素食店老闆設計圖和一排三個姿勢 | 同上 |

做法跟之前一樣：先出「設計圖」，滿意後把設計圖附上當參考，再出動作表，這樣每一格的人才會長得一樣。

## 共用的風格句（每個角色 prompt 的開頭都貼這段）

```
16-bit SNES-era pixel art in the style of Final Fight / Streets of Rage, chunky pixels, thick dark outlines, limited
palette, stocky chibi proportions (big head, about 3 heads tall), side view slightly turned, character faces RIGHT.
Flat solid magenta background (#FF00FF). No ground shadow, no text, no captions, no watermark.
```

## 1. 山賊（小兵）

### 設計圖（單張）

```
[共用風格句]
Single character design, full body, idle stance. A Yellow Turban bandit ("黃巾賊") of ancient China: a dirty yellow cloth
headband/turban tied at the forehead with two short tails, messy black hair and stubble, angry shouting face, ragged
ochre-brown short tunic with the sleeves torn off, bare forearms with cloth wraps, rope belt, baggy dark brown trousers,
straw sandals. In his right hand he holds a burning wooden torch (bright orange-yellow flame, kept small and close to the
hand), the other hand is a fist. Menacing but a little comical.
```

### 動作表 A（bandit-a.jpg）：2 排，第一排 4 格、第二排 3 格

格與格之間、排與排之間畫 4 px 黑色格線；每格一個姿勢，同一個人、同樣大小、腳都落在每格的同一條水平線上。

```
[共用風格句] Same character as the attached design (reference image). A sprite sheet, magenta background, separated by thick black grid
lines. Row 1, four cells: (1) idle standing, torch held low; (2) walk frame 1; (3) walk frame 2; (4) walk frame 3 (a walk
cycle, torch in the right hand, left arm swinging). Row 2, three cells: (1) wind-up, torch pulled back over the shoulder,
leaning back; (2) the swing, torch swung forward and down at arm's length, body lunging, no motion-blur effect drawn;
(3) follow-through, torch low in front, body leaning forward. Keep the flame inside the torch only.
```

### 動作表 B（bandit-b.jpg）：同樣 2 排，第一排 4 格、第二排 3 格

```
[共用風格句] Same character, same sheet layout and grid lines. Row 1, four cells: (1) hurt: flinching back, eyes squeezed
shut, mouth open in pain; (2) knocked back: flying through the air, body tilted back, arms flung out, torch dropped;
(3) idle variation: fist raised, shouting; (4) lying flat on his back on the ground, head to the RIGHT and feet to the
LEFT, eyes closed. Row 2, three cells: (1) getting up: crouching with one knee down, one hand on the ground; (2) rushing
forward at full speed, torch held out in front, body leaning far forward; (3) ready stance: low guard, one leg stepped
back, torch held ready (the start of a kick).
```

## 2. 山賊頭目

### 設計圖

```
[共用風格句] Single character design, full body. The chief of the Yellow Turban bandits: a hulking heavy man, clearly bigger
and wider than an ordinary bandit (about 1.3 times), a large yellow turban with two long tails, fierce red beard and
angry eyes, open yellow-and-red robe showing a big bare chest and belly, gold prayer-bead necklace, wide dark sash,
arm guards, heavy boots. He carries a huge burning club (a spiked log with flames at its head) on one shoulder.
```

### 動作表 A（chief-a.jpg）：2 排，每排 3 格

```
[共用風格句] Same character as the attached design. Sprite sheet, magenta background, thick black grid lines. Row 1, three cells:
(1) idle standing, club held at his side; (2) walk frame 1; (3) walk frame 2. Row 2, three cells: (1) wind-up, club
raised high over his head with both hands; (2) the slam, club smashed down in front of him, body bent forward, no impact effect drawn;
(3) follow-through, club resting on the ground in front, body leaning on it.
```

### 動作表 B（chief-b.jpg）：2 排，每排 3 格

```
[共用風格句] Same character, same layout. Row 1, three cells: (1) hurt: flinching, teeth clenched; (2) knocked back, flying
through the air, club flying off; (3) lying flat on his back, head to the RIGHT, feet to the LEFT. Row 2, three cells:
(1) getting up from one knee; (2) charging forward, club held back, leaning far forward; (3) roaring: head thrown back, mouth wide open,
club raised in one hand (flames only on the club, no text).
```

## 3. 素食店老闆

### 設計圖

```
[共用風格句] Single character design, full body. The friendly owner of a vegetarian shop in a mountain village: a middle-aged,
plump, kind man with a gentle smile and a small mustache, a white cloth tied around his head, a white kimono-style shirt
with the sleeves rolled up, a long green apron down to his knees, plain trousers, cloth shoes. Hands free.
```

### 姿勢表（owner-a.jpg）：1 排 3 格

```
[共用風格句] Same character as the attached design. A single row of three cells, magenta background, separated by thick black grid
lines, same size, feet on the same line: (1) idle standing, hands together in front of the apron, smiling; (2) talking,
one hand raised, mouth open; (3) offering: one arm stretched forward at chest height, palm up and EMPTY (the item is added
by the game), warm smile.
```

遊戲裡老闆站在店門口，面向左邊（遊戲會把圖左右翻轉），所以圖裡請朝右。

## 4. 背景（bg-street.png）

接近 8:7 的橫圖（例如 1341×1173），一個畫面、沒有人物、沒有文字。重點是「位置」：遊戲用百分比定位，請照下面描述的位置畫。

```
16-bit SNES-era pixel art, side-scrolling beat-'em-up stage background, a single fixed screen, aspect ratio 8:7, crisp
pixels, rich but limited palette. No characters, no people, no text anywhere.
A quiet mountain-village street at dusk (blue hour with an orange glow on the horizon, so that torchlight will stand out
later). Top 0-45%: the sky, layered misty mountains and terraced hills far away. Around 45-62% of the height, the back
of the street: on the left a few Chinese bayberry (yangmei) trees full of dark-red bumpy round fruits, and carambola
(starfruit) trees hung with yellow-green star-shaped fruits, a low wooden fence, a stone lantern. In the right-centre, a
single-storey wooden shop with a dark tiled roof, its open front facing us: the shop's door is centred at 77% of the
width and the base of its front wall sits at 61% of the height. Green noren curtain across the doorway, wooden crates in
front of the shop piled with fresh vegetables (bok choy, white radish, mushrooms, tofu), paper lanterns at the eaves, and
above the door a hanging wooden signboard that is completely BLANK (no writing), its centre at 77% width and 33% height,
about 24% of the width wide and 6% high. The street itself fills the lower part, from 62% to 93% of the height: flat, wide, open packed-earth road with a few
pebbles and wheel ruts, nothing standing on it, nothing blocking the middle, no steps, no objects; below it (93-100%) a
narrow gutter and grass edge. The overall mood: peaceful, healthy, a little humorous.
```

做完 `bg-street.png` 後，如果招牌的位置跟遊戲預設不同，用 `--sign X Y W H`（256×224 畫面上的像素）告訴我，遊戲就會在空白招牌上寫「健康素食」：

```
python3 tools/build_street.py --sign 166 68 62 13 --preview /tmp/street.png
```
