# Peşəkar kripto ticarət metodları və KriptoFani üzrə müqayisəli audit

Tarix: 2026-10-05. Yoxlanmış lokal commit: `fe284d3e56a3f7e467d7af3c59ac9f870aaa2a37`.

## 1. Əsas qərar

**Sistemə daha çox indikator əlavə etməkdən əvvəl onun qərarlarını və hipotetik nəticələrini düzgün ölçmək lazımdır.** Cari kodda faydalı risk məhdudiyyətləri var. Lakin yeni shadow mexanizmi və “exact system” adlanan ayrıca simulyasiya hələ canlı strategiyanın etibarlı ölçüsü deyil. Bunların nəticəsinə əsasən confidence, stop və leverage dəyişmək kapital üçün yanlış qərara səbəb ola bilər.

Bizim şəraitə ən uyğun tədqiqat istiqaməti: az sayda likvid alət, əvvəlcədən müəyyən edilmiş trend/pullback və ya breakout-retest qaydası, strukturla əsaslandırılmış stop, stopa və xərclərə görə ölçülən mövqe, ümumi portfel riski və ayrıca qiymətləndirilən AI filtri. Bu, gəlirliliyi təsdiqlənmiş yeni strategiya deyil; yoxlanmalı layihə təklifidir.

Bu işdə mənbə araşdırması və kod təhlili aparılıb. Strategiya kodu, canlı ayarlar və VPS dəyişdirilməyib. Cari lokal versiyanın VPS-də eyni olduğu və yeni dəyişikliklərin bütün qəbul testlərindən keçdiyi bu hesabatda təsdiqlənmir.

## 2. Araşdırmanın sübut sərhədi

“Ən uğurlu treyder” üçün müqayisə edilə bilən, depozit/çıxarışlarla düzəldilmiş, bütün hesabları əhatə edən müstəqil auditli gəlirlilik cədvəli tapılmadı. Şirkət qurmaqdan yaranan sərvət, bir uğurlu mövqe, müsabiqə nəticəsi və uzunmüddətli ticarət üstünlüyü eyni ölçü deyil. Yalnız qalibləri seçmək survivorship bias yaradır.

Ona görə adları gəlirlilik reytinqi kimi deyil, metodların mənbəsi kimi qiymətləndirirəm:

| Şəxs / təşkilat | Təsdiqlənən metod və mənbə | Bizə tətbiqi | Sübutun sərhədi |
|---|---|---|---|
| **Peter Brandt** | Qrafikdə şərti ssenari, əvvəlcədən müəyyən risk, çəkilməyə diqqət. [Öz yazısı, 19.09.2026](https://www.peterlbrandt.com/my-focus-is-bitcoin/) | Girişin hansı şərtdə etibarsız olduğunu rəqəmlə göstərmək; proqnoza görə risk artırmamaq | Şəxsi metod izahıdır; bizim 15 dəqiqəlik alqoritm üçün gəlirlilik sübutu deyil |
| **CryptoCred** | Giriş, struktur, invalidasiya və mövqe idarəsini əvvəlcədən ayıran ticarət planı. [Öz yazısı, 19.03.2019](https://medium.com/@cryptocreddy/building-a-trading-system-where-to-start-e96381c28c2f) | Hər siqnal üçün yoxlanıla bilən setup ID və qayda; sonradan izah uydurmamaq | Tədris materialıdır; müstəqil təsdiqlənmiş şəxsi PnL deyil |
| **CryptoCred — risk** | Mövqe ölçüsünü stop məsafəsi və risk büdcəsi ilə hesablamaq; leverage-i ayrıca nəzərdən keçirmək. [Öz yazısı, 07.07.2018](https://medium.com/@cryptocreddy/comprehensive-guide-to-position-size-and-leverage-2e27764ce9e0) | Bizdə əsas prinsip mövcuddur; saxlamaq və icra xərcləri ilə yoxlamaq | Yazıdakı risk faizlərini bizim hesaba avtomatik köçürmək olmaz |
| **Arthur Hayes** | Spot və futures arasındakı basis-dən cash-and-carry gəliri; istiqamət ticarətindən fərqli mexanizm. [All Aboard, 01.04.2021](https://cryptohayes.medium.com/all-aboard-4d50435190d6) | Funding/basis-i ölçmə kontekstinə əlavə etmək mümkündür | 100 USDT-lik bot üçün hazır carry strategiyası tövsiyəsi deyil; margin, qarşı tərəf və icra riski qalır |
| **Wintermute** | Delta-neutral arbitraj, likvidlik təminatı, statistik modellər və aşağı gecikməli infrastruktur. [Rəsmi metod təsviri](https://www.wintermute.com/algorithmic-trading) | Xərci, likvidliyi, inventarı və portfel ekspozisiyasını vahid sistemdə ölçmək | İnstitusional imkanların təsviridir; açıq mənbəli siqnal və ya auditli strategiya gəliri verilmir |
| **Andrew Kang** | Araşdırmada əldə edilən birinci əl müsahibə kapitalın uzunmüddətli sektor tezislərinə yönəldilməsinə aiddir. [Raoul Pal ilə müsahibə](https://www.youtube.com/watch?v=2qsUh1sMDfs) | Yalnız ayrıca uzunmüddətli tədqiqat üslubu kimi | Buradan bizim üçün konkret 15m giriş/stop alqoritmi çıxarmaq əsaslı deyil |
| **DonAlt** | TechnicalRoundup və şərhlərinə istinadlar tapıldı, lakin bu araşdırmada təkrarlana bilən tam qayda dəsti üçün yetərli birinci əl material alınmadı | Konkret parametrləri ona aid edərək tətbiq etməmək | Firecrawl-un hədəf axtarışı boş nəticə verdi; xəbər saytlarının “dəqiq proqnoz” başlıqları sübut sayılmadı |
| **GCR** | Axtarış nəticələrində qazanc hekayələri və ikinci əl metod xülasələri üstünlük təşkil etdi | “Kontrarian ol”, “whale-i kopyala” kimi qeyri-müəyyən qaydaları canlıya daşımamaq | Tam risk, zərər, kapital axını və bütün mövqelər olmadan üstünlük ölçülmür; konkret gəlir iddiaları qəbul edilmədi |

**Metodları mexaniki birləşdirmək olmaz.** Trend davamı ilə diapazon daxilində əks istiqamətli girişin şərtləri fərqlidir. Eyni anda hər ikisini təsdiqləyən indikatorlar tələb etmək real üstünlük yaratmadan bütün girişləri bağlaya bilər.

Mənbələrdə razılaşmayan tövsiyələr də var: Brandtın çətin ticarət ili barədə yazısında gecə stoplarının istifadəsinə dair diskresion yanaşma təsvir edilir. Nəzarətsiz işləyən leveraged kripto botunda bunu tətbiq etməyi tövsiyə etmirəm; birjada qoruyucu stop saxlanmalıdır. [Brandt: Lessons from a difficult year](https://www.peterlbrandt.com/lessons-from-a-difficult-year-of-trading/)

## 3. Biz nə edirik, nəyi dəyişməliyik?

Aşağıdakı qiymətlər kod müşahidəsinə və bizim arxitektura mühakiməmizə əsaslanır. “Saxla” həmin metodun qazanc gətirdiyinin təsdiqi deyil.

| Metod | Cari vəziyyət | Qərar | Risk / konkret addım |
|---|---|---|---|
| Stopa görə mövqe ölçüsü | `sizePosition`: stop məsafəsi + fee/slippage; risk və allocation limitlərindən kiçiyi | **Saxla** | Yuvarlaqlaşdırılmış son qty ilə risk/margin/minimumları yenidən yoxlamaq |
| Qapalı şam və böyük zaman çərçivəsi | 15m giriş məlumatı, 4h SMA20/SMA50 istiqaməti | **Saxla, ayrıca ölç** | Trend proxy-si özü müsbət expectancy sübutu deyil |
| ADX ilə rejim | 22/35 hədləri və rejimə görə RSI filtri əlavə olunub | **Düzəlt və test et** | Məlumat çatışmazlığı RANGING kimi yazılır; hədlərin kalibrasiyası yoxdur |
| Konkret giriş setup-u | AI-yə şərhlər və ardınca istiqamət/RSI məhdudiyyətləri | **Əlavə et** | Pullback/retest-in ölçülən tərifi, invalidasiya və son istifadə vaxtı lazımdır |
| Struktur stop | Funksiya S/R qəbul edir, canlı çağırış səviyyə ötürmür | **Düzəlt** | Cari yol əsasən ATR stopudur; “struktur” adı nəticəni şişirdir |
| Qismən TP / breakeven / trailing | Canlı sistemdə mərhələli çıxış var | **Hələ saxla, ablation apar** | Hansı çıxışın üstün olduğu ayrıca müqayisə olunmayıb |
| Birjada qoruyucu stop | İcra kodunda native stop mexanizmi var | **Saxla** | Yerli trailing və AI birja stopunu əvəz etməməlidir |
| Gündəlik zərər / drawdown limiti | 2% / 5% yeni giriş dondurması | **Saxla** | Bunlar zərərin zəmanətli maksimumu deyil; gap və icra gecikməsi aşma yarada bilər |
| Birgə portfel riski | Gross və rezerv risk limitləri var | **Genişləndir** | Korrelyasiyalı altcoin LONG-lar müstəqil risk deyil; stress və eyni faktor qrupu limiti |
| AI confidence | 75 həddi, `noul > .45` risk baryeri | **Semantikanı və uçotu düzəlt** | Gəlir ehtimalı kimi təqdim etməmək; həddi yalnız OOS sübutla dəyişmək |
| Giriş etmədiyimiz qərarların ölçülməsi | Əvvəlki offline replay + yeni sadə shadow | **Yeni shadow-u düzəlt** | Vaxt, qismən çıxış, xərc və seçim qərəzi problemləri var |
| HFT, market-making, kompleks carry | Yoxdur | **İndi əlavə etmə** | Kapital, fee tier, infra və inventar tələbləri başqa məhsuldur |
| Whale / məşhur treyder kopyalama | Audit edilən siqnal yolunda yoxdur | **Əlavə etmə** | Açıq görünən bir mövqe gizli hedge və digər hesabları göstərmir |

Kod sübutları: [trading-service.ts](../../src/lib/trading-service.ts), [trading-math.ts](../../src/lib/trading-math.ts), [quant-math.ts](../../src/lib/quant-math.ts), [risk-policy.ts](../../src/lib/risk-policy.ts), [execution.ts](../../src/lib/execution.ts).

## 4. Ən vacib tapıntılar və düzəliş qaydaları

### F01 — Kritik: “raw AI” filtrdən sonrakı nəticədir

`src/lib/trading-service.ts:133–142`: Jev `isHighRisk=true` qaytardıqda `action/confidence` ilkin WAIT/0 vəziyyətində qalır. `rawAction/rawConfidence` bundan sonra kopyalanır. Beləliklə, model LONG/80 demiş olsa belə risk baryerinin blokladığı siqnal WAIT/0 kimi saxlanır. `candidateSide` də buradan götürüldüyü üçün həmin namizəd shadow-a düşməyə bilər.

**Təsir:** “AI fürsəti görmədi” ilə “risk filtri imkan vermədi” qarışır. Filtrin qarşısını aldığı gəlir və zərər düzgün ölçülmür. Bu, müşahidə edilən kod qüsurudur; bütün əvvəlki WAIT-lərin belə yarandığı iddiası deyil.

**Düzəliş:** cavabı hər hansı filtrdən əvvəl saxla; model qərarı, risk ehtimalı, tətbiq edilmiş filtrlər və yekun qərar ayrı sahələr olsun. `response.model`, prompt/config/code hash, bütün choice probabilities, raw confidence, raw noul və tam zaman məlumatı saxlanmalıdır. Model alias-ını dəyişməz versiya saymaq olmaz. API cavabında faktiki model sahəsi mövcuddur. [TypeSafe API](https://docs.typesafe.ai/api)

Qəbul testi: LONG/80 + risk=.60 daxil olduqda raw LONG/80/risk=.60, final WAIT və `RISK_GATE` səbəbi ayrıca qalmalıdır.

### F02 — Kritik: shadow şam vaxtını düzgün izləmir

`src/lib/trading-service.ts:204–298`: bütün istifadəçilərin açıq shadow-ları bazar üzrə seçilir; son beş şam alınsa da yalnız sonuncu emal olunur. `bars_held` hər çağırışda artır. Son emal edilmiş şam ID-si, girişdən sonrakı ilk uyğun şam şərti və hesab üzrə emal sahibliyi görünmür.

**Təsir:** eyni şam təkrar işlənə, girişdən əvvəl baş vermiş high/low çıxış yarada, fasilə zamanı aradakı stop buraxıla bilər. İki hesabın ardıcıl analiz çağırışı bir mövqenin vaxtını iki dəfə artıra bilər. `max_bars=16` futures üçün nəzərdə tutulan 4 saat əvəzinə çağırış sayına bağlıdır; spot 1h üçün 16 şam 16 saatdır.

**Düzəliş:** `last_processed_close_time`, `entry_available_at`, `horizon_end` saxla; bütün çatışmayan şamları vaxt sırası ilə emal et; `(shadow_id, candle_close_time)` unikal olsun. Emal və cursor yenilənməsi atomik olmalı, tenant və worker sahibliyi aydın qurulmalıdır.

Qəbul testləri: eyni şamı iki dəfə çağırmaq nəticəni dəyişməməli; iki hesab və paralel worker dublikat yaratmamalı; 45 dəqiqə fasilədən sonra aradakı stop itirilməməlidir.

### F03 — Kritik: shadow PnL canlı strategiyanın PnL-i deyil

`src/lib/trading-service.ts:254–284`: shadow TP1/2/3-dən biri vurulanda bütöv mövqeni bağlayır; eyni şamda bir neçəsi keçilərsə ən uzaq TP prioritetlidir. Canlı çıxış isə 50%/25%/25% mərhələlidir. Shadow qiymət faizindən sabit `0.1` çıxır; real qty, lot, funding, slippage, marja və portfel məhdudiyyətlərini hesablamır. Giriş son qapalı şamın qiymətidir; qərardan sonra əldə edilən qiymət deyil.

**Təsir:** gəlir, zərər, saxlama müddəti və imkan verilən əməliyyatlar fərqli olur. Nəticəni dollar qazancı və ya canlı sistemin dəqiq alternativi kimi təqdim etmək olmaz. `EXECUTING_LIVE` etiketi də preflight/icra təsdiqindən əvvəl qoyulur.

**Düzəliş:** giriş/çıxış və risk hesablamaları replay ilə ortaq deterministik moduldan gəlsin. Siqnal nəticəsi, birjada icra edilə bilən hipotetik nəticə və portfel nəticəsi ayrı göstərilsin. Faktiki fill təsdiqlənməyənədək status `LIVE_CANDIDATE` olsun. Mark-price trigger və contract fill qiyməti fərqləndirilsin; eyni şamda sıra bilinmirsə qeyri-müəyyənlik etiketi və konservativ ssenari verilsin.

Qəbul testi: TP1-dən sonra stop olan fixture-də canlı idarə qaydası ilə replay eyni qty, fee, qalıq və PnL verməlidir.

### F04 — Kritik: “exact system” simulyasiyası AI-ni təxmin edir və gələcək qiymətdən istifadə edir

İzlənməyən lokal `scripts/simulate-current-exact-system.ts` faylı ayrıca nəzərdən keçirildi; onun production-da işlədiyi iddia edilmir.

- Sətir 117-dən sonrakı blok özünü dəqiq qərar məntiqi adlandırır. Lakin 131–165 hissəsində AI qərarı ADX/RSI/şam qaydaları və 76/71/66/68 kimi təyin edilmiş confidence-lərlə əvəz olunur. Bu, Jev-in tarixi qərarı deyil.
- Sətir 211-dən etibarən cari şamın high/low-u ilə əvvəlki mövqelər idarə olunur və balans dəyişir. Sətir 301-də cari şamın close-u ilə equity hesablanır. Sətir 334-də isə yeni giriş həmin şamın open qiymətində göstərilir. Yəni giriş ölçüsünə və boşalan kapitala həmin girişdən sonra məlum olan məlumat daxil olur.

**Düzəliş:** skripti `heuristic-proxy` kimi etiketlə; nəticələrini Jev performansından ayır. Hadisə ardıcıllığı `decision available → entry → sonrakı qiymət hadisələri → exit` olmalıdır. Sonrakı close-u dəyişmək əvvəlki entry qty-ni dəyişməməlidir. Tarixi AI cavabı yoxdursa bunu bərpa edilmiş fakt kimi uydurmaq olmaz; indiki modelə köhnə şamları vermək ayrıca retrospektiv model sınağıdır və modelin gələcək dövrlərlə öyrədilməsi ehtimalı da qalır.

### F05 — Orta: confidence və yüksək risk etiketləri yanlış şərh edilə bilər

TypeSafe-in rəsmi sənədində Choice üçün:

`c = (p_max − 1/n) / (1 − 1/n)`

LONG/SHORT/WAIT üçün `n=3`; `c=.75` seçilmiş cavabın təxminən `.8333` ehtimalına uyğun gəlir. Bu, əməliyyatın gəlirli bitmə ehtimalı deyil. Noul-da `.5` qeyri-müəyyənliyi göstərir. [Rəsmi confidence sənədi](https://docs.typesafe.ai/confidence)

`src/lib/typesafe.ts:95` sətrində `noul > .45` bloklayır. Bu konservativ seçim ola bilər, amma qeyri-müəyyən halı da `isHighRisk=true` kimi təqdim edir. Cari məlumatdan bunun yaxşı və ya pis filtr olduğunu hesablamaq mümkün deyil.

**Düzəliş:** raw risk ehtimalını saxla; “risk siqnalı” ilə “qeyri-müəyyənlik səbəbindən blok”u ayır. Confidence aralıqlarında əhatə, net expectancy, tail loss və bloklanmış alternativlərin nəticəsini ölç. Faktiki qazanc ehtimalı üçün ayrıca, müəyyən exit/horizon üzrə OOS kalibrasiya lazımdır; confidence-i birbaşa Brier score-a qazanc ehtimalı kimi vermək olmaz. 75 həddini sadəcə giriş açılsın deyə azaltma.

### F06 — Orta: struktur stop adı faktiki stopa uyğun deyil

`src/lib/trading-service.ts:350` `computeQuantPlan`-a support/resistance ötürmür. `src/lib/quant-math.ts:49` funksiyasının standart səviyyələri boşdur. Praktik yol ATR(14) × 1.5, minimum 0.5%, maksimum 2% çərçivəsidir.

**Düzəliş:** ya bunu açıq şəkildə ATR stopu adlandırıb test et, ya keçmişdən məlum struktur səviyyələrini ötür. Təsdiqlənmiş swing üçün sağ tərəf şamları tələb edilirsə səviyyə yalnız həmin şamlar bağlanandan sonra məlum sayılmalıdır. Setup üçün lazımi stop 2%-dən uzaqdırsa, sırf order açılsın deyə stopu strukturun içinə çəkmə; namizədi rədd et və ya ayrı risk qaydasını əvvəlcədən test et.

### F07 — Orta: rejim təsnifatı məlumat xətasını bazar rejiminə çevirir

`src/lib/quant-math.ts:153–180`: məlumat çatışmazlığı və qeyri-finit ADX zamanı `RANGING/15` qaytarılır. Bu, ölçülmüş diapazon rejimi deyil. ADX 22/35 hədləri və RSI keçidləri hazırda test ediləcək fərziyyələrdir.

**Düzəliş:** `UNKNOWN` rejimi və səbəb qaytar; yeni girişə icazə vermə. Rejim dəyişmələri üçün yalnız keçmiş məlumatla təsdiqləmə/histerezis variantını test et. Trend gücünü istiqamətlə qarışdırma; PDI/MDI ilə 4h trend arasında ziddiyyət üçün açıq siyasət müəyyən et.

### F08 — Orta: həcm üzrə seçilmiş çox koin diversifikasiya demək deyil

`src/lib/trading-service.ts` hədəf seçimi USDT adı, 24h həcm və qiymət dəyişikliyindən istifadə edir. Bu seçim hesabın minimum orderi ödəyə bildiyini, cari spread/depth-i və aktiv sinfini özü təsdiqləmir. Eyni istiqamətli altcoin mövqeləri ümumi BTC şokuna məruz qala bilər.

**Düzəliş:** əvvəlcə kontrakt statusu/tipi, hesabın giriş imkanı, lot/minNotional, stop-riskə uyğun minimal qty, canlı spread/depth və data tamlığı yoxlansın. Sonra siqnal sıralansın. XAU/SOXL kimi simvolların underlyings-i rəsmi metadata ilə təsnif edilmədən hamısı eyni “kripto” modelinə salınmasın. Tarixi testdə bugünkü qalibləri bütün keçmişə tətbiq etmə; delist və universe dəyişikliklərini nəzərə al.

### F09 — Orta: versiya və müqayisə uçotu zəifdir

Rejim və prompt dəyişsə də snapshot `risk-v2:${provider}` yazır. Ayrı-ayrı aylıq/sniper/new-system skriptləri mövcuddur; onların olması təkbaşına overfitting sübutu deyil, lakin neçə parametr və variant sınandığını bilmədən ən yaxşı nəticəni seçmək etibarsızdır.

**Düzəliş:** bütün sınaqlar üçün dəyişməz manifest: kod/prompt/model/config versiyası, data hash, universe, xərc fərziyyələri, train/validation/test aralıqları, sınanmış variantların sayı. Seçilməyən və zərərli nəticələr də registrdə qalsın. Təkrar sınaqların backtest üstünlüyünü şişirtməsi akademik ədəbiyyatda ayrıca göstərilir. [Bailey və həmmüəlliflər: Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)

## 5. Hansı yeni strategiyanı ilk yoxlayaq?

**Təklif: yalnız bir strukturlaşdırılmış trend-continuation namizədi ilə başlamaq.** Bu, treyderlərin qaydalarının dəqiq kopyası deyil; bizim bot üçün mühəndislik hipotezidir.

1. Likvid və faktiki icra edilə bilən universe seçilir.
2. Son bağlanmış 4h məlumatla trend istiqaməti müəyyən edilir.
3. 15m-də əvvəlcədən məlum səviyyənin qırılması və ya trend daxilində pullback üçün tək, dəqiq qayda seçilir. “Gözəl qırılma” kimi subyektiv söz kifayət deyil.
4. Retest/təsdiq gələcəkdə tamamlanırsa giriş də həmin təsdiqdən sonra olur; qırılma şamının əvvəlinə geri yazılmır.
5. Stop setup-u etibarsız edən məlum səviyyəyə əsaslanır; spread və volatilite nəzərə alınır. Mövqe ölçüsü sonra hesablanır.
6. Eyni girişlərdə üç siyasət müqayisə edilir: mexaniki qayda; mexaniki qayda + mövcud AI; yalnız mövcud AI siyasəti. Risk və icra modeli hamısında eyni olur.
7. Range strategiyası ayrıca ID və portfel büdcəsi ilə sonrakı tədqiqatdır. Trend botunun boşluğunu doldurmaq üçün dərhal əlavə olunmur.

Momentum və investor diqqəti kriptoda tədqiq edilmişdir, lakin 2018-ci il araşdırmasının nəticəsi bizim 15m ADX/RSI kombinasiyasının 2026-da xərclərdən sonra işlədiyini göstərmir. Akademik nəticə istiqamət seçməyə kömək edir; konkret alqoritmi təsdiqləmir. [Liu və Tsyvinski, NBER 24877](https://www.nber.org/papers/w24877)

Funding, open interest, nisbi güc və həcm əlavə namizəd xüsusiyyətlərdir. Hamısını birdən giriş baryerinə çevirmək əvəzinə bir-bir OOS faydası ölçülməlidir. Ekstremal funding özü avtomatik SHORT siqnalı deyil. Tarixi məlumatın yayımlanma vaxtı yoxdursa həmin xüsusiyyətlə səbəb-nəticə backtest-i aparılmamalıdır.

## 6. Riyazi qəbul meyarı

### Net üstünlük

Öz ölçmə çərçivəmizdə, sabit orta gross qazanc `W`, gross zərər `L`, əməliyyat başına orta xərc `C` üçün:

`E_net = p × W − (1 − p) × L − C`

`p_break_even = (L + C) / (W + L)`

İzahlı fərziyyə: stop qiymətdən 0.5% uzaqdır; hər tərəfə fee 0.05% və slippage 0.05% götürülür. Təqribi round-trip xərc 0.20% = 0.4R edir. Bütün mövqenin 2R-də çıxması modelində net qələbə 1.6R, net məğlubiyyət −1.4R, break-even win rate təxminən 46.7%-dir. Xərcsiz 33.3% hesabı aldadıcı olardı. Bu rəqəmlər cari faktiki fee/spread ölçüsü və ya canlı qismən TP strategiyasının dəqiq hesabı deyil; funding və gap ayrıca əlavə olunur.

### Ölçü və icra imkanı

USDT-margined xətti kontrakt üçün ümumi sxem:

`q_risk = equity × risk_fraction / (|entry − stop| + estimated_cost_per_unit)`

`q = floor_to_step(min(q_risk, q_margin, q_liquidity, q_portfolio))`

`q < minQty` və ya `q × entry < minNotional` olarsa **SKIP**. Minimumu keçmək üçün risk büdcəsini gizli aşmaq olmaz. Gap riski sabit xərc rezervinə tam sığmır; ayrıca stress hesabı lazımdır.

### Birgə risk

Ən sadə başlanğıc: eyni faktor/istiqamət qrupuna düşən mövqelərin nominal stop risklərini cəmləmək və əlavə stress itkisi limiti qoymaq. Statistik qat kimi `portfolio_variance = wᵀΣw` faydalıdır, amma kripto şokunda tarixi korrelyasiya və normal paylanma fərziyyələri zəifləyə bilər. Ona görə kovariasiya modeli sərt gross/rezerv limitlərini əvəz etməməlidir.

## 7. Əvvəlki real-data replay nə deyir?

Repo daxilindəki [392 qərarlıq əvvəlki hesabat](../counterfactual-2026-10-05/report.md) bu işdə yenidən oxundu. 18.5 saatlıq kəsikdə:

| Standartlaşdırılmış siyasət | 100 USDT-dən son balans |
|---|---:|
| Qeydə alınmış qərarlar, confidence ≥75 | 100.0000 |
| AI-siz 4h trend | 98.7215 |
| AI-siz trend + əvvəlki RSI filtri | 99.5294 |

Əsas xərc fərziyyəsi hər tərəfə 0.05% fee və 0.05% slippage-dir. Trend+RSI sıfır slippage-də +0.0649 USDT, əsas slippage-də −0.4706 USDT verir. Bu, xərclərin ölçülməsinin vacibliyini göstərir.

**Bu rəqəmlər yeni ADX/shadow versiyasının nəticəsi deyil.** Hesabat standartlaşdırılmış ayarlara, qısa və korrelyasiyalı nümunəyə əsaslanır. “Heç giriş olmadı, deməli bot mükəmməldir” və “bir buraxılmış trade qazandırardı, deməli filtri söndürək” nəticələrinin heç biri çıxmır. Əvvəlki artefakt oxunub; bu araşdırmada replay yenidən işə salınmayıb.

## 8. Etibarlı qiymətləndirmə ardıcıllığı

### P0 — Strategiya ayarını dəyişməzdən əvvəl

- F01–F04: raw qərar, zaman ardıcıllığı, shadow/live çıxış uyğunluğu və proxy simulyasiya etiketlərini düzəltmək.
- Versiyalı snapshot və bütün filtr səbəblərini yazmaq; heç trade açılmasa da məlumat tam qalmalıdır.
- Vaxtı dəyişməz fixture-lərlə lookahead, dublikat şam, partial TP, gap, funding və iki hesab izolyasiyasını test etmək.

### P1 — Müqayisə edilən tədqiqat

- İndiki siyasəti baseline kimi dondurmaq; sadə mexaniki alternativi ayrıca qeydiyyata almaq.
- Bull, bear, range və şok dövrlərini əhatə edən məlumat seçmək. Tək uğurlu ay kifayət deyil; tarixi universe və kontrakt qaydaları məlum deyilsə məhdudiyyəti göstərmək.
- Xronoloji train/validation/test ayırmaq. Test hissəsində parametr seçməmək; ona baxdıqdan sonra yenidən seçilən strategiya üçün yeni toxunulmamış test tələb olunur.
- Sərhədi keçən outcome pəncərələrini təmizləmək; üst-üstə düşən 4h etiketlər üçün ən az həmin overlap-ı nəzərə almaq. Feature-lər hər qərar anında mövcud olmalıdır.
- Eyni şamı yüz qərarda müşahidə etməyi yüz müstəqil sınaq saymamaq. Etibar intervalını zaman blokları ilə bootstrap etmək; az məlumatda nəticə “qeyri-müəyyən” qala bilər.

### P2 — Qəbul və əməliyyat uyğunluğu

| Ölçü | Tələb olunan hesabat |
|---|---|
| Üstünlük | Net expectancy, profit factor, drawdown, expected shortfall; bütün trade və xərc uçotu |
| Sabitlik | Hər rejim, simvol və zaman kəsiyi; gəlirin bir trade/gün/simvolda cəmlənməsi |
| Xərc dözümlülüyü | Ölçülmüş spread/slippage əsas ssenarisi və əvvəlcədən seçilmiş daha pis ssenarilər |
| Seçim keyfiyyəti | Giriş əhatəsi, filter üzrə rədd sayları, qarşısı alınmış zərər və buraxılmış hipotetik gəlir |
| Portfel | Eyni vaxtlı risk, kapital rezervi, minimum lot və korrelyasiyalı şok |
| Etibarlılıq | Data gap, censored outcome, naməlum intrabar sıra və execution failure ayrıca |
| AI faydası | Eyni icra şərtlərində AI-li və AI-siz siyasətin əlavə net faydası |

OOS orta gəlirin müsbət görünməsi təkbaşına keçid şərti olmamalıdır: qeyri-müəyyənlik, tail loss, xərc həssaslığı və çoxsaylı sınaqlar nəzərə alınmalıdır. Yetərli müstəqil hadisə olmadan “100 trade keçdi” kimi mexaniki sertifikat verilmir. Sonrakı forward shadow canlı qiymət/latency ilə uyğunluğu ölçməlidir; paper və ya testnet nəticəsi də real fill-in tam əvəzi deyil.

## 9. Nəyi dayandırmaq, nəyi saxlamaq lazımdır?

**Dayandırılmalı yanaşmalar:** əməliyyat olmamasını avtomatik uğur saymaq; confidence-i gəlir ehtimalı adlandırmaq; AI təxminini orijinal qərar kimi göstərmək; natamam shadow nəticəsinə əsasən parametrləri yumşaltmaq; bir neçə saatlıq nəticədən sonra strategiyanı yenidən optimallaşdırmaq; mənbəsiz treyder qazanc hekayəsini alqoritm sübutu saymaq.

**Saxlanmalı mexanizmlər:** əvvəlcədən risk büdcəsi, birjada stop, qapalı şamlar, idempotent icra, hesab izolyasiyası, minimum order nəzarəti, günlük zərər/drawdown dondurması və xərclərlə mövqe ölçüsü. Bunların production qəbulunu ayrıca sübut etmək lazımdır.

**İlk tətbiq prioriteti:** etibarlı qərar jurnalı və ortaq replay/shadow hesablaması. **İlk strategiya tədqiqatı:** bir dəqiq strukturlaşdırılmış trend setup-u və AI filtrinin ona əlavə dəyərinin ölçülməsi. Nəticələrdən əvvəl yeni gəlir və ya hazırlıq faizi vermək əsaslı deyil.

## 10. Alətlər və təkrar yoxlama

Tavily CLI, Composio vasitəsilə Firecrawl SEARCH/SCRAPE və daxili web axtarış/açma vasitələri istifadə olundu. Firecrawl ilə CryptoCred-in tam ilkin yazısı çıxarıldı; Kang axtarış nəticələri ayrıca saxlandı. DonAlt üzrə hədəf Firecrawl axtarışı boş gəldi. Bu məhdudiyyət nəticə uydurmaqla doldurulmadı.

Tavily research request: `5b0f540a-ee03-46f8-8854-e2087d857158`. Xam alət cavabları [sources/](sources/) qovluğundadır; avtomatik research xülasəsi ilkin mənbələrin yerini tutmur. Mənbə reyestri və alət statusu [sources.md](sources.md) faylında verilir.

Yoxlama sərhədi: lokal kod oxunması, istinadların yoxlanması və hesabat artefaktları. Yeni strategiya backtest-i, cari versiyanın test-suite-i və canlı birja icrası bu araşdırma çərçivəsində aparılmayıb. Əvvəlki test sayları cari dəyişikliklərin qəbul nəticəsi kimi istifadə olunmur.
