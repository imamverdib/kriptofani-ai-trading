# Canlı hesabın girişdən əvvəl yoxlanması — 2026-10-05

Bu yoxlama VPS-də işləyən konteynerdən Binance-in yalnız GET endpoint-ləri ilə və SQLite `OPEN_READONLY` bağlantısı ilə aparıldı. API açarları/şifrələr çıxışa yazılmadı. Diaqnostika order, transfer, margin/leverage dəyişikliyi və Telegram mesajı göndərmədi. Aktiv bot ayrıca işləməyə davam etdiyi üçün bu sənəd yalnız müşahidə anının vəziyyətidir.

## Təsdiqlənənlər

- Futures wallet və available balance: 100 USDT; tətbiqin equity snapshot-u bununla uyğundur.
- `canTrade=true`, One-way (`dualSidePosition=false`), multi-assets margin bağlıdır.
- Spot vasitəsilə yoxlanmış API restriction cavabı: reading və Futures icazəsi açıq, withdrawal bağlı, IP restriction açıq. Bu cavab gələcək orderin qəbul olunacağına zəmanət deyil.
- Birjada açıq Futures mövqe, adi open order və algo order sayı sıfır idi.
- Worker və hesab heartbeat-ləri yenidir; `frozen_reason=null`, son account monitor xətası yoxdur. Son backup timestamp-ı mövcuddur; həmin backup bu mərhələdə ayrıca bərpa edilməyib.
- Telegram hazırkı private chat üçün `getChat` uğurludur, verified identity mövcuddur; webhook qurulub, pending update yoxdur. Cari chat-a son bildirişlərin çatdırılması DB-də qeydə alınıb. Yeni test mesajı göndərilməyib.

## Tapıntılar və görülən iş

### Orta — kiçik miqdarın yuvarlaqlaşdırılması girişi bloklaya bilərdi

Real qiymət/balans ilə BTC allocation hesablaması `Unsupported precision` verdi. Səbəb `grid()` funksiyasının giriş ədədinin onluq hissəsi 18 rəqəmi keçəndə onu rədd etməsi idi; adi bölmə nəticəsi bu həddi keçə bilir. Bu, risk həddini aşan order yaratmırdı, amma düzgün ölçüləndirməni vaxtından əvvəl dayandırırdı.

`src/lib/trading-math.ts` daxilində onluq və elmi yazılış BigInt ilə dəqiq uyğunlaşdırılır; sabit 18-rəqəm məhdudiyyəti və `toFixed` çevirməsi çıxarılıb. Aşağı yuvarlaqlaşdırma saxlanır: minimumdan kiçik order minimuma süni qaldırılmır. `tests/decimal-grid.test.ts` kiçik kapital, uzun onluq nəticə, elmi yazılış və sərhəd hallarını yoxlayır. 58 test, lint və TypeScript keçdi.

### Orta — cari kapital/ayarlarla BTC və ETH minimum order həddinə çatmır

100 USDT sərbəst balans, 10% allocation, 2x leverage və faktiki 0.05% taker fee ilə allocation üzrə yuxarı notional sərhədi təxminən 19.96 USDT-dir. Birjanın həmin anda bildirdiyi minimumlar BTC üçün 50, ETH üçün 20 USDT-dir. Lot yuvarlaqlaşdırması bunu daha da azaldır; ETH sınağında təxminən 19.07 USDT alındı.

SOL, XRP, ZEC, SAND və NEAR üçün minimum 5 USDT idi və allocation üzrə yuxarı sərhəd minimumu keçirdi. Bu, onların mütləq icra oluna biləcəyi demək deyil: stop-risk hesabı, siqnal, spread və digər yoxlamalar yenə rədd edə bilər. Sadəcə order açılsın deyə kapital/risk/leverage ayarları artırılmadı. BTC/ETH üçün imtina hazırkı ayarlarda gözlənilən davranışdır.

### Aşağı — köhnə Telegram ünvanına qalmış bildiriş

Outbox ID 6 köhnə, hazırkı chat-dan fərqli ünvana göndərilir; 22 cəhd və `Telegram HTTP 400` qeydə alınmışdı. Son yeni bildirişlər hazırkı chat-a uğurla çatdırılıb. Köhnə qeyd silinmədi, delivered kimi saxtalaşdırılmadı və yeni ünvana səssiz yönləndirilmədi. Bu köhnə retry ayrıca təmizləmə mövzusudur; cari bildiriş çatdırılmasının uğursuzluğu kimi qiymətləndirilməməlidir.

### Açıq qəbul — Isolated və leverage keçidi

Yoxlama zamanı ETH/SOL isolated 1x, digər seçilmiş simvollar cross 5x idi; tətbiqdə seçilmiş leverage 2x-dir. Kod girişdən əvvəl margin/leverage-i dəyişir və nəticəni yenidən yoxlayir. Həmin mutasiya diaqnostikada çağırılmadı. Onun real qəbulu, giriş orderi, native stop/OCO, partial fill və çıxış orderləri hələ real icra sübutu tələb edir.

## Son siqnalların izahı və müşahidə məhdudiyyəti

Yoxlanan son dövrdə altı simvolun yekun qərarı WAIT, SOL isə LONG/confidence 25 idi. Minimum confidence 75 olduğundan SOL girişə uyğun deyildi. WAIT=0 nəticəsi təkbaşına xam model confidence-in sıfır olduğunu göstərmir: kod high-risk qərarını da WAIT/0-a çevirir. Xam provider cavabı və imtinanın ayrı səbəb kodu snapshot-da saxlanmadığı üçün keçmiş WAIT qərarlarının dəqiq model səbəbini bərpa etmək olmur. Təkrar provider sorğusu keçmiş qərarın sübutu sayılmaz və bu yoxlamada edilmədi.

## İlk real əməliyyatda qəbul

Order açılan kimi Binance-də faktiki fill miqdarı/qiyməti, isolated margin və 2x leverage, native qoruyucu stop-un statusu və miqdarı tətbiqin qeydləri ilə tutuşdurulmalıdır. Sonra TP/SL/partial fill və faktiki fee/PnL yoxlanmalıdır. Bunu mövqe bağlanana qədər təxirə salmaq olmaz. Bu söhbət davamlı xarici monitorinq xidməti yaratmır.

## Canlıya tətbiq və son yoxlama

Yeni Docker image VPS-də uğurla build edildi. Konteyner dəyişdirilməzdən əvvəl yalnız oxuma guard-ı açıq Futures mövqe/order, managed exposure və SUBMITTING/UNKNOWN intent olmadığını yoxladı. Sonra 2026-10-05 təxminən 05:47 Bakı vaxtı konteyner yeni image ilə yeniləndi. Əvvəlki source `/tmp/kripto-trading-math-before-readiness.ts` server faylında, əvvəlki image isə `sha256:84cbacd273473352768a92ecd1ec50fbf650d48a93da1eacae02367e6875bd16` olaraq saxlanıldı.

Yenilənmədən sonra `/api/health` HTTP 200 (`web=true`, `worker=true`), Docker statusu healthy oldu. Lokal və konteynerdəki math faylının SHA-256 heşi eynidir: `c7b7dc17c2def570d13817fa1dcf55e9a396fcc08e74e514c6bd85ca5b117369`. Təkrar canlı GET əsaslı ölçüləndirmə yoxlamasında BTC artıq exception vermədi, lot qaydasına uyğun sıfır miqdara yuvarlaqlandı. ETH təxminən 19.08 USDT ilə minimum 20-dən aşağı qaldı. Digər beş simvolun allocation yuxarı sərhədi 5 USDT minimumunu keçdi.

Confidence, allocation, risk və leverage konfiqurasiyası dəyişdirilmədi. Native order/stop icrası bu deployment ilə yoxlanmış sayılmır. Restart worker-in adi analiz dövrünü başladır; diaqnostika özü order göndərməyib.
