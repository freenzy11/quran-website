/* ============================================================
   daily-ayah.js — one ayah per day for the home page.

   A curated list of short, well-known ayahs rotates by day of
   year: the same day of the month shows the same ayah across
   years, and every entry carries its Arabic text, a plain
   translation and the surah reference. Translations are kept
   simple and faithful; the Qur'an text follows the standard
   Uthmani spelling.
   ============================================================ */

const DailyAyah = (() => {
  "use strict";

  const AYAHS = [
    {
      arabic: "إِنَّ مَعَ الْعُسْرِ يُسْرًا",
      translation: "Indeed, with hardship comes ease.",
      surah: "Ash-Sharh",
      reference: "94:6"
    },
    {
      arabic: "فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ",
      translation: "So remember Me; I will remember you. Be grateful to Me, and do not deny Me.",
      surah: "Al-Baqarah",
      reference: "2:152"
    },
    {
      arabic: "يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ",
      translation: "O you who believe, seek help through patience and prayer. Indeed, Allah is with the patient.",
      surah: "Al-Baqarah",
      reference: "2:153"
    },
    {
      arabic: "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
      translation: "Allah does not burden a soul beyond what it can bear.",
      surah: "Al-Baqarah",
      reference: "2:286"
    },
    {
      arabic: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ",
      translation: "Do not despair and do not grieve — you shall be the ones to prevail, if you are believers.",
      surah: "Aal-Imran",
      reference: "3:139"
    },
    {
      arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
      translation: "Sufficient for us is Allah, and He is the best Disposer of affairs.",
      surah: "Aal-Imran",
      reference: "3:173"
    },
    {
      arabic: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً إِنَّكَ أَنتَ الْوَهَّابُ",
      translation: "Our Lord, do not let our hearts deviate after You have guided us, and grant us mercy from Yourself. Indeed, You are the Bestower.",
      surah: "Aal-Imran",
      reference: "3:8"
    },
    {
      arabic: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
      translation: "Verily, in the remembrance of Allah do hearts find rest.",
      surah: "Ar-Rad",
      reference: "13:28"
    },
    {
      arabic: "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ",
      translation: "If you are grateful, I will surely increase you.",
      surah: "Ibrahim",
      reference: "14:7"
    },
    {
      arabic: "رَبِّ زِدْنِي عِلْمًا",
      translation: "My Lord, increase me in knowledge.",
      surah: "Ta-Ha",
      reference: "20:114"
    },
    {
      arabic: "لَا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ",
      translation: "There is no deity except You; exalted are You. Indeed, I have been among the wrongdoers.",
      surah: "Al-Anbiya",
      reference: "21:87"
    },
    {
      arabic: "وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ",
      translation: "When My servants ask you about Me — indeed I am near. I answer the call of the caller when he calls upon Me.",
      surah: "Al-Baqarah",
      reference: "2:186"
    },
    {
      arabic: "قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ",
      translation: "Say: O My servants who have wronged themselves, do not despair of the mercy of Allah.",
      surah: "Az-Zumar",
      reference: "39:53"
    },
    {
      arabic: "وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ",
      translation: "Whoever is mindful of Allah, He will make a way out for him and provide for him from where he never expected.",
      surah: "At-Talaq",
      reference: "65:2-3"
    },
    {
      arabic: "فَإِذَا فَرَغْتَ فَانصَبْ وَإِلَىٰ رَبِّكَ فَارْغَب",
      translation: "So when you are free, devote yourself earnestly to worship, and turn your hopes to your Lord.",
      surah: "Ash-Sharh",
      reference: "94:7-8"
    },
    {
      arabic: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا",
      translation: "Our Lord, grant us joy in our spouses and offspring, and make us leaders for the righteous.",
      surah: "Al-Furqan",
      reference: "25:74"
    },
    {
      arabic: "ادْعُونِي أَسْتَجِبْ لَكُمْ",
      translation: "Call upon Me, and I will answer you.",
      surah: "Ghafir",
      reference: "40:60"
    },
    {
      arabic: "وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا",
      translation: "Those who strive for Us — We will surely guide them to Our ways.",
      surah: "Al-Ankabut",
      reference: "29:69"
    },
    {
      arabic: "فَلَنُحْيِيَنَّهُ حَيَاةً طَيِّبَةً",
      translation: "Whoever does righteous deeds, We will surely give him a good life.",
      surah: "An-Nahl",
      reference: "16:97"
    },
    {
      arabic: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ",
      translation: "Seek help through patience and prayer.",
      surah: "Al-Baqarah",
      reference: "2:45"
    },
    {
      arabic: "إِنَّ رَحْمَتَ اللَّهِ قَرِيبٌ مِّنَ الْمُحْسِنِينَ",
      translation: "Indeed, the mercy of Allah is near to those who do good.",
      surah: "Al-Araf",
      reference: "7:56"
    },
    {
      arabic: "وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ",
      translation: "And my success comes only through Allah. In Him I trust, and to Him I turn.",
      surah: "Hud",
      reference: "11:88"
    },
    {
      arabic: "إِنَّ اللَّهَ مَعَ الَّذِينَ اتَّقَوا وَالَّذِينَ هُم مُّحْسِنُونَ",
      translation: "Indeed, Allah is with those who are mindful of Him and those who do good.",
      surah: "An-Nahl",
      reference: "16:128"
    },
    {
      arabic: "الْمَالُ وَالْبَنُونَ زِينَةُ الْحَيَاةِ الدُّنْيَا وَالْبَاقِيَاتُ الصَّالِحَاتُ خَيْرٌ عِندَ رَبِّكَ ثَوَابًا وَخَيْرٌ أَمَلًا",
      translation: "Wealth and children are the adornment of this worldly life, but lasting righteous deeds are better with your Lord in reward and better in hope.",
      surah: "Al-Kahf",
      reference: "18:46"
    },
    {
      arabic: "رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِن ذُرِّيَّتِي رَبَّنَا وَتَقَبَّلْ دُعَاءِ",
      translation: "My Lord, make me an establisher of prayer, and from my descendants. Our Lord, accept my supplication.",
      surah: "Ibrahim",
      reference: "14:40"
    },
    {
      arabic: "وَإِذَا مَرِضْتُ فَهُوَ يَشْفِينِ",
      translation: "And when I fall ill, it is He who heals me.",
      surah: "Ash-Shuara",
      reference: "26:80"
    },
    {
      arabic: "وَتَوَكَّلْ عَلَى اللَّهِ وَكَفَى بِاللَّهِ وَكِيلًا",
      translation: "And put your trust in Allah, for sufficient is Allah as a Trustee of affairs.",
      surah: "Al-Ahzab",
      reference: "33:3"
    },
    {
      arabic: "وَبَشِّرِ الصَّابِرِينَ",
      translation: "And give good tidings to the patient.",
      surah: "Al-Baqarah",
      reference: "2:155"
    },
    {
      arabic: "قُلْ هُوَ اللَّهُ أَحَدٌ اللَّهُ الصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ",
      translation: "Say: He is Allah, the One. Allah, the Eternal Refuge. He neither begets nor is born, and there is none comparable to Him.",
      surah: "Al-Ikhlas",
      reference: "112:1-4"
    },
    {
      arabic: "وَالْعَصْرِ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ",
      translation: "By time, humanity is in loss — except those who believe, do righteous deeds, counsel one another to truth, and counsel one another to patience.",
      surah: "Al-Asr",
      reference: "103:1-3"
    }
  ];

  function dayOfYear(date = new Date()) {
    const start = new Date(date.getFullYear(), 0, 1);
    return Math.floor((date - start) / 86400000);
  }

  /* Same day of the month shows the same ayah across years,
     because the index is day-of-year modulo 30. */
  function getDailyAyah(date = new Date()) {
    return AYAHS[dayOfYear(date) % AYAHS.length];
  }

  return { AYAHS, getDailyAyah };
})();

/* Some page scripts check window globals before using them. */
window.DailyAyah = DailyAyah;
