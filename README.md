# Världskarta - Donationer Visualisering

En interaktiv världskarta som visar donationer som ljuspunkter på kartan.

## Funktioner

- **Ljuspunkter**: Varje punkt representerar 50 kr (konfigurerbart)
- **Regional fördelning**: 40% av punkterna placeras i Sydamerika och södra Afrika (konfigurerbart)
- **Nya donationer**: Nya donationer visas i en annan färg och större storlek i 15 sekunder
- **Automatisk uppdatering**: Hämtar data från API var 60:e sekund (konfigurerbart)
- **Responsiv**: Anpassar sig automatiskt när kartan ändrar storlek
- **Landkontroll**: Punkter placeras endast på land, inte på hav

## Installation

1. Ladda ner alla filer:
   - `index.html`
   - `styles.css`
   - `script.js`

2. **Viktigt - SVG Karta**: 
   - Kartan försöker laddas från `https://mapsvg.com/maps/world`
   - På grund av CORS-begränsningar kan detta inte fungera direkt
   - **Lösning**: Ladda ner SVG-filen från mapsvg.com och spara den lokalt, eller hosta den på din egen server
   - Uppdatera `script.js` rad 132 för att peka på din lokala SVG-fil:
     ```javascript
     fetch('din-sökväg-till/world.svg')
     ```

## Användning

### Test Donationer

Använd knapparna i test-panelen för att simulera donationer:
- "Lägg till 50 kr" - Lägger till en donation på 50 kr
- "Lägg till 500 kr" - Lägger till en donation på 500 kr

### Konfiguration

Alla inställningar kan ändras i `script.js` i `CONFIG`-objektet:

```javascript
const CONFIG = {
    pricePerPoint: 50,              // Pris per punkt i kr
    regionPercentage: 40,            // Procent i Sydamerika/Afrika
    updateInterval: 60,              // API uppdatering i sekunder
    minDistance: 20,                 // Minsta avstånd mellan punkter (px)
    newDonationDuration: 15,        // Hur länge nya donationer ska synas annorlunda (sekunder)
    apiUrl: 'https://actsvenskakyrkan.adoveo.com/getProgressbarData/40',
    mapUrl: 'https://mapsvg.com/maps/world'
};
```

### Länder i Region

Länder som räknas till Sydamerika och södra Afrika kan ändras i `REGION_COUNTRIES`-objektet i `script.js`. Lägg till eller ta bort ISO-landskoder efter behov.

## Styling

All styling finns i `styles.css`. Huvudsakliga klasser:

- `.point` - Grundstil för donationer
- `.point.new-donation` - Stil för nya donationer
- `@keyframes pulse-glow` - Animation för vanliga donationer
- `@keyframes pulse-glow-new` - Animation för nya donationer

## API Format

API:et förväntar sig ett JSON-svar med följande format:

```json
{
    "amount": 5000
}
```

## Tekniska Detaljer

- **Vanilla JavaScript**: Ingen dependencies
- **Canvas**: Används för koordinatberäkningar
- **DOM Element**: Punkter renderas som DIV-element för bättre CSS-styling
- **SVG Koordinater**: Konverterar SVG-koordinater till skärmkoordinater automatiskt
- **Land Detection**: Använder SVG:s `isPointInFill()` för att säkerställa att punkter hamnar på land

## Felsökning

### Kartan laddas inte
- Kontrollera CORS-inställningar
- Ladda ner SVG-filen lokalt och uppdatera sökvägen i `script.js`

### Punkter hamnar på fel ställen
- Kontrollera att SVG-kartan har korrekt `viewBox`
- Kontrollera att landskoder i SVG matchar `REGION_COUNTRIES`

### API-anrop fungerar inte
- Kontrollera CORS-inställningar på API-servern
- Kontrollera att API:et returnerar rätt format

## Browser Support

- Moderna webbläsare med stöd för:
  - ES6+
  - SVG
  - Canvas API
  - Fetch API

