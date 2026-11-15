# MyDataFixer Pinterest pins

30 ready-to-post Pinterest pins (1000×1500 px, Pinterest's 2:3 size) that show how MyDataFixer works and send people to https://mydatafixer.com.

- `images/pin-01.png` … `pin-30.png` are the pins
- `pins.csv` holds the title, description, hashtags and link for each pin, in Pinterest's bulk-upload column format
- `pins.json` holds all the text on the pins. Edit it and re-run the renderer to change any pin.

## Pin mix
| Type | Pins |
|---|---|
| Before → After demos (duplicates, dates, names, phones, emails, numbers, countries, name split, missing values) | 03, 04, 05, 06, 10, 13, 16, 19, 23 |
| How it works / step-by-step | 02, 20, 28 |
| Checklists and lists | 07, 11, 14, 18, 25, 29 |
| Data tips | 15, 21, 26 |
| Pain-point hooks | 08, 17, 24 |
| Brand / call to action | 01, 09, 12, 22, 27, 30 |

## Posting
- **One at a time:** upload the image, then copy the title, description and link from `pins.csv`.
- **Bulk upload:** host the images somewhere public, replace `<upload-url>` in the `Media URL` column with that address, then upload the CSV under Pinterest Business → Create → Bulk create Pins.
- Post 1–3 pins a day rather than all 30 at once.

## Re-render
```
node render.js
```
Needs Node and Playwright with Chromium. The Inter and JetBrains Mono fonts make it look best.
