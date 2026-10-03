# Audit düzəlişləri — 2026-10-03

**Son status:** [offline-acceptance.md](offline-acceptance.md) — 48 test, tam lint (0 xəta/0 xəbərdarlıq), TypeScript, build və HTTP qəbul keçib. Aşağıdakı ilk mərhələ qeydlərindəki lint və offline backup/bərpa borcu son mərhələdə bağlanıb. Real/demo birja qəbul sınağı hələ aparılmayıb.

Bu sənəd `codex_analiz_comments.md` auditinə cavab olaraq edilmiş kod dəyişikliklərini və yoxlama sərhədini göstərir. Real API açarları ilə order göndərilməyib, production DB dəyişdirilməyib, canlı deployment edilməyib. Aşağıdakı nəticələr yerli kod, fake exchange və təcrid olunmuş build üzərindədir.

## Düzəliş reyestri

| Audit problemi | İcra olunmuş dəyişiklik | Sübut / məhdudiyyət |
|---|---|---|
| F01, PnL-də leverage təkrarı | PnL faktiki fill miqdarı və qiymətindən; leverage ikinci dəfə vurulmur. Komissiya çıxılır, futures funding ayrıca cəmlənir. | Fill/PnL testləri. Naməlum fee asset PnL-ni natamam işarələyir və yeni girişləri dondurur. |
| F02, TP1/TP2 stop itkisi | İlk birja stop-u saxlanır. Futures STOP_MARKET `closePosition=true`; TP/emergency MARKET `reduceOnly=true`. | TP2 və native stop fill testləri. Yerli BE/trailing yalnız worker işləyəndə; birjadakı stop ilkin səviyyədə qalır. |
| F03, yarış və təkrar satış | Hesab üzrə durable ownership, qısa SQLite transaction, atomik reservation və job dedupe. | Eyni vaxtda iki monitor, mövqe slotu və manual job testləri. |
| F04, cavabı itmiş order | POST-dan əvvəl deterministik client ID və intent. UNKNOWN zamanı həmin ID sorğulanır; kor-koranə təkrar POST yoxdur. Fill import idempotentdir. | POST qəbulundan sonra cavab itkisi, fill-read xətası, restart üçün stale intent və partial fill testləri. |
| F05, emergency əks mövqe | Yalnız botun uyğunlaşdırılmış qalıq miqdarı və reduce-only çıxışı. | İmzalanmış adapter sorğusu, qoruma rəddi və liquidation buffer testləri. |
| F06, spot komissiyası və gap | Base-asset fee qalıqdan çıxılır, OCO miqdarı grid üzrə aşağı yuvarlaqlaşdırılır, market stop leg istifadə olunur. | Base fee və modern OCO adapter testləri. Gap qiymət təminatı vermir. |
| F07, stale position/capital limit | OPENING rezervi də limitə daxildir; eyni symbol spot/futures üzrə təkrar rezerv edilmir; portfel stress riski ≤2%, gross notional ≤equity. | Concurrent slot və 100 tenant reservation testləri. |
| F08, margin/likvidasiya | One-way, isolated margin, leverage 1–5, bracket yoxlaması; fill-dən sonra faktiki liquidation qiyməti ilə stop arasında ≥2% entry-price buffer. | Adapter/test stub yoxlamaları; real hesabda təsdiq edilməyib. |
| F09, drawdown | Cashflow-adjusted high-water; 5% drawdown və 2% gündəlik equity itkisi yeni girişləri dondurur. Pause/expiry qorumanı dayandırmır. | Deposit/withdraw risk testləri. Bunlar maksimum mümkün zərərə zəmanət deyil; stop/gap və API kəsilməsi limitdən artıq itki yarada bilər. |
| F10, fail-open səlahiyyət | Cron/Telegram secret tələb edir; Telegram private chat tokenlə user-ə bağlanır; payment admin user-ID allowlist ilə. | Secret/AAD testləri və HTTP 401 yoxlamaları. |
| Risk/allocation qarışıqlığı | `maxRiskPct` kapital/margin ayırmasıdır (0–20%). `riskPerTradePct` stop+fee+slippage itkisi büdcəsidir (0–2%, default 0.25%). Hər ikisi UI/API-də ayrılıb. | Ölçü və input testləri. 0 yeni girişləri dayandırır. |
| Xərc/liquidity/model | Hesaba aid taker rate, orderbook spread/impact həddi, son bağlanmış dəqiqənin həcmindən ümumi symbol rezervi ≤1%; bağlanmış candles, qərar TTL və entry drift yoxlaması. | Riyazi və adapter testləri. Həcm limiti bazar təsirini sıfırlamır. |
| Worker lifecycle | Davamlı ayrıca worker, durable jobs/outbox, singleton, heartbeat, Unix process-group shutdown. Route-lar yalnız işi növbəyə əlavə edir. | HTTP smoke və job testləri. Telegram çatdırılması canlı yoxlanmayıb. |
| Tenant izolyasiyası | İmzalanmış account UID, UID/key fingerprint unique, composite tenant FK, tenant AAD-li AES-GCM, eyni istifadəçinin spot/futures UID-si eyni olmalıdır. | Tenant FK, account UID və encryption testləri. |
| Deployment/migration | `.dockerignore` env/key/DB excludes; FULL synchronous və migration error visibility; köhnə confidence-ni səssiz azaltma çıxarılıb. | Build və DB testləri. Production backup/restore sınağı aparılmayıb. |

## Strategiya davranışı dəyişib

Yeni `risk-v2` yolu bağlanmış şamlar, 4h SMA trendi, RSI və modelin istiqamət təklifi əsasında işləyir. Model order miqdarı və stop qiyməti təyin etmir. Əvvəlki mühərrikdəki bütün heuristikalar eyni şəkildə saxlanılmayıb. Köhnə performansı bu versiyaya aid etmək olmaz. Confidence gəlir ehtimalı deyil; provider nasazlığında avtomatik başqa modelə keçilmir.

Spot OCO TP1-də qorunan bütün miqdarı bağlaya bilər. Futures-də TP1/TP2/TP3 kumulyativ hədəfləri 50%/75%/100%-dir. Qalıq grid, qismən fill və komissiyaya görə dəyişir. BE/trailing ilkin native stop-u silmir. Worker dayananda qalan mövqe ilkin stop-a qədər qazancı geri verə bilər.

## Dəstəklənən əməliyyat çərçivəsi

- Bir host, lokal diskdə SQLite, bir trading worker. NFS/shared-volume multi-host işə salmaq olmaz. PID ownership başqa hosta və ya canlı prosesə TTL ilə ötürülmür. Host dəyişdikdə lock-un əl ilə təmizlənməsi yalnız əvvəlki worker-in dayandığı təsdiqləndikdən sonra mümkündür.
- Hər istifadəçiyə ayrıca, yalnız bu bot üçün Binance hesabı/subaccount; eyni hesabı iki tenant istifadə edə bilməz. Manual order, başqa bot, hedge mode, multi-assets margin və unmanaged futures exposure dəstəklənmir.
- Futures üçün eyni UID-nin Spot API-si də qeydiyyatda olmalıdır: equity hər iki wallet-i əhatə edir. Earn, options, margin, başqa subaccount transferləri bu modeldə yoxdur. Bot işləyərkən həmin məhsullara transfer edilməməlidir. Universal transfer tarixçəsində Spot/USDT-M sərhədini keçən USDT köçürmələri artıq ayrıca cashflow kimi uçota alınır; eyni UID-nin qeydiyyatlı Spot↔USDT-M köçürməsi net sıfırdır. Earn və subaccount tarixçələri bu endpoint ilə tam əhatə edilmir; həmin məhsullar hələ də dəstəklənmir.
- Depozit/withdraw tarixçəsində yalnız USDT avtomatik qiymətləndirilir. Withdrawal network fee ehtiyatlı şəkildə equity xərci olaraq qalır. Qeyri-USDT cashflow yeni girişi dondurur; tarixçənin 89 gündən çox boşluğu ayrıca backfill tələb edir.
- `TRADING_ENABLED=false` yalnız yeni girişləri kəsir. Mövcud yeni-format mövqelərin monitorinqi və riskdən çıxışı davam edir. `npm run dev` də worker başladır; real DB ilə onu açmaq mövcud mövqelərdə icra yarada bilər.
- Köhnə `futures_positions` OPEN qeydləri yeni engine tərəfindən avtomatik sahiblənilmir və qorunmur. Yeni girişlər bloklanır. Köhnə real exposure və orderlər əvvəlcə birjada yoxlanmalıdır; bu migrasiyanı açıq real mövqelər üstündə kor-koranə işə salmaq olmaz.

## Təhlükəsiz keçid ardıcıllığı

1. Köhnə worker və xarici cron icralarını dayandırın. Mövcud exposure/native stop-ları birjada yoxlayın. Fayl surəti zamanı SQLite writer saxlayın və ya SQLite online backup API istifadə edin; tək `.db` faylının canlı WAL-dan ayrı surəti etibarlı backup deyil. Bərpanı ayrıca qovluqda yoxlayın.
2. Yeni `.env.example` parametrlərini mövcud env ilə birləşdirin; açarları silməyin və yeni encryption key ilə köhnə DB-ni açmağa çalışmayın. Yeni key versiyası üçün `ENCRYPTION_KEY_VERSION` və köhnə `ENCRYPTION_KEY_Vn` saxlanılır. Mövcud autentifikasiya olunmuş legacy ciphertext oxunur, plaintext qəbul edilmir.
3. Default `TRADING_ENABLED=false`, `TRADING_ACCOUNT_IS_DEDICATED=false` saxlayın. Settings-də API açarlarını yenidən qeydiyyatdan keçirərək signed UID-ni təsdiqləyin. Futures üçün Spot wallet də eyni UID ilə qeydiyyatda olsun.
4. `npm run trading:review -- USER_ID inspect` vəziyyəti göstərir. Komanda real hesabı yalnız oxuyur, order yaratmır/silmir. `archive-flat-legacy` yalnız flat exchange, boş managed exposure, boş pending intent və boş order siyahısı zamanı köhnə OPEN qeydləri `LEGACY_UNVERIFIED` edir; gəlir uydurmur.
5. Qeyri-USDT komissiya varsa `npm run trading:review -- USER_ID value-fees` fill vaxtından əvvəlki public aggTrade əsasında tarixi USDT qiymətləndirməsi yazır. Bu, real USDT debit deyil; source trade ID saxlanır. Naməlum asset/stale tarixçə rədd edilir.
6. `reset-risk-when-flat` yalnız mövqe, legacy OPEN, UNKNOWN order, naməlum fee və birja open orderləri qalmadıqda operator freeze-ni açır. High-water və tarixçəni sıfırlamır; drawdown davam edirsə növbəti snapshot yenidən donduracaq. UNKNOWN intent üçün order statusunu uyduran avtomatik admin bypass yoxdur.
7. `npm test`, `npm run typecheck`, `npm run build -- --webpack` işlədin. `npm start` web (3005) və worker başladır. `/api/health` worker heartbeat <60 saniyə olduqda 200 verir. Bu health cavabı birja order qorumasının sübutu deyil.
8. Uyğun demo/testnet hesabında entry, partial fill, native stop, response timeout və restart qəbul sınağını tamamlayın. Yalnız nəticələr təsdiqləndikdən sonra dedicated-account flag və trading flag açılmalıdır. Bu işdə həmin canlı/demo sınaq və aktivləşdirmə edilməyib.

## Qazanclılıq yoxlaması

`npm run replay -- input.json output.json` artıq qeydə alınmış siqnallar üçün offline OHLC replay-dir. Siqnalın məlum olduğu şamda giriş etmir; növbəti bar, hər iki tərəf fee, slippage, funding və stop-first intrabar qeyri-müəyyənliyini modelləşdirir. Məlumat formatı `src/lib/replay.ts` və nümunələr `tests/replay.test.ts` daxilindədir. Portfolio drawdown-u hesablamır: üst-üstə düşən trade sample-larından saxta equity curve yaratmamaq üçün `portfolioDrawdown:null` yazılır.

Tarixi point-in-time siqnal dataset-i, walk-forward split, untouched holdout, regime breakdown, confidence calibration, selection/survivorship bias yoxlaması və forward paper nəticəsi təqdim edilməyib. Alətin mövcudluğu strategiyanın gəlirli olduğunun sübutu deyil. Bu empirik işlər real data tələb edir və tamamlanmış sayılmır.

## Yoxlama nəticəsi

- 40 test keçdi: execution faults, partial fill, risk/decimal arithmetic, tenant ownership, crypto context, job dedupe, native stop, actual liquidation buffer və replay.
- Əvvəlki mərhələdə 100 tenant üçün lokal SQLite reservation sınağı təxminən 0.5 saniyə çəkdi. Bu 100 istifadəçinin birjada real-time icrasının benchmark-ı deyil.
- TypeScript yoxlaması və Next.js 16.2.6 webpack production build keçdi; 58 route/page yaradıldı. Build real `.env` və DB-siz ayrıca müvəqqəti checkout-da edildi.
- Təcrid olunmuş HTTP smoke: `/login` 200; secret/session olmadan cron, futures monitor, Telegram webhook və jobs 401; worker olmadan health 503.
- Əvvəl qeyd olunan 43 `no-explicit-any` xətası bağlandı. Exchange DTO-ları, fill/risk/config/job SQL row tipləri və `unknown` default-ları əlavə edildi; execution, store, service, exchange client, wallet-flows, legacy-review, reporting, jobs, outbox və review script üzrə seçilmiş lint yoxlaması keçir. Tam `npm run lint` hələ keçmir: digər modullar və testlər daxil olmaqla 161 xəta, 47 xəbərdarlıq qalır. Seçilmiş yoxlamanın keçməsi repository-wide lint-in keçməsi demək deyil.
- Birjada real order, real Telegram çatdırılması, real production DB migration/restore və uzunmüddətli worker outage sınağı edilməyib.

## 100+ istifadəçiyə açılmamışdan əvvəl qalan iş

SQLite single-host izolyasiyası multi-host scale arxitekturasının əvəzi deyil. PostgreSQL, distributed ownership/fencing, shared IP/UID rate budgets, tenant fairness/load SLA, reconciliation gecikməsi ölçüləri, user-data streams və monitor backlog alert-ləri ayrıca mərhələdir. Hazırkı worker iki admission hesabını müstəqil monitor/analiz işləri ilə icra edir; 100+ hesab üçün 5 saniyəlik dövr zəmanəti yoxdur. Public data cache və həcm rezervi order sıxlığını azaldır, internal market competition-u ləğv etmir.

Bağlanmış kod risklərini, layihənin digər modullarındakı statik tip borcunu, dəstəklənməyən hesab topologiyalarını və empirik gəlirlilik yoxlamasını eyni “tam hazır” statusuna salmaq düzgün deyil. Şəxsi istifadə üçün daha təhlükəsiz icra bazası yaradılıb; kənar istifadəçilərə production açılışı ayrıca qəbul sübutu tələb edir.

## Son kod tamamlama mərhələsi

- Birja və SQL sərhədlərində açıq `any` əvəzinə konkret DTO/row tipləri; generic SQL-nin default-u `unknown` oldu. Lazımi LOT_SIZE/PRICE_FILTER olmadıqda giriş dayanır.
- Universal-transfer tarixçəsi paginasiya ilə oxunur. Natamam səhifə, naməlum istiqamət, pending status və USDT olmayan xarici transfer yeni riski bloklayır; mövcud native stop qoruması saxlanır. Mənbə: [Binance Wallet transfer API](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/asset). Endpoint yalnız GET ilə istifadə olunur, vəsait köçürülmür.
- Legacy arxivləşdirmə API açarı olmadığı üçün hesabı səhvən flat saymır; canlı exposure, adi/algo/spot open order və UNKNOWN intent olduqda bloklanır. Köhnə açıq mövqeyə saxta giriş fill-i yazılmır.
- Risk baseline yaradıldıqdan sonra istifadəçinin exchange UID-si dəyişdirilə bilmir; əks halda köhnə cashflow/high-water yeni hesabın kapitalı ilə qarışardı. Eyni UID-nin key rotasiyası saxlanır.
- Əlavə 7 testlə cəmi 40 test keçdi; TypeScript və seçilmiş lint yoxlamaları keçdi.

## Cari status: iki hesab üçün offline qəbul

Yuxarıdakı 40-test və lint borcu nəticələri əvvəlki mərhələnin tarixçəsidir. Cari vəziyyət: 54 test, tam lint və TypeScript keçir; ayrıca production build ilə iki sessiyalı HTTP qəbul sınağı keçir. Admission maksimum iki hesaba məhdudlaşdırılıb, müstəqil monitor/analiz işləri və per-account health əlavə edilib. Qurulma addımları, sınaq sübutu və qalan real/demo qəbul [two-account-readiness.md](two-account-readiness.md) sənədindədir.
