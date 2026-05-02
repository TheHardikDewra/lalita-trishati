#!/usr/bin/env python3
"""
Sri Lalita Trishati - Data builder

Reads source files from ../lalita-trishati-research/ and produces data.js
with all 300 names organized by 15 syllables / 3 kūṭas of the Pañcadaśākṣarī mantra.

Sources:
- Devanagari: sanskritdocuments.org (trishati.html, trishatinaamaavali.html)
- ITRANS: sanskritdocuments.org (trishati.itx, trishatinaamaavali.itx)
- English meanings: kadambakusumam.blogspot.com (Sri Ranganathan translation)
"""

import json
import re
import os
from pathlib import Path

RESEARCH = Path.home() / 'lalita-trishati-research'
OUT = Path.home() / 'lalita-trishati' / 'data.js'

# ITRANS -> IAST mapping (Harvard-Kyoto-style → Unicode IAST)
# Based on https://www.sanskritweb.net/itrans/itmanual2003.pdf
# Plus the conventions used by sanskritdocuments.org
ITRANS_TO_IAST = [
    # Compound: longer matches first
    ('R^i', 'ṛ'), ('R^I', 'ṝ'), ('L^i', 'ḷ'), ('L^I', 'ḹ'),
    ('aa', 'ā'), ('AA', 'ā'),
    ('ii', 'ī'), ('II', 'ī'), ('I', 'ī'),
    ('uu', 'ū'), ('UU', 'ū'), ('U', 'ū'),
    ('ai', 'ai'), ('au', 'au'),
    ('A', 'ā'),
    ('Ch', 'ch'), ('chh', 'ch'),
    # Aspirated consonants
    ('kh', 'kh'), ('gh', 'gh'), ('~N', 'ṅ'), ('N^', 'ṅ'),
    ('ch', 'c'), ('Ch', 'ch'), ('jh', 'jh'), ('~n', 'ñ'), ('JN', 'ñ'),
    ('Th', 'ṭh'), ('Dh', 'ḍh'), ('N', 'ṇ'),
    ('th', 'th'), ('dh', 'dh'),
    ('ph', 'ph'), ('bh', 'bh'),
    ('sh', 'ś'), ('Sh', 'ṣ'), ('shh', 'ṣ'),
    # Single consonants that have replacements
    ('T', 'ṭ'), ('D', 'ḍ'),
    ('M', 'ṃ'), ('.m', 'ṃ'),
    ('H', 'ḥ'), ('.h', ''),  # halant
    ('R', 'ṛ'),
    # Anusvara/visarga signs
]

def itrans_to_iast(s):
    """Convert ITRANS-encoded Sanskrit to IAST.

    The ITRANS scheme used by sanskritdocuments.org is documented at
    https://www.sanskritweb.net/itrans/itmanual2003.pdf
    """
    if not s:
        return s

    # Handle longest matches first
    # Order: compound vowels/consonants > aspirated consonants > single chars
    rules = [
        # Long vowels with marks
        ('R^i', 'ṛ'), ('R^I', 'ṝ'),
        ('L^i', 'ḷ'), ('L^I', 'ḹ'),

        # ai, au are diphthongs - leave as-is
        # but keep them protected from the 'a' replacement
        ('ai', '\x01'), ('au', '\x02'),

        # Aspirated consonants (must come before bare consonants)
        ('kh', '\x10'), ('gh', '\x11'),
        ('chh', '\x12'),
        ('jh', '\x13'),
        ('Th', '\x14'), ('Dh', '\x15'),
        ('th', '\x16'), ('dh', '\x17'),
        ('ph', '\x18'), ('bh', '\x19'),

        # Other special consonants
        ('~N', 'ṅ'), ('N^', 'ṅ'),
        ('~n', 'ñ'), ('JN', 'ñ'),
        ('shh', 'ṣ'), ('Sh', 'ṣ'),
        ('sh', 'ś'),
        ('chh', 'ch'),  # already replaced above
        ('ch', 'c'),

        # Long vowels
        ('aa', 'ā'), ('AA', 'ā'), ('A', 'ā'),
        ('ii', 'ī'), ('II', 'ī'), ('I', 'ī'),
        ('uu', 'ū'), ('UU', 'ū'), ('U', 'ū'),

        # Single retroflex/special
        ('T', 'ṭ'), ('D', 'ḍ'), ('N', 'ṇ'),
        ('M', 'ṃ'), ('.m', 'ṃ'), ('.n', 'ṃ'),
        ('H', 'ḥ'),
        ('.h', ''),  # halant marker

        # Restore protected diphthongs
        ('\x01', 'ai'), ('\x02', 'au'),

        # Restore aspirated consonants
        ('\x10', 'kh'), ('\x11', 'gh'),
        ('\x12', 'ch'),
        ('\x13', 'jh'),
        ('\x14', 'ṭh'), ('\x15', 'ḍh'),
        ('\x16', 'th'), ('\x17', 'dh'),
        ('\x18', 'ph'), ('\x19', 'bh'),
    ]

    out = s
    for src, tgt in rules:
        out = out.replace(src, tgt)
    return out


# Panchadashi mantra structure
# Vāgbhava Kūṭa (5 syllables): Ka E Ī La Hrīṃ
# Kāmarāja Kūṭa (6 syllables): Ha Sa Ka Ha La Hrīṃ
# Śakti Kūṭa (4 syllables): Sa Ka La Hrīṃ
SYLLABLES = [
    # Vāgbhava Kūṭa (Speech / Wisdom)
    {"index": 0,  "devanagari": "क",     "iast": "ka",   "kuta": 0,
     "meaning": "Light - the first syllable of the Pañcadaśī mantra"},
    {"index": 1,  "devanagari": "ए",     "iast": "e",    "kuta": 0,
     "meaning": "Absolute Truth (Brahman) - the second syllable"},
    {"index": 2,  "devanagari": "ई",     "iast": "ī",    "kuta": 0,
     "meaning": "Śakti, the moving force - the third syllable"},
    {"index": 3,  "devanagari": "ल",     "iast": "la",   "kuta": 0,
     "meaning": "The wave that initiates wisdom - the fourth syllable"},
    {"index": 4,  "devanagari": "ह्रीं",  "iast": "hrīṃ", "kuta": 0,
     "meaning": "The bījā of Devī - seal of the Vāgbhava Kūṭa"},

    # Kāmarāja Kūṭa (Desire / Love)
    {"index": 5,  "devanagari": "ह",     "iast": "ha",   "kuta": 1,
     "meaning": "Valour that destroys enemies - the sixth syllable"},
    {"index": 6,  "devanagari": "स",     "iast": "sa",   "kuta": 1,
     "meaning": "Material wealth and pleasures - the seventh syllable"},
    {"index": 7,  "devanagari": "क",     "iast": "ka",   "kuta": 1,
     "meaning": "Light, returning - the eighth syllable"},
    {"index": 8,  "devanagari": "ह",     "iast": "ha",   "kuta": 1,
     "meaning": "Wealth and valour - the ninth syllable"},
    {"index": 9,  "devanagari": "ल",     "iast": "la",   "kuta": 1,
     "meaning": "Wisdom-wave, returning - the tenth syllable"},
    {"index": 10, "devanagari": "ह्रीं", "iast": "hrīṃ", "kuta": 1,
     "meaning": "The bījā of Devī - seal of the Kāmarāja Kūṭa"},

    # Śakti Kūṭa (Power)
    {"index": 11, "devanagari": "स",     "iast": "sa",   "kuta": 2,
     "meaning": "Wealth, returning - the twelfth syllable"},
    {"index": 12, "devanagari": "क",     "iast": "ka",   "kuta": 2,
     "meaning": "Light, third turn - the thirteenth syllable"},
    {"index": 13, "devanagari": "ल",     "iast": "la",   "kuta": 2,
     "meaning": "Wisdom-wave, third turn - the fourteenth syllable"},
    {"index": 14, "devanagari": "ह्रीं", "iast": "hrīṃ", "kuta": 2,
     "meaning": "The final bījā - seal of the Śakti Kūṭa"},
]

KUTAS = [
    {"index": 0,
     "name": "First Section",
     "syllables": [0, 1, 2, 3, 4],
     "description": "Names 1-100 worship Devī as the source of all knowledge and sacred speech."},
    {"index": 1,
     "name": "Second Section",
     "syllables": [5, 6, 7, 8, 9, 10],
     "description": "Names 101-200 worship Devī as the empress of all desire and the consort of Kāmeśvara."},
    {"index": 2,
     "name": "Third Section",
     "syllables": [11, 12, 13, 14],
     "description": "Names 201-300 worship Devī as the supreme Śakti who pervades and dissolves all."},
]

# Each syllable holds 20 names. Map name number → syllable index.
def syllable_for_name(num):
    return (num - 1) // 20

# 300 names span 59 verses. The verse pattern from the stotra:
# Each verse holds either 5 or 6 names typically, except some compound names take 1 line.
# I'll parse this from the actual stotra text.
# For now, simple mapping: ~5 names per verse = 60 verses, but actually 59.
# The exact mapping comes from the stotra parsing.


def parse_namavali_devanagari(path):
    """Parse the Devanagari namavali file. Returns list of (number, devanagari_name, full_namavali_line)."""
    with open(path) as f:
        text = f.read()

    # Find names like "ॐ ककाररूपायै नमः ।"
    # The "ॐ ऐं ह्रीं श्रीं" prefix line has no नमः and is skipped.
    # Match "ॐ" + non-newline-non-danda content + (नमः|नाम्ः) - bounded to single line.
    pattern = re.compile(r'ॐ\s+([^।\n]+?)\s*(?:नमः|नाम्ः)')
    lines = []
    for m in pattern.finditer(text):
        full = m.group(0).strip()
        # Normalize the typo found in source for name 149
        if 'नाम्ः' in full:
            full = full.replace('नाम्ः', 'नमः')
        name = m.group(1).strip()
        lines.append((full, name))

    # The first match is "ॐ ऐं ह्रीं श्रीं" which doesn't have नमः - skip.
    # Actually that line is " OM aiM hrIM shrIM" without "namaH" so won't match.
    return lines


def parse_namavali_itrans(path):
    """Parse the ITRANS namavali. Returns list of (number, name) tuples."""
    with open(path) as f:
        text = f.read()
    # Bound to single line so the "OM aiM hrIM shrIM" prefix doesn't leak into name 1.
    pattern = re.compile(r'OM\s+([^|\n]+?)\s+(?:namaH|nAmH)', re.IGNORECASE)
    names = []
    for m in pattern.finditer(text):
        name = m.group(1).strip()
        # Skip the initial "aiM hrIM shrIM" type lines - those don't have "namaH" in them anyway
        if name and name.lower() not in ('aim hrim shrim',):
            names.append(name)
    return names


def parse_kadamba_meanings(path):
    """Parse the kadamba blog English text. Returns dict of {number: (english_translit, meaning)}."""
    with open(path) as f:
        text = f.read()

    meanings = {}
    # Format: "1 Kakara Roopa - She who is like..."
    pattern = re.compile(r'^(\d+)\s+(.+?)\s+-\s+(.+?)$', re.MULTILINE)
    for m in pattern.finditer(text):
        num = int(m.group(1))
        if 1 <= num <= 300:
            translit = m.group(2).strip()
            meaning = m.group(3).strip()
            # Skip if already collected (some duplicates due to comments at bottom)
            if num not in meanings:
                meanings[num] = (translit, meaning)
    return meanings


def normalize_devanagari_name(name):
    """Convert namavali form (ending in -āyai/-yai) to nominative form (ending in -ā/-ī etc).

    Actually, for display we might want to keep both. But the dative form (-āyai)
    is what's chanted. The base form appears in the stotra. Let me keep the dative
    namavali form but also try to derive the basic stotra form.
    """
    # The transformations are complex. Better to just map from stotra text directly.
    # For now, return as-is.
    return name


def parse_stotra_devanagari(path):
    """Parse the full stotra. Extract 59 main verses with their name lines.

    Strips trailing parenthetical variants from each verse so they don't count as
    extra tokens (e.g., "हालामदालसा ॥ २३॥ (हालामदोल्लसा)" → V23 ends at the danda,
    the variant note belongs to V23 not V24).
    """
    with open(path) as f:
        text = f.read()

    start = text.find("॥ अथ श्रीललितात्रिशती स्तोत्रम् ॥")
    end = text.find("॥ इति श्रीललितात्रिशतीस्तोत्रं सम्पूर्णम् ॥")
    if start < 0 or end < 0:
        raise RuntimeError("Could not find main stotra delimiters")

    body = text[start:end]

    # Strip variant parentheticals so they don't get attached to the next verse
    body = re.sub(r'\([^)]*\)', '', body)

    verses = []
    pattern = re.compile(r'(.+?)॥\s*(\d+)॥', re.DOTALL)
    for m in pattern.finditer(body):
        verse_text = m.group(1).strip()
        verse_num = int(m.group(2))
        verse_text = re.sub(r'\n', ' ', verse_text)
        verse_text = re.sub(r'\s+', ' ', verse_text).strip()
        verse_text = verse_text.replace("॥ अथ श्रीललितात्रिशती स्तोत्रम् ॥", "").strip()
        verses.append({"number": verse_num, "devanagari": verse_text})
    return verses


def parse_purvapithika(path):
    with open(path) as f:
        text = f.read()
    start = text.find("॥ श्रीललितात्रिशती पूर्वपीठिका ॥")
    end = text.find("॥ इति श्रीललितात्रिशतीस्तोत्रस्य पूर्वपीठिका सम्पूर्णा")
    if start < 0 or end < 0:
        raise RuntimeError("Could not find purvapithika delimiters")
    section = text[start:end]
    # Extract verses
    verses = []
    speaker = None
    # Speakers: अगस्त्य उवाच, सूत उवाच, हयग्रीव उवाच, श्रीदेवी उवाच
    pattern = re.compile(r'(.+?)॥\s*(\d+)॥', re.DOTALL)
    cur_speaker = None
    pos = 0
    speaker_pattern = re.compile(r'(अगस्त्य उवाच|सूत उवाच|हयग्रीव उवाच|श्रीदेवी उवाच)\s*[-–—]*')
    for m in pattern.finditer(section):
        chunk = m.group(1)
        verse_num = int(m.group(2))
        # Find speaker if present
        sm = speaker_pattern.search(chunk)
        if sm:
            cur_speaker = sm.group(1)
            chunk = chunk[sm.end():]
        text_clean = re.sub(r'\s+', ' ', chunk).strip()
        verses.append({"number": verse_num, "speaker": cur_speaker, "devanagari": text_clean})
    return verses


def parse_uttarapithika(path):
    with open(path) as f:
        text = f.read()
    start = text.find("॥ श्रीललिता त्रिशती उत्तरपीठिका ॥")
    if start < 0:
        # try another marker
        start = text.find("उत्तरपीठिका")
        if start < 0:
            raise RuntimeError("Could not find uttarapithika delimiters")
    end = text.find("॥ इति श्री ब्रह्माण्डपुराणे")
    if end < 0:
        end = len(text)
    section = text[start:end]
    verses = []
    pattern = re.compile(r'(.+?)॥\s*(\d+)\s*॥', re.DOTALL)
    speaker_pattern = re.compile(r'(अगस्त्य उवाच|सूत उवाच|हयग्रीव उवाच|श्रीदेवी उवाच)\s*[-–—]*')
    cur_speaker = None
    for m in pattern.finditer(section):
        chunk = m.group(1)
        verse_num = int(m.group(2))
        sm = speaker_pattern.search(chunk)
        if sm:
            cur_speaker = sm.group(1)
            chunk = chunk[sm.end():]
        text_clean = re.sub(r'\s+', ' ', chunk).strip()
        verses.append({"number": verse_num, "speaker": cur_speaker, "devanagari": text_clean})
    return verses


def parse_dhyana_etc(path):
    """Parse nyāsa, dhyāna, pañcapūjā from the stotra file."""
    with open(path) as f:
        text = f.read()
    # Nyāsa
    n_start = text.find("॥ न्यासः ॥")
    n_end = text.find("॥ ध्यानम् ॥")
    nyasa = ''
    if n_start >= 0 and n_end > n_start:
        nyasa = text[n_start:n_end].replace("॥ न्यासः ॥", "").strip()
        nyasa = re.sub(r'\n+', '\n', nyasa).strip()

    d_start = text.find("॥ ध्यानम् ॥")
    d_end = text.find("॥ लं इत्यादि पञ्चपूजा ॥")
    dhyana = ''
    if d_start >= 0 and d_end > d_start:
        dhyana = text[d_start:d_end].replace("॥ ध्यानम् ॥", "").strip()
        dhyana = re.sub(r'\n+', '\n', dhyana).strip()

    p_start = text.find("॥ लं इत्यादि पञ्चपूजा ॥")
    p_end = text.find("॥ अथ श्रीललितात्रिशती स्तोत्रम् ॥")
    panchapuja = ''
    if p_start >= 0 and p_end > p_start:
        panchapuja = text[p_start:p_end].replace("॥ लं इत्यादि पञ्चपूजा ॥", "").strip()
        panchapuja = re.sub(r'\n+', '\n', panchapuja).strip()

    return nyasa, dhyana, panchapuja


def determine_verse_for_name(name_num, verses):
    """Given a name number 1-300 and the list of 59 verses,
    determine which verse it belongs to by matching a portion of the name in the verse text.
    For now, use a simple even-distribution heuristic: ~5 names per verse."""
    # Names are distributed across 59 verses. Total = 300 names / 59 verses ≈ 5.08.
    # The exact mapping requires parsing each verse's name boundaries (separated by spaces in DV).
    # For now, just use a rough mapping; we'll refine if needed.
    # Rough: names 1-5 → verse 1, 6-10 → verse 2, etc., adjusting where verses have 4 or 6 names.
    return min(((name_num - 1) // 5) + 1, 59)


def build_verse_name_mapping(verses, name_devanagari_list):
    """Map names to verses using syllable anchors.

    The 15 syllables of the Pañcadaśākṣarī mantra each generate exactly 20 names.
    The first name of each syllable is a "syllable-marker" name (Kakāra-rūpā,
    Ekāra-rūpā, Īkāra-rūpā, etc.) that appears as the first or second token of
    the verse where its syllable group begins.

    Algorithm:
      1. Find which verse each syllable-marker name appears in (gives 15 anchors).
      2. For each syllable, distribute its 20 names across its verses by
         counting whitespace-separated tokens per verse (with hyphen-merging
         and visarga-sandhi detection). Any leftover from sandhi mismatches
         spills onto the last verse of that syllable group.
    """
    # Syllable anchor markers (the first name of each syllable group, in stem form
    # that appears verbatim in the stotra)
    anchors = [
        ('ककाररूपा',     1),
        ('एकाररूपा',      21),
        ('ईकाररूपा',      41),
        ('लकाररूपा',      61),
        ('ह्रींकाररूपा',  81),
        ('हकाररूपा',      101),
        ('सकाररूपा',      121),
        ('ककारार्था',     141),
        ('हकारार्था',     161),
        ('लकाराख्या',     181),
        ('ह्रींकारिणी',   201),
        ('सकाराख्या',     221),
        ('ककारिणी',       241),
        ('लकारिणी',       261),
        ('ह्रींकारमूर्ति', 281),
    ]

    # Find verse number where each anchor first appears
    syllable_start_verse = []  # verse number for syllable i (0-14)
    for marker, _ in anchors:
        found_verse = None
        for v in verses:
            if marker in v["devanagari"]:
                found_verse = v["number"]
                break
        if found_verse is None:
            raise RuntimeError(f"Could not find anchor marker: {marker}")
        syllable_start_verse.append(found_verse)

    # Compute verse range per syllable
    syllable_verses = []  # list of (start_v, end_v) inclusive for each syllable
    for i in range(15):
        start_v = syllable_start_verse[i]
        end_v = syllable_start_verse[i + 1] if i + 1 < 15 else verses[-1]["number"]
        # Each syllable's verses go from start_v to end_v - 1, except last syllable
        # which goes to the final verse.
        if i < 14:
            end_v = end_v  # exclusive
            syllable_verses.append((start_v, end_v - 1))
        else:
            syllable_verses.append((start_v, verses[-1]["number"]))

    # Build verse_idx → verse object map
    verse_by_num = {v["number"]: v for v in verses}
    for v in verses:
        v["names"] = []

    # For each syllable, count tokens in its verses to distribute 20 names
    name_to_verse = {}
    cur_name = 1

    for syl_idx in range(15):
        start_v, end_v = syllable_verses[syl_idx]
        # The 20 names for this syllable go into verses [start_v..end_v]
        # Special case: the FIRST verse of a syllable may also contain trailing
        # names of the previous syllable (when the previous syllable's last name
        # finishes mid-verse and the new syllable starts on the same verse line).
        # We've already advanced cur_name past those, so just distribute the next 20.

        # Collect token counts per verse in this syllable's range
        verses_in_range = []
        for vn in range(start_v, end_v + 1):
            v = verse_by_num[vn]
            v_text = v["devanagari"]

            # If this is the syllable-start verse and not the first syllable,
            # only count tokens AFTER the syllable marker
            if vn == start_v and syl_idx > 0:
                marker = anchors[syl_idx][0]
                idx = v_text.find(marker)
                if idx > 0:
                    v_text = v_text[idx:]

            # If this is the LAST verse of this syllable's range AND the next
            # syllable starts in the same verse (i.e., end_v == start of next),
            # only count tokens BEFORE the next syllable marker
            if syl_idx + 1 < 15 and vn == end_v:
                next_marker = anchors[syl_idx + 1][0]
                if next_marker in v["devanagari"]:
                    idx = v["devanagari"].find(next_marker)
                    # Trim to before next_marker, but only if marker appears in this verse
                    if idx >= 0:
                        v_text_section = v["devanagari"][:idx]
                        # If we already trimmed v_text for the start marker, intersect both
                        if vn == start_v and syl_idx > 0:
                            marker = anchors[syl_idx][0]
                            start_idx = v["devanagari"].find(marker)
                            v_text = v["devanagari"][start_idx:idx] if start_idx >= 0 else v_text_section
                        else:
                            v_text = v_text_section

            # Tokenize
            cleaned = re.sub(r'[।॥]', ' ', v_text)
            cleaned = re.sub(r'[०-९0-9]', '', cleaned)
            tokens = [t for t in cleaned.split() if t]
            clean_tokens = []
            in_paren = False
            i = 0
            while i < len(tokens):
                t = tokens[i]
                if t.startswith('(') and t.endswith(')'):
                    i += 1; continue
                if t.startswith('('):
                    in_paren = True; i += 1; continue
                if in_paren:
                    if t.endswith(')'): in_paren = False
                    i += 1; continue
                while t.endswith('-') and i + 1 < len(tokens):
                    i += 1
                    t = t + tokens[i]
                clean_tokens.append(t)
                i += 1

            # Count tokens with very conservative sandhi adjustment.
            # Only "र्ह्रीं" (visarga + ह्रींकार-prefix) is reliably a sandhi joint
            # in this stotra - many names start with ह्रींकार and the previous
            # name's visarga sandhies into "र्".
            count = 0
            for t in clean_tokens:
                # Strip the first 3 chars to skip any leading "ह्रीं" of the token itself
                # (so we don't double-count the start of a single name)
                inner = t[3:] if len(t) > 3 else ''
                sandhi_extra = 1 if 'र्ह्रीं' in inner else 0
                count += 1 + sandhi_extra
            verses_in_range.append((vn, count, clean_tokens))

        # Distribute exactly 20 names across these verses
        total_counted = sum(c for _, c, _ in verses_in_range)
        # Assign names according to counted distribution; if total != 20, scale or shift
        if total_counted == 20:
            for vn, count, _ in verses_in_range:
                v = verse_by_num[vn]
                for _ in range(count):
                    v["names"].append(cur_name)
                    name_to_verse[cur_name] = vn
                    cur_name += 1
        else:
            # Distribute proportionally, rounding, and adjust last verse for remainder
            # Or simpler: assign counted, then put remaining names on last verse of group
            assigned = 0
            for vn, count, _ in verses_in_range:
                # Don't exceed 20 total
                use_count = min(count, 20 - assigned)
                v = verse_by_num[vn]
                for _ in range(use_count):
                    v["names"].append(cur_name)
                    name_to_verse[cur_name] = vn
                    cur_name += 1
                assigned += use_count
            # If we still have names left to assign, put on last verse
            while assigned < 20:
                last_vn = verses_in_range[-1][0]
                verse_by_num[last_vn]["names"].append(cur_name)
                name_to_verse[cur_name] = last_vn
                cur_name += 1
                assigned += 1

    return name_to_verse


def main():
    nam_dv = parse_namavali_devanagari(RESEARCH / 'trishati_namavali.txt')
    nam_itrans = parse_namavali_itrans(RESEARCH / 'trishati_namavali.itx')
    meanings = parse_kadamba_meanings(RESEARCH / 'kadamba_english.txt')
    stotra_verses = parse_stotra_devanagari(RESEARCH / 'trishati_full.txt')
    purvapithika = parse_purvapithika(RESEARCH / 'trishati_full.txt')
    uttarapithika = parse_uttarapithika(RESEARCH / 'trishati_full.txt')
    nyasa, dhyana, panchapuja = parse_dhyana_etc(RESEARCH / 'trishati_full.txt')

    print(f"Devanagari namavali entries: {len(nam_dv)}")
    print(f"ITRANS namavali entries: {len(nam_itrans)}")
    print(f"Meanings: {len(meanings)}")
    print(f"Stotra verses: {len(stotra_verses)}")
    print(f"Purvapithika verses: {len(purvapithika)}")
    print(f"Uttarapithika verses: {len(uttarapithika)}")

    # Sanity check
    assert len(nam_dv) == 300, f"Expected 300 Devanagari names, got {len(nam_dv)}"
    assert len(nam_itrans) == 300, f"Expected 300 ITRANS names, got {len(nam_itrans)}"

    # Build the names list
    # We'll extract base name from the namavali (which is in dative case ending in -āyai etc.)
    # The base/stotra form of the name is what appears in the stotra verses.
    # For display we'll use the namavali form but also derive basic IAST.

    names = []
    # Extract bare devanagari names from namavali entries (they're in dative case)
    nam_dv_bare = [n[1] for n in nam_dv]  # just the name part

    def itrans_dative_to_nominative(d):
        """Strip dative endings to get the nominative stotra form (in ITRANS)."""
        rules = [
            ('Ayai', 'A'),    # long ā-stems: -āyai → -ā
            ('yai',  'I'),    # long ī-stems: -yai → -ī
            ('ave',  'U'),    # long ū-stems: -ave → -ū
            ('aye',  'i'),    # short i-stems (rare)
            ('mate', 'matI'), # matī-stems → matī (h­r̥īṃmati case)
        ]
        for src, tgt in rules:
            if d.endswith(src):
                return d[:-len(src)] + tgt
        return d

    def deva_dative_to_nominative(d):
        """Strip Devanagari dative endings to get nominative form."""
        # Order matters: longest first
        rules = [
            ('ायै', 'ा'),     # -āyai → -ā
            ('्यै', 'ी'),     # -yai → -ī (consonant + halant + yai → consonant + ī)
            ('वे',  'ू'),     # -ave → -ū (rare)
            ('ये',  'ी'),     # -ye → -ī (rare)
            ('मते', 'मती'),    # mati → matī
            ('नवे', 'नू'),    # tanave → tanū
        ]
        for src, tgt in rules:
            if d.endswith(src):
                return d[:-len(src)] + tgt
        return d

    # First map name → verse using stotra
    # The verse text contains names in nominative form. For matching, use the prefix.
    # Build stotra-form names from each verse: each verse has names separated by spaces.
    # But since matching is fuzzy, just do a sequential walk.
    name_to_verse = build_verse_name_mapping(stotra_verses, nam_dv_bare)

    for i in range(300):
        num = i + 1
        dv_full, dv_dative = nam_dv[i]
        itrans_dative = nam_itrans[i]

        # Derive nominative (stotra) form from the dative (namavali) form
        itrans_nom = itrans_dative_to_nominative(itrans_dative)
        iast_nom = itrans_to_iast(itrans_nom)
        iast_dative = itrans_to_iast(itrans_dative)
        dv_nom = deva_dative_to_nominative(dv_dative)

        eng_translit = meanings.get(num, ('', ''))[0]
        meaning = meanings.get(num, ('', ''))[1]
        syl_idx = syllable_for_name(num)
        kuta_idx = SYLLABLES[syl_idx]['kuta']
        verse_num = name_to_verse.get(num, determine_verse_for_name(num, stotra_verses))

        namavali_iast = f"oṁ {iast_dative} namaḥ"

        names.append({
            "number": num,
            "devanagari": dv_nom,           # nominative (stotra) form for display
            "iast": iast_nom,                # nominative IAST
            "english": eng_translit,         # English transliteration (nominative)
            "meaning": meaning,
            "syllable": syl_idx,
            "kuta": kuta_idx,
            "verse": verse_num,
            "devanagariDative": dv_dative,   # dative form (namavali)
            "iastDative": iast_dative,       # dative IAST
            "namavaliDevanagari": dv_full,   # full "ॐ X नमः" line
            "namavaliIast": namavali_iast,   # full "oṁ x namaḥ" line
        })

    # Build syllables list with name ranges
    syllables_out = []
    for s in SYLLABLES:
        s_out = dict(s)
        s_out["nameStart"] = s["index"] * 20 + 1
        s_out["nameEnd"] = (s["index"] + 1) * 20
        s_out["kutaName"] = KUTAS[s["kuta"]]["name"]
        syllables_out.append(s_out)

    # Final data structure
    data = {
        "meta": {
            "totalNames": 300,
            "totalSyllables": 15,
            "totalKutas": 3,
            "totalMainVerses": len(stotra_verses),
            "source": "Brahmāṇḍa Purāṇa, dialogue between Hayagrīva and Agastya",
            "version": "1.0",
        },
        "names": names,
        "syllables": syllables_out,
        "kutas": KUTAS,
        "verses": stotra_verses,
        "purvapithika": purvapithika,
        "uttarapithika": uttarapithika,
        "nyasa": nyasa,
        "dhyana": {
            "devanagari": dhyana,
            "iast": "atimadhura-cāpahastām aparimitāmoda-bāṇa-saubhāgyām | aruṇām atiśayakaruṇām abhinava-kulasundarīṃ vande ||",
            "english": "I bow to Her who holds the supremely sweet sugarcane bow and arrows of boundless joy and prosperity, who is crimson-hued, who is mercy beyond all measure, the ever-fresh empress of beauty.",
        },
        "panchapuja": panchapuja,
    }

    # Write data.js
    js = "/* Sri Lalita Trishati - generated by build_data.py - DO NOT edit by hand */\n"
    js += "const TRISHATI_DATA = "
    js += json.dumps(data, ensure_ascii=False, indent=2)
    js += ";\n"

    OUT.write_text(js)
    print(f"\nWrote {OUT} ({len(js)} bytes, {len(names)} names)")


if __name__ == '__main__':
    main()
