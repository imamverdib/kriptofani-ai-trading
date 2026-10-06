# Çox-Kapitallı 1 İllik Real Portfel Simulyasiyası Hesabatı
**Tarix Aralığı:** 01.09.2025 – 01.09.2026 (12 Tam Təqvim Ayı / 8,760 Saat)  
**Kapital Səviyyələri:** $500, $1,000 və $10,000 USDT (Müqayisə üçün $100 baza daxil)  
**Mühit:** Binance Futures Real Tarixi Şamlar (Taker komissiyası 0.05%, Sürüşmə 0.05%)  
**Strategiya:** Fibonacci 0.618 Golden Pocket + ADX $\ge$ 25 Trend Filtri + TP1-də (+2.0R) 50% çıxış və +0.8R Mənfəət Kilidi

---

## 1. Giriş və Tədqiqatın Məqsədi
Bu testin məqsədi cari canlı sistemimizin parametr və qaydalarını heç bir güzəşt olmadan 1 illik tarixi kaset üzərində daha böyük kapital səviyyələri üçün yoxlamaqdır.
Əsas suallar:
1. $500, $1,000 və $10,000 balanslarda kapital artdıqca komissiya və lot dəqiqliyi necə dəyişir?
2. `BTCUSDT` əlavə olunduqda 5 koinli portfelin davranışı necə formalaşır?

---

## 2. Cari Canlı Sistemlə 5 Koinli Testin Nəticələri (BTC, ETH, SOL, BNB, LINK)
*Şərtlər: Max 2 paralel mövqe, 1% Dinamik Risk, 2x Leverage.*

### A. $500 USDT Başlanğıc Balans — Ay-Ay Cədvəl

| Ay | Başlanğıc Balans | Son Balans | Aylıq Xalis PnL | Əməliyyat | Qələbə (%) | Max DD | Komissiya |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2025-09** | 500.00$ | 505.18$ | +5.18$ (+1.04%) | 26 | 9/26 (34.6%) | 6.8% | 5.56$ |
| **2025-10** | 505.07$ | 528.57$ | **+23.50$ (+4.65%)** | 35 | 16/35 (45.7%) | 7.2% | 6.92$ |
| **2025-11** | 528.47$ | 508.53$ | -19.94$ (-3.77%) | 25 | 9/25 (36.0%) | 8.0% | 5.07$ |
| **2025-12** | 508.62$ | 487.60$ | -21.01$ (-4.13%) | 39 | 17/39 (43.6%) | 6.5% | 7.87$ |
| **2026-01** | 487.64$ | 487.75$ | +0.10$ (+0.02%) | 26 | 10/26 (38.5%) | 8.4% | 5.05$ |
| **2026-02** | 487.83$ | 492.42$ | +4.59$ (+0.94%) | 25 | 10/25 (40.0%) | 5.1% | 4.73$ |
| **2026-03** | 492.42$ | 527.99$ | **+35.57$ (+7.22%)** | 23 | 13/23 (56.5%) | 5.5% | 4.83$ |
| **2026-04** | 527.99$ | 511.33$ | -16.66$ (-3.16%) | 27 | 11/27 (40.7%) | 5.5% | 5.76$ |
| **2026-05** | 511.22$ | 559.47$ | **+48.25$ (+9.44%)** | 28 | 19/28 (67.9%) | 2.6% | 6.12$ |
| **2026-06** | 559.33$ | 545.86$ | -13.47$ (-2.41%) | 26 | 8/26 (30.8%) | 7.0% | 5.92$ |
| **2026-07** | 546.00$ | 528.28$ | -17.72$ (-3.25%) | 25 | 9/25 (36.0%) | 6.5% | 5.75$ |
| **2026-08** | 528.39$ | 499.76$ | -28.63$ (-5.42%) | 20 | 6/20 (30.0%) | 5.8% | 4.42$ |
| **YEKUN** | **500.00$** | **499.20$** | **-0.80$ (-0.16%)** | **327** | **138 (42.2%)** | **15.55%** | **68.43$** |

---

### B. $1,000 USDT Başlanğıc Balans — Ay-Ay Cədvəl

| Ay | Başlanğıc Balans | Son Balans | Aylıq Xalis PnL | Əməliyyat | Qələbə (%) | Max DD | Komissiya |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2025-09** | 1000.00$ | 1010.39$ | +10.39$ (+1.04%) | 26 | 9/26 (34.6%) | 6.8% | 11.14$ |
| **2025-10** | 1010.17$ | 1054.32$ | **+44.15$ (+4.37%)** | 35 | 16/35 (45.7%) | 7.6% | 14.27$ |
| **2025-11** | 1054.13$ | 1016.92$ | -37.21$ (-3.53%) | 25 | 9/25 (36.0%) | 7.8% | 10.38$ |
| **2025-12** | 1017.08$ | 979.42$ | -37.66$ (-3.70%) | 39 | 17/39 (43.6%) | 6.1% | 16.10$ |
| **2026-01** | 979.50$ | 976.49$ | -3.00$ (-0.31%) | 26 | 10/26 (38.5%) | 8.6% | 10.28$ |
| **2026-02** | 976.67$ | 984.89$ | +8.22$ (+0.84%) | 25 | 10/25 (40.0%) | 4.9% | 9.63$ |
| **2026-03** | 984.89$ | 1059.14$ | **+74.25$ (+7.54%)** | 23 | 13/23 (56.5%) | 5.5% | 9.91$ |
| **2026-04** | 1059.14$ | 1025.30$ | -33.84$ (-3.20%) | 27 | 11/27 (40.7%) | 5.5% | 11.71$ |
| **2026-05** | 1025.09$ | 1122.67$ | **+97.58$ (+9.52%)** | 28 | 19/28 (67.9%) | 2.6% | 12.36$ |
| **2026-06** | 1122.39$ | 1095.38$ | -27.01$ (-2.41%) | 26 | 8/26 (30.8%) | 7.1% | 12.03$ |
| **2026-07** | 1095.65$ | 1059.27$ | -36.38$ (-3.32%) | 25 | 9/25 (36.0%) | 6.6% | 11.61$ |
| **2026-08** | 1059.48$ | 1000.22$ | -59.27$ (-5.59%) | 20 | 6/20 (30.0%) | 5.9% | 9.05$ |
| **YEKUN** | **1,000.00$** | **999.11$** | **-0.89$ (-0.09%)** | **327** | **138 (42.2%)** | **15.16%** | **139.30$** |

---

### C. $10,000 USDT Başlanğıc Balans — Ay-Ay Cədvəl

| Ay | Başlanğıc Balans | Son Balans | Aylıq Xalis PnL | Əməliyyat | Qələbə (%) | Max DD | Komissiya |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2025-09** | 10000.00$ | 10103.84$ | +103.84$ (+1.04%) | 26 | 9/26 (34.6%) | 6.8% | 112.49$ |
| **2025-10** | 10101.36$ | 10539.73$ | **+438.38$ (+4.34%)** | 35 | 16/35 (45.7%) | 7.7% | 145.79$ |
| **2025-11** | 10537.75$ | 10198.61$ | -339.14$ (-3.22%) | 25 | 9/25 (36.0%) | 7.7% | 106.76$ |
| **2025-12** | 10200.53$ | 9831.87$ | -368.66$ (-3.61%) | 39 | 17/39 (43.6%) | 6.1% | 165.45$ |
| **2026-01** | 9832.48$ | 9794.59$ | -37.89$ (-0.39%) | 26 | 10/26 (38.5%) | 8.7% | 105.33$ |
| **2026-02** | 9796.52$ | 9849.75$ | +53.23$ (+0.54%) | 25 | 10/25 (40.0%) | 4.9% | 98.15$ |
| **2026-03** | 9849.75$ | 10621.83$ | **+772.08$ (+7.84%)** | 23 | 13/23 (56.5%) | 5.5% | 100.58$ |
| **2026-04** | 10621.83$ | 10276.00$ | -345.83$ (-3.26%) | 27 | 11/27 (40.7%) | 5.5% | 118.19$ |
| **2026-05** | 10273.92$ | 11261.01$ | **+987.09$ (+9.61%)** | 28 | 19/28 (67.9%) | 2.7% | 125.75$ |
| **2026-06** | 11258.18$ | 11000.27$ | -257.91$ (-2.29%) | 26 | 8/26 (30.8%) | 7.1% | 122.06$ |
| **2026-07** | 11003.04$ | 10627.45$ | -375.59$ (-3.41%) | 25 | 9/25 (36.0%) | 6.7% | 117.34$ |
| **2026-08** | 10629.59$ | 10029.96$ | -599.63$ (-5.64%) | 20 | 6/20 (30.0%) | 6.0% | 91.16$ |
| **YEKUN** | **10,000.00$** | **10,018.19$** | **+18.19$ (+0.18%)** | **327** | **138 (42.2%)** | **15.07%** | **1,417.72$** |

---

## 3. Koinlər Üzrə Performans Bölüşdürülməsi (5 Koin):
10,000$ balansda koinlərin performansı belə bölündü:
- **LINKUSDT:** **+220.83$ PnL** | 63 əməliyyat | 44.4% WR | Ən güclü performans
- **SOLUSDT:** **+22.77$ PnL** | 68 əməliyyat | 45.6% WR | Sabit müsbət
- **BTCUSDT:** **+3.95$ PnL** | 56 əməliyyat | 35.7% WR | Zəif qələbə nisbəti
- **ETHUSDT:** **-111.06$ PnL** | 81 əməliyyat | 42.0% WR
- **BNBUSDT:** **-118.31$ PnL** | 59 əməliyyat | 42.4% WR

---

## 4. DƏRİN RİYAZİ KƏŞF: "Slot Kannibalizasiyası" və BTC Təsiri

Niyə 4 koinli portfel (ETH, SOL, BNB, LINK) **+10.75% xalis qazanc** gətirdiyi halda, BTC əlavə olunanda 5 koinli portfel **0% (breakeven)** səviyyəsinə düşdü?

### Səbəb 1: BTC-nin Zəif Qələbə Faizi (35.7%)
2025–2026-cı illərdə 1H zaman intervalında Fibonacci 0.618 səviyyələrində BTC kəskin yalançı qırılmalar (fakeouts) edərək cəmi **35.7%** qələbə nisbəti göstərmişdir (56 əməliyyatdan yalnız 20 qələbə).

### Səbəb 2: "Slot Kannibalizasiyası" (Max 2 Mövqe Məhdudiyyəti)
Portfeldə eyni anda maksimum **2 açıq mövqe** limiti var. BTC 56 dəfə zəif ehtimallı (35.7% WR) əməliyyat açdıqda, həmin vaxt ərzində yüksək qələbə ehtimalına malik olan **ETH, LINK və ya BNB siqnallarının yerini zəbt etdi (cannibalization)**.
Nəticədə ən qazanclı siqnalların bir hissəsi "maksimum 2 mövqe doludur" səbəbi ilə bazara daxil ola bilmədi.

---

## 5. Müqayisəli Analiz: 4 Koinli "Qızıl Dördlük" və 5 Koinli Portfel

Aparılan əlavə kross-simulyasiya bu fərqi riyazi olaraq tam təsdiqlədi:

### A. 4 Koinli Kainat (ETH, SOL, BNB, LINK) — Max 2 Mövqe:
| Başlanğıc Balans | Yekun Balans | Xalis Gəlir (PnL) | Qələbə (%) | Profit Factor | Max Drawdown |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **100 USDT** | 110.07 USDT | **+10.07$ (+10.07%)** | 44.2% | **1.08** | 11.98% |
| **500 USDT** | 553.36 USDT | **+53.36$ (+10.67%)** | 44.2% | **1.08** | 12.06% |
| **1,000 USDT** | 1,107.48 USDT | **+107.48$ (+10.75%)** | 44.2% | **1.08** | 12.08% |
| **10,000 USDT** | **11,075.18 USDT** | **+1,075.18$ (+10.75%)** | 44.2% | **1.08** | **12.10%** |

*Nəticə:* 4 koinli portfeldə kapital böyüdükcə lot dəqiqliyi artır və sistem **+10.75% xalis qazanc** ilə sabit işləyir. $10,000 hesabda illik xalis qazanc **+$1,075.18 USDT**, Max Drawdown isə cəmi **12.10%** təşkil edir.

### B. 5 Koinli Portfel (BTC Daxil) — Əgər Mövqe Limiti 3-ə Qaldırılarsa:
BTC-nin digər koinləri sıxışdırmaması üçün mövqe limiti 3-ə qaldırıldıqda:
| Başlanğıc Balans | Yekun Balans | Xalis Gəlir (PnL) | Qələbə (%) | Profit Factor | Max Drawdown |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **500 USDT** | 538.54 USDT | +38.54$ (+7.71%) | 42.8% | 1.05 | 18.29% |
| **1,000 USDT** | 1,065.94 USDT | +65.94$ (+6.59%) | 42.8% | 1.04 | 18.48% |
| **10,000 USDT** | 10,627.13 USDT | +627.13$ (+6.27%) | 42.8% | 1.04 | 18.74% |

*Nəticə:* 5 koinlə portfel qazanca keçir (+6.3% – +7.7%), lakin BTC-nin gətirdiyi əlavə dalğalanma səbəbindən Max Drawdown 12%-dən **18.7%-ə** yüksəlir.

---

## 6. Yekun Strateji Tövsiyə
1. **Optimal Seçim:** Ən yüksək xalis gəlir (+10.75%) və ən aşağı risk (Max DD 12.1%) üçün **ETH, SOL, BNB, LINK** dördlüyü ilə davam etmək riyazi cəhətdən ən effektiv yoldur.
2. **BTC Daxil Ediləcəksə:** Eyni anda açıq mövqe sayı minimum 3 olmalıdır ki, BTC daha sərfəli altkoin siqnallarını bloklamasın. Lakin bu halda 18.7% drawdown-a hazır olmaq lazımdır.
