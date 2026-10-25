'use strict';

const tutorAssessment = (() => {
    const UNITS = { mm: 1n, cm: 10n, dm: 100n, m: 1000n, km: 1000000n };
    const WHOLE = '-?(?:0|[1-9][0-9]{0,11})';
    const DECIMAL = `${WHOLE}(?:[.,][0-9]{1,12})?`;
    const numericHelp = 'Napiš celé nebo desetinné číslo, zlomek (1/2) či smíšené číslo (1 3/4). Jmenovatel nesmí být nula.';
    const normalizeAnswer = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('cs').replace(/y/g, 'i').trim().replace(/\s+/g, ' ');
    function rational(text) {
        const [whole, part = ''] = text.replace(',', '.').split('.');
        return { numerator: BigInt(whole + part), denominator: 10n ** BigInt(part.length) };
    }
    function parseNumber(text) {
        if (new RegExp(`^${DECIMAL}$`).test(text)) return rational(text);
        const fraction = text.match(new RegExp(`^(${WHOLE})\\s*/\\s*(${WHOLE})$`));
        if (fraction) {
            const numerator = BigInt(fraction[1]);
            const denominator = BigInt(fraction[2]);
            if (denominator === 0n) return null;
            return denominator < 0n ? { numerator: -numerator, denominator: -denominator } : { numerator, denominator };
        }
        const mixed = text.match(/^(-?)(0|[1-9][0-9]{0,11})\s+([1-9][0-9]{0,11})\s*\/\s*([1-9][0-9]{0,11})$/);
        if (!mixed) return null;
        const [, sign, whole, part, denominator] = mixed;
        if (BigInt(part) >= BigInt(denominator)) return null;
        return {
            numerator: (BigInt(whole) * BigInt(denominator) + BigInt(part)) * (sign ? -1n : 1n),
            denominator: BigInt(denominator)
        };
    }
    const compare = (a, b) => {
        const difference = a.numerator * b.denominator - b.numerator * a.denominator;
        return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    };
    function parseInput(policy, raw) {
        if (typeof raw !== 'string') return { error: 'Odpověď musí být text.' };
        const text = raw.trim();
        if (!text) return { error: 'Odpověď chybí.' };
        if (text.length > 80) return { error: 'Odpověď je příliš dlouhá.' };
        if (policy.input === 'text') return { text };
        if (policy.input === 'length') {
            if (new RegExp(`^${DECIMAL}$`).test(text)) return { error: 'Doplň jednotku délky: mm, cm, dm, m nebo km.' };
            const match = text.match(new RegExp(`^(${DECIMAL})\\s*(mm|cm|dm|m|km)$`));
            if (!match || match[1].startsWith('-')) return { error: 'Napiš nezápornou délku s jednotkou mm, cm, dm, m nebo km, například 1,5 m.' };
            const value = rational(match[1]);
            value.numerator *= UNITS[match[2]];
            value.denominator *= UNITS[policy.unit];
            return { text, value };
        }
        const formats = {
            integer: [`^${WHOLE}$`, 'Napiš celé číslo bez jednotky, například -12.'],
            fraction: [`^(${WHOLE})\\s*/\\s*(${WHOLE})$`, 'Napiš zlomek, například 1/2. Jmenovatel nesmí být nula.'],
            decimal: [`^${DECIMAL}$`, 'Napiš číslo s jednou desetinnou čárkou nebo tečkou, bez jednotky.'],
            year: ['^[0-9]{1,4}$', 'Napiš letopočet pomocí jedné až čtyř číslic.']
        };
        if (formats[policy.input] && !new RegExp(formats[policy.input][0]).test(text)) {
            return { error: formats[policy.input][1] };
        }
        if (policy.input !== 'number' && !Object.hasOwn(formats, policy.input)) throw new Error(`Unsupported answer input: ${policy.input}`);
        const value = policy.input === 'year' ? rational(String(Number(text))) : parseNumber(text);
        return value ? { text, value } : { error: numericHelp };
    }
    function matches(matcher, parsed) {
        switch (matcher.type) {
            case 'string': {
                const normalize = matcher.normalization === 'czech' ? normalizeAnswer : text => text.trim().normalize('NFC');
                return normalize(parsed.text) === normalize(matcher.value);
            }
            case 'number': {
                const actual = parsed.value || parseNumber(parsed.text);
                return Boolean(actual && compare(actual, parseNumber(matcher.value)) === 0);
            }
            case 'range': {
                const actual = parsed.value || parseNumber(parsed.text);
                if (!actual) return false;
                const lower = compare(actual, parseNumber(matcher.min));
                const upper = compare(actual, parseNumber(matcher.max));
                return (lower > 0 || (lower === 0 && matcher.includeMin)) &&
                    (upper < 0 || (upper === 0 && matcher.includeMax));
            }
            case 'array':
                return matcher.items.some(item => matches(item, parsed));
            default:
                throw new Error(`Unsupported answer matcher: ${matcher.type}`);
        }
    }
    function evaluate(policy, raw) {
        const parsed = parseInput(policy, raw);
        if (parsed.error) return { fraction: 0, correct: false, valid: false, status: 'invalid', message: parsed.error };
        const fraction = matches(policy.exact, parsed) ? 1 :
            policy.partial && matches(policy.partial.match, parsed) ? policy.partial.credit : 0;
        return {
            fraction, correct: fraction === 1, valid: true,
            status: fraction === 1 ? 'correct' : fraction > 0 ? 'partial' : 'incorrect',
            message: fraction === 1 ? 'Správně.' : fraction > 0 ? 'Částečně správně. Získáváš polovinu bodů.' :
                'Tentokrát to nevyšlo. Porovnej svůj postup s řešením.'
        };
    }
    function legacyMathsPolicy(answer) {
        if (!['integer', 'fraction', 'decimal', 'length'].includes(answer.format)) throw new Error(`Unsupported maths answer format: ${answer.format}`);
        return {
            input: answer.format,
            ...(answer.format === 'length' ? { unit: answer.unit } : {}),
            exact: { type: 'number', value: answer.format === 'fraction' ? `${answer.numerator}/${answer.denominator}` : answer.value }
        };
    }
    function legacyHistoryPolicy(question) {
        if (question.type !== 'text') return { input: 'integer', exact: { type: 'number', value: String(question.answer) } };
        if (!question.year) return {
            input: 'text', exact: { type: 'array', items: question.acceptedAnswers.map(value => ({ type: 'string', value, normalization: 'czech' })) }
        };
        const year = Number(question.acceptedAnswers[0]);
        return {
            input: 'year', exact: { type: 'number', value: String(year) },
            partial: { credit: .5, match: { type: 'range', min: String(year - 9), max: String(year + 9), includeMin: true, includeMax: true } }
        };
    }
    return { parseNumber, parseInput, compare, evaluate, normalizeAnswer, legacyMathsPolicy, legacyHistoryPolicy };
})();

if (typeof module !== 'undefined') module.exports = tutorAssessment;
