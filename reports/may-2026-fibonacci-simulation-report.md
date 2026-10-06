# May 2026 Kaset Replay və Tarixi Sınaq Hesabatı (Fibonacci Golden Pocket 1H)

**Tarix:** 2026-10-06  
**Dövr:** 2026-05-01 00:00:00 UTC – 2026-06-01 00:00:00 UTC (31 tam gün)  
**Məlumat Mənbəyi:** Binance Futures Real Klines (`fapi.binance.com`)  
**Metodologiya:** 1H Fibonacci Golden Pocket (0.618 - 0.705) + 4H Trend Filtri (SMA20/50) + 1:2/1:3 Asimmetrik R:R  
**Kapital və Risk Qaydaları:** Başlanğıc 100.00 USDT | 2x Leverec | 0.5% Risk Invariantı ($0.50) | 0.05% Komissiya + 0.05% Sürüşmə  

---

## 1. Ümumi Maliyyə Göstəriciləri

| Metrika | Dəyər | Şərh |
| :--- | :--- | :--- |
| **Başlanğıc Balans** | **100.00 USDT** | Real ticarət kapitalı |
| **Yekun Balans** | **106.49 USDT** | Xalis kapitallaşma |
| **Xalis Gəlir (Net PnL)** | **+6.49 USDT (+6.49%)** | **Müsbət xalis mənfəət zonası** |
| **Maksimal Çəkilmə (Max DD)** | **1.07%** | Ən pis anda cəmi $1.07 çəkilmə (Ultra-təhlükəsiz) |
| **Cəmi Əməliyyat Sayı** | **33 əməliyyat** | Orta hesabla gündə ~1 əməliyyat |
| **Qələbə Nisbəti (Win Rate)** | **54.5%** | 18 Qalib / 15 Kiçik Zərər |
| **Qazanc Faktoru (Profit Factor)**| **2.96** | İnstitusional meyarlara görə əla (> 2.0) |
| **Cəmi Komissiya Xərci** | **0.975 USDT** | Bütün ay üzrə 1 dollardan az komissiya (1H qənaəti) |

---

## 2. Koinlər üzrə İcraat Analizi

| Koin | Əməliyyat | Qələbə | Win Rate | Xalis PnL | Cəmi Komissiya |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SOLUSDT** | 19 | 12 | **63.2%** | **+3.90 USDT** | 0.529 USDT |
| **ETHUSDT** | 14 | 6 | **42.9%** | **+2.59 USDT** | 0.446 USDT |
| **BTCUSDT** | 0 | - | - | - | - |
| **CƏMİ** | **33** | **18** | **54.5%** | **+6.49 USDT** | **0.975 USDT** |

> **Qeyd: Niyə BTCUSDT üzrə əməliyyat açılmadı?**  
> May 2026-da BTC qiyməti $76,000 – $81,000 aralığında idi. Binance Futures-də BTC üçün minimum order ölçüsü `0.001 BTC` ($76 – $81 notional) təşkil edir. Bizim 0.5% ($0.50) sərt risk idarəetmə qaydamız 100 USDT balans üçün stop-loss məsafəsi 0.65%-dən böyük olan heç bir BTC mövqeyinə icazə vermir, çünki bu halda zərər $0.50-ni keçə bilərdi. Sistem riyazi olaraq hesabı qoruyaraq yalnız mikrosəviyyədə ölçülənən ETH və SOL-da ticarət etmişdir.

---

## 3. Çıxış Növlərinin Təsnifatı

* **HORIZON_EXPIRY / HORIZON_PROFIT (21 əməliyyat):** 16 saatlıq vaxt limiti dolduqda mövqelərin bağlanması (bunların əksəriyyəti ya mənfəətdə, ya da başa-baş bağlanmışdır).
* **STOP_LOSS (6 əməliyyat):** Sərt 0.5% risk həddi ilə çıxış (hər biri ~$0.50 zərər).
* **TRAILING_STOP (3 əməliyyat):** TP2-dən sonra qalan 25% payın dinamik izləyən stopla yüksək mənfəətlə bağlanması (hər biri +$0.82 – +$1.01 mənfəət).
* **TP3_GOLDEN_EXTENSION (1 əməliyyat):** -0.618 qızıl genişlənmə hədəfinə tam çataraq bağlanma (+$1.01 mənfəət).
* **TEST_END (2 əməliyyat):** Mayın son saatında açıq qalan mövqelərin bağlanması.

---

## 4. Xülasə və Əsas Nəticə

1. **Davamlı Müsbət Qazanc:** 
   - İyun 2026 sınağında **+0.62%** qazanc əldə edildikdən sonra, May 2026 kasetində də sistem **+6.49% xalis qazanc** və **2.96 Profit Factor** göstərdi.
2. **Komissiya Problemi 100% Həll Olundu:** 
   - Əvvəlki 15 dəqiqəlik sistemdə 1 ayda $15–$20 komissiya xərclənirdi və balans komissiyaya əriyirdi. 1H Fibonacci sistemi ilə bütün May ayı ərzində cəmi **0.97 USDT** komissiya ödənildi.
3. **Maksimal Təhlükəsizlik:** 
   - Maksimal çəkilmə cəmi **1.07%** oldu. Heç bir mərhələdə hesab kritik təhlükə ilə üzləşmədi.
