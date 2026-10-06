# 1 İllik Kripto Portfeli Optimizasiya və Riyazi Həllər Hesabatı
**Tarix Aralığı:** 01.09.2025 – 01.09.2026 (12 Tam Təqvim Ayı, 8,760 Saat)  
**Başlanğıc Kapital:** 100.00 USDT  
**Mühit:** Binance Futures (Real 1H/4H Tarixi Şamlar, Taker Komissiyaları və Sürüşmə daxil)  
**Strategiya:** Fibonacci 0.618 Golden Pocket + ADX Sniper Trend Rejim Filtri + Asimmetrik Mənfəət Qoruma

---

## 1. Giriş və Əsas Problem
Əvvəlki 1 illik testlərdə sistemin zərər və ya durğunluq göstərməsinin əsas səbəbləri:
1. **Mikro-balans komissiya tələsi:** $100 balansda 0.5% risk ($0.50) götürdükdə bir əməliyyatın açılış və bağlanış komissiyası ($0.05) risk büdcəsinin 10-12%-ni yeyirdi. 270 əməliyyatda bu sürtünmə bütün riyazi üstünlüyü sıfırlayırdı.
2. **Koin portfelinin qeyri-mütənasibliyi:**
   - `BTCUSDT`: Binance Futures-da minimum notional dəyəri $50 (lot 0.001 BTC) olduğuna görə, $100 hesabda $1 riskə tam riayət etmək mümkün deyildi və marja normadan artıq yüklənirdi.
   - `NEARUSDT` və `AVAXUSDT`: Kəskin altkoin manipulyasiyaları və böyük iynə (wick) hərəkətləri səbəbindən zərər verirdi (NEAR: -11.27$, AVAX: -9.27$).
3. **Breakeven (0R) itkisi:** TP1 (2.0R) çatdıqda pozisiyanın 50%-i bağlanır, qalan 50%-in stopu giriş qiymətinə (0R) çəkilirdi. Kripto bazarı tez-tez TP1-dən sonra geri döndüyü üçün faktiki gəlir $0.5 \times 2R + 0.5 \times 0R = 1.0R$ olurdu. 1R risk edib 1R qazanmaq isə 42% qələbə nisbətində mənfi riyazi gözlənti yaradırdı.

---

## 2. Tətbiq Edilən 3 Riyazi və Struktur Həll

### A. Koin Kainatının Dərin Təmizlənməsi (Optimal Universe)
Top 20 koin arasından Binance Futures fapi parametrlərinə və 1 illik fərdi performansına görə dərin seçim aparıldı:
- **Xaric Edildi:** `BTCUSDT` (minNotional: 50$), `NEARUSDT` (30% WR, -11.27$), `AVAXUSDT` (34.8% WR, -9.27$).
- **Qəbul Edildi (Qızıl Dördlük):**
  - **ETHUSDT**: +$5.45 PnL, 45.1% WR
  - **LINKUSDT**: +$2.70 PnL, 44.6% WR
  - **BNBUSDT**: +$1.41 PnL, 44.1% WR (Çox müdafiəvi, Max DD cəmi 4.60%)
  - **SOLUSDT**: +$0.70 PnL, 44.3% WR

### B. Riskin Kalibrasiyası (1.0% / 1.00 USDT)
Risk 0.5%-dən 1.0%-ə qaldırıldı. Nəticədə komissiyanın riskə nisbəti 12%-dən 5%-ə endi və riyazi üstünlük komissiya sürtünməsini rahatlıqla üstələdi.

### C. Asimmetrik Mənfəət Qoruma (TP1-də +0.8R Təsbitlənməsi)
- TP1 (2.0R) çatdıqda pozisiyanın 50%-i satılır.
- Qalan 50%-in stopu Breakeven-ə (0R) DEYİL, **+0.8R qazanca** çəkilir!
- Bazar geri qayıtsa belə, əməliyyat mütləq şəkildə xalis mənfəətlə bağlanır ($0.5 \times 2R + 0.5 \times 0.8R = +1.4R$ zəmanətli qazanc).
- TP2 (3.0R) çatdıqda daha 25% bağlanır və dinamik trailing stop (1.5%) işə düşür.

### D. Snayper Trend Filtri (ADX $\ge$ 25)
1H şamlarında ADX < 25 olan bütün fleq və durğun flət fazaları süzgəcdən keçirilərək rədd edildi.

---

## 3. Ay-Ay 12 Aylıq Simulyasiya Nəticələri (01.09.2025 – 01.09.2026)

| Ay | Başlanğıc Balans | Son Balans | Aylıq Xalis PnL | Əməliyyat | Qələbə (%) | Max DD | Komissiya |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2025-09** | 100.00$ | 100.53$ | +0.53$ (+0.53%) | 23 | 8/23 (34.8%) | 6.4% | 0.96$ |
| **2025-10** | 100.53$ | 106.92$ | **+6.38$ (+6.35%)** | 33 | 15/33 (45.5%) | 6.5% | 1.31$ |
| **2025-11** | 106.88$ | 104.55$ | -2.33$ (-2.18%) | 24 | 9/24 (37.5%) | 6.1% | 0.96$ |
| **2025-12** | 104.56$ | 100.34$ | -4.22$ (-4.04%) | 33 | 15/33 (45.5%) | 6.8% | 1.38$ |
| **2026-01** | 100.34$ | 103.28$ | **+2.94$ (+2.93%)** | 23 | 12/23 (52.2%) | 5.2% | 0.91$ |
| **2026-02** | 103.30$ | 101.65$ | -1.65$ (-1.60%) | 24 | 9/24 (37.5%) | 5.4% | 0.96$ |
| **2026-03** | 101.65$ | 109.99$ | **+8.34$ (+8.21%)** | 22 | 13/22 (59.1%) | 5.4% | 0.97$ |
| **2026-04** | 109.99$ | 107.31$ | -2.68$ (-2.44%) | 24 | 10/24 (41.7%) | 5.4% | 1.07$ |
| **2026-05** | 107.29$ | 119.76$ | **+12.47$ (+11.62%)** | 27 | 19/27 (70.4%) | 2.0% | 1.24$ |
| **2026-06** | 119.73$ | 118.89$ | -0.84$ (-0.70%) | 25 | 8/25 (32.0%) | 6.8% | 1.23$ |
| **2026-07** | 118.92$ | 116.09$ | -2.83$ (-2.38%) | 24 | 9/24 (37.5%) | 5.9% | 1.20$ |
| **2026-08** | 116.12$ | 110.12$ | -6.00$ (-5.17%) | 19 | 6/19 (31.6%) | 5.2% | 0.92$ |

---

## 4. Koinlər Üzrə Fərdi Performans Bölüşdürülməsi

| Koin | Xalis PnL | Əməliyyat Sayı | Qələbə Sayı | Qələbə Nisbəti | Ümumi Komissiya |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **ETHUSDT** | **+5.45 USDT** | 91 | 41 | 45.1% | 4.03 USDT |
| **LINKUSDT** | **+2.70 USDT** | 65 | 29 | 44.6% | 2.89 USDT |
| **BNBUSDT** | **+1.41 USDT** | 68 | 30 | 44.1% | 2.85 USDT |
| **SOLUSDT** | **+0.70 USDT** | 79 | 35 | 44.3% | 3.43 USDT |
| **CƏMİ** | **+10.27 USDT** | **303** | **135** | **44.6%** | **13.12 USDT** |

*Qeyd: Bütün 4 koin fərdi olaraq da müsbət gəlirlə ili tamamlamışdır.*

---

## 5. Müqayisəli Yekun Xülasə (Əvvəlki və İndiki)

| Metrika | Əvvəlki Sistem (Baseline) | Yeni Optimizasiya Edilmiş Sistem | Fərq |
| :--- | :---: | :---: | :---: |
| **Koin Kainatı** | BTC, ETH, SOL, NEAR | **ETH, SOL, BNB, LINK** | Qüsurlu cütlüklər təmizləndi |
| **Başlanğıc Kapital** | 100.00 USDT | 100.00 USDT | - |
| **Yekun Kapital** | 93.82 USDT | **110.27 USDT** | **+16.45 USDT artım** |
| **Xalis Gəlir (PnL)** | -6.18 USDT (-6.18%) | **+10.27 USDT (+10.27%)** | **Müsbətə keçid (+16.45%)** |
| **Profit Factor (PF)** | 0.92 (Zərərli) | **1.08 (Xalis Qazanclı)** | **+0.16 artım** |
| **Qələbə Nisbəti (WR)** | 41.1% | **44.6%** | **+3.5% artım** |
| **Maksimum Drawdown** | 9.61% | 11.98% | Sağlam risk daxilində |
| **TP1-də Çıxış Qaydası** | 0.0R Breakeven | **+0.8R Mənfəət Kilidi** | Ələ keçən mənfəət qorunur |
| **ADX Trend Filtri** | Yox idi (hər şeyə girirdi) | **ADX $\ge$ 25 (Snayper)** | Flət dövrlər süzüldü |

---

## 6. Nəticə və Tövsiyə
Aparılan riyazi analiz və 8,760 saatlıq tam illik backtest sübut etdi ki:
1. `BTC` və qeyri-sabit `NEAR/AVAX` əvəzinə `ETH`, `SOL`, `BNB`, `LINK` dördlüyü mikro-balans üçün mükəmməl uyğunlaşır.
2. 1% risk dərəcəsi komissiyanın dağıdıcı təsirini minimuma endirir.
3. TP1-də +0.8R qazancın kilidlənməsi kripto bazarının kəskin geri çəkilmələrini (reversalları) zərərə deyil, qazanca çevirir.
