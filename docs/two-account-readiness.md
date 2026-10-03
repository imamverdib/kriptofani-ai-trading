# İki hesab üçün offline hazırlıq

Tarix: 2026-10-03. Hədəf: sahib və dost üçün iki ayrıca tətbiq istifadəçisi və iki ayrı dedicated Binance hesabı. Real hesab açarları, real DB və canlı ticarət bu mərhələdə dəyişdirilməyib.

## Tamamlananlar

- `TRADING_USER_IDS` maksimum iki müsbət istifadəçi ID-si qəbul edir. Boş siyahı yeni girişləri və açar qeydiyyatını bağlayır. Siyahıdan çıxarılan hesabın mövcud managed mövqeləri yenə monitor olunur.
- Lokal hesab yaratma və dəvətlə qeydiyyat iki istifadəçi limiti ilə tranzaksiyada yoxlanır. Açıq qeydiyyat standart halda bağlıdır. Yeni hesablar paused yaradılır. Lokal CLI şəxsi hesabı active subscription ilə, dəvətli web qeydiyyatı isə admin aktivləşdirməsi tələb edən vəziyyətdə yaradır.
- Balans, risk ayarları, fill/PnL, tarixçə, job və bildirişlər session istifadəçisinə bağlıdır. Sorğuda başqa `user_id` göndərmək sahiblik vermir. Eyni birja UID-si iki istifadəçiyə bağlana bilmir.
- Hər hesabın ayrıca monitor və analiz işi var. Bir hesabın gözləyən sorğusu digərinin işini gözlətmir. Eyni hesab üçün paralel təkrar icra ownership kilidi ilə məhdudlaşdırılır.
- API autentifikasiya/transport xətasında müvəqqəti blok konkret açara aiddir. Birjanın ümumi IP rate limiti isə ortaq qalır.
- Hər hesab üçün son uğurlu monitor vaxtı saxlanır. 60 saniyədən köhnə monitor ayrıca incident yaradır; işlək ümumi worker heartbeat bunu gizlətmir. Xəbərdarlıqlar müstəqil watchdog/outbox vasitəsilə çatdırılır.

## Offline qəbul sübutu

| Yoxlama | Nəticə |
|---|---|
| `npm test` | 54 test keçdi; iki hesabın fərqli balans/risk ilə ölçüləndirilməsi, sahiblik və iş izolyasiyası daxil olmaqla. |
| Hesab A-nın birja sorğusunu cavabsız saxlamaq | B hesabının TP1 və TP2 çıxışları davam etdi; A-nın sonrakı xətası B-ni dondurmadı. Fake exchange sınağıdır. |
| Analiz növbələri | A RUNNING qaldıqda B COMPLETED oldu; B işi A-nı yenidən növbəyə atmadı. |
| `npm run test:two-accounts:http` | Ayrıca checkout/DB-də production build və iki JWT sessiyası ilə balans, PnL, tarixçə, job, ayarlar, pause, bildiriş, admin və admission sərhədləri keçdi. Birja sorğusu/orderi göndərilmir. |
| Statik yoxlamalar | Lint, TypeScript və diff format yoxlaması keçdi. |

Əvvəlki crash/restart, native stop, partial fill, reconciliation, backup/restore və migration sınaqları [offline-acceptance.md](offline-acceptance.md) sənədindədir. Bu nəticələr real birja qəbulunun və gəlirliliyin sübutu deyil.

## İki hesabın lokal qurulması

1. Mövcud deployment varsa əvvəlcə backup və [migration qaydalarını](audit-remediation.md) tətbiq edin. Mövcud encryption açarını dəyişməyin. `TRADING_ENABLED=false` və `TRADING_ACCOUNT_IS_DEDICATED=false` saxlayın.
2. `npm run accounts -- list` ilə mövcud istifadəçi ID-lərini görün. Uyğun iki hesab artıq varsa onları təkrar yaratmayın. Yeni, boş DB üçün aşağıdakı nümunəni **bash** terminalında işlədin; şifrə terminal tarixçəsinə komanda arqumenti kimi yazılmır:

```bash
read -s -r -p 'Owner password: ' ACCOUNT_PASSWORD
printf '%s' "$ACCOUNT_PASSWORD" | npm run accounts -- create owner --password-stdin --admin
unset ACCOUNT_PASSWORD
read -s -r -p 'Friend password: ' ACCOUNT_PASSWORD
printf '%s' "$ACCOUNT_PASSWORD" | npm run accounts -- create friend --password-stdin
unset ACCOUNT_PASSWORD
```

Şifrələr 12–128 simvol olmalıdır. `--admin` yalnız ilk hesab üçün qəbul edilir. Real şifrələri chat-a göndərməyin.

3. Çıxışda verilən faktiki ID-ləri `.env` daxilində `TRADING_USER_IDS=1,2` formatında yazın. `1,2` yalnız nümunədir. `REGISTRATION_SECRET` boş qalsın. JWT/encryption və istifadə edilən provider/Telegram sirlərini lokal konfiqurasiya edin. Env dəyişikliyindən sonra prosesləri yenidən başladın.
4. Hər istifadəçi öz sessiyasında öz dedicated birja hesabının açarlarını qeydiyyatdan keçirsin. Futures istifadə edilirsə həmin istifadəçinin Spot və Futures açarları eyni UID-yə aid olmalıdır; iki istifadəçinin UID-si fərqli olmalıdır. Açar qeydiyyatı signed birja sorğusu tələb etdiyi üçün bu addım offline sınaqdan sonrakı mərhələdir. Withdrawal icazəsini açmayın.
5. Hər hesabın riskini ayrıca təyin edin və şəxsi Telegram qoşulmasını ayrıca tamamlayın. `npm run accounts -- check` ilə admission, paused status, qeydiyyatlı marketlər və konfiqurasiya xülasəsini görün. Bu komanda canlı birja testi etmir; encryptionConfigured yalnız dəyişənin mövcudluğunu göstərir.
6. Uyğun demo/test mühitində ayrıca DB və açarlarla aşağıdakı qəbul ssenarilərini tamamlayın. Test orderləri üçün flag-lar yalnız həmin izolyasiya olunmuş mühitdə açılmalıdır. Production flag-ları bu kod mərhələsində açılmayıb.

## Real/demo mühitdə qalan qəbul

Hər iki hesabda ayrıca: UID/icazə yoxlaması; giriş və real fill/fee; native stop/OCO qəbulu və icrası; partial fill; TP1/TP2/TP3; timeout zamanı order reconciliation; worker restart; pause zamanı yeni girişin bloklanıb mövcud mövqenin qorunması; Telegram çatdırılması. Sonra eyni vaxtda iki hesab və birinin API icazəsi ləğv ediləndə digərinin davam etməsi yoxlanmalıdır. Backup bərpası yalnız ayrıca DB-də, yeni giriş bağlıykən birja ilə tutuşdurulmalıdır.

Real/demo hesab, sirlər və API icazələri operator tərəfindən təmin edilməlidir. Endpoint-in uyğunluğu və bütün tələb olunan UID/order API-lərini dəstəkləməsi canlı qəbul zamanı yoxlanmalıdır. Offline testdə istifadə olunan fake exchange demo birjanı əvəz etmir.

## Qalan məhdudiyyətlər

İki hesab eyni host, SQLite disk, internet, public market data/provider və IP limitlərini bölüşür. Host itkisi hər ikisinə təsir edə bilər; hostdan kənar monitor/backup deployment zamanı qurulmalıdır. Testlər gecikmə SLA-sı və ya iki hesabın eyni siqnalda bazar təsirinin sıfır olduğunu təsdiqləmir. Eyni hesabda manual trade, başqa bot və dəstəklənməyən cashflow reconciliation-u dondura bilər. 100 istifadəçi və multi-host production bu mərhələnin əhatəsində deyil.
