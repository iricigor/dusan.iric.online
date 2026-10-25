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
Společný webový generátor používá jedno schéma verze 3 pro oba předměty a podporuje
řešené příklady, slovníček, procvičování s nápovědami, přesnou kontrolu odpovědí,
kvízy bez časového omezení, částečné bodování a místní výsledky.

**Mimo současný rozsah:** symbolická algebra a interaktivní geometrie.
Připravená matematická ukázka spojuje zlomky a převody jednotek délky. Podpora Gemini je
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

Oba předmětoví tutoři mají připravený JSON z předchozí práce. Pokud nezadáš téma
ani podklady nebo výslovně požádáš o výchozí ukázku, použijí jej beze změny:

| Tutor | Výchozí lekce | Zdroj JSON |
|-------|---------------|------------|
| `tutor-history` | Od defenestrace k Bílé hoře | `tools\tutor-website\examples\defenestrace.json` |
| `tutor-maths` | Zlomky a převody jednotek délky | `tools\tutor-website\examples\zlomky-a-prevody-delky.json` |

Stačí zadat například „Použij tutor-history a výchozí lekci“ nebo
„Použij tutor-maths a výchozí lekci“. Tutor zkopíruje připravený JSON do artefaktů
své relace a přes společný generátor sestaví místní HTML. Nevymýšlí novou ukázku
a nevyžaduje další podklady. Vlastní zadané téma nebo materiál má přednost,
pokud výslovně nezvolíš výchozí lekci. Ukázka není automaticky zveřejněna.

Pokud ještě není k dispozici, nainstaluj Node.js 22 nebo novější. Nejsou potřeba
balíčky npm, Python, klíče k AI službám ani místní webový server.

Otevři PowerShell v kořenové složce repozitáře:

```powershell
$artifacts = Join-Path ([System.IO.Path]::GetTempPath()) ("history-preview-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $artifacts | Out-Null
$capabilities = node tools\tutor-website\build.js capabilities history | ConvertFrom-Json
$inputPath = Join-Path $artifacts "history.json"
$outputPath = Join-Path $artifacts "history.html"
Copy-Item -LiteralPath $capabilities.examplePath -Destination $inputPath
$handoff = @{
    operation = "build"
    subject = "history"
    artifactDirectory = $artifacts
    inputPath = $inputPath
    outputPath = $outputPath
}
$handoffPath = Join-Path $artifacts "handoff.json"
[System.IO.File]::WriteAllText($handoffPath, ($handoff | ConvertTo-Json))
node tools\tutor-website\build.js build $handoffPath
Start-Process $outputPath
```

Oba předměty používají tentýž generátor a schéma. Náhledy musí být mimo repozitář.
Existující HTML se nepřepisuje; `overwriteApproved: true` v předávacím objektu
povol pouze po výslovném schválení náhrady daného souboru.

Ukázka **Od defenestrace k Bílé hoře** obsahuje všech sedm dodaných oddílů
původního textu beze změny slov, včetně zajímavostí a závěrečné citace.
Předvádí také opravu věcné chyby: slovo
*defenestrace* pochází z latiny, nikoli z němčiny. Obsahuje 30 různých otázek
(6 lehkých, 15 středních a 9 těžkých). Výklad nyní zahrnuje také pobělohorské
změny a třicetiletou válku. Oprava tvrzení, že válka neměla vítězů, zůstává
oddělená od původního textu. Přehled uvádí nově porovnané zdroje i meze ověření.
Také matematická ukázka má 30 celých cvičení v poměru 6/15/9, ne jen 30 kroků.
Nové lekce obou tutorů vyžadují alespoň 30 různých otázek; délky jednotlivých
kvízů a přijímání starších dat se nemění.
Starší schválená ukázka v souboru `site\history\defenestrace.html` zůstává beze změn.

Testy nástrojů spustíš takto:

```powershell
node --test tools\tutor-website\tests\*.test.js
```

## Vytvoření nové dějepisné lekce s Copilotem

Otevři relaci Copilotu v tomto repozitáři a použij například toto zadání:

> Použij tutor-history. Přečti .github\agents\tutor-history.agent.md,
> společné pokyny tutor-common a pravidla dějepisu
> v tools\tutor-website\README.md.
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
Oba předměty ve výsledku zobrazují **Dobu odpovídání**: součet času při
odpovídání, bez čtení zpětné vazby, pobytu v jiné části lekce nebo skryté
stránce prohlížeče. Matematika během kvízu čas neukazuje a doba nemění její
body, známku ani pořadí. Sloupec **Kdy** označuje datum a čas pokusu.
Výsledky se ukládají do úložiště relace prohlížeče, zvlášť pro každou
lekci. Neodesílají se na server a neslouží jako trvalý záznam.

Závazné pokyny pro generování a pravidla kvízu obsahuje
[technický návod](tools/tutor-website/README.md#history-authoring-and-quiz-rules). Datový formát popisuje
[společné schéma lekce](tools/tutor-website/lesson.schema.json).

Nové lekce obou předmětů mají společná metadata, původní text, slovníček
a povinný krátký motivační podtitulek `subtitle`. Pravidlo povzbudivého jazyka
patří do `tutor-common`; schéma a zobrazení vlastní `tutor-website`.
Styly `plain`, `note`, `example`, `tip`, `warning`, `comment`, `fun`, `quote`
odliší běžný text, poznámku, příklad, tip, upozornění, komentář, zajímavost a citaci.
V původním textu nastav `original[].style`; jeho znění se nemění.
Pro jednotlivé původní odstavce lze použít `original[].paragraphs`: jejich text
spojený dvěma konci řádku musí přesně odpovídat `original[].text`.
Citace se zobrazí jako samostatný citovaný blok bez přidaných slov.
V matematických příkladech a dějepisných výukových
blocích lze přidat pole `paragraphs` s položkami `{ "style", "text" }`.
HTML ani vlastní CSS do obsahu nepatří.

Volitelné `icon` doplní krátké emoji k původnímu oddílu, výukovému bloku,
řešenému příkladu, otázce, cvičení nebo pojmu ve slovníčku. Bez něj generátor
použije výchozí ikonu. Pravý okraj obsahového panelu Učit se, nikoli okraj
celého prohlížeče, má na široké obrazovce záložku 🔖 Slovníček:
otevře vysouvací panel přes učivo, aniž by posouval text nebo zabíral stálý
sloupec. Na mobilu se záložka přidrží okraje obrazovky, aby nezakrývala text.
Panel je zpočátku zavřený na počítači i mobilu. Zavřeš ho tlačítkem,
klávesou Escape nebo kliknutím mimo něj; po zavření tlačítkem či klávesou
se vrátí zaměření na záložku. Otevřenou definici zavře první Escape,
samotný slovníček až další. Definice se otevírají u kliknutého
pojmu nebo podtrženého slova v učivu. Dvě malé ikony Rozbalit vše / Sbalit vše
jsou vpravo u záložek pouze v části Učit se a mění jen nápovědy a řešení,
nikoli slovníček ani kvíz. Mají české tooltipy a přístupné popisky.
Drobný ovladač Nápověda 💡 je uvnitř pravého horního rohu odstavce,
text ho obtéká a vysvětlení se otevře pod celým odstavcem.
Kroky a výsledky mají kompaktní číslované odkrývání bez rámečků.
V části Učit se jsou všechny nápovědy, kroky, výsledky a řešení zpočátku sbalené
v obou předmětech; samotný text učiva zůstává viditelný.
Dějepis používá sépiové akcenty a jemný papírový podklad,
matematika modrozelené akcenty a jemnou geometrickou mřížku.
Síla podkladu je mezi původní velmi světlou a pozdější výraznější variantou.
Podklad pokrývá celé karty původního textu a učiva, včetně nadpisů a okrajů,
nikoli jen proužky pod odstavci. Kvíz a výsledky zůstávají neutrální.
Zajímavosti mají hravější zlatavý podklad, kulatý odznak ikony a jemné jiskřičky,
ne fialovou. Ostatní významové styly zůstávají odlišené. Vše podporuje tmavý režim.
Odznak předmětu a název lekce jsou na jednom řádku se zachováním svých stylů;
dlouhý název se může zalomit ve svém sloupci. Motivační věta má barvu předmětu.
Záložky s ikonami a českými popisky navazují na obsahový
panel a podporují ovládání šipkami; obtížnosti mají výraznější barevnou výplň.
Přepnutí záložek zjemňuje krátké prolnutí s drobným svislým posunem.
Prohlížeče bez View Transitions animují jen příchod nového obsahu.
Omezený pohyb animace vypne. Vyhrazené místo pro svislý posuvník brání
poskakování do stran mezi krátkým a dlouhým obsahem; stránka se posouvá přirozeně.
Světlý a tmavý režim přepíná přepínač se sluncem a měsícem. Věk se v záhlaví
nezobrazuje. Krátký popisek přezdívky a vstup jsou na jednom řádku; požadavky
na délku jsou v tooltipu a přístupném popisu. Podrobná pravidla bodování jsou
rozbalovací. Dějepisný bonus ukazuje
jen tenký ubývající proužek, nikoli odpočet. Dokončení každého kvízu oslaví
krátké CSS konfety; pořadí pokusu zůstává uvnitř rozbalovacích výsledků.
Síň slávy je v úvodním nastavení sbalená, po dokončení kvízu se sama rozbalí.
Nové stránky mají vloženou světlou ikonu s velkým modrým D a menší černou absolventskou čepicí.
Stávající zveřejněné stránky se tímto nemění.
Dějepisné ověření a zdroje zůstávají v metadatech lekce, nikoli v samostatné
viditelné kartě Ověření a doplnění. Opravy podtržených tvrzení zůstávají dostupné.

Nenápadné ozubené kolečko vpravo u záložek v části Hrát si rozbalí nástroje;
v části Učit se stejné místo využívají ikony pro rozbalení a sbalení učiva.
Stáhnout JSON uloží celou sadu otázek se správnými odpověďmi, celkovým počtem
a počty podle obtížnosti easy/medium/hard. Matematické cvičení se počítá jako
jedna otázka a export obsahuje odpovědi všech jeho kroků. Export funguje místně
bez sítě, neobsahuje přezdívku ani výsledky žáka a nespustí kvíz.
Panel je kompaktní; vysvětlení je v tooltipu a přístupném popisu tlačítka.
Po zahájení stažení, kliknutí mimo panel nebo stisku Escape se zavře.
Při chybě zůstane otevřený s viditelnou zprávou a možností opakovat stažení.

Barevnější světlý/tmavý vzhled a krátké animace otázek, zpětné vazby,
výsledků a odkrývání nápověd jsou společné. Nastavení omezeného pohybu je vypne.
Každý kvíz postupuje od lehkých otázek přes střední po těžké; náhodný výběr
a pořadí zůstává uvnitř obtížnosti. V dějepisu uveď všechny plně správné varianty
jména v `acceptedAnswers` i ve společném pravidle `assessment.exact`, například
Komenský i Jan Komenský.

Každá otázka nebo matematický krok ve v3 má `assessment`: vstup `input`,
pravidlo `exact` pro plné body a volitelné `partial: { "match", "credit": 0.5 }`
pro polovinu bodů. Obě kategorie podporují typy `number` (přesná hodnota),
`string` (konkrétní zápis), `array` (seznam uznávaných alternativ) a `range`
(číselný interval s výslovně určenými hranicemi). Číselné hodnoty jsou kvůli
přesnosti uložené jako omezené řetězce, ne desetinná čísla JSON.
Plně správná shoda má vždy přednost, body obou kategorií se nesčítají.
Při přesné odpovědi 1620 a částečném intervalu 1615–1625 získá 1620 plné body,
1618 polovinu. U krácení může zápis `1/2` získat plné body a `3/6` polovinu,
přestože jde o stejnou hodnotu. Jiné zápisy se neuznávají automaticky:
rozhoduje výslovné pravidlo a zadání to musí dítěti vysvětlit.
Číselný matcher naopak může uznávat všechny přesně rovnocenné zápisy.
Vyhodnocení i kontrola pravidel jsou společné v `tutor-website\assessment.js`.

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

Interní `tutor-website` vlastní společné schéma, kontrolu dat i všechny
implementace CSS a JavaScriptu v `tools\tutor-website`. Matematická větev
schématu nevyžaduje historické zdroje ani letopočty. Dějepis a matematika
mají oddělené jen učivo a adaptéry pro odlišné hodnocení: historické opravy,
varianty jmen a toleranci letopočtů oproti přesným výpočtům, jednotkám
a bodům za jednotlivé kroky. Důvody rozdělení podrobně popisuje technický návod.
Starší dějepisný JSON v1 a matematický v2 nadále fungují; staré příkazy jsou
jen kompatibilní vstupy do společné implementace. Zveřejněné HTML se samo nemění.
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
Když otázka určuje jednotku („Převeď 2 km na metry“, „Kolik centimetrů?“),
očekává se pouze číslo v této jednotce, například `2000`, nikoli `2000 m`.
Takové otázky používají číselný vstup. Jednotku dítě dopisuje jen při výslovném
požadavku na délku s jednotkou; pole je označené „včetně jednotky“.
Ve vysvětlení postupu jednotky zůstávají.
Kontrakt popisuje přesné porovnávání, rovnocenné zlomky, desetinnou čárku/tečku
a převody jednotek. Číselné formáty uznávají přesně rovnocenné zápisy:
7/4, 1 3/4 i 1,75; nebo 0.5 i 1/2, pokud to pravidlo `number` povoluje.
Pravidlo `string` rozlišuje konkrétní zápisy a může jinému zápisu přidělit jen
částečné body. Záporné smíšené číslo -1 3/4 znamená -7/4.
Zaokrouhlené přiblížení nezíská body bez výslovného částečného pravidla.
Každý krok se kontroluje přesně, bez automatické tolerance dějepisných
odpovědí. Pokud pole výslovně vyžaduje jednotku, její chybění nebo neplatný
zápis má výslovné vysvětlení.
Pravidla bodů jsou 10 bodů rozdělených mezi čtyři lehké výpočty a 1 bod
za všechny zcela správně, 20 bodů za střední úlohu a 30 bodů rozdělených do tří těžkých
kroků. Částečně správný krok získá polovinu svých bodů, nikoli bonus za vše správně.
Lehký krok tak může získat 1,25 bodu. Známky zahrnují dosažitelné bonusy do jmenovatele: maxima jsou 61, 111
a 212 bodů. Hranice známek jsou 80/60/40/20 %. Úlohy se v jednom kvízu neopakují.
Po odeslání nelze odpovědi změnit; dítě si přečte správné odpovědi a postup
a samo zvolí pokračování. Přehled výsledků je místní, zvlášť pro každou lekci;
při selhání úložiště stránka zobrazí varování.

Vyžádej si `tutor-maths` a zadej téma nebo přilož podklady. Tutor vysvětlí
opravy, připraví českou lekci podle stejného formátu a předá ji webovému
pomocníkovi. Podporována nejsou jen dvě ukázková témata, ale všechny úlohy
vyjádřitelné podporovanými číselnými formáty. Výchozí JSON obsahuje v jedné lekci
výpočty se zlomky i převody délky mezi mm, cm, dm, m a km. Slovní úlohy oba
okruhy také propojují. Desetinnou čárku lze nahradit tečkou; rovnocenné zlomky
a správně převedené délky se uznávají podle deklarovaného pravidla.
Technická testovací data nejsou schválenou výukovou lekcí. I nadále používej
tutory pouze na vyžádání, zachovej místní kontrolu, výslovné schválení zveřejnění
a neměň složku `gems`.
