# Mənbə reyestri və araşdırma qeydi

Yoxlama tarixi: 2026-10-05. Bu reyestr ilkin mənbəni avtomatik research xülasəsindən ayırır. Tam məqalələr hesabatda köçürülməyib; qısa metod xülasələri, istinadlar və ayrıca öz kod müşahidələrimiz verilib.

## İstifadə edilən mənbələr

| ID | Birbaşa mənbə | Növ / tarix | Nə üçün istifadə edildi | Nəyi sübut etmir |
|---|---|---|---|---|
| S01 | [Peter Brandt: My focus is Bitcoin](https://www.peterlbrandt.com/my-focus-is-bitcoin/) | Müəllifin öz saytı; 19.09.2026 | Şərti ssenari və risk mərkəzli metod | Auditli şəxsi nəticə və bizim alqoritmin gəliri |
| S02 | [Brandt: Lessons from a difficult year of trading](https://www.peterlbrandt.com/lessons-from-a-difficult-year-of-trading/) | Müəllifin öz saytı; köhnə reflektiv yazı | Metod/icra fərqi; gecə stopu yanaşmasının botumuza avtomatik köçürülməməsi | Universal, dəyişməz risk qaydası |
| S03 | [CryptoCred: Building a Trading System](https://medium.com/@cryptocreddy/building-a-trading-system-where-to-start-e96381c28c2f) | Birinci əl tədris yazısı; 19.03.2019 | Setup, invalidasiya və idarə planı | Müəllifin müstəqil təsdiqlənmiş PnL-i |
| S04 | [CryptoCred: Position Size and Leverage](https://medium.com/@cryptocreddy/comprehensive-guide-to-position-size-and-leverage-2e27764ce9e0) | Birinci əl tədris yazısı; 07.07.2018 | Stop-risk-mövqe ölçüsü əlaqəsi | Hər leverage-in təhlükəsiz olması; stopda zəmanətli fill |
| S05 | [Arthur Hayes: All Aboard](https://cryptohayes.medium.com/all-aboard-4d50435190d6) | Müəllifin öz essesi; 01.04.2021 | Cash-and-carry və istiqamət ticarətinin fərqi | Bugünkü basis gəliri və ya risksiz arbitraj |
| S06 | [Wintermute: Algorithmic trading](https://www.wintermute.com/algorithmic-trading) | Şirkətin rəsmi metodu; tarixsiz | Delta-neutral, arbitraj, aşağı latency və institusional resurs fərqi | Konkret gizli strategiya, gəlir auditi |
| S07 | [Andrew Kang / Raoul Pal müsahibəsi](https://www.youtube.com/watch?v=2qsUh1sMDfs) | Birinci əl müsahibənin səhifəsi/metadatası | Uzunmüddətli sektor tezisi; 15m qayda çıxarmaq üçün kifayət etməməsi | Tam videonun audiovizual auditi və dəqiq giriş alqoritmi |
| S08 | [Liu və Tsyvinski: Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877) | İlkin akademik iş; avqust 2018 | Momentum/diqqət hipotezi | ADX=22 və RSI qaydasının 2026-da net üstünlüyü |
| S09 | [Bailey və həmmüəlliflər: Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) | Müəllifin yerləşdirdiyi tədqiqat PDF-i | Çoxsaylı sınaq və seçim qərəzi | Bu bot üçün hesablanmış PBO; burada belə hesab aparılmayıb |
| S10 | [TypeSafe: Confidence](https://docs.typesafe.ai/confidence) | Rəsmi texniki sənəd | Choice confidence formulu və Noul qeyri-müəyyənliyi | Trade-in gəlir ehtimalı |
| S11 | [TypeSafe: API](https://docs.typesafe.ai/api) | Rəsmi texniki sənəd | Cavab/model/probabilities uçotunun sxemi | Keçmiş loglarda itmiş cavabların bərpası |
| S12 | [Peter Brandt, Chat With Traders 329](https://chatwithtraders.com/episode/329-peter-brandt) | Birinci əl müsahibə | Risk mövzusunun əlavə yoxlanması | Auditli ticarət gəliri |
| S13 | [Wintermute-in SEC-ə məktubu](https://www.sec.gov/files/wintermute-response-sec-090325.pdf) | Şirkətin təqdim etdiyi ilkin sənəd; 03.09.2025 | Öz kapitalı ilə proprietary fəaliyyət təsviri | SEC tərəfindən strategiyanın təsdiqi və ya müstəqil PnL auditi |

S06 səhifəsinin birbaşa təkrar açılışı ölçü limiti verdi; məzmun rəsmi domenin web axtarış çıxarışından yoxlandı. S08 birbaşa təkrar açılışda 403 verdi; rəsmi NBER axtarış nəticəsi abstraktı və working-paper metadata-sını göstərdi. Bu hallar digər mənbənin həmin təşkilatın yerinə keçirilməsi ilə örtülmədi.

## Alət nəticələri

- **Tavily pro research:** tamamlandı. Request ID `5b0f540a-ee03-46f8-8854-e2087d857158`; [tam JSON](sources/tavily-research.json). Sintez və mənbə siyahısı oxundu. Tövsiyələr ilkin mənbələr və repo müşahidələri ilə yenidən süzüldü.
- **Tavily əlavə DonAlt axtarışı:** tamamlandı; [JSON](sources/tavily-donalt-search.json). TechnicalRoundup podcast səhifəsi və ikinci əl xəbərlər çıxdı; tam mexaniki qayda sübutu alınmadı.
- **Composio / Firecrawl SCRAPE:** CryptoCred sistem yazısı çıxarıldı; [JSON](sources/firecrawl-cryptocred-system.json).
- **Composio / Firecrawl SEARCH — Kang:** uğurlu; log `log_zT7P3M3HFaT-`. Böyük cavabın göstərdiyi müvəqqəti fayl ayrıca oxundu və [tam payload](sources/firecrawl-kang-results.json) kimi saxlandı; tək pointer envelope ilə kifayətlənilmədi.
- **Composio / Firecrawl SEARCH — DonAlt:** texniki uğurlu, nəticə siyahısı boş; log `log_nGtJuJzvKmQD`; [JSON](sources/firecrawl-search-donalt.json).
- **Daxili web search/open:** müəlliflərin öz səhifələri, rəsmi TypeSafe sənədləri və ilkin akademik mənbələr birbaşa yoxlandı.
- **Lokal repo:** `fe284d3` və ayrıca izlənməyən simulyasiya skripti oxundu. Canlı hesab, açarlar və şəxsi qərar məlumatları public research sorğularına göndərilmədi.

## Avtomatik research-dən qəbul edilməyən iddialar

Tavily nəticəsində faydalı mənbələrlə yanaşı keyfiyyəti yetərsiz əlaqələr də var. Bunlar hesabatda sübut kimi istifadə edilmədi:

1. GCR üçün üçüncü şəxsin Scribd yükləməsindən “dəqiq GCR strategiyası” çıxarılması — müəlliflik və tam metod təsdiqlənmir.
2. Andrew Kang haqqında Binance Square-də başqa müəllifin paylaşımının birinci əl şəxsi qazanc sübutu sayılması — platformanın adı ilkin müəlliflik demək deyil.
3. Wintermute-in SEC-ə məktubunun müstəqil gəlir auditi kimi şərhi — bu şirkətin öz təqdimatıdır.
4. Wintermute quoting barədə üçüncü tərəf GitHub analizindən daxili alqoritmin dəqiq müəyyən edilməsi — rəsmi metodun təsdiqi deyil.
5. SEO/marketinq bloqlarındakı konkret walk-forward pəncərələrinin universal qaydaya çevrilməsi — qəbul edilmədi; qiymətləndirmə qaydaları ayrıca tədqiqat dizaynı kimi verildi.
6. Forum iddiaları, milyard dollarlıq sərvət başlıqları və mənbəsiz performans reytinqləri — şəxsi reputasiya və gəlir barədə nəticə çıxarılmadı.

DonAlt/GCR haqqında yetərli sübut alınmaması onların uğursuz olması demək deyil. Sadəcə bu araşdırmanın onlara konkret qayda və performans aid etmək üçün yetərli əsası yoxdur.
