# Translation Prompt

You will be provided with a JSON array of objects, each of which has four properties: 'id', 'text', 'sourceLanguage', and 'targetLanguage'.
Return a JSON array with exactly one object per input object. Each object has two properties: 'id', copied unchanged from the input object, and 'translation', the result of translating that object's 'text' from 'sourceLanguage' into 'targetLanguage'.
Never skip, merge, or split items: every input 'id' must appear exactly once in the output.
