# KriptoFani — texniki və maliyyə auditi

Tarix: 3 oktyabr 2026. Yoxlanılan commit: `00455a7`. Əhatə: spot/futures qərar mühərrikləri, riyaziyyat, Binance adapterləri, order və mövqe uçotu, API giriş nöqtələri, worker, autentifikasiya və multi-tenant üçün kritik saxlama/deployment sərhədləri.

## Audit hökmü və sübut sərhədi

**Mövcud versiya şəxsi hesabda nəzarətsiz real-kapital ticarətinə hazır deyil. 100+ istifadəçiyə təqdim etmək üçün də hazır deyil.** Səbəb yalnız strategiyanın gəlirinin sübut edilməməsi deyil: mövqe qorumasını silən, eyni çıxışı təkrarlayan, real orderi uçotdan kənarda saxlayan və PnL-ni şişirdən konkret kod yolları mövcuddur.

Davamlı qazanc vədi üçün sübut yoxdur. Repozitoriyada təkrarlana bilən backtest, out-of-sample nəticələr, xərclərdən sonra gəlir əyrisi, drawdown seriyası və statistik etibarlılıq hesabatı tapılmadı. Bu, strategiyanın mütləq zərərli olduğunu sübut etmir; qazanclılığın hazırda ölçülmədiyini göstərir. Mövcud dashboard həmin ölçmə üçün etibarlı əsas deyil.

Sübut səviyyələri:

- **Kod:** göstərilən fayl və sətirlərdə birbaşa müşahidə edilmiş davranış.
- **Təcrid testi:** orijinal TypeScript modulu transpile edilib, DB/Binance/AI/Telegram asılılıqları nəzarətli saxta cavablarla əvəz olunub. Testlər kodun davranışını yoxlayır; birjanın real gecikməsini və fill ehtimalını ölçmür.
- **Rəsmi mənbə:** Binance sənədləri audit vaxtı onlayn yoxlanılıb. API versiya və hesab uyğunluğu ayrıca inteqrasiya testinə tabedir.
- **Ssenari/hesablama:** açıq göstərilən fərziyyələr əsasında risk nümunəsi; faktiki gəlir və ya canlı insident deyil.

Canlı birja hesabına order göndərilməyib, production DB və məxfi açarların məzmunu oxunmayıb, server/deployment vəziyyəti yoxlanmayıb. İşlək kod dəyişdirilməyib. `tsc --noEmit --incremental false` uğurla keçdi. 12 təcrid testinin 12-si hədəflənmiş səhv davranışı təkrarladı; bu, sistemin təhlükəsizlik testindən keçməsi demək deyil. Test kodu sənədin sonunda verilir.

Risk dərəcələri: **Kritik** — real kapitalın qorunmasını, icra səlahiyyətini və ya maliyyə uçotunun etibarlılığını poza bilir; **Orta** — siqnal keyfiyyəti, xərclər və əməliyyat etibarlılığında ciddi boşluq; **Aşağı** — birbaşa kapital təsiri məhdud olan uyğunsuzluq. Dərəcə hadisənin artıq baş verdiyi iddiası deyil.

| ID | Dərəcə | Əsas tapıntı | Sübut |
|---|---|---|---|
| F01 | Kritik | Futures PnL-də leverage ikinci dəfə vurulur | Kod + T01 |
| F02 | Kritik | TP2-dən sonra birjadakı stop silinir, əvəzi qoyulmur | Kod + T02 |
| F03 | Kritik | Paralel monitor və DB xətası eyni hissəni təkrar sata bilir | Kod + T03/T04 |
| F04 | Kritik | Order fill-ləri və birjadakı mövqe DB ilə uzlaşdırılmır | Kod + T05/T07 |
| F05 | Kritik | Futures təcili bağlanış `reduceOnly` olmadan göndərilir | Kod + T09 |
| F06 | Kritik | Spot baza-aktiv komissiyası həm OCO-nu, həm çıxışı poza bilir | Kod + T12 |
| F07 | Kritik | Mövqe sayı limiti bir dövrənin içində aşılır; spotda tətbiq edilmir | Kod + T06 |
| F08 | Kritik | Margin rejimi xətası udulur; likvidasiya sərhədi yoxlanmır | Kod + T08 |
| F09 | Kritik | Qlobal equity/drawdown və portfel risk limiti yoxdur | Kod |
| F10 | Kritik | Cron/webhook sirləri yoxdursa giriş nəzarəti açıq qalır | Kod; deployment şərtindən asılı |

## 1. Maliyyə və qazanc mexanizminin realizmi

### 1.1. Qazanclılıq sübutu yoxdur; confidence qazanc ehtimalı deyil — Orta

**İstinad:** `src/lib/typesafe.ts:28–54,79–101`; `src/lib/futures-engine.ts:389–469,479–483`; `src/lib/quant-math.ts:46–49`; `package.json:7–13`.

TypeSafe cavabındakı confidence 100-ə vurularaq faiz kimi istifadə edilir. Gemini öz confidence rəqəmini yaradır. Heç biri üçün “bu siqnalın komissiyadan sonra müsbət nəticə ehtimalı” etiketləri ilə kalibrasiya yoxdur. `confidence >= 75` 75% qazanma ehtimalını ifadə etmir. Quant modulundakı “high-probability” şərhini təsdiqləyən empirik dəlil yoxdur.

TypeSafe işləməyəndə Gemini-yə keçid təkcə texniki provider dəyişikliyi deyil: stop, ölçü və qərar siyasəti dəyişir. `jev-latest` sabit model versiyası deyil; model/prompt/data snapshot-ları üzrə tam qərar jurnalı saxlanılmır. Qərarların bir qismi console loglarında olsa da, bu, reproduksiya olunan strategiya tarixçəsi yaratmır.

**Həll:** strategiyanı, modeli, prompt-u, məlumat snapshot-ını və risk siyasətini versiyalayın. Provider-ləri ayrı strategiya kimi qiymətləndirin; yoxlanmamış fallback olduqda yeni entry-ni saxlayın. Kalibrasiyada Brier score, reliability curve və confidence qrupları üzrə net nəticə ölçün. Eyni girişlər üçün AI-siz RSI/trend bazası ilə müqayisə edin; AI mürəkkəbliyinin əlavə dəyərini ayrıca ölçün.

**Qəbul meyarı:** müəyyən müddətdə əldə edilmiş real qərar arxivindən eyni order planı reproduksiya olunsun; out-of-sample net expectancy və onun etibar intervalı təqdim edilsin. Güvən faizi UI-da “qazanma ehtimalı” kimi göstərilməsin.

### 1.2. Bazar rejimləri üzrə davranış — Orta, qəfil enişdə Kritik nəticə mümkündür

**İstinad:** `src/lib/futures-engine.ts:53–133,273–321,395–420,488–585`; `src/lib/quant-math.ts:58–85,104–120`; `src/lib/engine.ts:151–158,264–280`.

| Rejim | Kodun faktiki yanaşması | Zəiflik | Konkret düzəliş |
|---|---|---|---|
| Trend | 4H SMA20/SMA50, RSI, MACD əsasında istiqamət və istisnalar | Divergensiya yalnız 10 nöqtənin ilk/son müqayisəsidir; real swing divergensiyası təsdiqlənmir. Güclü trendə qarşı erkən mövqe aça bilər | Swing-ləri təsdiq vaxtı ilə hesablayın; əks-trend siyasətini ayrıca test edin və ayrıca risk büdcəsi verin |
| Sideways | Neytral trend, RSI, volume, FVG pre-filter | `noFVGNearPrice` yalnız FVG siyahısının boşluğunu yoxlayır; qiymətə yaxınlıq və gap-in artıq doldurulması yoxlanmır | FVG yaşını, məsafəsini, doldurulmasını və spread/ATR rejimini hesaba qatın |
| Yüksək volatilite | ATR × 1.5, sonra SL maksimum 2%-ə sıxılır | ATR 8% tələb etsə belə 2% stop seçilə bilər; “struktur arxası stop” strukturun içinə düşür | Stop-u süni daraltmaq əvəzinə ölçünü azaldın və ya setup-u rədd edin; net xərc/risk nisbətini yenidən hesablayın |
| Black swan | Futures ilkin STOP_MARKET; spot OCO stop-limit; yerli monitor | Stop-market qiymət zəmanəti vermir; stop-limit gap zamanı dolmaya bilər; TP2-dən sonra server dayanması qorumasız mövqe saxlayır | Birja tərəfində davamlı qoruma, gap stress testi, leverage/likvidasiya buffer-i, yeni entry üçün circuit breaker |

“FVG”, “divergence” və ATR əlavə etmək özlüyündə gəlir mənbəyi deyil. Fərqli rejimlərdə nəticə ayrı ölçülməlidir. RSI/SMA/MACD eyni qiymət tarixindən törəyir; onları müstəqil təsdiqlər kimi saymaq yanlış əminlik yarada bilər.

### 1.3. F01 — Futures PnL riyaziyyatı səhvdir — Kritik

**İstinad:** `src/lib/futures-engine.ts:610–613,780–783,834–836,896–898,985–987`; `src/app/api/futures/dashboard/route.ts:39–43`.

Ölçü artıq `quantity = margin × leverage / price` ilə hesablanır. Sonra PnL hesabında `(exit - entry) × quantity × leverage` işlədilir. USDT ilə hesablanan xətti kontraktda baza-aktiv miqdarı artıq leverage təsirini daşıyır.

Düzgün gross hesab:

```text
s = +1 LONG, -1 SHORT
N = Q × P_entry                         # notional
M ≈ N / L                              # ilkin margin, sadələşdirilmiş
PnL_gross = s × Q_closed × (P_exit_fill - P_entry_fill)
PnL_net = PnL_gross - entry_fee_allocated - exit_fee - funding_paid
ROI_margin = PnL_net / margin_basis     # leverage burada dolayı təsir edir
```

**T01:** entry 100, exit 104, bağlanan miqdar 5, leverage 5 olduqda gross gəlir 20 USDT-dir. Kod 100 USDT yazdı. Həm mənfəətin, həm zərərin modulu leverage qədər şişir. Commission/funding düzəlişi də yoxdur.

**Həll:** bütün PnL yollarından artıq leverage vurmasını çıxarın; real fill qiyməti və miqdarı ilə hesablayın. Keçmiş nəticələri Binance trade/income tarixindən yenidən qurun. Köhnə `total_pnl` rəqəmini sadəcə leverage-ə bölmək kifayət deyil: yanlış fill, itmiş çıxış, fee/funding və təkrar yazı problemləri də var.

**Qəbul:** LONG/SHORT, qismən çıxış, müxtəlif fee asset-ləri və funding üçün ledger birja tarixçəsi ilə eyni nəticəni verməlidir. Fərq yalnız açıq müəyyən edilmiş yuvarlaqlaşdırma toleransında qalmalıdır.

### 1.4. Xərclər tam modelləşdirilmir — Orta

**İstinad:** `src/lib/engine.ts:291–308,324–328`; `src/lib/futures-engine.ts:592–613,834–840`; `src/lib/binance-futures.ts:280–288`.

Spotda 0.1%, futures-də 0.2% balans buffer-i var. Bunlar net PnL hesabı deyil. Hesab/simvol üzrə maker/taker tarifləri, çıxış komissiyası, funding, spread, order-book dərinliyi, market impact və gecikmə ilə qiymət dəyişməsi risk planına daxil edilmir. Market order istifadə olunduğuna görə maker tarifini əsas götürmək düzgün olmaz. 24 saatlıq 50 milyon USDT volume filtri həmin an order-book dərinliyinin zəmanəti deyil.

Təxmini bir round-trip üçün:

```text
c = f_entry + f_exit + spread_crossing + slippage_entry + slippage_exit
net_return ≈ gross_return - c - funding_return
E[net] = p × G - (1-p) × D - C
p_break_even = (D + C) / (G + D)
```

Burada G, D və C eyni vahiddə olmalıdır; spread-i slippage ölçüsünə artıq daxil etmisinizsə ikinci dəfə çıxmayın. Real fill qiymətlərindən hesablanan PnL-də slippage/spread artıq qiymətlərdə əks olunur; ayrıca xərc kimi yenidən çıxılmır.

**İllüstrativ nümunə, Binance tarif iddiası deyil:** stop 0.5%, target 1%, round-trip xərc 0.2% olsa, binary full-exit strategiyasında break-even win rate 33.3%-dən 46.7%-ə yüksəlir. 40% win rate gross +0.1%, net −0.1% verir. Qısa target-lərdə xərclər strategiyanı mənfiyə sala bilər.

**Həll:** account/symbol commission məlumatını və fill commission-larını saxlayın; funding cashflow-larını ayrıca yazın. Entry-dən əvvəl bid/ask, tələb edilən miqdar üçün depth VWAP, spread həddi, data age və maksimum slippage büdcəsi yoxlanılsın. Böyük order üçün ölçünü azaldın və ya təxirə salın; stop çıxışında sərt qiymət limiti ilə icrasız qalma riskini ayrıca qiymətləndirin.

### 1.5. “1:2 / 1:3 / 1:4” tam strategiyanın expectancy-si deyil — Orta

**İstinad:** `src/lib/futures-engine.ts:581–584,820–950`; `src/lib/quant-math.ts:83–85`.

Kod “minimum 1:2” yazsa da, `reward/risk >= 1.8` qəbul edir. TypeSafe planı 2R/3R/4R qurur, Gemini planının TP2/TP3 ardıcıllığı ayrıca təsdiqlənmir.

İdeal 50%/25%/25% fill-lərlə bütün target-lər vurularsa gross nəticə `0.5×2R + 0.25×3R + 0.25×4R = 2.75R` olur. TP1-dən sonra qalan hissə entry qiymətində bağlansa, gross nəticə +1R-dir. Qalan hissənin “breakeven” qiyməti komissiya və funding-dən sonra xalis sıfır demək deyil. Trailing çıxışları nəticəni daha da path-dependent edir. Yuxarıdakı binary win-rate düsturunu bu çoxmərhələli strategiyaya birbaşa tətbiq etmək olmaz.

**Həll:** “SL əvvəl”, “TP1 sonra BE”, “TP2 sonra trailing”, “TP3”, “gap/liquidation” yollarını ayrı ölçün. `E[R_net] = Σ p_j × R_j_net` hesablayın. Bir bar daxilində həm SL, həm TP toxunarsa xırda zamanlı data ilə ardıcıllığı tapın; bilinmirsə konservativ icra götürün.

### 1.6. Overfitting və lookahead sərhədi — Orta

**İstinad:** `src/lib/engine.ts:35–47,140–149`; `src/lib/futures-engine.ts:85–106,246–303`; `src/lib/binance-futures.ts:78–85,265–391`.

- Hər iki engine son klines elementini istifadə edir. Futures `closeTime` götürür, amma şamın bağlandığını süzmür; spot close vaxtını saxlamır. Tamamlanmamış şamda RSI, volume və FVG dəyişə bilər. Bu, canlıda repaint/intrabar qeyri-sabitliyidir; təkbaşına gələcək məlumat oxumaq demək deyil.
- Pivot i+1 və i+2 şamlarını tələb edir. Cari tam snapshot-da tarixi pivot hesablamaq avtomatik lookahead deyil. Backtest onu i şamında artıq məlum sayarsa iki şamlıq məlumat sızması yaranır.
- Bu gün seçilmiş top-volume coin-lərlə bütün keçmişi test etmək survivorship/selection bias yaradar. O anki listinq, volume, blacklist və mövcud simvol kainatı bərpa edilməlidir.
- RSI sərhədləri, 1.2× volume, 1.5× ATR, 0.3–2% SL və 1.5% trailing üçün optimallaşdırma tarixi və holdout yoxdur. Overfitting sübut olunmayıb; yüksək diskresion seçim azadlığı və sübut çatışmazlığı var.
- Tarixi AI replay-də sonrakı hadisələri bilən modeldən, hətta yalnız tarixi indikator prompt-u ilə istifadə edilməsi ayrıca nəzarət tələb edir. Ən etibarlı yoxlama irəliyə doğru toplanan dəyişməz qərar arxividir.

**Həll:** `closeTime < exchangeNow - safetyLag` filtri; intrabar strategiyası istənirsə məhz intrabar snapshot arxivi. Signal availability timestamp, növbəti icra edilə bilən qiymət, walk-forward train/validation/test, üst-üstə düşən mövqelər üçün purge/embargo və block-bootstrap tətbiq edin. Parametrlərin yaxın variantlarında nəticə sabitliyini yoxlayın; test dəstini seçim üçün təkrar istifadə etməyin.

## 2. Risk idarəetməsi və təhlükəsizlik zənciri

### 2.1. Risk faizi əslində margin/allocation faizidir — Kritik semantik boşluq

**İstinad:** `src/lib/engine.ts:291–308`; `src/lib/futures-engine.ts:592–613`; `src/app/api/futures/settings/route.ts:39–50`.

`max_risk_pct` stop-a qədər itirilə bilən kapital deyil. Spotda alış məbləği, futures-də margin məbləği kimi tətbiq edilir:

```text
M = available_USDT × configured_pct
N = M × leverage
Q = N / price
stop_loss_fraction_of_equity ≈ configured_pct × leverage × stop_distance_fraction
```

Bu formula yalnız available_USDT ≈ equity fərziyyəsindədir. Mövcud mövqelər olduqda free margin ilə equity eyni deyil.

**Misal:** 1,000 USDT, 2% parametr, 5× leverage, 1% stop → 20 USDT margin, 100 USDT notional, təxminən 1 USDT gross stop zərəri, yəni equity-nin 0.1%-i. 125× və 2% stop → nəzəri 50 USDT, yəni 5%; belə leverage-də likvidasiya stop-dan əvvəl də baş verə bilər. Deməli “2% maksimum risk” sabit limit deyil. Bu tapıntı ölçünü dərhal artırmaq tövsiyəsi deyil.

**Həll:** `risk_per_trade_pct`, `max_margin_allocation_pct`, `max_gross_notional` ayrı anlayışlar olsun:

```text
risk_budget = equity × risk_per_trade_pct
loss_per_unit = abs(entry_fill_est - stress_stop_fill_est)
                + entry_fee_per_unit + exit_fee_per_unit + funding_buffer_per_unit
Q_risk = risk_budget / loss_per_unit
Q_final = floor_to_step(min(Q_risk, Q_margin_cap, Q_liquidity_cap,
                           Q_symbol_cap, Q_portfolio_cap))
```

Riski yuvarlaqlaşdırmadan və fill-dən sonra yenidən hesablayın. Stress itki qiyməti stop trigger qiymətindən pis olmalıdır. Minimum notional-a çatmırsa orderi böyüdüb risk limitini pozmaq əvəzinə setup-u buraxın.

### 2.2. F09 — Max Drawdown üçün icra olunan limit yoxdur — Kritik

**İstinad:** `src/lib/db.ts:60–70,145–203`; hər iki engine-in entry yolları.

Equity high-water mark, gündəlik zərər limiti, ardıcıl itki dayandırıcısı, realized+unrealized portfel limiti və spot/futures arasında ümumi exposure hesabı yoxdur. Stop-loss tək mövqenin mexanizmidir; Max Drawdown limiti deyil. Korelyasiyalı BTC/ETH/altcoin LONG-ları risk baxımından müstəqil deyil.

```text
E_t = wallet_balance_t + unrealized_PnL_t     # eyni hesab üçün doğru birja sahələri ilə
H_t = max(H_(t-1), flow_adjusted_E_t)
DD_t = (H_t - flow_adjusted_E_t) / H_t
portfolio_stop_risk = Σ estimated_stress_loss_i
```

Depozit/withdrawal və spot-futures transferləri gəlir kimi sayılmamalıdır. Günlük PnL realized və mark-to-market dəyişməsini birlikdə əhatə etməlidir. Gap və birja kəsilməsi şəraitində “hard 5% drawdown zəmanəti” vermək olmaz; limit yalnız yeni riski dayandırıb planlı azalma başlada bilər.

**Həll:** per-account risk service, cashflow-adjusted equity seriyası, daily loss/DD və gross/net exposure hədləri, BTC-beta və korelyasiya qrupları üzrə limitlər. Hədd keçiləndə yeni entry-ni atomik bloklayın; qoruyucu order və mövcud mövqe idarəetməsi davam etsin. Risk azaltma siyasətinin özü audit olunan qayda olmalıdır.

**Qəbul:** eyni vaxtda beş korelyasiyalı siqnal risk büdcəsini paylaşsın; stop zərəri, funding, manual trade və transfer daxil ediləndə limit düzgün işləsin.

### 2.3. F07 — Açıq mövqe və kapital limiti atomik deyil — Kritik

**İstinad:** `src/lib/futures-engine.ts:211–241,681–696`; `src/lib/engine.ts:117–138,291–308`; `src/lib/db.ts:64–66`.

Futures `openPositions` siyahısını user dövrəsinin əvvəlində bir dəfə alır. Sonrakı INSERT-lər array-ə əlavə edilmir və maksimum limit symbol dövrəsində yenidən yoxlanmır. **T06:** limit 1, başlanğıcda 0 mövqe, iki təsdiqli simvol → iki entry. Default 3 limit və 7 coin siyahısı da eyni problemdən təsirlənir. Təkrar simvol siyahısı əlavə duplicate riskidir.

Spot `max_open_positions` saxlayır, amma engine onu oxuyub tətbiq etmir. Hər iki engine balansı bir dəfə alır və orderdən sonra yerli risk/margin rezervini yeniləmir. Birja kifayət etməyən margin-i rədd edə bilər, lakin istifadəçinin daha sərt portfel limitini qorumur.

**Həll:** account-level kilid + qısa DB tranzaksiyası daxilində slot və risk reservation. `OPENING`, `PARTIALLY_FILLED`, `OPEN`, `CLOSING`, `UNKNOWN` vəziyyətləri büdcə istifadə etsin. Hər yeni simvolda güncəl rezervlərə baxın; siyahını trim/uppercase/dedupe edin. Sadəcə array-ə `push` etmək paralel proses yarışını həll etmir.

**Qəbul:** 20 paralel trigger və restart zamanı limitdən çox reservation/order yaranmasın; `UNKNOWN` order həll edilmədən büdcəsi sərbəst buraxılmasın.

### 2.4. F02 — TP1/TP2 zamanı stop qoruması itir — Kritik

**İstinad:** `src/lib/futures-engine.ts:845–874,907–937`.

TP1-də bütün adi və algo orderlər silinir, sonra breakeven stop qoyulur. Yeni stop xətası yalnız loglanır; DB stop-u entry-yə çəkilmiş kimi yazır və istifadəçiyə uğur mesajı gedir. **T11** bunu təkrarladı.

TP2-də yenə bütün orderlər silinir, amma heç bir birja stop-u və ya native trailing əvəzi yaradılmır. Yalnız DB-də `trailing_active=1` yazılır. **T02:** market exit, cancel, cancelAlgo; stop çağırışı sıfırdır. Qalan mövqe 30 saniyəlik worker və onun bütün asılılıqlarına bağlı qalır.

**Həll:** ilkin ən pis-hal stop-u bütün lifecycle boyu saxlayın. Native trailing istifadə ediləcəksə yeni orderin qəbulunu və aktivliyini təsdiqləyin. Yalnız bu mövqeyə məxsus order ID-ləri ilə dəyişiklik edin. Birja eyni anda iki protective reduce-only orderə icazə vermədiyi halda “əvvəl yeni stop, sonra köhnəni sil” universal həll deyil: dəstəklənən amend/cancel-replace semantikası və təhlükəsiz fallback test edilməlidir. Qoruma təsdiqlənmirsə entry-ləri dondurun və faktiki qalıq üçün nəzarətli reduce-only çıxış tətbiq edin.

**Qəbul:** TP1, TP2 və hər retry/restart sərhədində `exchange_exposure > 0` olduqda təsdiqlənmiş qoruyucu order və ya aktiv emergency-close state olsun. Qəbul cavabı olmadan “SL çəkildi” mesajı verilməsin.

### 2.5. F08 — Margin və likvidasiya təhlükəsizliyi təsdiqlənmir — Kritik

**İstinad:** `src/lib/futures-engine.ts:625–631,683–689`; `src/lib/binance-futures.ts:110–129,133–174`; `src/app/api/futures/settings/route.ts:48–50`.

Adapter yalnız `-4046` (“artıq həmin rejim”) xətasını xüsusi qəbul edir. Engine isə qalan bütün margin dəyişmə xətalarını da udur və ticarətə davam edir. **T08:** margin switch rədd edildi, yenə entry açıldı və DB-yə `ISOLATED` yazıldı. Faktiki hesab CROSSED qala bilər.

1–125 leverage clamp-i simvolun faktiki leverage bracket-ini, notional pilləsini, maintenance margin-i və liquidation məsafəsini yoxlamır. `positionSide` göndərilmir; Hedge Mode dəstəyi tətbiq edilməyib. Binance Hedge Mode üçün `positionSide` tələb edir və həmin rejimdə `reduceOnly` məhdudiyyəti var. Stop adapterində `workingType` yoxdur; rəsmi default `CONTRACT_PRICE`-dır. [Binance Futures order müqaviləsi](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade).

Sadələşdirilmiş tək isolated LONG üçün, əlavə margin/funding/fee/tier deduction olmadan:

```text
P_liq ≈ P_entry × (1 - 1/L) / (1 - maintenance_margin_rate)
```

Bu production liquidation kalkulyatoru deyil. Birjanın faktiki risk məlumatı əsas götürülməlidir. Yüksək leverage-də `1/L` məsafəsi stop-un 2%-lik məsafəsindən daha kiçik ola bilər. Contract və mark qiymət fərqi ayrıca stress edilməlidir.

**Həll:** preflight-da faktiki margin mode, position mode, leverage bracket, mövcud manual exposure və mark/liquidation məlumatını təsdiqləyin. Rejim uyğunsuzluğunda entry açmayın. LONG üçün `SL > liquidationPrice + buffer`, SHORT üçün `SL < liquidationPrice - buffer` şərtini stress ilə yoxlayın. Buffer volatilite, spread və gecikmədən törəsin. Başlanğıc şəxsi versiyada yalnız əvvəlcədən seçilmiş aşağı leverage və bir position mode dəstəkləmək daha yoxlanılandır; bu da risk zəmanəti deyil.

### 2.6. F05 — Emergency close yeni əks mövqe aça bilər — Kritik

**İstinad:** `src/lib/futures-engine.ts:643–678`; `src/lib/binance-futures.ts:133–145,170–208`.

Stop üç cəhddən sonra uğursuz sayıldıqda əks MARKET order `reduceOnly=true` olmadan göndərilir. **T09** parametrin ötürülmədiyini təsdiqlədi. İlkin stop birjada qəbul olunub cavabı itib, sonra trigger olub mövqeni bağlayıbsa, təcili SELL artıq LONG-u azaltmır — yeni SHORT aça bilər. Qismən fill və manual close da oxşar risk yaradır.

Stop helper-i birinci sorğunun istənilən xətasından sonra fərqli `closePosition=true` sorğusuna keçir. Engine-in üç cəhdi altı stop sorğusuna çata bilər. Qəbul edilmiş, amma cavabı bilinməyən orderlər əvvəlcə sorğulanmır. Retry zamanı stop daha uzağa çəkilir, amma DB ilkin `formattedSL` saxlayır.

**Həll:** timeout/unknown halını rədd edilmiş orderdən ayırın; deterministic `clientAlgoId`/client order ID ilə status soruşun. Faktiki exposure-u oxuyun; One-way rejimdə çıxış `reduceOnly=true`, Hedge üçün uyğun bağlama semantikası ilə olsun. Exposure sıfırdırsa çıxış göndərməyin. Faktiki qəbul olunan stop qiymətini/ID-ni saxlayın; riski artıran stop dəyişikliyini yenidən təsdiqləyin.

Binance müəyyən 503 cavabında icra vəziyyətinin naməlum olduğunu, duplicate yaratmamaq üçün statusun əvvəlcə yoxlanmasını bildirir. Bütün HTTP xətalarını “order yoxdur” kimi qəbul etmək düzgün deyil. [Binance xəta semantikası](https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info).

### 2.7. F06 — Spot qoruması komissiya və stop-limit gap-i qarşısında zəifdir — Kritik

**İstinad:** `src/lib/engine.ts:332–386`; `src/lib/binance.ts:51–78`.

Market BUY cavabı nəzərə alınmır. OCO və emergency SELL ilkin istənilən miqdarla göndərilir. Komissiya alınan baza aktivindən tutulursa, əldə edilən sərbəst miqdar daha azdır.

**T12:** BUY 0.2 vahid; baza-aktiv fee 0.0002; net 0.1998. Üç OCO cəhdi 0.2 tələb edir, təcili SELL də 0.2 tələb edir. Hamısı test birjasında insufficient balance alır; alış DB-yə yazılmır. Bu, fee modelinə bağlı realistik ssenaridir, hər hesabda komissiyanın mütləq baza aktivindən tutulduğu iddiası deyil.

OCO stop-limit qiyməti trigger-dən təxminən 0.2% aşağı qoyulur. Sürətli gap bu limitdən də aşağı keçərsə satış icrasız qala bilər. Sonrakı market nəzarət/reconciliation mexanizmi yoxdur. İstifadə edilən `/api/v3/order/oco` rəsmi sənəddə deprecated kimi göstərilir; bu, endpoint-in audit günündə mütləq işləmədiyi demək deyil. Fill cavablarında commission və commissionAsset məlumatları var. [Binance Spot order sənədləri](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/trade).

**Həll:** `net_base = executedQty - base_asset_commission`; protective miqdarı step-ə aşağı yuvarlaqlaşdırın və real free/locked balance ilə uzlaşdırın. Naməlum OCO cavabında yeni OCO və SELL-dən əvvəl list/order statusunu soruşun. Cari order-list API-yə keçid edin. Stop-limit-in icrasız qalmasına ayrıca deadline/market-exit siyasəti qurun; dəstəklənən stop-market alternativini simvol üzrə yoxlayın. Alışı qoruma nəticəsindən əvvəl durable intent/fill kimi qeyd edin.

## 3. Texniki və əməliyyat boşluqları

### 3.1. F04 — Birja həqiqəti ilə yerli state arasında bərpa mexanizmi yoxdur — Kritik

**İstinad:** `src/lib/futures-engine.ts:633–696,754–788,963–1004`; `src/lib/binance-futures.ts:133–157`; `src/lib/engine.ts:332–386`; `src/lib/db.ts:145–188`.

- Futures `entryOrder` cavabını alır, amma istifadə etmir. Qiymət `currentPrice`, miqdar requested quantity olaraq saxlanılır. **T07:** exchange 0.2 vahid və 101 average price qaytardı, DB 1 vahid və 100 yazdı.
- Market order adapteri `newOrderRespType` göndərmir. Rəsmi default ACK-dır; ACK-ni yekun fill ilə eyniləşdirmək olmaz. RESULT istifadə etmək belə restart/timeout reconciliation ehtiyacını aradan qaldırmır. [Binance Futures order cavabı](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade).
- Entry birjada qəbul olunub proses DB INSERT-dən əvvəl dayansa, yerli monitor onu tapa bilmir. Stop uğursuzluğu və emergency close uğursuzluğu yolları da INSERT-ə çatmadan `continue` edir.
- Binance stop, manual close və liquidation yerli DB-yə düşmür. Monitor yalnız qiymət oxuyur. **T05:** birja artıq flat olan mövqedə reduce-only exit rədd edildi; DB OPEN qaldı. Qiymət geri qalxsa saxta TP yoxlamaları da davam edə bilər.
- Dashboard `getFuturesPositions` çağırır, lakin alınan `binancePositions` nəticəsini nə uzlaşdırır, nə çıxışda istifadə edir (`src/app/api/futures/dashboard/route.ts:15–24,29–49,81–91`). Bu çağırış risk nəzarəti deyil.
- DB-də order ID, client ID, algo ID, fill/trade ID, cumulative executed quantity yoxdur. `futures_partial_fills` TP hadisəsi jurnalıdır; birjanın partial-fill lifecycle-ı deyil.

**Həll:** durable order intent, exchange ID-ləri, execution ledger və idempotent state machine. User-data stream sürətli yol, REST snapshot/trade-history reconciliation bərpa yolu olsun. Startup zamanı naməlum/open/closing bütün vəziyyətlər uzlaşdırılmadan yeni entry açılmasın. Manual mövqelər aşkarlansın, avtomatik botun mövqeyi sayılmasın.

### 3.2. F03 — Race condition və qeyri-atomik tranzaksiya ardıcıllığı — Kritik

**İstinad:** `scripts/worker.ts:42–57`; `src/app/api/futures/monitor/route.ts:13–17`; `src/lib/futures-engine.ts:820–866,882–929`; `src/app/api/futures/force-run/route.ts:18–29`; `src/app/api/force-run/route.ts:23–39`.

Monitorlar 30 saniyə aralı işə salınır; əvvəlki prosesin bitməsi gözlənmir. Route özü də engine promise-ni gözləmədən cavab verir. İki monitor eyni `tp1_filled=0` snapshot-ını görə bilər.

**T03:** hər monitor 10 vahidlik mövqenin 5 vahidini satdı. Reduce-only hər orderin mövqeni böyütməsini dayandıra bilər, amma iki 50%-lik çıxışın birlikdə bütün mövqeni bağlamasını dayandırmır. Hər ikisi `remaining_qty=5` yaza və PnL-ni iki dəfə artıra bilər.

**T04:** market fill-dən sonra partial-fill INSERT xətası verildi; növbəti monitor DB-də köhnə flag-i gördüyü üçün eyni hissəni yenidən satdı. `INSERT fill` və `UPDATE position` tranzaksiya deyil. SQL tranzaksiyası əlavə etmək vacibdir, amma xarici birja orderini DB ilə atomik etmir.

Manual run cooldown-u da əvvəl SELECT, sonra UPDATE-dir: eyni vaxtlı iki request hər ikisi yoxlamadan keçə bilər. Spot dedupe key `symbol + action + Date.now()`-dur, entry-dən sonra yaranır və tenant ID daşımır (`engine.ts:383–386`); həm retry-ni dedupe etmir, həm iki tenantın eyni millisekundunda lazımsız UNIQUE xətası yarada bilər.

**Həll:** account/symbol üzrə tək icra sahibi, DB lease + fencing/version, order intent üzrə unique idempotency key, compare-and-swap state keçidləri. Lock-un vaxtı bitsə köhnə workerin sonradan order göndərməsinin qarşısı ayrıca alınmalıdır. Cooldown reservation atomik şərtli UPDATE ilə alınsın. Hər fill və state yeniliyi eyni qısa DB tranzaksiyasında yazılsın; network sorğusu boyunca DB write lock saxlamayın.

**Məntiqi ilgək hökmü:** kodda stop/AI retry sayları məhduddur; sübut olunmuş sinxron sonsuz dövrə yoxdur. Lakin stale OPEN mövqe üçün hər monitor dövründə təkrar çıxış cəhdi, timeout-suz fetch ilə asılı qalma və üst-üstə düşən cron işləri əməliyyat səviyyəsində bitməyən nasazlıq zənciri yaradır.

### 3.3. Qiymət köhnəlməsi və TP state sıralaması — Orta

**İstinad:** `src/lib/futures-engine.ts:274,330–469,538–618,768–950`; `src/lib/binance-futures.ts:255–261`.

Qiymət 4H klines sorğusundan götürülür; ardınca başqa timeframe-lər, AI, exchangeInfo, margin və leverage sorğuları gəlir. Entry-dən əvvəl təzə bid/ask və signal age yoxlanmır. AI entry qiyməti ilə həmin köhnə qiymət arasında 1% tolerance, 0.3–0.5% stop-dan böyükdür.

**Misal:** müşahidə edilən qiymət 100, AI entry 100.9, LONG SL 100.5, TP1 101.7 → mövcud yoxlamaları keçə bilər: entry fərqi 0.9%, SL məsafəsi təxminən 0.40%, R:R 2. Amma MARKET fill 100 olsa stop bazarın yuxarısındadır; qoruyucu order dərhal trigger səbəbi ilə rədd edilə bilər.

TP1 DB flag-i yenilənəndə yerli `pos.tp1_filled` dəyişmir. Qiymət bir poll-da TP3-dən keçsə də yalnız TP1 işləyir. **T10** bunu təsdiqlədi. İdeal ardıcıl poll-da digər hissələr sonrakı 30/60 saniyədə işləyə bilər; qiymət geri dönərsə həmin target-lər itər. TP2 üçün də eyni snapshot gecikməsi var.

**Həll:** planı fill qiyməti ilə yenidən təsdiqləyin; stale signal üçün TTL və maksimum entry drift qoyun. Native reduce-only TP orderləri və ya cumulative target-exit quantity əsasında tək reconciled state keçidi istifadə edin. Eyni tick-də köhnə flag-lərlə üç ayrı order göndərmək də düzgün həll deyil.

### 3.4. TP2/TP3 və sayısal sərhəd yoxlamaları natamamdır — Orta

**İstinad:** `src/lib/futures-engine.ts:538–581,615–618`; `src/lib/binance-futures.ts:401–408`; `src/lib/binance.ts:23–30`; `src/lib/quant-math.ts:50–59`; settings route-ları.

TP2/TP3 direction/ordering/risk yoxlamasından keçmir. Missing/zero target fallback-i həmişə TP1×1.01 və TP1×1.02-dir; SHORT üçün qiymət aşağı getməli olduğu halda target-ləri yuxarı çəkir. `isNaN` yoxlaması `Number.isFinite` və müsbət aralıq yoxlaması deyil. Quant helper-ə 0 qiymət veriləndə NaN faizlər alınır; real data yolu bunu əvvəlcədən rədd etməlidir.

`precision = -floor(log10(stepSize))` bütün decimal addımlar üçün doğru deyil. Birbaşa helper testində `stepSize=0.25`, input 1.25 → output 1.3 oldu; bu addımın qatına uyğun deyil. Hazırda seçilən bütün simvolların 0.25 addımı olduğu iddia edilmir; helper ümumi halda yanlışdır. Float bölmə də bəzi sərhədlərdə əlavə aşağı yuvarlaqlaşma yarada bilər.

`LOT_SIZE`/`PRICE_FILTER` qismən işlənir; market-ə aid filtrlər, maxQty və notional yoxlaması tam deyil. Sabit “spot minimum $10”, “futures margin minimum $5” fərqli simvolların faktiki notional müqaviləsi deyil. TP dilimləri minimum miqdardan aşağı düşə və ya sıfıra yuvarlaqlaşa bilər; onda flag irəliləmir.

**Həll:** decimal/integer-tick arifmetikası; `finite && > 0`; SHORT üçün `SL > entry > TP1 > TP2 > TP3`, LONG üçün tərsi; tick rounding-dən sonra yenidən təsdiq. ExchangeInfo əsasında order tipinə uyğun filtr tətbiq edin. Target dilimlərini entry-dən əvvəl planlaşdırın; qalıq dust üçün full-close siyasəti olsun. Bütün settings üçün server-side schema, aralıq, integer və simvol allowlist qoyun. `0 || default` semantikasını aradan qaldırın: risk=0 həqiqətən deaktiv etməlidir.

### 3.5. Spot və futures hesabatları faktiki portfeli göstərmir — Orta

**İstinad:** `src/lib/engine.ts:324–328,383–386`; `src/app/api/dashboard/route.ts:86–110`; `src/app/api/futures/dashboard/route.ts:51–66`; `src/lib/db.ts:209–210`.

Spot satışının maya dəyəri son BUY qiymətidir; çoxsaylı alışlar, qismən satış, əvvəlcədən mövcud manual inventar və fee-lər nəzərə alınmır. OCO çıxışları DB-yə yazılmır. “Open positions” bütün tarixi `BUY + EXECUTED` yazılarının sayıdır. Futures total/today PnL yalnız CLOSED mövqelərdən yığılır; hələ açıq mövqenin TP1/TP2 realized gəliri həmin vaxt görünmür, sonradan hamısı close gününə düşür.

DB hər yeni bağlantı başlanğıcında mövcud `min_confidence=80` parametrini 75-ə endirir; bu, istifadəçi siyasətinin səssiz dəyişməsidir.

**Həll:** seçilmiş FIFO/weighted-average uçotunu bot-owned lot-lara tətbiq edin; real fill timestamp ilə realized ledger, mark qiyməti ilə unrealized seriya yaradın. Tarix/saatları UTC epoch və ya açıq `Z` ilə saxlayın. SQLite `CURRENT_TIMESTAMP` string-i timezone-suz parse edildiyinə görə cooldown və gündəlik statistika server timezone-undan asılı ola bilər. Data migration yalnız versiyalı migration kimi bir dəfə və istifadəçinin seçimini qoruyaraq işləsin.

### 3.6. Timeout, worker və xəbərdarlıq zənciri — Orta; qorumasız mövqedə Kritik

**İstinad:** `src/lib/binance.ts:15–78`; `src/lib/binance-futures.ts`; `src/lib/telegram.ts:13–32`; `scripts/worker.ts:5–11,42–57`; `package.json:8–12`; `start.sh:5–9`; `vercel.json`.

Binance fetch-lərində explicit deadline/AbortController yoxdur. Bir sorğu asılı qalsa ardıcıl user/position dövrəsi gecikə bilər. `recvWindow` HTTP timeout deyil. Telegram göndərişi də trade yolu içində gözlənilir; əvvəl bot_messages INSERT edilir, sonra HTTP status yoxlanmadan fetch bitmiş sayılır. DB xətası xəbərdarlığın özünü də poza bilər.

Route “positions monitored” cavabını iş bitməmiş verir. Long-running Node prosesində fire-and-forget iş davam edə bilər, amma crash/deploy/serverless lifecycle zamanı durable təminat yoxdur. Yerli Next.js 16 sənədində `after` belə platformanın maxDuration sərhədindədir; maliyyə işi üçün persistent queue/worker əvəzi deyil (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

`npm run dev` web-i 7860-da açır, worker default 3005-ə gedir. `npm start` yalnız web-i başladır; README-dəki həmin production yolu ayrıca worker başlatmır. `start.sh` hər ikisini işlədir, amma web və worker üçün ayrıca supervisor/healthcheck yoxdur. `vercel.json` yalnız saatlıq spot cron göstərir, futures monitor planı yoxdur. Hansı deployment-in canlı işlədiyi auditdə yoxlanmayıb.

**Həll:** bounded HTTP timeout, error taxonomy, retry/backoff/jitter, exchange clock offset və ölçülən latency; risk-reducing sorğulara prioritet. Entry engine-dən ayrı monitor worker və durable queue. Web/worker ayrıca process health + heartbeat, graceful shutdown və recovery. Telegram üçün outbox; DB-dən müstəqil ehtiyat alert yolu. Status endpoint-ləri job ID, running/completed/failed və son uğurlu reconciliation vaxtını qaytarsın.

### 3.7. Ən kritik üç fəlakət ssenarisi

| Ssenari | Hadisələr zənciri | Kapital təsiri | Qarşısını alan tələb |
|---|---|---|---|
| **A. TP2 → server kəsilməsi → əks gap** | 75% çıxışdan sonra birjadakı bütün stop-lar silinir → qalıq 25% yerli trailing-ə qalır → worker/API/host dayanır → bazar əks istiqamətdə sıçrayır | Qalan margin-in böyük hissəsi/likvidasiya; faktiki CROSSED rejimində daha geniş hesab riski | Bütün lifecycle boyu təsdiqlənmiş exchange protective order; TP2 crash testi; margin/liquidation preflight |
| **B. Naməlum stop cavabı → emergency reversal** | Stop qəbul edilir, cavab itir → retry/fallback → stop trigger olur və flat edir → reduceOnly-siz emergency order gəlir | Botun xəbərsiz olduğu yeni əks mövqe; DB-yə ümumiyyətlə yazılmaya bilər | UNKNOWN state + query-before-retry, client ID, faktiki exposure və mode-aware close |
| **C. Paralel TP/DB nasazlığı → exchange/DB ayrılması** | İki monitor eyni flag-i oxuyur və ya fill-dən sonra DB yazısı alınmır → TP1 təkrar satılır → DB yarı mövqe saxlayır, birja artıq flat/daha kiçikdir | Yanlış qalıq, yanlış PnL, yanlış stop/cancel; növbəti qərarlarda səhv risk büdcəsi | Account owner/lease, idempotent intents, fill ledger, atomik daxili state və restart reconciliation |

Bu ssenarilər risk zənciridir; canlıda baş verdiyi iddia edilmir. A-nın stop silmə hissəsi, B-nin reduceOnly çatışmazlığı və C-nin təkrar order hissəsi testlə təsdiqlənib. Spot üçün T12 ayrıca eyni dərəcədə təcili qoruma boşluğudur.

## 4. Çoxistifadəçili sistemə keçid riskləri

### 4.1. 100+ istifadəçidə data təkrarı, növbə gecikməsi və rate limit — Orta, qoruma SLA-sı pozularsa Kritik

**İstinad:** `src/lib/futures-engine.ts:199–246,289–290,762–768`; `src/lib/binance-futures.ts:12–19,265–360`; `scripts/worker.ts:30–57`.

Hər user üçün AUTO seçimi təkrar edilir: bir 24h ticker + maksimum 30 RSI kline sorğusu; 7 coin üçün 4 timeframe = 28 əlavə kline; bir balance sorğusu. Təxmini **60 public/private sorğu/user/analiz**, entry və dashboard xaric. 100 user üçün təxminən **6,000 sorğu/30 dəqiqə**, orta 200 sorğu/dəqiqə. Bu, request weight hesabı deyil; ortalama rəqəm avtomatik ban sübut etmir. Burst, endpoint weight, eyni IP-dən monitor/dashboard və üst-üstə düşən işlər əlavə edilməlidir.

3 mövqe/user nəzərdə tutulsa monitor 300 qiymət sorğusu/30 saniyə ≈ 600/dəqiqə edir. Calls ardıcıldır: yalnız 100 ms orta round-trip fərziyyəsində 300 sorğu 30 saniyədir; DB/order/Telegram vaxtı hələ daxil deyil. 700 AI çağırışı orta 2 saniyə fərziyyəsi ilə 23.3 dəqiqə çəkir; bu ölçülmüş benchmark deyil. Gecikmə 30 dəqiqəlik intervalı aşanda yeni analizlər köhnələrin üstünə düşür.

Binance request-weight limitləri IP, order count isə hesab üzrə izlənilir. 429-dan sonra davamlı yük IP ban-a səbəb ola bilər. Fərqli API key-lər eyni outbound IP-ni izolyasiya etmir. [Binance limitləri](https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info).

**Həll:** shared market-data stream/cache, symbol/timeframe üzrə bir hesablanma; user üçün yalnız risk/ölçü icrası. Eyni snapshot/strategy üçün cache-lənə bilən market qərarını şəxsi balansdan ayırın. Weighted token bucket IP+account səviyyəsində, header-lərdən dinamik istifadə, 429 backoff, 418 entry freeze, exit/cancel üçün ayrılmış büdcə. Bounded concurrency və backpressure; worker sayını limitsiz artırmayın.

**Qəbul:** 100 virtual account, 300 mövqe, gecikmə/429/timeout inyeksiyası altında p95/p99 monitor gecikməsi və risk-reducing order növbəsi ölçülsün. Sadəcə request throughput uğuru kifayət deyil.

### 4.2. Eyni siqnal üzrə öz-özünə rəqabət — Orta

Bütün istifadəçilərin eyni istiqamətli MARKET orderləri ardıcıl gəldikdə ilk hesablar daha yaxşı qiymət, sonrakılar daha pis qiymət ala bilər. Bu, özlüyündə sübut olunmuş qəsdən front-running deyil; sıra üstünlüyü, eyni siqnala yığılma və market impact problemidir. Fərqli risk büdcələri və balanslar nominal miqdarı daha da qeyri-bərabər edir. Əks istiqamətli hesabların qarşılıqlı uyğunlaşması ayrıca exchange/STP siyasəti tələb edə bilər.

```text
aggregate_notional(symbol, window) = Σ user_order_notional
participation = aggregate_notional / observed_executable_volume_in_window
impact(Q) = abs(depth_VWAP(Q) - reference_price) / reference_price
```

**Həll:** hesablar arası aggregate liquidity cap, istifadəçi üzrə maksimum implementation shortfall, planlı fair scheduling və queue-age həddi. Böyük siqnalları kiçik hissələrlə icra etmək yalnız alpha decay və əməliyyat xərci müqayisəsindən sonra tətbiq olunsun. Risk çıxışlarını “ədalətli sıra” üçün gecikdirməyin. Eyni snapshot əsasında verilən sifarişlərdə sistematik prioriteti izləyin; ölçülməyən FIFO üstünlüyünü gizlətməyin.

### 4.3. Balans və execution izolyasiyası qisməndir — Kritik

**Müsbət fakt:** settings/dashboard/trades sorğularında əsasən `session.id`/`user_id` filtri və parameterized SQL var; API açarları user səviyyəsindədir. Auditdə həmin əsas route-larda birbaşa user-id parametrini dəyişərək başqasının nəticəsini oxuma yolu göstərilmədi. Buna görə “heç bir tenant izolyasiyası yoxdur” hökmü düzgün olmaz.

**Boşluqlar:**

- `futures_positions`/`futures_partial_fills` tenant sahələri nullable-dır; partial fill-in `user_id`-si ilə parent position sahibini bağlayan composite constraint yoxdur (`db.ts:145–188`). Tətbiq səhvi səviyyəsində sərhəd zəifdir.
- Eyni Binance hesabının iki yerli istifadəçi/API key ilə qeydiyyatı aşkarlanmır (`api/setup/route.ts:15–25,29–50`). İzolyasiya tenant ID yox, faktiki exchange account + positionSide səviyyəsində də olmalıdır.
- `cancelAll...Orders(symbol)` manual və başqa botun orderlərini də silir (`futures-engine.ts:845–854,913–923,973–981`). `closePosition=true` fallback-i bütün symbol exposure-una toxuna bilər. One-way mode-da manual və bot mövqeləri fiziki olaraq birləşir.
- Spot SELL bütün free asset balance-ını satır (`engine.ts:309–311`), yalnız botun aldığı lot-u deyil.
- Bütün tenantların açarı eyni master secret və prosesə bağlıdır (`encryption.ts:3–5`). AES-GCM/random IV yaxşı əsasdır, amma plaintext fallback (`:23`) və key version/tenant AAD olmaması migration və ciphertext səhv-assosiasiya riskidir.

**Həll:** şəxsi mərhələdə ayrıca bot subaccount/ayrılmış inventar və bir icra sahibi. Multi-tenant mərhələdə `tenant_id + exchange_account_id + strategy_id + symbol + position_side` ownership, composite FK/NOT NULL/unique constraints, bot-owned order IDs və hesab üzrə lock. Hər API route/job-da tenant context məcburi olsun. Master-key rotasiyası, KMS/envelope encryption, version və tenant/account AAD; plaintext fallback yalnız birdəfəlik offline migration-da işləsin. Açar dəyişimi açıq mövqeləri sahibsiz qoymamalıdır.

### 4.4. F10 — İdarəetmə səlahiyyəti fail-open qala bilir — Kritik, konfiqurasiyadan asılı

**İstinad:** `src/app/api/cron/route.ts:48–50`; `src/app/api/futures/cron/route.ts:7–9`; `src/app/api/futures/monitor/route.ts:6–8`; `src/proxy.ts:11–13,27–28`; `src/app/api/telegram/webhook/route.ts:10–15,25–36,83–91`.

`CRON_SECRET` yoxdursa route bütün çağırışları qəbul edir; API-lər proxy autentifikasiyasından da keçmir. Bu vəziyyətdə xaricdən təkrar çağırış bütün uyğun hesablar üçün analiz/monitor başlada bilər. Canlı deployment-də secret-in yoxluğu təsdiqlənməyib; kodun həmin vəziyyətdə açıq davranması təsdiqlənib.

Telegram webhook secret-i də optional-dır. Olmadıqda göndərənin username/chat metadata-sına güvənilir. İlk əlaqə Telegram username və hətta lokal login username uyğunluğu ilə qurulur, bir dəfəlik hesab-bağlama sübutu yoxdur. Payment callback-də `callback_query.from.id` üçün admin allowlist yoxlaması görünmür. Webhook secret olsa belə real callback göndərənin ayrıca səlahiyyət yoxlaması lazımdır.

**Həll:** tələb olunan sirlər yoxdursa startup/endpoint bağlı qalsın. Cron private network/service auth və təkrar job idempotency ilə işləsin. Telegram linking authenticated paneldən alınan qısaömürlü, birdəfəlik token ilə olsun; private-chat və dəyişməz Telegram user ID yoxlansın. Admin callback ayrıca admin ID/rolu, payment transition və replay yoxlaması tələb etsin. Tenant A-nın metadata-sı tenant B-ni bağlaya bilməməlidir.

### 4.5. Botu dayandırma və abunəlik vahid icra siyasəti deyil — Kritik

**İstinad:** `src/lib/telegram.ts:134–140`; `src/app/api/auth/toggle-bot/route.ts:12–18`; `src/app/api/cron/route.ts:19–21`; `src/lib/futures-engine.ts:184–196`; `src/lib/engine.ts:101–104`; `src/lib/db.ts:31–33`.

Ümumi pause yalnız `users.is_active` dəyişir. Futures analizi `is_futures_active`-ə baxır, `users.is_active`-ə baxmır. Buna görə “bot dayandı/yeni mövqe açılmayacaq” mesajı futures üçün doğru olmaya bilər. Abunəlik bitəndə də yalnız `is_active=0` edilir. Spot cron-un engine seçimi subscription status-u yoxlamır; yeni user default is_active=1-dir. Manual run route-ları subscription yoxlayır, engine-in targetUser seçimi isə aktivlik flag-ini yoxlamır. User siyahısı alındıqdan sonra pause edilsə belə hər entry-dən əvvəl təkrar gate yoxdur.

**Həll:** ayrıca `can_open_new_risk(account)` siyasətini reservation və order submission-dan dərhal əvvəl tətbiq edin. Spot/futures pause və qlobal kill switch aydın ayrılsın. Billing bitməsi mövcud exposure-un monitor/stop idarəetməsini söndürməsin. Pause yeni entry-ni bloklasın, bağlama/reconciliation isə davam etsin.

### 4.6. DB, migration və deployment sirr sərhədi — Orta; image sızmasında Kritik

**İstinad:** `src/lib/db.ts:16–19,135–141,206–215,221–250`; `Dockerfile`; `.dockerignore:1–7`; `start.sh`.

SQLite WAL avtomatik “100 istifadəçiyə çatmaz” demək deyil; aşağı write yükündə şəxsi mərhələ üçün kifayət edə bilər. Burada problem qısa tranzaksiyalar, ownership constraints, recovery, per-user/symbol/status indeksləri və açıq busy-timeout siyasətinin olmamasıdır. Migration xətaları geniş şəkildə udulur. Çox hostda hər replica-nın ayrı SQLite faylı olması risk state-ni parçalayacaq; shared volume da avtomatik düzgün həll deyil.

`.dockerignore` `.env*`, açar faylları və DB WAL/SHM sidecar-ları üçün ümumi qadağa vermir. `COPY . .` build kontekstində belə fayllar varsa onları image-ə daşıya bilər. Məxfi faylın həqiqətən yayımlandığı yoxlanmayıb; bu, şərtli build təhlükəsizlik boşluğudur.

**Həll:** migration versiyaları, failure-visible startup, backup+restore drill, məqsədli indekslər, atomik DB yeniləmələri. Tək-host şəxsi mərhələdə WAL saxlanıla bilər. Multi-worker/multi-host üçün PostgreSQL və tenant sərhədləri, transactional outbox; köçürülmə reconciliation ilə verifikasiya edilsin. Docker build context-dən `.env*`, private key, DB və sidecar-ları çıxarın, runtime secret injection tətbiq edin. Sızma sübutu olmadan “açarlar artıq komprometdir” deməyin; əvvəl image/layer yoxlanışı aparın.

## 5. Konkret düzəliş arxitekturası və buraxılış meyarları

### 5.1. İcra state machine-i

```text
PLANNED -> RESERVED -> SUBMITTING -> ACKNOWLEDGED
                              \-> UNKNOWN -> RECONCILING
ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED -> PROTECTION_PENDING -> PROTECTED
PROTECTED -> EXIT_INTENT -> PARTIAL_EXIT / CLOSING -> CLOSED
hər nonterminal state -> RECONCILING
qoruma təsdiqlənməyibsə -> UNPROTECTED + entry freeze + emergency policy
```

`HTTP 200`, `ACK`, `FILLED`, `PROTECTED`, `CLOSED` ayrı faktlardır. “Exactly once” xarici HTTP order üçün DB tranzaksiyası ilə əldə olunmur; at-least-once job delivery + deterministic intent + idempotent yerli yazı + exchange reconciliation lazımdır. Exchange client-ID unique qaydasını yalnız açıq orderlərlə məhdud sayan hallara görə bütün tarix üzrə idempotency yerli bazada da saxlanmalıdır.

```python
# Psevdokod: SQL tranzaksiyası boyunca HTTP gözləməyin.
def open_position(signal, account):
    owner = acquire_account_lease_with_fencing(account.id)
    reconcile_account(account)                 # orders, fills, positions, balances
    assert can_open_new_risk(account)
    assert signal.is_fresh_and_closed_bar_safe()
    plan = deterministic_risk_plan(signal, account)
    validate_liquidity_margin_liquidation(plan)

    with db.transaction():
        verify_current_fence(owner)
        reserve_portfolio_risk_and_position_slot(plan)
        intent = insert_unique_intent(account, signal.id, "ENTRY", plan)

    if intent.already_submitted_or_unknown:
        return reconcile_intent(intent)        # kor-koranə yenidən POST deyil

    result = submit_with_stable_client_id(intent)
    if result.execution_unknown:
        persist_unknown(intent)
        freeze_new_entries(account)
        return schedule_reconciliation(intent)

    fills = confirm_actual_fills(result)
    with db.transaction():
        append_fills_once_by_exchange_trade_id(fills)
        update_position_from_cumulative_fills()
        resize_risk_reservation_to_actual_exposure()

    protection = ensure_exchange_stop_for_actual_exposure()
    if not protection.confirmed:
        mark_unprotected_and_apply_mode_aware_close_policy()
    else:
        persist_protected_order_id_and_actual_trigger()
    enqueue_notification_in_outbox()
```

```python
# TP üçün çıxılmalı kumulyativ miqdar hədəfi saxlanılır.
def reconcile_take_profit(position, reached_stage):
    with account_execution_owner(position.account):
        refresh_fills_and_exchange_exposure(position)
        target_closed = target_fraction(reached_stage) * position.actual_entry_qty
        to_close = floor_step(min(target_closed - position.confirmed_closed_qty,
                                  position.exchange_remaining_qty))
        if to_close <= 0:
            return
        create_unique_exit_intent(position.id, reached_stage, to_close)
        execute_mode_aware_risk_reduction()
        reconcile_fills_before_advancing_flags()
        ensure_continuous_exchange_protection()
```

Notification DB və şəbəkə xətası orderin maliyyə state-ni geri çevirməməlidir. UI-da “submitted”, “fill confirmed”, “protection confirmed”, “reconciliation needed” ayrılmalıdır.

### 5.2. Şəxsi istifadə üçün prioritet ardıcıllıq

| Mərhələ | Görüləcək iş | Bitmə sübutu |
|---|---|---|
| P0 — kapital qoruması | F01–F09: PnL, durable intents, actual fills, reconciliation, reduce-only emergency, fasiləsiz SL, margin preflight, limit reservation, DD siyasəti | Aşağıdakı fault-injection testləri təhlükəsiz gözlənilən davranışla keçsin; hesab/DB fərqi sıfır olsun |
| P0 — səlahiyyət və işə düşmə | F10, pause gate, settings validation, düzgün worker port/supervision, secrets/build sərhədi | Secret yoxdur → 401/503 və sıfır job; pause → sıfır entry, monitor davam edir; worker restart recovery keçir |
| P1 — ölçmə | Net ledger, equity seriyası, closed-bar/snapshot arxivi, spread/depth/funding modeli | Birja tarixçəsi ilə PnL uzlaşır; backtest/replay və paper nəticələri müqayisə oluna bilir |
| P1 — idarə olunan pilot | Demo/testnet execution müqaviləsi, sonra shadow/paper; yalnız bundan sonra ayrıca minimal-risk live pilot planı | Qorumasız exposure və naməlum orderlər vaxtında aşkarlanır; real xərclər proqnozdan kənara çıxanda entry dayandırılır |
| P2 — multi-tenant | Shared data, fair bounded scheduler, account ownership, RLS/constraints, queue/outbox, load və isolation testləri | 100 hesabda ölçülmüş latency/risk SLA və tenant sərhədləri |

Demo/testnet canlı likvidlik, slippage və qazanclılıq sübutu deyil. Canlı pilot üçün kapital məbləği, qəbul olunan itki limiti və dayandırma qaydası əvvəlcədən konkretləşdirilməlidir; bu audit canlı ticarət başlatmır.

### 5.3. Məcburi nasazlıq və maliyyə testləri

| Test | İnyeksiya | Təhlükəsiz nəticə |
|---|---|---|
| Qəbul olunmuş order, itmiş cavab | POST birjada qəbul, client timeout | UNKNOWN; eyni intent üzrə ikinci təsadüfi ID-li order yoxdur; status bərpa edilir |
| Process crash sərhədləri | Intent-dən sonra, entry-dən sonra, stop-dan sonra, fill INSERT-dən sonra kill | Restart əvvəl uzlaşdırır; orphan/duplicate yoxdur |
| Qismən icra | 10%, 60%, terminal canceled/expired/filled ardıcıllığı | Yalnız real filled qty qorunur və uçota düşür; qalıq reservation düzgün sərbəstləşir |
| Paralel trigger | Cron + force-run + iki monitor eyni anda | Bir entry intent, bir kumulyativ TP çıxışı; limit aşılmır |
| Birja stop-u/manual close | Worker görmədən exposure sıfıra düşür | CLOSED yalnız təsdiqlənmiş fill/flat əsasında; yeni reversal order yoxdur |
| Qoruyucu order rəddi | TP1 replacement və TP2 trailing rədd | Köhnə qoruma saxlanır və ya faktiki exposure nəzarətli bağlanır; yanlış uğur mesajı yoxdur |
| Spot fee asset | Fee baza/quote/BNB, qismən fill | Net sellable qty düzgün; OCO/exit overdraft etmir |
| Gap/liquidation | Trigger-dən kənar qiymət, mark/contract ayrılması, spread sıçrayışı | Stress loss qeydə düşür, entry breaker işləyir; stop qiyməti ilə zəmanətli fill fərz edilmir |
| Rate limit/deadline | 429, 418, 503 unknown, asılan HTTP, clock skew | Bounded retry; UNKNOWN uzlaşır; risk azaltma prioriteti və müstəqil alert |
| Tenant sərhədi | A-nın job/position ID-si B context-də, eyni account iki tenantda | Rədd edilir; B-nin açarı, orderi və balance rezervi dəyişmir |
| Portfolio risk | BTC/ETH/altcoin eyni tərəf, spot+futures, manual position | Aggregate stop/stress/notional limiti qorunur |
| Uçot | Partial TP, funding, depozit, transfer, fee asset, UTC sərhədi | Net PnL/equity/DD birja mənbələri ilə uzlaşır |

### 5.4. Qazanclılığın təsdiqi üçün ayrıca tədqiqat protokolu

1. Əvvəl execution və uçot səhvlərini bağlayın. Yanlış PnL üzərində parametrləri optimallaşdırmayın.
2. Tarixi simvol kainatı, delisting, funding və bid/ask/depth fərziyyələri ilə event-driven backtest qurun. 30 dəqiqəlik entry və 30 saniyəlik monitor cadence-i real qaydada modelləşdirilsin.
3. Toxunulmamış test intervalları və ən azı fərqli trend/range/yüksək-volatilite dövrləri ayırın. Nümunə sayını yalnız “100 trade oldu” kimi deyil, net expectancy etibar intervalı və serial dependence ilə qiymətləndirin.
4. AI-siz baza, TypeSafe, Gemini və provider-fallback siyasətini ayrı ölçün. Əlavə AI/API/hosting xərcini də strategiyanın biznes nəticəsinə daxil edin.
5. Net return, Max DD, time-under-water, turnover, profit factor, average win/loss, tail loss, exposure, implementation shortfall və capacity ölçün. Sharpe üçün yüksək tezlikli asılı gəlirləri kor-koranə illikləşdirməyin.
6. Parametr dəyişməsi, latency 2×/5×, spread/slippage 2×/3×, fill rejection və outage stress-ləri aparın. Faizlər stress fərziyyəsidir; real paylanma ölçüldükcə yenilənməlidir.
7. Shadow qərarlarını əvvəlcədən arxivləyin, sonra real bazar yolu ilə müqayisə edin. Yalnız bütün xərclərdən sonra sabit out-of-sample üstünlük görünərsə ölçülü live sınağı planlaşdırın.

## Əlavə A — Audit zamanı icra edilmiş yoxlamalar

| ID | Təcrid testində müşahidə | Nəticə |
|---|---|---|
| T01 | 20 USDT gross TP1 əvəzinə 100 USDT yazıldı | Səhv təkrarlandı |
| T02 | TP2-də iki cancel, sıfır yeni stop çağırışı | Səhv təkrarlandı |
| T03 | İki paralel monitor eyni TP1 üçün 5+5 vahid çıxış verdi | Səhv təkrarlandı |
| T04 | Fill INSERT xətasından sonra növbəti monitor TP1-i yenidən göndərdi | Səhv təkrarlandı |
| T05 | Exchange flat/reduceOnly reject → DB CLOSED olmadı | Səhv təkrarlandı |
| T06 | max_open_positions=1 → bir analizdə 2 INSERT/entry | Səhv təkrarlandı |
| T07 | Real 0.2 @ 101 əvəzinə DB 1 @ 100 saxladı | Səhv təkrarlandı |
| T08 | Margin dəyişməsi rədd → entry davam etdi | Səhv təkrarlandı |
| T09 | Emergency SELL-də reduceOnly ötürülmədi | Səhv təkrarlandı |
| T10 | TP3-dən yuxarı qiymətdə yalnız TP1 işlədildi | Səhv təkrarlandı |
| T11 | Breakeven stop rədd → DB və mesaj uğur bildirdi | Səhv təkrarlandı |
| T12 | 0.1998 net aktivə 0.2 OCO/exit tələbi; alış uçotsuz qaldı | Səhv təkrarlandı |

Əlavə birbaşa helper yoxlamaları: `computeQuantPlan('LONG', 0, [])` NaN faiz qaytarır; `formatQuantity(1.25, 0.25)` və `formatPrice(1.25, 0.25)` 1.3 qaytarır. Bunlar cari simvolda canlı reject sübutu deyil, funksiya sərhəd pozuntusudur.

TypeScript yoxlaması: `./node_modules/.bin/tsc --noEmit --incremental false`, exit code 0. Build, canlı exchange E2E, Docker runtime, 100-user load və gəlir backtest-i icra edilməyib. Sintaksis/tip yoxlamasının keçməsi maliyyə təhlükəsizliyini göstərmir.

Test harness real source fayllarını oxuyur, bütün xarici importları allowlist mock-larla əvəz edir; real `.env` yükləmir, real DB/şəbəkə/order işləmir. Assertion-lar nasaz davranışın mövcudluğunu təsdiqləyir; düzəlişdən sonra təhlükəsiz davranışı tələb edən regression testlərinə çevrilməlidir. T03/T04 mock snapshot-ları məhz stale-state interleaving-i modelləşdirir; gerçek birja matching-engine concurrency testi deyil.

Təkrar icra: aşağıdakı JavaScript blokunu `/tmp/kriptofani-audit-20261003.cjs` kimi saxlayın, repo kökündən `node /tmp/kriptofani-audit-20261003.cjs` işlədin. Yalnız `/tmp/kriptofani-audit-20261003-results.json` nəticə faylı yazılır.

<!-- AUDIT_HARNESS_START -->
```javascript
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.cwd(),ts=require(path.join(root,'node_modules/typescript'));
const assert=require('assert/strict');
const results=[];
function load(file,mocks={}){
 const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const ctx={module:m,exports:m.exports,require:(id)=>{if(id in mocks)return mocks[id];throw Error('Unmocked import '+id)},process:{env:{}},console:{log(){},warn(){},error(){}},setTimeout:(cb)=>{cb();return 1},clearTimeout(){},fetch:mocks.fetch};
 vm.runInNewContext(code,ctx,{filename:file});return m.exports;
}
const quant=load('src/lib/quant-math.ts');
const fmt=(q,s)=>Math.floor(q/s)*s;
const base={id:1,user_id:1,symbol:'BTCUSDT',side:'LONG',entry_price:100,quantity:10,remaining_qty:10,leverage:5,stop_loss_price:98,take_profit_1:104,take_profit_2:106,take_profit_3:108,tp1_filled:0,tp2_filled:0,tp3_filled:0,highest_price:100,lowest_price:100,total_pnl:0,futures_api_key:'fake',futures_api_secret:'fake'};
function harness({pos=base,price=104,mode='monitor',failFill=false,orderError=false,marginError=false,entryPartial=false,stopError=false,geminiDecision=null}={}){
 const calls=[],writes=[],messages=[],errors=[];
 let fail=failFill;
 const db={dbAll:async(q)=>q.includes('FROM users')?[{id:1,username:'audit',futures_api_key:'fake',futures_api_secret:'fake'}]:mode==='monitor'?[{...pos}]:[],dbGet:async(q)=>q.includes('risk_configs')?{max_open_positions:1,target_coins:'BTCUSDT,ETHUSDT',max_risk_pct:2,leverage:5,min_confidence:75}:null,dbRun:async(q,p)=>{writes.push({q,p});if(fail&&q.includes('INSERT INTO futures_partial_fills')){fail=false;throw Error('injected DB failure')}return {lastID:1}}};
 const binance={getFuturesPrice:async()=>price,getFuturesBalance:async()=>1000,getFuturesKlines:async(_s,_i,n)=>Array.from({length:n},(_,i)=>({openTime:i,closeTime:i+1,open:100,high:101,low:99,close:100,volume:100})),getFuturesExchangeInfo:async()=>({filters:[{filterType:'LOT_SIZE',stepSize:'0.1',minQty:'0.1'},{filterType:'PRICE_FILTER',tickSize:'0.01'}]}),formatFuturesQuantity:fmt,formatFuturesPrice:(p)=>p,setMarginType:async()=>{calls.push(['margin']);if(marginError)throw Error('margin rejected')},setLeverage:async()=>{},placeFuturesMarketOrder:async(...a)=>{calls.push(['market',...a]);if(orderError)throw Error('reduceOnly rejected; position already flat');return {status:entryPartial?'PARTIALLY_FILLED':'FILLED',executedQty:entryPartial?'0.2':String(a[4]),avgPrice:'101'}},placeFuturesStopOrder:async(...a)=>{calls.push(['stop',...a]);if(stopError)throw Error('stop unavailable');return {}},cancelAllFuturesOrders:async(...a)=>calls.push(['cancel',...a]),cancelAllFuturesAlgoOrders:async(...a)=>calls.push(['cancelAlgo',...a])};
 const gen={GoogleGenerativeAI:class {getGenerativeModel(){return {generateContent:async()=>({response:{text:()=>JSON.stringify(geminiDecision)}})}}},SchemaType:{OBJECT:'OBJECT',STRING:'STRING',INTEGER:'INTEGER',NUMBER:'NUMBER'}};
 const mod=load('src/lib/futures-engine.ts',{'./db':db,'./encryption':{decrypt:x=>x},'./telegram':{sendMessageToUser:async(...a)=>messages.push(a)},'technicalindicators':{rsi:()=>[50],sma:({period})=>[period===20?99:98],macd:()=>[]},'./typesafe':{isTypeSafeConfigured:()=>!geminiDecision,evaluateWithJev:async()=>({action:'LONG',confidence:90,isHighRisk:false})},'./quant-math':quant,'./binance-futures':binance,'@google/generative-ai':gen});
 return {mod,calls,writes,messages};
}
async function test(name,fn){try{const details=await fn();results.push({name,reproduced:true,details})}catch(e){results.push({name,reproduced:false,error:e.message});process.exitCode=1}}
(async()=>{
 await test('T01 leverage counted twice in TP1 PnL',async()=>{const h=harness();await h.mod.monitorFuturesPositions();const fill=h.writes.find(x=>x.q.includes('INSERT INTO futures_partial_fills'));assert.equal(fill.p[4],100);return {recorded:fill.p[4],correctGross:20}});
 await test('T02 TP2 cancels exchange protection without replacement',async()=>{const h=harness({pos:{...base,tp1_filled:1,remaining_qty:5,stop_loss_price:100},price:106});await h.mod.monitorFuturesPositions();assert.equal(h.calls.filter(x=>x[0]==='stop').length,0);assert.equal(h.calls.filter(x=>x[0].startsWith('cancel')).length,2);return h.calls.map(x=>x[0])});
 await test('T03 concurrent monitors each execute TP1',async()=>{const h=harness();await Promise.all([h.mod.monitorFuturesPositions(),h.mod.monitorFuturesPositions()]);const orders=h.calls.filter(x=>x[0]==='market');assert.equal(orders.length,2);return {orders:orders.length,quantities:orders.map(x=>x[5])}});
 await test('T04 DB failure after fill causes repeated TP1 next monitor',async()=>{const h=harness({failFill:true});await h.mod.monitorFuturesPositions();await h.mod.monitorFuturesPositions();assert.equal(h.calls.filter(x=>x[0]==='market').length,2);return 'Two market exits for unchanged DB snapshot after first fill insert failed'});
 await test('T05 exchange-flat position remains OPEN after reduceOnly rejection',async()=>{const h=harness({price:97,orderError:true});await h.mod.monitorFuturesPositions();assert.equal(h.writes.filter(x=>x.q.includes("status = 'CLOSED'")).length,0);return 'No CLOSED update or exchange reconciliation'});
 await test('T06 max_open_positions=1 permits two entries in same run',async()=>{const h=harness({mode:'analysis'});await h.mod.runFuturesAnalysis(1);const inserts=h.writes.filter(x=>x.q.includes('INSERT INTO futures_positions'));assert.equal(inserts.length,2);return {configuredMax:1,inserted:inserts.length}});
 await test('T07 partial fill and actual average price ignored at entry',async()=>{const h=harness({mode:'analysis',entryPartial:true});await h.mod.runFuturesAnalysis(1);const row=h.writes.find(x=>x.q.includes('INSERT INTO futures_positions'));assert.equal(row.p[3],100);assert.equal(row.p[4],1);return {exchange:{quantity:0.2,avgPrice:101},database:{quantity:row.p[4],entryPrice:row.p[3]}}});
 await test('T08 margin switch error does not prevent entry',async()=>{const h=harness({mode:'analysis',marginError:true});await h.mod.runFuturesAnalysis(1);assert(h.calls.some(x=>x[0]==='market'));return 'Entries and ISOLATED records written despite injected margin error'});
 await test('T09 emergency close omits reduceOnly',async()=>{const h=harness({mode:'analysis',stopError:true});await h.mod.runFuturesAnalysis(1);const exit=h.calls.find(x=>x[0]==='market'&&x[4]==='SELL');assert(exit);assert.equal(exit[6],undefined);return {side:exit[4],quantity:exit[5],reduceOnly:'omitted'}});
 await test('T10 TP3 gap only processes TP1 on first poll',async()=>{const h=harness({price:109});await h.mod.monitorFuturesPositions();assert.equal(h.calls.filter(x=>x[0]==='market').length,1);assert.equal(h.writes.filter(x=>x.q.includes("status = 'CLOSED'")).length,0);return 'Price beyond all targets; only first 50% exit runs'});
 await test('T11 failed breakeven stop still recorded and announced as moved',async()=>{const h=harness({stopError:true});await h.mod.monitorFuturesPositions();assert(h.writes.some(x=>x.q.includes('tp1_filled = 1')));assert(h.messages.some(x=>x[2].includes('SL breakeven-ə')));return 'Exchange stop rejected; DB and notification report breakeven'});
 await test('T12 spot base-asset fee breaks OCO and emergency exit',async()=>{
 const calls=[],writes=[],messages=[];let net=0;
 const gen={GoogleGenerativeAI:class{},SchemaType:{OBJECT:'OBJECT',STRING:'STRING',INTEGER:'INTEGER',NUMBER:'NUMBER'}};
 const mod=load('src/lib/engine.ts',{'crypto':require('crypto'),'./db':{dbAll:async()=>[{id:1,username:'audit',binance_api_key:'fake',binance_api_secret:'fake'}],dbGet:async()=>({target_coins:'BTCUSDT',max_risk_pct:2,min_confidence:75}),dbRun:async(q,p)=>writes.push({q,p})},'./encryption':{decrypt:x=>x},'./telegram':{sendMessageToUser:async(...a)=>messages.push(a)},'@google/generative-ai':gen,'technicalindicators':{rsi:()=>[25],sma:()=>[101]},'./typesafe':{isTypeSafeConfigured:()=>true,evaluateWithJev:async()=>({action:'LONG',confidence:90,isHighRisk:false})},'./quant-math':quant,'./binance':{getExchangeInfo:async()=>({filters:[{filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.001'},{filterType:'PRICE_FILTER',tickSize:'0.01'}]}),formatQuantity:fmt,formatPrice:p=>p,placeMarketOrder:async(_k,_s,_sym,side,q)=>{calls.push({type:side,q});if(side==='BUY'){net=q*0.999;return {executedQty:q,fills:[{price:100,qty:q,commission:q*0.001,commissionAsset:'BTC'}]}}if(q>net)throw Error('insufficient balance')},placeOCOOrder:async(_k,_s,_sym,_side,q)=>{calls.push({type:'OCO',q});if(q>net)throw Error('insufficient balance')}},fetch:async(url)=>({ok:true,json:async()=>url.includes('/account')?{balances:[{asset:'USDT',free:'1000'}]}:Array.from({length:50},()=>[0,'100','101','99','100','10'])})});
 await mod.runTradingEngine(1);assert.equal(calls.filter(x=>x.type==='OCO').length,3);assert.equal(writes.length,0);assert(messages.some(x=>x[2].includes('KRİTİK XƏBƏRDARLIQ')));return {netBase:net,calls,persistedTrades:writes.length};
 });
 console.log(JSON.stringify(results,null,2));
 fs.writeFileSync('/tmp/kriptofani-audit-20261003-results.json',JSON.stringify(results,null,2));
})();
```
<!-- AUDIT_HARNESS_END -->


## Düzəlişlərin icra statusu — 2026-10-03

Auditdən sonra kod dəyişdirilib. F01–F10 və əlavə risklər üzrə tətbiq olunan mexanizmlər, 33 testin nəticəsi, keçid qaydaları və hələ tamamlanmamış real birja/multi-host/qazanclılıq yoxlamaları [audit-remediation.md](docs/audit-remediation.md) faylında ayrıca göstərilib. Yuxarıdakı audit ilkin versiyanın nəticəsidir; sətir nömrələri dəyişdirilmiş kodda artıq eyni olmaya bilər. Yeni kodun production-da təsdiqləndiyi iddia edilmir.

Son kod mərhələsində əvvəl qeyd olunan 43 tip xətası bağlandı, wallet transfer uçotu və legacy-flat yoxlaması sərtləşdirildi. Test sayı 40-a çatdı; detallı status remediation sənədində yenilənib.

## Şəxsi istifadə üçün offline qəbulun tamamlanması

48 test, tam lint (0 xəta/0 xəbərdarlıq), TypeScript, secretsiz production build və HTTP idarəetmə yoxlamaları keçdi. Cashflow conservation, SIGKILL/restart, backup/restore/migration və müstəqil watchdog/outbox sınaqlarının nəticələri [offline-acceptance.md](docs/offline-acceptance.md) faylında verilib. Real birja qəbulunu və gəlirlilik sübutunu əvəz etmir.

## İki hesab üçün cari hazırlıq

İki hesab limiti/admission, ayrı monitor və analiz icrası, açar üzrə müvəqqəti API bloklanması, hər hesabın health xəbərdarlığı və private onboarding tamamlandı. 54 test və ayrıca production build üzərində iki sessiyalı HTTP qəbul keçdi. Cari qurulma və real/demo test siyahısı: [two-account-readiness.md](docs/two-account-readiness.md). Real hesab bağlantısı, operator sirlərinin konfiqurasiyası və canlı qəbul bu offline mərhələdə edilməyib.

## Canlı hesab yoxlaması — 2026-10-05

VPS və Binance GET yoxlamaları tamamlandı. Kiçik order miqdarında `Unsupported precision` yaradan decimal-grid xətası düzəldildi, 58 test/lint/TypeScript keçdi və düzəliş VPS-də build/deploy edilərək healthy statusu təsdiqləndi. Cari 100 USDT balans və ayarlarla BTC/ETH minimum order məbləğinə çatmır; digər beş yoxlanmış simvol allocation üzrə minimum həddi keçir. Telegram-da köhnə ünvana aid uğursuz bildiriş ayrıca qeyd edildi, cari chat işləyir. Sübutlar, məhdudiyyətlər və qalan native order/stop qəbulu [live-readiness-2026-10-05.md](docs/live-readiness-2026-10-05.md) faylındadır.
