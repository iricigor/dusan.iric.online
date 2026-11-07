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

### Comics

Inspect every panel separately and preserve reading order. Use one `original`
section per panel with a numbered Czech heading and a Czech `panelDescription`
describing only what is visible. Keep all dialogue, captions and other image
text verbatim in `text`, including spelling, capitalization and punctuation:

```json
{
  "heading": "Komiks – obrázek 1",
  "language": "en-GB",
  "panelDescription": "Dítě ukazuje kamarádovi krabici se svou sbírkou.",
  "text": "Look! My collektion!"
}
```

The original-text page displays each panel in its own card. Authored visual
descriptions are explicitly labelled **Popis obrázku** and remain outside the
verbatim `.original-text`. The label and description use smaller, muted text
without a prominent callout border or tinted background, keeping the original
English text visually primary while preserving readable contrast in both themes.
Do not merge panels into a summary, silently correct
dialogue or invent speaker labels. Preserve distinct text blocks in reading
order; optional styled paragraphs must still reproduce `text` exactly.

For a silent panel, provide its description and `text: ""`. The page explicitly
states that the panel has no text; do not invent dialogue. Empty text is allowed
only for described English comic panels, not ordinary source sections. Whitespace
alone is not a transcription. Other subjects cannot use `panelDescription`.

Confirm the panel-by-panel transcription with the user before generating a
lesson. Ask about unreadable text, missing panels or ambiguous reading order
rather than guessing. Spelling notes still refer to the panel's zero-based
original section and leave its transcription unchanged. Visual descriptions
are authored Czech guidance and do not contribute to `contentSize.englishWords`.

### Original-text spelling feedback

English uses an orange accent in both light and dark themes. Genuine spelling
mistakes must be explicitly called out on **Původní text**, not only recorded
in the non-visible `review` field. Author optional `originalNotes`:

```json
{
  "section": 0,
  "quote": "I have a collektion.",
  "kind": "spelling",
  "explanation": "Slovo collektion je pravopisná chyba. Správně je collection."
}
```

Each note quotes exactly one occurrence in its zero-based original section.
Use surrounding wording to disambiguate repeated words. Quotes cannot overlap
or cross styled paragraph boundaries. Original wording remains unchanged;
quoted passages become accessible popup buttons and visible explanatory notes
appear beneath the source in the same card.

Use `kind: "spellingVariant"` for valid British/American spellings only when
the original mixes the two conventions. Explain consistency neutrally in Czech:
valid UK/US variants are **not mistakes**, and an entirely American source is
not inconsistent. The renderer counts authored variant occurrences across all
original sections: zero, one or two are ignored; three or more are displayed
as **Pravopisná varianta (UK/US)**, not **Pravopisná chyba**. Genuine spelling
notes are always displayed, independently of that threshold. Do not repeat
ignored variants in `review` or teaching content.

Notes are tutor-authored, not automatic dictionary or dialect detection.
Educational review must identify spelling mistakes, classify variants correctly
and include the corrected spelling in mistake explanations. Existing English
v5 lessons without notes remain valid; other subjects cannot use this field.

### Learning content and size

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
