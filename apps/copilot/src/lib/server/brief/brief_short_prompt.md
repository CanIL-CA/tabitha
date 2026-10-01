# TaBiThA-BRIEF Generation Prompt

Inputs: verse reference, TNN text, LWC verse, TaBiThA notes, and rigor (HIGH/LOW). Empty-but-present fields are valid. TNN is never reconstructed or inferred.

Output Sections 4, 5, and 7 according to the provided JSON schema.

TNN is the sole content source; LWC and TaBiThA are control inputs only. Apply each section independently to the full TNN. Do not draw on any external knowledge, commentary, or background sources for the content of any section, use only what is provided in the input.

**Inline LWC markers:**

- `<<...>>` - implicit material, may seed a Section 4 note
- `(Literal)/(Dynamic)` - translator choices, never Section 7
- `(Primary)/(Alternate n)` - meaning alternatives, always Section 7 `UNRESOLVED`.

**Rigor:**

In `LOW`, bracket presence means open; bracket absence is unknown. In `HIGH`, bracket presence means open and bracket absence means deliberate closure. Rigor affects exclusion from Section 4 notes and Section 7 status, never whether a TNN-attested interpretive split exists.

**Section 4 — Translator Notes:**

Extract only verbatim TNN mechanics notes that address a hazard actually present in the LWC. Build a candidate table: `NOTE`, `FUNCTION`, `LWC SPAN`, `VERDICT`. `FUNCTION` = MECHANICS (how to translate) or BACKGROUND (what it means/refers to). Mechanics with a live LWC hazard → `RETAIN`; mechanics whose construction is absent → `NOT APPLICABLE`; mechanics whose requested fix is performed by LWC → `SOLVED`. Background tied to a specific verse term → Section 5 (Cultural or Background). Background with no specific verse term → `CUT`. `CUT` is allowed only for out-of-scope notes or null payload already expressed by the LWC. Never cut because something is obvious, self-evident, or an over-reading.

Only `RETAIN` appears in Section 4. Also return the excluded mechanics notes, if any, with the reason of exclusion.

If rigor is `HIGH`, and TNN presents multiple alternatives that are equally valid, but the LWC verse does not show alternatives for that part of the verse, then exclude that note - the LWC verse takes priority over the TNN. If rigor is `LOW`, then that TNN note should be included, and possibly moved to Section 7 as `RESOLVED UPSTREAM`.

Rules:

- Extract verbatim only. Do not summarize, paraphrase, or add any commentary of your own.
- Do not include alternative renderings — these are supplied by TaBiThA.
- Do not include framing phrases such as "Here are some other ways to translate this word/phrase/verse part."
- Extract only the mechanics problem identification and any cross-reference instructions.

**Section 5 — Cultural & Contextual Background:**

Use only TNN background notes tied to a specific verse term and containing information not already evident in the LWC verse or trivially obvious in context. For example, a lexical gloss that merely restates what the LWC already makes plain should not be kept. Summarization is allowed, but every clause must be traceable to supplied TNN.

- `Cultural` - term creates a target-language/cultural word-choice issue.
- `Background` - verse leaves needed meaning unexplained. Do not add external knowledge or theological claims.

**Section 7 — Consultant Decision:**

Surface every TNN-attested interpretive/textual split verbatim, including competing background readings. Never silently discard a competing reading.

A split can also be detected during the Section 4 pass: if two or more background notes give competing readings of the same verse term, that is a TNN-attested split and is surfaced here — it must **never** be resolved by keeping one reading and silently excluding the other in Section 4.

Classify each as:

- `UNRESOLVED` - the semantic notes, LWC verse, and the TNN do not contradict each other in the number or validity of alternatives. Meaning alternatives from the LWC are always `UNRESOLVED`
- `CONFLICT` - the semantic notes or the LWC verse assumes or implicitly picks one alternative, whereas the TNN explicitly presents multiple alternatives that are equally valid
- `RESOLVED UPSTREAM` - the semantic notes or the LWC verse assumes or implicitly picks one alternative, and the TNN does not explicitly contradict that decision

Always preserve the TNN wording; do not use external knowledge, BSB/Greek reconstruction, or content from other sections to manufacture conclusions.
