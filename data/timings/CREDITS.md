# Word timings

`alafasy/`, `husary/` and `minshawi/` contain word-level recitation timings
derived from [cpfair/quran-align](https://github.com/cpfair/quran-align),
release `release-2016-11-24`, licensed **CC BY 4.0**.

Original data: https://github.com/cpfair/quran-align/releases/tag/release-2016-11-24
License: https://creativecommons.org/licenses/by/4.0/

Each file is one surah. Values are flat groups of four numbers:
`[firstWordIndex, wordAfterLast, startMs, endMs]`. Indices are 0-based and
match the whitespace tokenisation of the Uthmani text after Quranic pause
marks (U+06D6–U+06ED) are left out of the word count.
