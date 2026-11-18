# Köket – familjens köksskärm

En helskärmssida för iPaden i köket. Den visar:

- stor klocka, datum, namnsdag, vecka och flaggdag
- en hälsning som följer dygnet, till exempel "God morgon" eller "Trevlig fredagskväll"
- väder för Örebro med prognos och ett kort tips, till exempel "Regn väntas runt 15 – ta med paraply"
- dagens händelser ur familjekalendern, med "Pågår" och "om 20 min" (efter kl. 17 visas även morgondagen)
- **meddelanden** som familjen skickar via Siri eller Genvägar
- en bakgrund som rör sig långsamt och byter färg: gryning, dag, kväll och natt
- nattläge 22–06 med bara en dämpad klocka och morgondagens första tid. Tryck på skärmen för att se allt i 90 sekunder.

Förhandsvisa en annan tid på dygnet: `?demo&t=2026-11-18T07:15`

---

## 1. Lägg upp sidan (GitHub Pages)

1. På GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**. Välj `main` och `/ (root)`.
2. Sidan hamnar på `https://uffewickberg.github.io/claude/koket/`.

(Om repot är privat krävs GitHub Pro för Pages. Annars går det lika bra att lägga mappen på Cloudflare Pages.)

## 2. Kalendrarna i familjens iCloud-konto

1. Logga in med familjekontot i Kalender-appen.
2. Skapa en ny kalender som heter **Meddelanden**. Dela den med familjemedlemmarna och ge dem rätt att redigera, eller låt dem vara inloggade på familjekontot.
3. Gör så här för **både** familjekalendern och Meddelanden: tryck på ⓘ vid kalendern, slå på **Offentlig kalender** och kopiera länken (`webcal://p…-caldav.icloud.com/published/…`).

> Länkarna är hemliga i praktiken: den som har dem kan läsa kalendern. Därför ska de bara ligga i Workern, aldrig i koden.

## 3. Cloudflare Worker (gratis, ungefär 5 minuter)

iCloud tillåter inte att en webbsida läser kalendern direkt. Workern hämtar den åt sidan.

1. Skapa ett konto på cloudflare.com och gå till **Workers & Pages → Create → Worker**. Döp den till `koket`.
2. Klistra in innehållet i `worker/worker.js` och tryck på **Deploy**.
3. Gå till **Settings → Variables and Secrets** och lägg till dessa som *Secret*:
   - `KEY`: ett långt slumpat lösenord, till exempel 30 tecken
   - `ICS_FAMILJ`: länken till familjekalendern
   - `ICS_MEDDELANDEN`: länken till kalendern Meddelanden
4. Skriv in Workerns adress, till exempel `https://koket.dittnamn.workers.dev`, i `config.js` under `proxy`.

Fler kalendrar, till exempel skolans schema: lägg till `ICS_SKOLA` i Workern och en rad i `kalendrar` i `config.js`.

## 4. Genvägen "Skicka till köket" (alla i familjen)

Öppna **Genvägar → +** och lägg till följande åtgärder:

1. **Text**: ditt namn, till exempel `Uffe`.
2. **Fråga efter indata**: Text, med frågan "Vad ska stå på köksskärmen?"
3. **Justera datum**: Lägg till `1` dag till *Aktuellt datum*.
4. **Lägg till ny händelse**:
   - Kalender: **Meddelanden**
   - Titel: *Angiven indata*
   - Start: *Aktuellt datum*
   - Slut: *Justerat datum*
   - Anteckningar: *Text* (namnet från steg 1)
   - Stäng av "Visa när körs".

Döp genvägen till **Skicka till köket**. Därefter kan man säga *"Hej Siri, skicka till köket"*, lägga genvägen på hemskärmen eller i en widget, eller köra den från klockan.

Meddelandet ligger kvar i 24 timmar. Ta bort händelsen i Kalender om du vill ta bort det tidigare. Det går också att skapa en händelse för hand i kalendern Meddelanden. Den visas under hela sin tid, och heldagshändelser visas hela dagen.

Obs: iCloud uppdaterar offentliga kalenderlänkar med viss fördröjning, oftast inom några minuter.

## 5. iPaden

1. Öppna `https://uffewickberg.github.io/claude/koket/?key=DITT-LÖSENORD` i Safari. Nyckeln sparas på iPaden.
2. Tryck på **Dela → Lägg till på hemskärmen**. Öppna sedan sidan därifrån, så visas den i helskärm.
3. Gå till **Inställningar → Skärm och ljusstyrka → Automatisk låsning → Aldrig**.
4. Gå till **Inställningar → Hjälpmedel → Guidad åtkomst**: slå på funktionen och sätt *Automatisk låsning* till *Aldrig*. Öppna appen och trippelklicka på den övre knappen.
5. Valfritt: skapa en automation i Genvägar som sänker ljusstyrkan till 10 % kl. 22.00 och höjer den till 70 % kl. 06.00. En webbsida kan inte styra bakgrundsbelysningen själv.

Sidan laddar om sig själv varje natt kl. 03.33. Ändringar som pushas hit syns alltså på skärmen nästa morgon.
