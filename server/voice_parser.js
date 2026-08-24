const nlp = require('compromise');
const chrono = require('chrono-node');
const Fuse = require('fuse.js');

function parseDate(text) {
    const parsed = chrono.parseDate(text);
    if (!parsed) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function extractEntity(text, list, keys) {
    if (!list || list.length === 0) return null;
    
    // Simple approach: Use fuse to find the best match of any known entity in the text
    // A better approach is to check if any item in the list is present in the text
    // Let's create a fuse instance where the "query" is the list item, and we check if it matches the text? No.
    // Let's do: score each item based on if its string representation is in the text.
    
    // To handle misspellings, we'll extract words from the text and see if they fuzzy match the list items.
    // Or we just tokenize the text and use Fuse to search for each item.
    // Best way: Use fuse.js on the list, and for the query, pass the text. But the text has extra words.
    // Instead, let's extract nouns/people/places with compromise, then fuzzy search those against the list.
    
    let candidates = nlp(text).nouns().out('array');
    candidates = candidates.concat(nlp(text).people().out('array'));
    candidates = candidates.concat(nlp(text).places().out('array'));
    
    // also add the raw words longer than 3 chars just in case compromise missed it
    text.split(' ').forEach(w => {
        if (w.length > 3) candidates.push(w);
    });

    const fuse = new Fuse(list, { keys: keys, threshold: 0.3, includeScore: true });
    
    let bestMatch = null;
    let bestScore = 1; // Lower is better in fuse.js (0 is perfect)
    
    for (const cand of candidates) {
        const results = fuse.search(cand);
        if (results.length > 0) {
            if (results[0].score < bestScore) {
                bestScore = results[0].score;
                bestMatch = results[0].item;
            }
        }
    }
    
    // If we didn't find anything via compromise, try searching the whole text
    // (Fuse handles long text poorly but might get a hit if threshold is high, though risky)
    if (!bestMatch) {
        const fullResults = fuse.search(text);
        if (fullResults.length > 0 && fullResults[0].score < 0.4) {
            bestMatch = fullResults[0].item;
        }
    }
    
    return bestMatch;
}

function parseVoiceIntent(transcript, context) {
    const { users, locations, leaveCategories } = context;
    const text = transcript.toLowerCase();
    
    let intent = 'UNKNOWN';
    let entities = {
        date: parseDate(text),
        user: extractEntity(text, users, ['name']),
        location: extractEntity(text, locations, ['name']),
        leaveCategory: extractEntity(text, leaveCategories, ['name'])
    };

    // Intent Matching Heuristics
    if ((text.includes('approve') || text.includes('accept')) && text.includes('leave')) {
        intent = 'APPROVE_LEAVE';
    } else if ((text.includes('reject') || text.includes('deny') || text.includes('decline')) && text.includes('leave')) {
        intent = 'REJECT_LEAVE';
    } else if (text.includes('cancel') && text.includes('leave')) {
        intent = 'CANCEL_LEAVE';
    } else if (text.includes('add') && text.includes('holiday')) {
        intent = 'ADD_HOLIDAY';
    } else if (text.includes('add') && text.includes('location')) {
        intent = 'ADD_LOCATION';
    } else if (text.includes('change') && text.includes('category')) {
        intent = 'CHANGE_CATEGORY';
    } else if (text.includes('when is') && (text.includes('holiday') || text.includes('next holiday'))) {
        intent = 'NEXT_HOLIDAY';
    } else if (text.includes('show') && (text.includes('team') || text.includes('employee'))) {
        intent = 'SHOW_TEAM';
    }

    return {
        transcript,
        intent,
        entities
    };
}

module.exports = {
    parseVoiceIntent
};
