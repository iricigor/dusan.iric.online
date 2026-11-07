# English v5

English uses the existing shared schema, guarded builder, page and quiz
lifecycle. Run `node tools\tutor-website\build.js capabilities english` from
the repository root to discover the current authoring requirements and mixes.
The prepared default is `examples\my-collections.json`: original A1 content
about collections, possessions, location and question words, not a textbook
transcription. Subject agents author JSON only.

## Sources, language and size

Use `version: 5`, `subject: "english"` and `language: "cs-CZ"`. The page interface,
topic, subtitle, prompts, explanations and glossary definitions are Czech.
Original sections may set `language` to `en-GB` or `cs-CZ`. Preserve supplied
text exactly and explain corrections separately in `review`, with matching
quotations; do not silently repair originals. Confirm image transcriptions
before lesson generation and disclose missing referenced stories or recordings.

`chunks` contain a Czech `heading`, English `sentences` (at least two), a Czech
`explanation` and optional Czech styled `paragraphs`. They teach vocabulary,
grammar, readings/dialogues and worked examples, not the independent quiz bank.
Optional `audio` is `{ "text": "Reviewed English script.", "language": "en-GB" }`.
Every tested word, construction and permitted answer variant must be taught.

Topic-only lessons target approximately 800-1,000 English words, with Czech
explanations separately; source-driven lessons follow the supplied coverage.
The approximation is an authoring policy, not a validator restriction on
textbook or smaller structural fixtures. Measure the actual JSON:

```powershell
node -e "const {contentSize}=require('./tools/tutor-website/english.js'); console.log(contentSize(require('C:\\session-artifacts\\lesson.json')))"
```

`contentSize` counts Unicode words (internal apostrophes stay in a word) in
English original sections, learning sentences, glossary terms, English exercise
texts, word banks, choice labels and quiz audio scripts. Czech-to-English source
texts, Czech prompts/explanations, repeated learning audio scripts, glossary
forms, answer alternatives and assessment duplicates are not counted.
`englishSentences` counts terminators in those passages, not fragments or an
independent required sentence quota. The prepared default has 949 English words.
This measures authored teaching/exercise material, not unique vocabulary.

## Exercise shapes

Every `exercises` entry declares `id`, `difficulty` (`easy`, `medium`, `hard`),
`type`, `skill` (`meaning`, `grammar`, `spelling`), Czech `prompt`,
`explanation` and explicit `assessment`. Selection uses the shared history-size
mode mixes, without history's required year question or speed bonus. Capabilities
owns minimum/recommended bank counts. Smaller banks remain valid if they can
serve every mode.

| Type | Additional fields |
|------|-------------------|
| `trueFalse` | `options: ["Ano", "Ne"]`, zero-based `answer`; optional English `text` |
| `choice` | Two to four offered English `options`, zero-based `answer`; optional English `text` |
| `gapFill` | English `text` containing `____`; accepted written answers |
| `wordOrder` | Shuffled `words`, `skill: "grammar"`; accepted sentences must use every offered word exactly once |
| `text` | A bounded written response; optional English `text` |
| `translation` | Source `text`, `direction: "en-cs"` or `"cs-en"` and matching answer language |
| `listening` | English `audio`, accepted written answers; no visible source `text` |

Written types require `answerLanguage` (`en-GB` or `cs-CZ`) and
`acceptedAnswers`. Individual word-bank entries contain words, not punctuation;
declare sentence-ending punctuation in the task and accepted sentences.
Any exercise may attach reviewed English `audio`. Scripts appear in feedback,
not before submission; audio is available for replay. Plain quiz text has no
glossary buttons that would reveal translation answers.

## Exact and partial answers

Choices use `input: "number"` with one number matcher for the correct option
index and no partial credit. Written answers use `input: "text"` and either one
string matcher or an array of string matchers, all with
`normalization: "language"`. These must exactly match `acceptedAnswers`.
Normalization preserves accents and punctuation, ignores capitalization,
normalizes Unicode NFC and collapses extra whitespace without joining words.
No automatic semantic translation, fuzzy full credit or history i/y matching.
Answer fields retain the shared 80-character limit; scope each question accordingly.

Meaning tasks can opt into partial credit:

```json
{
  "input": "text",
  "exact": { "type": "string", "value": "magazine", "normalization": "language" },
  "partial": {
    "credit": 0.5,
    "match": { "type": "typo", "values": ["magazine"], "excludedWords": ["magazines"] }
  }
}
```

`values` must equal the declared full-credit alternatives. The shared evaluator
awards half credit for precisely one insertion, deletion, substitution or
adjacent-letter swap in one expected word of at least four letters. All other
words, whitespace boundaries and punctuation must match after normalization.
Only one typo in the whole answer is allowed. Correct alternatives win first.
The English adapter passes `knownWords(lesson)` to `evaluate`; a typo matcher
without that context throws an explicit error. Known lesson words and authored
`excludedWords` can never receive typo credit as the changed token.

Spelling and grammar tasks (including word ordering) cannot opt in. This
conservative rule prevents grammatical inflections and changes of word order
from receiving typo credit without a grammar parser. Authors also list untaught
real-word/confusion variants in `excludedWords`. This is not a dictionary or AI
grammar checker: educational review must check ambiguous pairs. Do not
declare a meaning task merely to bypass a grammar or spelling requirement.

## Listening and shared UI

### Opt-in compact listening

Set `"listeningUi": "compact"` on an English v5 lesson to opt in to a
single Play/Pause/Resume button in learning and quizzes, a single availability
warning near the top, and a shared male/female voice selector. Original English
sections additionally get one Play/Stop button each. Without this field, existing
lessons keep their two-button controls and per-clip status messages. This option
does not change quizzes, scoring, result storage or the page accent color.

For styled original sections, declare `language` on **every paragraph** when
opting in. Playback includes only `en-GB` paragraphs; Czech descriptions and
guidance are omitted. Paragraph text must still reconstruct `original.text`
exactly with blank-line separators. For example:

```json
{
  "heading": "Komiks — obrázek 1",
  "language": "en-GB",
  "text": "Dvě děti slaví narozeniny.\n\nIt's our birthday!",
  "paragraphs": [
    { "style": "comment", "language": "cs-CZ", "text": "Dvě děti slaví narozeniny." },
    { "style": "plain", "language": "en-GB", "text": "It's our birthday!" }
  ]
}
```

Original playback reads the preserved text, not unavailable textbook recordings
or answers to blanks. It uses the same local device voice as authored listening.
The browser does not provide voice gender. The selector recognizes only verified
Microsoft US voice names: David and Mark (male), Zira (female), as listed in
[Microsoft's supported Narrator voices](https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices).
Unknown voices are not guessed or mislabeled; a usable unrecognized English voice
can still play, with the selector disabled and an explanation. Missing choices
are disabled. If a selected voice disappears, playback does not silently switch
to another voice. Availability updates when voices load.

Pause/resume keeps the same utterance. Starting another clip or switching voices
cancels the current one, including paused playback. Playback errors remain visible
at the affected clip; routine state announcements are accessible but not repeated
as visible availability comments. Completion, navigation and quiz submission
reset playback. No microphone, remote voice or automatic speaking assessment
is added.

`speech.js` owns browser Speech Synthesis, with a local English voice and a
slower playback rate. Local voices avoid dependence on remote voice services.
There are no external audio URLs, microphone permissions, recognition or
speaking exercises. Voice availability/pronunciation depend on the device.
If no local English voice is installed, the page visibly asks for one; it does
not substitute a Czech voice or show a successful listening result. Voice lists
may arrive asynchronously; the user can retry after they load. API, startup and
playback failures are visible. Replaying replaces rather than queues audio.
Controls allow unrestricted replay and stop. Submission, tab navigation, hidden
documents and page exit cancel current playback. Late events from a replaced
utterance cannot change the new playback state.

English keeps Původní text, Učit se, Hrát si, the name/nickname gate, shared
feedback/results, session-only storage, highlighting, learning progress,
export and both themes. Its separate storage prefix is `english-tutor:v5`.
No countdown or speed bonus; answering duration is informational and never
breaks scoring ties. Replay never changes the score.

Test browser behavior using deterministic speech mocks, and disclose that those
do not verify audible pronunciation. Actual audio review requires an available
local English voice. Standalone text remains offline; listening requires that
voice. History/maths contracts and the independent `gems` workflow are unchanged.
Draft generation is not publication approval.
