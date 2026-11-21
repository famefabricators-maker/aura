# Aura — logo w skrócie

**Idea:** litera A, której poprzeczką jest wyspa — wystaje poza nogi litery, tak jak wyspa Aury wysuwa się przy krawędzi ekranu. Inicjał i produkt w jednym znaku.

## Pliki

| Plik | Do czego |
|---|---|
| `aura-symbol-color-light.svg` / `-color-dark.svg` | Znak na jasnym / ciemnym tle (podstawowa wersja) |
| `aura-symbol-black.svg` / `-white.svg` | Jeden kolor: druk, grawer, naklejki, tła ze zdjęciem |
| `aura-symbol-small-black.svg` | **Tylko 16–32 px** — pełny daszek i szersze szczeliny |
| `aura-app-icon.svg` / `-small.svg` | Ikona aplikacji (ciemny kafelek); wersja `-small` do 16–32 px |
| `aura-logo-horizontal-*.svg` | Znak + napis obok siebie (README, strony, nagłówki) |
| `aura-logo-stacked-*.svg` | Znak nad napisem (kwadratowe miejsca, okładki) |
| `aura-wordmark-black.svg` | Sam napis „aura” |

W aplikacji: `icon.ico` (Windows, w środku osobne obrazki 16–256 px; do 32 px z wersji uproszczonej), `icon.png` (256 px), `build/icon.png` (1024 px, macOS), `trayTemplate.png` + `@2x` (pasek menu macOS, obrazek-szablon).

## Kolory

| Nazwa | HEX | RGB | Gdzie |
|---|---|---|---|
| Atrament | `#111114` | 17 17 20 | litera na jasnym tle, kafelek ikony |
| Papier | `#F5F5F7` | 245 245 247 | litera na ciemnym tle |
| Fiolet aury (jasne tło) | `#7C5CFA` | 124 92 250 | wyspa na jasnym tle |
| Lawenda aury (ciemne tło) | `#B49BFF` | 180 155 255 | wyspa na ciemnym tle |

Fiolet tylko na wyspie — to jedyny akcent. Litera zawsze neutralna. W jednym kolorze cały znak ma ten sam kolor.

## Zasady

- **Pole ochronne:** wokół znaku zostaw co najmniej grubość wyspy × 1,5 wolnego miejsca (wyspa = 30/256 wysokości znaku).
- **Najmniejszy rozmiar:** znak pełny od 40 px; poniżej używaj `aura-symbol-small-*` / `aura-app-icon-small`. Logo poziome od 90 px szerokości.
- **Napis:** krój Manrope (OFL), grubość 760, zamieniony na krzywe — nie przepisuj go zwykłą czcionką.

## Czego nie robić

- Nie zmieniaj koloru litery na fiolet ani wyspy na kolor litery w wersji kolorowej.
- Nie dodawaj cieni, poświat, gradientów ani obrysów.
- Nie rozciągaj, nie obracaj i nie przesuwaj wyspy względem litery.
- Nie zestawiaj z napisem w innym kroju ani w innych proporcjach niż w plikach `aura-logo-*`.
- Nie kładź wersji kolorowej na zdjęcia lub wzory — tam tylko czarna albo biała.

## Uwaga

Przed rejestracją znaku warto zrobić profesjonalne sprawdzenie w bazach znaków towarowych (np. EUIPO, UPRP) — tutaj tego nie sprawdzano.
