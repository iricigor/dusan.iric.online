# Dušanovo doučování

## Účel a současný rozsah

Cílem jsou přehledné interaktivní lekce v jednoduché češtině pro desetileté dítě,
pro které čeština není mateřským jazykem. Každá lekce je jeden samostatný soubor
HTML. Lze jej otevřít místně, používat bez internetu a případně zveřejnit
na stávajícím webu.

Tento repozitář neslouží jen doučování. Postup pro Copilot se používá pouze
na výslovné vyžádání a jeho nástroje jsou ve složce `tools\history-tutor`.
Nemění obecné chování agenta v repozitáři. Složka `gems` zůstává samostatnou
variantou a v rámci tohoto řešení se nemění.

**Nyní je k dispozici:** dějepisný tutor pro Copilot, datový formát lekce,
místní generátor HTML, interaktivní prostředí a krátká ukázková lekce.

**Plánováno, zatím neimplementováno:** doučování matematiky. Podpora Gemini je
odložena; tento postup nyní podporuje pouze Copilot.

## Jak vzniká lekce

1. Předej Copilotu podklady a výslovně ho požádej, aby použil dějepisného tutora.
2. Copilot ověří historická fakta, vysvětlí opravy a nejistoty a připraví obsah
   lekce ve formátu JSON.
3. Místní generátor zkontroluje JSON a spojí jej se šablonou, styly a skriptem.
   AI vytváří vzdělávací obsah, nikoli novou aplikaci pro každou lekci.
4. Otevři samostatný soubor HTML místně a zkontroluj ho.
5. Teprve po schválení přidej stránku na web a otevři pull request (PR).

Pracovní návrhy patří do složky artefaktů dané relace Copilotu, mimo repozitář.
V Gitu uchovávej opakovaně použitelné nástroje a příklady, ne průběžné návrhy.

## Vyzkoušení dějepisné ukázky

Pokud ještě není k dispozici, nainstaluj Node.js 22 nebo novější. Nejsou potřeba
balíčky npm, Python, klíče k AI službám ani místní webový server.

Otevři PowerShell v kořenové složce repozitáře:

```powershell
node tools\history-tutor\build.js tools\history-tutor\examples\defenestrace.json "C:\Temp\history-preview\defenestrace.html"
Start-Process "C:\Temp\history-preview\defenestrace.html"
```

Generátor vytvoří výstupní složku. Existující soubor nepřepíše; přepínač `--force`
přidej pouze tehdy, když chceš dřívější náhled záměrně nahradit.

Ukázka **Od defenestrace k Bílé hoře** používá vybrané nezměněné úryvky
ze stávající dějepisné ukázky. Předvádí také opravu věcné chyby: slovo
*defenestrace* pochází z latiny, nikoli z němčiny. Obsahuje deset otázek
pro vyzkoušení všech tří obtížností; nejde o celou učebnicovou kapitolu.
Schválená ukázka pro web je v souboru `site\history\defenestrace.html`.

Testy nástrojů spustíš takto:

```powershell
node --test tools\history-tutor\tests\*.test.js
```

## Vytvoření nové dějepisné lekce s Copilotem

Otevři relaci Copilotu v tomto repozitáři a použij například toto zadání:

> Přečti tools\history-tutor\README.md a řiď se částí „Tutor instructions“.
> Z následujících podkladů vytvoř dějepisnou lekci v češtině pro desetileté dítě,
> pro které čeština není mateřským jazykem.
>
> Nejprve ověř fakta a česky vysvětli opravy i nejistoty. Původní text zachovej,
> ale ve výukové části a kvízu používej správná fakta. Odkazy musí vést
> na české zdroje a jejich popisky musí být také česky.
> JSON lekce i samostatné HTML ulož do složky artefaktů této relace,
> mimo repozitář.
>
> Otevři místní náhled ke kontrole. Neměň gems, nezveřejňuj stránku
> a neotevírej PR pro zveřejnění, dokud lekci neschválím.
>
> [Vlož text nebo přilož dokument či fotografii.]

U fotografie musí Copilot prohlédnout skutečný obrázek a před vytvořením lekce
si nechat potvrdit přepis. Nečitelný text je potřeba upřesnit, ne odhadovat.
Odkazy musí vést na skutečně použité české zdroje. Pokud vhodný český zdroj nelze
ověřit, musí Copilot omezení přiznat a před použitím cizojazyčného zdroje
požádat o souhlas. Neúspěšné ověření se nesmí vydávat za úspěšnou kontrolu.

Výsledná stránka má tři části:

| Záložka | Co v ní dítě najde |
|---------|--------------------|
| Původní text | Původní podklady a vysvětlení zvýrazněných chyb |
| Učit se | Jednodušší vysvětlení, rozbalovací nápovědy a klikací slovníček |
| Hrát si | Kvíz se 3, 5 nebo 10 otázkami, přehled odpovědí, body a českou školní známku |

Stránka podporuje světlý i tmavý režim. Rychlostní bonus je volitelný a ve výchozím
stavu vypnutý. Výsledky se ukládají do úložiště relace prohlížeče, zvlášť pro každou
lekci. Neodesílají se na server a neslouží jako trvalý záznam.

Závazné pokyny pro generování a pravidla kvízu obsahuje
[technický návod](tools/history-tutor/README.md). Datový formát popisuje
[schéma lekce](tools/history-tutor/lesson.schema.json).

## Místní kontrola a zveřejnění

Zkontroluj původní text i opravy, českou slovní zásobu, nápovědy, správné odpovědi
a jejich vysvětlení. Vyzkoušej všechny obtížnosti, chybnou odpověď, otázku
s vlastní odpovědí a výsledkovou obrazovku. Ověř čitelnost na úzké obrazovce
a funkčnost samostatného souboru bez připojení k internetu.

Dokud není návrh hotový, požádej Copilot o úpravy. Vytvoření ani otevření místního
souboru samo o sobě nic nezveřejní.

Po výslovném schválení stránky můžeš zadat:

> Přidej schválenou místní dějepisnou lekci do site\history pod výstižným názvem
> souboru. Doplň odkaz do site\i\index.html a otevři PR proti zamýšlené cílové
> větvi. Nezahrnuj pracovní JSON ani dočasné soubory.

Stávající automatizace Azure Static Web Apps je nastavena pro vytvoření webového
náhledu u PR, které mění `site`, pokud jsou dostupné potřebné přístupové údaje
pro nasazení. Změny samotných nástrojů náhled webu nespustí. Pokud se mění lekce
i index, použij adresu náhledu nasazení a připoj cestu k lekci; automatický
komentář s přímým odkazem vzniká pouze při změně jediného souboru webu.
Sloučení změn webu do `main` je zveřejní na ostrém webu.

## Plán rozšíření o matematiku

### Dohodnutý směr

Nejprve dokončit a vyzkoušet dějepis. Matematika je pozdější rozšíření,
nikoli součást současné implementace. I nadále ji používat pouze na vyžádání,
držet ji odděleně od ostatních účelů repozitáře a neměnit složku `gems`.

Před programováním matematiky domluvit rozsah a založit úkoly v GitHub Issues.
Pořadí zůstává: **návrh a diskuse, úkoly, implementace**.

### Navrhovaný způsob výuky

- Používat řešené příklady s postupným odkrýváním kroků a vysvětlením,
  proč daný krok funguje, ne jen zobrazit konečný výsledek.
- Jednoduše vysvětlovat české matematické pojmy.
- Nabídnout vedené procvičování: vlastní pokus, nápověda, další pokus
  a teprve potom celé řešení.
- Odpovědi vyhodnocovat matematicky. Rovnocenné zlomky, desetinný zápis
  a jednotky potřebují výslovná pravidla; dějepisnou toleranci pravopisu
  a přibližných letopočtů nelze přenést na matematiku.
- Nevytvářet tlak na rychlost. Porozumění má být důležitější než rychlá odpověď.

Jde o návrhy, ne o hotové funkce ani konečné zadání.

### Co je ještě potřeba rozhodnout

| Oblast | Otázky před implementací |
|--------|--------------------------|
| Vstupní podklady | Stránka učebnice či pracovní list, zadané téma, nebo obojí? |
| První témata | Který ročník a které učivo má první verze pokrývat? |
| Odpovědi | Jen celá čísla, nebo také zlomky, desetinná čísla, výrazy a jednotky? |
| Nápovědy | Jak mají nápovědy, opakované pokusy a odkrytí řešení ovlivnit postup a body? |
| Obrázky | Potřebujeme hned číselné osy, geometrické útvary či jiné interaktivní pomůcky? |
| Společné prostředí | Které části dějepisné stránky lze znovu využít, aniž by matematika musela napodobovat práci s textem a letopočty? |

### Předpokládaný postup

Po dohodě připravit matematické pokyny pro tutora a datový formát lekce.
Sdílet zobrazovací a sestavovací kód jen tam, kde se skutečně hodí,
a zachovat fungování dějepisu. Doplnit jednoznačné vyhodnocování odpovědí
pro vybrané učivo a před zveřejněním místně vyzkoušet první matematickou lekci.

O samostatné složce pro matematiku nebo menším společném prostředí pro více
předmětů rozhodnout podle konkrétního prvního zadání. Dějepisný nástroj
nezobecňovat předem jen kvůli možnému budoucímu rozšíření.
