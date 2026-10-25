# Dušanovo doučování

## Účel a současný rozsah

Cílem jsou přehledné interaktivní lekce v jednoduché češtině pro desetileté dítě,
pro které čeština není mateřským jazykem. Každá lekce je jeden samostatný soubor
HTML. Lze jej otevřít místně, používat bez internetu a případně zveřejnit
na stávajícím webu.

Tento repozitář neslouží jen doučování. Postup pro Copilot se používá pouze
na výslovné vyžádání a jeho nástroje jsou ve složkách `tools\history-tutor`
a `tools\tutor-website`.
Nemění obecné chování agenta v repozitáři. Složka `gems` zůstává samostatnou
variantou a v rámci tohoto řešení se nemění.

**Nyní je k dispozici:** dějepisný tutor pro Copilot, datový formát lekce,
místní generátor HTML, interaktivní prostředí a krátká ukázková lekce.
Společný webový generátor navíc podporuje samostatný matematický formát,
řešené příklady, slovníček, procvičování s nápovědami, přesnou kontrolu odpovědí,
kvízy bez časového omezení, částečné bodování a místní výsledky.

**Mimo současný rozsah:** symbolická algebra a interaktivní geometrie.
Ukázkové matematické lekce patří do #32. Podpora Gemini je
odložena; tento postup nyní podporuje pouze Copilot.

## Agenti v tomto repozitáři

Profily jsou ve složce `.github\agents` a mají krátká jména platná pro tento
repozitář:

| Agent | Úloha |
|-------|-------|
| `tutor-history` | Dějepisný tutor, kterého uživatel výslovně zvolí |
| `tutor-maths` | Matematický tutor s řešenými příklady, přesnou kontrolou a kvízy bez časového omezení |
| `tutor-common` | Interní společné pokyny: cílová skupina, jazyk, podklady a schvalování |
| `tutor-website` | Interní pomocník pro datový formát, kontrolu JSON a sestavení HTML |

Konverzace, dotazy a vysvětlení se řídí jazykem uživatele. Veškerý obsah
vygenerované stránky musí být výhradně česky. Pokud původní podklady nejsou
české, tutor nejprve vyjasní, jak získat český podklad, aniž by potichu přepsal
text, který má zachovat beze změn.

Předmětový tutor nejprve přečte `tutor-common` a požádá `tutor-website`
o podporovaný formát. Potom připraví obsah a předá mu absolutní cestu k JSON,
výstupnímu HTML a složce artefaktů své relace. Webový pomocník vrátí výsledek
kontroly a sestavení; za učivo, místní vyzkoušení a žádost o schválení odpovídá
předmětový tutor.

`tutor-common` a `tutor-website` mají `user-invocable: false`; na podporovaných
hostitelích se nenabízejí k přímému výběru a mohou je volat ostatní agenti.
Předmětoví tutoři mají `disable-model-invocation: true`, takže se nevybírají
automaticky. Jde o řízení výběru agentů, ne bezpečnostní hranici. Podpora
závisí na hostiteli a jeho verzi; po přidání profilů může být nutné obnovit
relaci. Pokud volání interních agentů není dostupné, Copilot to musí přiznat
a může se řídit stejnými profily a spustit stávající generátor přímo.
Podrobné předání popisuje `.github\agents\tutor-website.agent.md`.

## Jak vzniká lekce

1. Předej Copilotu podklady a výslovně ho požádej, aby použil `tutor-history`.
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
node --test tools\history-tutor\tests\*.test.js tools\tutor-website\tests\*.test.js
```

## Vytvoření nové dějepisné lekce s Copilotem

Otevři relaci Copilotu v tomto repozitáři a použij například toto zadání:

> Použij tutor-history. Přečti .github\agents\tutor-history.agent.md,
> společné pokyny tutor-common a část „Tutor instructions“
> v tools\history-tutor\README.md.
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

Stránka podporuje světlý i tmavý režim. Dějepisný rychlostní bonus je vždy zapnutý:
zcela správná odpověď za méně než 15 sekund získá dvojnásobek základních bodů.
Při odpovědi přesně za 15 sekund nebo později bonus nepřidáváme. Chybná ani
částečně správná odpověď bonus nezíská. Odpovídat lze i po vypršení bonusu
a dítě samo volí, kdy pokračovat. Známka vychází jen ze základních bodů,
nikoli z rychlosti. Matematika nemá časovač ani rychlostní bonus.
Výsledky se ukládají do úložiště relace prohlížeče, zvlášť pro každou
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

## Matematický tutor a webový formát

Interní `tutor-website` vlastní schéma a kontrolu matematických dat v
`tools\tutor-website`. Sdílí s dějepisem sestavení samostatného HTML, bezpečné
vložení dat a styly; nevyžaduje historický původní text, zdroje ani letopočty.
Podrobný kontrakt a příkazy obsahuje
[technický návod generátoru](tools/tutor-website/README.md).

```powershell
node tools\tutor-website\build.js capabilities maths
node tools\tutor-website\build.js build "C:\session-artifacts\handoff.json"
```

Předání určuje předmět a absolutní cesty k artefaktům relace. Generátor kontroluje
vstupní data, skutečné umístění cest včetně odkazů a ochranu před přepsáním.
Nevytváří návrhy v repozitáři a nezveřejňuje je. Úspěšné sestavení není ověřením
správnosti učiva ani schválením stránky. Český jazyk a správnost musí zkontrolovat
předmětový tutor a uživatel.

Matematická výuka má čtyři části: jednoduchý řešený příklad, složitější příklad,
slovní úlohu z běžného života a závěrečnou výzvu s řešením. Stránka nabízí
samostatné odkrývání nápověd, kroků a výsledků, klikací slovníček a světlý/tmavý
režim. Vedle procvičování na papíře nabízí záložku „Hrát si“ s kontrolou
odpovědí a zpětnou vazbou. Nemá časovač, odpočet, ukazatel rychlosti ani rychlostní bonus.

Schéma vyžaduje lehké skupiny čtyř výpočtů, střední slovní úlohy
a těžké úlohy se třemi kroky. Zachovává zásobu pro režimy 1/1/1, 1/2/2 a 2/5/3.
Odpovědi jsou typovaná celá čísla, zlomky, desetinná čísla nebo délky s jednotkou.
Kontrakt popisuje přesné porovnávání, rovnocenné zlomky, desetinnou čárku/tečku
a převody jednotek. Každý krok se kontroluje přesně, bez tolerance dějepisných
odpovědí. Chybějící nebo neplatná jednotka má výslovné vysvětlení.
Pravidla bodů jsou 10 bodů rozdělených mezi čtyři lehké výpočty a 1 bod
za všechny správně, 20 bodů za střední úlohu a 30 bodů rozdělených do tří těžkých
kroků. Známky zahrnují dosažitelné bonusy do jmenovatele: maxima jsou 61, 111
a 212 bodů. Hranice známek jsou 80/60/40/20 %. Úlohy se v jednom kvízu neopakují.
Po odeslání nelze odpovědi změnit; dítě si přečte správné odpovědi a postup
a samo zvolí pokračování. Přehled výsledků je místní, zvlášť pro každou lekci;
při selhání úložiště stránka zobrazí varování.

Vyžádej si `tutor-maths` a zadej téma nebo přilož podklady. Tutor vysvětlí
opravy, připraví českou lekci podle stejného formátu a předá ji webovému
pomocníkovi. Podporována nejsou jen dvě ukázková témata, ale všechny úlohy
vyjádřitelné podporovanými číselnými formáty. #32 dodá výukové ukázky.
Technická testovací data nejsou schválenou výukovou lekcí. I nadále používej
tutory pouze na vyžádání, zachovej místní kontrolu, výslovné schválení zveřejnění
a neměň složku `gems`.
