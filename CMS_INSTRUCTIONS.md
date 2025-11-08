# Instruktioner för CMS-integration

## Problem 1: Tomma divs får display:none

Alla viktiga divs har nu `::before` pseudo-element i CSS som förhindrar att de blir tomma. Detta är redan implementerat i `styles.css`.

## Problem 2: SVG-karta kan inte laddas upp

Du har två alternativ:

### Alternativ 1: Bädda in SVG direkt i HTML (REKOMMENDERAT)

1. Öppna din SVG-fil (`world.svg`) i en textredigerare
2. Kopiera hela SVG-koden (från `<svg>` till `</svg>`)
3. Ersätt innehållet i `map-container` div i HTML:

```html
<div class="map-container" id="mapContainer">
    <!-- Klistra in din SVG-kod här -->
    <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg">
        <!-- Hela SVG-koden här -->
    </svg>
</div>
```

4. **Ingen kodändring behövs!** Koden i `script.js` kontrollerar automatiskt om SVG redan finns i HTML och använder den i så fall. Du behöver bara bädda in SVG-koden i HTML.

### Alternativ 2: Ladda upp på GitHub och länka

1. Ladda upp `world.svg` till ett GitHub-repo
2. Gå till filen på GitHub och klicka "Raw"
3. Kopiera den direkta länken (t.ex. `https://raw.githubusercontent.com/user/repo/main/world.svg`)
4. Uppdatera `localSvgPath` i `script.js`:

```javascript
const localSvgPath = 'https://raw.githubusercontent.com/user/repo/main/world.svg';
```

**OBS:** Detta kan fortfarande ha CORS-problem beroende på GitHub-inställningar.

## Rekommendation

**Använd Alternativ 1** - det är enklast, fungerar alltid, och du har full kontroll. SVG-koden blir en del av HTML-filen och behöver inte laddas separat.

