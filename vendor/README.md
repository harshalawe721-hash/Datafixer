# Vendored dependencies

## SheetJS Community Edition (status: not yet added)

DataFixer will read XLSX and XLS files with the **official** SheetJS Community Edition build (approved Stage 2 decision, Option A).

| | |
|---|---|
| Package | `xlsx` (SheetJS Community Edition) |
| Version | 0.20.3 is the newest patched release known at the time of writing. **Check <https://cdn.sheetjs.com/> for a newer release before downloading.** |
| Official source | `https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz` (SheetJS no longer publishes to npm; `xlsx@0.18.5` on npm has two unfixed high-severity advisories) |
| License | Apache License 2.0 (included in the package as `LICENSE`) |
| Not used | `@e965/xlsx` (third-party republish). Using it requires explicit approval. |

### Why it isn't here yet

The development environment's network policy blocks `cdn.sheetjs.com` and `git.sheetjs.com` (HTTP 403). The one-time permission request was declined, so the package couldn't be downloaded automatically.

### How to add it

Either allow `cdn.sheetjs.com` in the cloud environment's network settings and ask Claude to continue, or do it yourself on a computer with normal internet access:

```bash
# 1. Check https://cdn.sheetjs.com/ for the latest version, then:
VERSION=0.20.3
curl -fLO "https://cdn.sheetjs.com/xlsx-$VERSION/xlsx-$VERSION.tgz"

# 2. Record the checksum
sha256sum "xlsx-$VERSION.tgz"     # macOS: shasum -a 256 "xlsx-$VERSION.tgz"

# 3. Commit it to this folder on the development branch
mv "xlsx-$VERSION.tgz" vendor/
git add "vendor/xlsx-$VERSION.tgz"
git commit -m "Vendor official SheetJS $VERSION"
git push
```

Then share the checksum from step 2. The next step installs it with `npm install ./vendor/xlsx-<version>.tgz`, which pins the exact file in `package-lock.json` through its integrity hash. The checksum is also recorded in `vendor/CHECKSUMS.txt`.

### Verification

SheetJS does not publish signatures or official checksums. To verify the package, we will:

1. compare the SHA-256 of your download with a second, independent download (for example, from a different network) when one is available;
2. check that `package.json` inside the tarball says the expected version and Apache-2.0 license;
3. run `npm audit` and the engine's malformed-file test suite against it.
