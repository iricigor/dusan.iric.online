# Assessment and answer formats

[Generator quick start and contract index](../README.md).

### Shared full/partial answer policies

`assessment.js` is the single parser and matcher for both subjects. Every v3
question/step declares `assessment.input` (`number`, `text` or `length`), an
`exact` full-credit matcher and, optionally, `partial: { match, credit: 0.5 }`.
Half credit is the only supported partial fraction, explicitly declared rather
than inferred from subject or value similarity. An unmatched valid answer earns
zero; invalid input earns zero with a specific Czech diagnostic.

Both credit categories accept the same tagged matcher shapes:

| Type | Example | Meaning |
|---|---|---|
| Number | `{ "type": "number", "value": "1620" }` | Exact rational value; accepts equivalent supported notation |
| String | `{ "type": "string", "value": "1/2" }` | Literal representation, trimmed and NFC-normalized, with no implicit case/spelling or numeric equivalence |
| Array | `{ "type": "array", "items": [{ "type": "string", "value": "Komenský" }, { "type": "string", "value": "Jan Komenský" }] }` | Any listed alternative matches; not a multi-part learner response |
| Range | `{ "type": "range", "min": "1615", "max": "1625", "includeMin": true, "includeMax": true }` | Exact numeric interval with explicit endpoint inclusion |

Numeric matcher values/bounds are bounded strings, never binary floating-point
JSON numbers: the `number` tag selects numeric semantics. They use the numeric
notation described below (stored decimal points, not commas). Arrays contain
1–20 distinct atomic number/string/range matchers, not nested arrays.
String matchers can explicitly request `normalization: "czech"` for historical
case/diacritic/i-y tolerance in text input only; `literal` is the default.
No regex, expressions, scripts, unknown fields or arbitrary match programs.
All matcher values have a maximum of 80 characters. Range bounds must be valid,
ordered and nonempty; equal bounds are allowed only if both ends are included.

```json
{
  "input": "number",
  "exact": { "type": "number", "value": "1620" },
  "partial": {
    "credit": 0.5,
    "match": {
      "type": "range",
      "min": "1615",
      "max": "1625",
      "includeMin": true,
      "includeMax": true
    }
  }
}
```

`1620` earns full credit **before** considering the overlapping partial interval.
`1618`, `1615` and `1625` earn half; `1614` and `1626` earn zero. Awards are never
added. No other tolerance is guessed.

```json
{
  "input": "number",
  "exact": { "type": "string", "value": "1/2" },
  "partial": { "credit": 0.5, "match": { "type": "string", "value": "3/6" } }
}
```

For this simplification policy, `1/2` earns full credit, `3/6` half, and unlisted
`2/4` or `0.5` zero. The raw representation is preserved while independently
checking that it is a valid number. `1/0` is invalid, not a valid string match.
To accept all equivalent values, instead declare `exact: { "type": "number",
"value": "1/2" }`; that deliberately gives `3/6` full credit. Never combine that
broad full-credit matcher with `3/6` partial and expect partial to override it.
Task wording must explain any required notation.

For `input: "length"`, declare `unit` alongside `exact`; number/range matchers
use that unit after exact conversion of the supplied length. String matchers
still compare the original unit-bearing representation. Bare numbers and
unsupported units are invalid. Maths input/dimensions must agree with the typed
canonical answer. History choice policies use `input: "number"` to match the
selected zero-based option index; text/year policies use the same engine.
History `acceptedAnswers` lists full-credit canonical forms, not partial ones.

A partial match earns half of the question/step's normal points. It earns no
history speed bonus and does not satisfy maths' all-fully-correct accuracy
bonus. An easy calculation can earn **1.25** points, so maths records now accept
quarter points; maxima and grade thresholds stay unchanged. Feedback and
results show partial status, the canonical correct answer, explanation and
actual awarded points; the learner still explicitly continues.

### Legacy assessment compatibility

V1 history and v2 maths JSON must not declare `assessment`; opt into v3 explicitly
to change policy. Compatibility helpers in the same shared evaluator preserve
legacy history spelling normalization, digit-only marked years and automatic
half credit strictly less than ten years away. They preserve legacy maths
integer-only, fraction-only and decimal notation restrictions and exact unit
conversion, with no new partial credit. Stored results are not rewritten.
Legacy pages get the common motivational subtitle if none was supplied.

### Typed answers and exact comparison

Expected values are bounded **strings**, never floating-point JSON numbers,
code, regular expressions or accepted-answer programs:

```json
{ "format": "integer", "value": "-12" }
{ "format": "fraction", "numerator": "2", "denominator": "4" }
{ "format": "decimal", "value": "0.125" }
{ "format": "length", "value": "1.5", "unit": "m" }
```

These are alternative answer objects, not a single JSON document. Integer
parts/numerators/denominators have at most 12 digits; decimals have at most 12
fractional digits. Stored values use a decimal point, no leading plus, exponent,
thousands separator or redundant leading zeros. Denominators are positive and
nonzero; length values are nonnegative. Units are exactly `mm`, `cm`, `dm`, `m`,
`km`. Irrelevant answer keys are rejected. The display uses Czech decimal commas.
Prefer integer numerical results when suitable. For a non-integer numerical
answer, use `decimal` so the child can type a comma or a dot; never require
one particular decimal separator. Explicit fraction and length tasks retain
their respective formats.

Choose the answer dimension from what the learner is asked to enter, not just
the topic. If the question specifies the target unit ("convert 2 km to metres",
"how many centimetres?"), use an integer/decimal answer with `input: "number"`;
the answer is `2000`, not `2000 m`. Do not require the learner to repeat the
given unit or accept another unit in place of performing the requested
conversion. Reserve `format: "length"` and `input: "length"` for prompts
explicitly asking for an answer including a unit. Those fields are labelled
"včetně jednotky"; other numeric fields take numbers only. Keep units in worked
calculations and explanations regardless of the input format.

The runtime compares exact rational values using bounded BigInt arithmetic, not
floating-point epsilon, spelling normalization, approximate-year credit, or
`eval`. Integer, fraction and decimal expected formats describe the canonical
answer. The declared policy decides credit, not this display format.
V3 number input accepts whole numbers, decimals with comma or point,
fractions and mixed numbers; number matchers compare values exactly:
**7/4 = 1 3/4 = 1.75**, **0.5 = 1/2**, **3 = 3.0 = 6/2**.
Value matchers need not enumerate infinitely many equivalent fractions.
String matchers deliberately do not apply value equivalence.
Trim surrounding whitespace; reject mixed separators, expressions,
trailing text, ambiguous grouping, empty or malformed answers. Length answers
require an explicit supported unit and exact conversion: 1 km = 1000 m,
1 m = 10 dm = 100 cm = 1000 mm. Equivalent supported units are valid; missing
units, wrong dimensions or unknown units are invalid. Algebra/interactive
geometry and other answer formats are unsupported, not silently misgraded.
User input permits at most 12 integer digits and 12 fractional digits, with
optional minus but no plus, exponent, thousands grouping or redundant leading
zeros. Fraction numerators and denominators are signed integers of at most
12 digits; whitespace around `/` is allowed. A denominator of zero is invalid;
negative denominators are normalized by exact cross multiplication. Decimal
notation is accepted across all three numeric formats. Mixed numbers use a
whole part followed by a proper positive fraction (`1 3/4`); a leading minus
applies to the whole value (`-1 3/4 = -7/4`). Zero denominators, signed mixed
fraction parts and improper mixed parts (`1 4/4`) are rejected. There is no implicit
rounding: `0.333333333333` is not `1/3`. Length answers accept whole or decimal
nonnegative values, optionally spaced from a lowercase unit (`150cm` and
`150 cm` both work); fractions as length values and uppercase units are invalid.
The page explains these formats and reports missing, malformed or unsupported
units explicitly. A supported but numerically wrong conversion earns zero.

Submitting locks every field for that task. Each missing, malformed or incorrect
step earns zero independently; partial steps earn their declared half credit
and other correct steps retain their points. Hard
steps are compared with their own expected values, not a propagated earlier
mistake. Feedback includes each entry, the correct typed answer, worked step,
whole-task explanation and points. Nothing advances until the child chooses
the next task. Results repeat all feedback and show a Czech grade. Grades use
the exact score, not the rounded display percentage.

Maths results store run id, entered name/nickname, mode, score, attainable
maximum, grade, local date/time and active `answerDurationMs` under
`maths-tutor:v2:<lesson-id>` in `sessionStorage`. Older named results without
answer duration remain readable. Duration never affects maths ranking. Old anonymous
v1 results remain untouched under their old key and are not migrated to a
fabricated player name. Results remain per-subject, per-lesson and session-local,
never transmitted. Read errors or corrupt records
show a Czech warning and leave the original storage untouched; new runs remain
in memory. Write failures warn that new results will not survive reload.
A later successful save includes all in-memory results and clears that warning.
