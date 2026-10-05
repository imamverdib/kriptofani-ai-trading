# Qərarların real məlumatla əks-faktual replay analizi

Məlumat sərhədi: **2026-10-04 23:01:03 – 2026-10-05 17:36:00 Bakı vaxtı**. 392 qeydə alınmış Futures qərarı, 10 simvol. Son qərar: 2026-10-05 17:30:14.

## Əsas nəticə

**Bu qısa dövrdə test edilmiş mexaniki alternativlər, əsas xərc fərziyyəsi altında, əməliyyat açmamaqdan daha zəif nəticə verdi.** Bununla yanaşı buraxılmış gəlirli ayrı-ayrı fürsətlər də var. Bu nəticə AI filtrinin düzgün kalibrasiya edildiyini və ya gələcəkdə üstün olacağını sübut etmir.

Botun yekun qərarlarından 389-u WAIT/0, biri WAIT/37, biri WAIT/43, biri LONG/25-dir. Minimum confidence 75 ilə heç biri girişə çevrilmir. Faktiki managed mövqe qeydi yoxdur.

## 100 USDT hesabı ilə xronoloji portfel sınağı

Əsas fərziyyə: hər tərəfdə 0,05% taker komissiyası + 0,05% mənfi qiymət sürüşməsi. Funding real tarixçədən. Maksimum saxlama 4 saat; nümunənin sonunda qalan mövqelər də xərclə bağlanır. Bu vaxt çıxışı canlı strategiyaya əlavə edilmiş müqayisə qaydasıdır.

| Siyasət | Əməliyyat | Son balans, USDT | Net nəticə, USDT | Maks. equity çəkilməsi |
|---|---:|---:|---:|---:|
| Qeydə alınmış qərarlar, confidence ≥75 | 0 | 100.0000 | +0.0000 | 0.000% |
| AI-siz 4 saatlıq trend istiqaməti | 19 | 98.7215 | -1.2785 | 1.461% |
| AI-siz trend + mövcud RSI filtri | 18 | 99.5294 | -0.4706 | 0.909% |
| Hər qərarda LONG namizədi | 12 | 99.6690 | -0.3310 | 2.201% |
| Hər qərarda SHORT namizədi | 18 | 98.8106 | -1.1894 | 1.933% |

Portfel bütün qərarları zaman sırası ilə emal edir: maksimum 3 açıq mövqe, eyni simvolda bir mövqe, 20% sərbəst vəsait ayırması, 2x leverage, 0,5% stop-risk büdcəsi, 2% ümumi rezerv risk, equity-dən böyük olmayan gross notional tətbiq edilir. Açılış komissiyası dərhal çıxılır, açıq mövqelər mark-price ilə qiymətləndirilir, gündəlik 2% zərər və 5% drawdown yeni girişləri dondurur. Gün UTC sərhədində dəyişir. Risk dondurulduqdan sonra avtomatik sıfırlanmır.

Eyni dəqiqədə yaranan namizədlər ilkin qərar vaxtı/ID sırası ilə seçilir. Sıra dəyişsə portfel dəyişə bilər. Açıq mövqelərin risk/notional rezervi tam bağlanana qədər saxlanır. Bu single-account modelidir; iki hesab və tarixi order-book icrası simulyasiya edilmir.

## Hər qərarın ayrıca nəticəsi

Aşağıdakı müqayisədə hər namizəd ayrıca 100 USDT hesabdan başlayır. Namizəd istiqaməti gələcəkdən seçilmir: snapshot-dakı 4 saatlıq trend götürülür. LONG və SHORT-un ayrı nəticələri CSV/HTML-də də var. Nəticələrin dollar cəmi real portfel qazancı deyil; eyni qiymət hərəkəti çox qərarda təkrarlanır.

| Baxış müddəti | İcra edilə bilən, tam müşahidəli namizəd | Gəlirli | Zərərli | Orta net USDT / namizəd |
|---|---:|---:|---:|---:|
| 15 dəqiqə | 312 | 60 | 252 | -0.071820 |
| 60 dəqiqə | 294 | 92 | 202 | -0.073312 |
| 240 dəqiqə | 222 | 71 | 151 | -0.099241 |

**Giriş etməmək üçün müqayisə nəticəsi 0 USDT-dir.** Gəlirli namizəd buraxılmış *hipotetik* fürsətdir; mənfi namizəd isə girməməklə qarşısı alınmış *hipotetik* zərərdir. Bunlar təkbaşına “model səhv/doğru qərar verib” etiketləri deyil.

## Tam müşahidə və rədd səbəbləri

- 15 dəqiqə: LOT_SIZE: 55; Structural stop exceeds volatility budget: 17; ENTRY_DRIFT: 1; CENSORED: 7.
- 60 dəqiqə: LOT_SIZE: 52; Structural stop exceeds volatility budget: 17; ENTRY_DRIFT: 1; CENSORED: 28.
- 240 dəqiqə: LOT_SIZE: 40; Structural stop exceeds volatility budget: 17; ENTRY_DRIFT: 1; CENSORED: 112.

`CENSORED`: qərardan sonra tam 15/60/240 dəqiqə hələ keçməyib; 0 qazanc kimi sayılmır. `LOT_SIZE`: miqdar birjanın minimum/addım qaydasına uyğun gəlmir. `Structural stop exceeds volatility budget`: ATR əsasında stop 2%-dən uzaqdır. `ENTRY_DRIFT`: növbəti dəqiqədəki giriş qiyməti son məlum şamdan 0,5%-dən çox uzaqlaşıb. `DATA_GAP` olsaydı namizəd ayrıca çıxarılardı.

## Nəticədən sonra seçilmiş izahlı nümunələr

Bunlar gələcək üçün seçim siqnalı deyil. Eyni simvolda yaxın vaxtlı nümunələr bir-birindən müstəqil deyil və portfeldə hamısı birlikdə açıla bilməz.

| Qərar vaxtı (Bakı) | Simvol | İstiqamət | Simulyasiya giriş qiyməti | İlkin stop | Net USDT | Çıxış |
|---|---|---|---:|---:|---:|---|
| 2026-10-05 05:15:12 | ZECUSDT | SHORT | 1349.59486500 | 1367.01000000 | +0.643987 | HORIZON_EXIT |
| 2026-10-05 05:30:12 | ZECUSDT | SHORT | 1348.71530500 | 1366.10000000 | +0.633611 | HORIZON_EXIT |
| 2026-10-05 06:15:10 | ZECUSDT | SHORT | 1351.60386000 | 1366.47000000 | +0.621640 | HORIZON_EXIT |
| 2026-10-05 05:45:15 | SANDUSDT | LONG | 0.07366681 | 0.07217000 | -0.425954 | STOP_OR_GAP |
| 2026-10-05 05:47:30 | SANDUSDT | LONG | 0.07360678 | 0.07211000 | -0.423306 | STOP_OR_GAP |
| 2026-10-05 06:15:12 | SANDUSDT | LONG | 0.07345671 | 0.07196000 | -0.422215 | STOP_OR_GAP |

## Xərclərə həssaslıq

Komissiya hər variantda hər tərəfə 0,05% qalır; yalnız sürüşmə dəyişir. Spread ayrıca əlavə edilmir, adverse slippage fərziyyəsinin tərkibindədir. Tarixi faktiki spread ölçülməyib.

| Siyasət | 0 sürüşmə | Hər tərəfə 0,05% | Hər tərəfə 0,10% |
|---|---:|---:|---:|
| Qeydə alınmış qərarlar, confidence ≥75 | +0.0000 USDT | +0.0000 USDT | +0.0000 USDT |
| AI-siz 4 saatlıq trend istiqaməti | -0.7254 USDT | -1.2785 USDT | -1.8382 USDT |
| AI-siz trend + mövcud RSI filtri | +0.0649 USDT | -0.4706 USDT | -1.0300 USDT |
| Hər qərarda LONG namizədi | -0.4517 USDT | -0.3310 USDT | -0.8069 USDT |
| Hər qərarda SHORT namizədi | -0.6362 USDT | -1.1894 USDT | -1.7237 USDT |

Trend+RSI variantının sıfır sürüşmədəki nəticəsi ilə sürüşmə daxil ediləndəki nəticəsinin fərqi vacibdir: zəif nominal üstünlük real icra xərcləri ilə itə bilər. Bu test bir slippage rəqəminin tarixi həqiqət olduğunu iddia etmir.

## Bərpa metodunun sərhədləri

1. **Gələcək məlumatsız stop/TP:** əvvəlki snapshot şamlarından ATR(14) × 1,5; stop minimum 0,5%, maksimum 2%; TP1/2/3 = 2R/3R/4R. 50%/25%/25% cumulative çıxış lot addımına yuvarlaqlaşdırılır. İlk TP-dən sonra local breakeven, ikinci TP-dən sonra 1,5% trailing; ilkin native stop saxlanır.
2. **Giriş vaxtı:** qərarın DB-yə yazılmasından sonrakı 1 dəqiqəlik şamın açılışı. Qərarın verildiyi şamın gələcək high/low-u giriş üçün istifadə edilmir. Canlı botun 15/30 saniyəlik siqnal ömrü və saniyəlik gecikməsi dəqiq bərpa edilmir; giriş gecikməsi 1–60 saniyədir.
3. **Mark və ticarət qiymətləri ayrıdır:** native stop mark-price high/low ilə, yerli TP/trailing 1 dəqiqəlik mark close ilə qiymətləndirilir. Canlı bot təxminən 5 saniyədə monitor edir; onun dəqiq trayektoriyası burada yoxdur. Stop fill-i trigger + şam açılışındakı contract/mark fərqi və adverse slippage ilə modelləşdirilir.
4. **Eyni şamda stop/TP:** stop əvvəl qəbul edilir, qeyri-müəyyənlik sayılır. Bu data kəsiyində simulyasiya edilmiş nümunələrdə belə hadisə qeydə alınmadı; bu, 1 dəqiqədən kiçik icra ardıcıllığının məlum olduğu demək deyil.
5. **Tarixi ayarlar:** istifadəçinin ayarları dəyişdiyindən bütün tarixçə hazırkı 20%/2x/0,5% qaydası ilə standartlaşdırılıb. İlk dövrlərin həqiqi ayarları və kapital hərəkətləri replay edilməyib. Başlanğıc hipotetik kapital 100 USDT-dir.
6. **Birja qaydaları:** exchangeInfo indiki snapshot-dır; həmin qaydaların bütün tarixi dövr ərzində dəyişmədiyi fərz edilir. Taker fee 0,05% kimi götürülüb; əvvəlki canlı yoxlamadan məlumdur, hər tarixi fill üçün ölçülməyib. Funding vaxtı, rate və markPrice ictimai tarixçədən götürülüb.
7. **İcra məhdudiyyətləri:** lot/minNotional, margin/risk/gross limitləri və əvvəlki dəqiqə həcminin 1%-i tətbiq edilir. Tarixi order-book dərinliyi, partial-fill gecikməsi, API outage, real native stop qəbulu, leverage bracket/liquidation icrası bərpa edilməyib. Full fill fərziyyəsi var.
8. **Məlumatın saxlanması:** orijinal snapshot-lar raw AI qərarını/isHighRisk səbəbini tam saxlamır. Ona görə model confidence həddini azaltmağın ayrıca təsirini bu testdən hesablamaq olmaz. Yeni model sorğusu ilə köhnə qərar uydurulmayıb.
9. **Vaxt çıxışı:** 15/60/240 dəqiqə sonunda qalan mövqe fərz edilən market orderlə bağlanır. Bu nəticəni “canlı bot mütləq həmin qədər qazanardı” kimi oxumaq olmaz. Portfeldə sample-end çıxışları da ayrıca etiketlənib.
10. **Statistika:** cəmi təxminən 18,5 saat, üst-üstə düşən və korrelyasiyalı namizədlər. Bunlar müstəqil 392 bazar sınağı deyil; qəti gəlirlilik, model kalibrasiyası və bütün rejimlər üçün nəticə çıxarmaq olmaz. Parametr optimizasiyası/holdout üstünlüyü iddia edilmir.

## Konkret növbəti addımlar

- Əməliyyat sayı artsın deyə confidence/risk hədlərini bu nəticəyə əsasən azaltmamaq.
- Yeni qərarlarda raw model action/confidence/risk score, yekun action, hər filtrin səbəbi və həmin andakı konfiqurasiya versiyasını saxlamaq. Bu analiz canlı kodu dəyişdirmir.
- Eyni replay qaydasını sabit saxlayaraq sonrakı, seçim üçün istifadə edilməmiş dövrdə təkrarlamaq; müxtəlif bazar rejimləri toplamaq.
- İlk real icrada fill/stop/fee-ni bu simulyasiya fərziyyələri ilə tutuşdurmaq.

## Fayllar və təkrarlanma

- [Bütün namizədlər — CSV](decisions.csv): hər qərar × 2 istiqamət × 3 müddət × 3 sürüşmə ssenarisi.
- [Tam nəticələr — JSON](results.json): xülasələr, portfel əməliyyatları və equity əyriləri.
- [İnteraktiv baxış](report.html): filtrli qərar cədvəli və portfel əyriləri.
- Lokal mənbələr: `reports/counterfactual-data/decisions.json`, `market.json`. Bunlar API açarları/şifrələr daşımır; yenə də şəxsi strategiya məlumatı olduqları üçün Git-dən çıxarılıb.

```bash
npm run replay:counterfactual -- reports/counterfactual-data/decisions.json reports/counterfactual-data/market.json reports/counterfactual-2026-10-05
npm test
```

Giriş fayllarının SHA-256 heşləri:

```
{
  "decisions": "5273cafafadedfde0e2847b72879b48ee851b95b3b28492b521b67ec4b4677fa",
  "market": "658768e43209e114b97d01986e4ad261b78011daf5eb52198dac49e503b06773"
}
```

Canlı botun ayarları və deployment-i dəyişdirilmədi. Birja orderi və Telegram mesajı göndərilmədi.

## Yoxlama nəticəsi

`npm run lint` və `npm run typecheck` keçdi; `npm test` 62 testi uğurla tamamladı. Yeni testlər gələcək şamın giriş üçün istifadə edilməməsini, mark-price stop-u, funding/fee uçotunu, natamam məlumatın ayrılmasını, portfel mövqe limitini və cash identity-ni yoxlayır. Hesabatın JavaScript sintaksisi, bütün qrup sayları və hər portfel üçün başlanğıc kapital + net cash = son equity uyğunluğu ayrıca yoxlandı. Bu offline yoxlamalar canlı icra zəmanəti deyil.

Ümumilikdə CSV-də 7 056 sətir var: 392 qərarın iki istiqamət, üç müddət və üç sürüşmə variantı. Bunlar 7 056 müstəqil müşahidə deyil. Yalnız botun əvvəldən qeydə aldığı simvollar qiymətləndirilib; seçilməmiş bazar fürsətləri bu hesabatda yoxdur.
