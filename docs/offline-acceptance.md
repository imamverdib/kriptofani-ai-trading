# Şəxsi istifadə — real hesabdan əvvəl tamamlanan yoxlamalar

Tarix: 2026-10-03. Bu mərhələ production hesabına qoşulmadan aparılıb. Birjaya real order və Telegram istifadəçisinə real mesaj göndərilməyib.

## Nəticə

| İş | Nəticə |
|---|---|
| Repository-wide lint | `npm run lint`: 0 xəta, 0 xəbərdarlıq. Əvvəlki 161 xəta/47 xəbərdarlıq bağlanıb; qaydalar söndürülməyib. |
| Statik yoxlama | `npm run typecheck`: keçdi. |
| Testlər | `npm test`: 48 keçdi, 0 uğursuz, 0 skipped. |
| Production build | Real `.env`, real DB, JWT/API/Telegram açarları olmayan ayrıca checkout-da Next.js webpack build keçdi; 58 route/page. JWT açarı build vaxtında tələb edilmir, autentifikasiya əməliyyatında minimum 32 simvol tələb edilir. |
| HTTP qəbul | Login; icazəsiz cron/jobs/Telegram rəddi; worker olmayan health; təkrar pause; paused manual-job rəddi; risk input validation/persistence; futures pause; admin izolyasiyası və dashboard yoxlamaları keçdi. |

## 1. Kod və idarəetmə

- UI və API/SQL məlumatlarına konkret tiplər verilib, error obyektləri daraldılıb; React effect və asılılıq xətaları düzəldilib.
- Futures UUID-si rəqəm kimi saxlanılmır. Qiymət/PnL yoxdursa UI sıfır gəlir uydurmur və null üzərində hesablamır.
- Risk/futures ayarları serverdə rədd ediləndə UI uğur göstərmir; səhv görünür və server vəziyyəti yenidən yüklənir.
- Pause API-si `{"active":false}` qəbul edir. Təkrar sorğu botu yenidən aktiv etmir. Köhnə boş-body toggle çağırışı 400 alır.
- İstifadəçinin admin tərəfindən arxivləşdirilməsi yeni girişləri dayandırır; mövqe, order, fill və sahiblik tarixçəsini silmir. Mövcud exposure monitorinqi saxlanır.
- Telegram balans sorğusu da timeout və rate-limit nəzarətli exchange client-dən keçir.

## 2. Pul hərəkətləri

Transfer tarixçəsi ilə yanaşı `capital_checkpoints` aktivlərin miqdarını saxlayır. Növbəti snapshot-a qədər gözlənilən dəyişiklik faktiki fill, komissiya, funding və qeydə alınmış cashflow-dan hesablanır. Qiymət dəyişməsi ilə asset vahidi dəyişikliyi qarışdırılmır.

İzahsız USDT/BTC və digər aktiv artımı/azalması qəbul edilmir; yoxlanmış checkpoint üzərinə yazılmır və yeni giriş baş tutmur. Beləliklə ayrıca endpoint-də görünməyən Earn/subaccount/manual əməliyyatı səssizcə trading gəliri sayılmır. Qeyri-USDT xarici cashflow hələ avtomatik qiymətləndirilmir: dəstəklənməyən hal bloklanır. Bu, bütün Binance məhsullarının dəstəkləndiyi demək deyil.

İlk checkpoint başlanğıc kapitalı müəyyən edir. Əvvəlki naməlum tarixçənin gəlirliliyini bərpa etmir. Hesab dedicated olmalıdır. Balans oxunuşu ilə paralel native fill/transfer baş verərsə sistem ehtiyatlı şəkildə reconciliation tələb edə bilər. Hədlər USDT üçün 0.01, digər aktivlər üçün 1e-8 vahiddir.

## 3. Prosesin dayanması və bərpası

Fake exchange vəziyyətini ayrıca disk faylında saxlayan subprocess sınağında:

1. Durable reservation və intent yazılır.
2. Fake exchange giriş orderini qəbul edir və fill-i saxlayır.
3. Cavab tətbiqə qayıtmamış worker `SIGKILL` ilə öldürülür.
4. Yeni proses eyni DB-ni açır; ölü prosesin singleton/account lock-larını bərpa edir.
5. Eyni client ID ilə order/fill tapılır, native stop yaradılır.
6. İkinci restart da yeni giriş yaratmır: cəmi bir ENTRY və bir STOP submission.

Supervisor üçün ayrıca fake-process sınağı worker-in çıxışından sonra yenidən başladıldığını, shutdown zamanı web/worker/watchdog proses qruplarına siqnal getdiyini təsdiqləyir. Supervisor qısa müddətdə maksimum üç restart edir; davamlı startup nasazlığı zamanı çıxır. Host səviyyəsində service/container restart siyasəti yenə deployment-in məsuliyyətidir.

## 4. Backup və migration

`VACUUM INTO` ilə ardıcıl snapshot yaradılır; committed WAL məlumatı daxil edilir. Snapshot 0600 permission alır, integrity/FK yoxlamasından keçir, mövcud destination üzərinə yazılmır.

```bash
npm run db:backup -- backup /path/kripto.db /path/new-backup.db
npm run db:backup -- verify /path/new-backup.db
npm run db:backup -- restore /path/new-backup.db /path/new-restored.db
```

Restore yalnız yeni fayla edilir. Tətbiqin istifadə etdiyi `DB_PATH` avtomatik dəyişmir. Bərpa olunmuş DB-ni işə salmazdan əvvəl bütün köhnə worker/watchdog proseslərini dayandırın və birja ilə reconciliation tamamlanana qədər yeni girişləri bağlı saxlayın. Backup-dan sonra birjada yaranmış orderlər köhnə snapshot-da olmaya bilər; backup order idempotency tarixçəsinin itirilməsini öz-özünə həll etmir.

Ayrı testdə legacy DB snapshot-u yeni sxemə iki dəfə keçirilib: confidence=91, allocation=3 dəyişməyib; legacy OPEN mövqe saxta CLOSED/fill-ə çevrilməyib.

Watchdog gündə bir verified backup yaradır: `BACKUP_DIR`, verilməzsə DB-nin yanındakı `backups/`. `/api/health` son backup vaxtını göstərir. Backup-lar avtomatik silinmir; disk istifadəsini izləmək və hostdan kənar surət saxlamaq lazımdır. Backup və encryption açarları ayrı təhlükəsiz saxlanmalıdır.

## 5. Watchdog və xəbərdarlıq

- `npm start` və `npm run dev` artıq web + worker + müstəqil watchdog işlədir.
- Watchdog 60 saniyədən köhnə/mövcud olmayan heartbeat üçün incident yaradır; eyni incident hər poll-da təkrarlanmır, recovery ayrıca qeyd edilir.
- Worker dayananda watchdog outbox-u çatdırmağa davam edə bilir. Yeni giriş yolu stale heartbeat ilə bağlanır; reconciliation/çıxış yolu açıq qalır.
- Telegram tokeni yoxdursa alert “delivered” olmur. HTTP 503/`ok:false` retry-yə keçir; `attempts`, `next_attempt`, `last_error` saxlanır. Testdə uğursuzluqdan sonra uğurlu retry təsdiqlənib. Çatdırılma at-least-once-dur: Telegram qəbulundan sonra DB commit-dən əvvəl crash dublikat mesaj yarada bilər.
- Supervisor startup grace-dən sonra health cavabı stale worker göstərərsə worker-i dayandırıb yenidən başlatmağa çalışır. Qoruma bununla real birjada təsdiqlənmiş sayılmır.

Bütün hostun, diskin və ya internetin sıradan çıxması zamanı eyni hostdakı watchdog xaricə mesaj göndərə bilməz. Hostdan kənar uptime monitorinqi ayrıca deployment işidir.

## Hələ real/demo mühit tələb edən qəbul

Binance-in real order/algo/OCO cavabları, hesab icazələri, real partial fill/slippage, native stop icrası və Telegram çatdırılması bu offline sınaqlarla təsdiqlənmir. Növbəti mərhələ uyğun demo/testnet hesabında qəbul sınağıdır. Strategiyanın gəlirliliyi ayrıca dataset və forward nəticə tələb edir. Bu sənəd “100% gəlirli” və ya “real kapital üçün risksiz” hökmü deyil.
