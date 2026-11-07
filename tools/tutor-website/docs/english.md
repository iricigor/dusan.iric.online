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

The original-text page displays each panel in its own card, with its visual
description visibly inside the same section but outside the verbatim
`.original-text`. Descriptions use smaller, muted text without a prominent
callout border or tinted background, keeping the original English text visually
primary while preserving readable contrast in both themes. Rely on the single,
subdued opening paragraph under **Jak číst přepis** for the distinction; do not repeat internal titles such as
**Autorský popis**, **Popis obrázku** or **Text z obrázku** within each panel.
Keep only the panel's own heading.
Do not merge panels into a summary, silently correct
dialogue or invent speaker labels. Preserve distinct text blocks in reading
order; optional styled paragraphs must still reproduce `text` exactly.

For a silent panel, provide its description and `text: ""`. The panel still
appears with its description, without invented dialogue. Empty text is allowed
only for described English comic panels, not ordinary source sections. Whitespace
alone is not a transcription. Other subjects cannot use `panelDescription`.

Confirm the panel-by-panel transcription with the user before generating a
lesson. Ask about unreadable text, missing panels or ambiguous reading order
rather than guessing. Spelling notes still refer to the panel's zero-based
original section and leave its transcription unchanged. Visual descriptions
are authored Czech guidance and do not contribute to `contentSize.englishWords`.

#### Introductions and general guidance

The website explains Czech descriptions once near the top of **Původní text**:
"Menší český text popisuje obrázky. Text z komiksu je přepsaný beze změn."
This is part of one small, muted, readable opening paragraph under **Jak číst
přepis**, to the left of the QR code on wider screens and above it on mobile.
It is not a banner. Do not duplicate it in an authored introduction or invent
a source section for it.
It appears only for lessons with a described comic panel.

An optional top-level `comicIntroduction` can provide one or two child-friendly
Czech sentences about the actual comic. Make the paragraph logical and coherent:
connect its sentences, introduce only supported characters/actions and avoid
unrelated instructions or invented motives. Omit it if there is no useful
comic-specific context. Put general reading/study instructions in the separate,
optional `comicGuidance` field instead:

```json
{
  "comicIntroduction": "Dítě ukazuje kamarádovi svou sbírku. Společně si prohlížejí krabici.",
  "comicGuidance": "Čti obrázky postupně. Když něčemu nerozumíš, vrať se k předchozí větě."
}
```

These are lesson-level fields, not part of an `original` section. The website
combines the introduction, description note and guidance into the single opening
paragraph under **Jak číst přepis**; do not include headings in the strings or
repeat guidance inside panels. When guidance is omitted, the website provides
short instructions to read panels in order and listen to their English text.
Both fields are optional nonblank
plain text, English-only, and require at least one original section with
`panelDescription`. They remain outside the verbatim source, do not change
section indices, and do not count toward `contentSize.englishWords`.
Coherence and grounding require educational review, not just schema validation.

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
Matching normalizes Unicode NFC and collapses extra whitespace without joining
words. Capitalization is assessed as a partial mistake rather than ignored.
Preserve accents, apostrophes and punctuation, except that a final full stop is
optional. A missing required question mark or exclamation mark counts as one
partial mistake. No automatic semantic translation, fuzzy full credit or
history i/y matching. Answer fields retain the shared 80-character limit;
scope each question accordingly.

For otherwise-correct written answers, combine partial mistakes as follows:

| Partial mistakes | Points awarded |
|------------------|----------------|
| 0 | 100% |
| 1 | 67% |
| 2 | 33% |
| 3 or more | 0% |

Any number of capitalization differences counts as one partial mistake per
answer. Each missing apostrophe is one mistake; a missing required question or
exclamation mark is one. Optional final full stops do not count.

Every written meaning task explicitly enables typo tolerance:

```json
{
  "input": "text",
  "exact": { "type": "string", "value": "magazine", "normalization": "language" },
  "partial": {
    "match": { "type": "typo", "values": ["magazine"], "excludedWords": ["magazines"] }
  }
}
```

`values` must equal the declared full-credit alternatives. Count each letter
insertion, deletion, substitution or adjacent-letter swap as one typo operation;
a swap counts once. For answers with fewer than ten letters, every operation
adds one partial mistake. For answers with ten or more letters, the first
operation is ignored and every additional operation adds one partial mistake.
Thus, exactly ten letters follows the longer-answer rule. The resulting typo
mistakes combine with capitalization, apostrophe and required end-mark
mistakes under the schedule above. All other words, word boundaries and
punctuation must match. Correct alternatives win first.

The English adapter passes `knownWords(lesson)` to the typo matcher; missing
context raises an explicit error. Known lesson words and authored
`excludedWords` can never receive typo credit as the changed token. Spelling
and grammar tasks (including word ordering) cannot receive typo credit. This
prevents grammatical inflections and changes of word order from receiving typo
credit without a grammar parser. Authors also list untaught real-word,
grammatical and vocabulary confusions in `excludedWords`. This is not a
dictionary or AI grammar checker: educational review must check ambiguous
pairs. Do not declare a meaning task merely to bypass a grammar or spelling
requirement.

## Listening and shared UI

On **Původní text**, every nonempty `original` section marked `en-GB`
automatically receives its own listening control. Use one section per comic
panel or original explanation section. Playback reads that section's exact
`text`, including original spelling and punctuation, not headings, Czech panel
descriptions, styled paragraph labels or correction notes. No new audio field
is required. Silent panels and Czech original sections have no English
listening control. These controls reuse the same player as learning and quizzes.

`speech.js` owns browser Speech Synthesis, with a local English voice and a
slower playback rate. Local voices avoid dependence on remote voice services.
There are no external audio URLs, microphone permissions, recognition or
speaking exercises. Voice availability/pronunciation depend on the device.
Do not add routine voice-available notices. If no local English voice is installed
or speech APIs are unavailable, show one specially formatted warning near the
top of the page, not a repeated warning per passage. The page does not substitute
a Czech or remote voice. Voice lists may arrive asynchronously; loading an
English voice clears the warning without showing a ready announcement.
Voice-list errors use that same page warning; preparation, startup and playback
failures remain explicit beside the relevant control.

Each passage has one rounded, child-friendly listening button: **🎧 Poslouchej**,
**⏸️ Pauza**, then **▶️ Pokračuj**. It plays, pauses and resumes the same
utterance; completion resets it for unrestricted replay. Playback deadlines are
suspended while paused and resume with their remaining time. Starting a different
passage replaces rather than queues audio. Submission, tab navigation, hidden
documents and page exit cancel current playback. Late events from a replaced
utterance cannot change the new playback state.

When both documented male and female local English voices are installed, a
top-right **👨 / 👩** switch selects the voice. The active emoji is colored; the
inactive emoji is gray but the switch remains operable. It has a keyboard-accessible
switch role and an announced female/male state. Switching stops current playback
and applies to subsequent listening; it never changes scoring or stored results.
Hide the selector for incomplete or unclassified pairs; those local English
voices still work with ordinary playback. Do not fake gender by changing pitch.

[`SpeechSynthesisVoice`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice)
exposes no gender property. `voiceGender` recognizes only Microsoft identities
documented in [Microsoft's Windows voice table](https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices):
David, Mark, George, James, Richard, Ravi, Sean, Guy, Ryan and Prabhat are male;
Zira, Hazel, Susan, Catherine, Linda, Heera, Jenny, Aria, Sonia and Neerja are female.
Recognition requires a Microsoft voice name plus local service and English
language metadata. Other platforms and unidentified names deliberately do not
get gender labels. Do not infer gender from first names alone or use cloud voices.

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
