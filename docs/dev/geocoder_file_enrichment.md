# Geocoder file enrichment

The API can enrich an uploaded CSV, XLS, or XLSX dataset with Census block-group
fields. Upload using `POST /upload` with a multipart `file`, then use the returned
`sessionId` and `tempPath`. All new file responses use `success`.

## Enrich an uploaded file

```http
POST /geocode-file?path=<URL-encoded-upload-tempPath>
Content-Type: application/json

{
  "sessionId": "<upload session UUID>",
  "addressField": "mailing_address",
  "fields": ["latitude", "longitude", "blockGeoid"],
  "join": "left",
  "hasHeaders": true,
  "sheet": "Applicants"
}
```

`addressField` accepts a stable column ID (`field1`, `field2`, ...) or a unique
header label. IDs take precedence over labels. With no selection, detection
samples the first 20 data rows in each column. Exactly one candidate proceeds;
zero or multiple candidates return 422 with `NO_ADDRESS_FIELDS` or
`AMBIGUOUS_ADDRESS_FIELDS` and candidate **IDs**. Select an ID explicitly if
headers repeat or detection misses an address beyond its sample.

`fields` defaults to all eight fields: `matchedAddress`, `latitude`, `longitude`,
`blockGeoid`, `state`, `county`, `tract`, `blkgrp`. Empty arrays, duplicates,
unknown names, non-arrays, and explicit null are rejected. Coordinates are
numbers in Excel. Census geographic identifiers remain strings, including
leading zeroes; `state` is a Census code. An address match without block-group
data counts as unmatched.

`join` defaults to `left`: output has one row for every input row in the same
order. `inner` keeps only matched rows in their original order, including
repeated rows. Blank, invalid, and unmatched addresses receive empty appended
cells for a left join. Format validation never applies suggested corrections.
Only exact, valid address strings are cached, within one request. A duplicate
valid address calls Census once; standardized Census addresses never serve as
join keys.

`hasHeaders` defaults to true. Set it to false to preserve the first data row of
headerless input; column labels are generated as `field1`, `field2`, etc.
`sheet` defaults to the first worksheet. Unknown sheets return 422 and CSV
rejects any sheet option. UTF-8 CSV is parsed as text, preserving leading zeroes,
Unicode, quoted commas, embedded newlines, and blank row positions. A dataset
with columns but no data rows is supported with explicit address selection;
files with no columns are rejected.

A successful response is 201:

```json
{
  "success": true,
  "sessionId": "<UUID>",
  "filename": "data_geocoded_<UUID>.csv",
  "tempPath": "<server session path>",
  "format": "csv",
  "addressField": "field2",
  "columnMapping": [
    { "id": "field1", "source": "id", "output": "id" },
    { "id": "field2", "source": "mailing_address", "output": "mailing_address" },
    { "id": "geocode_latitude", "source": "geocode_latitude", "output": "geocode_latitude" }
  ],
  "geocodeMapping": [
    { "field": "latitude", "id": "geocode_latitude", "output": "geocode_latitude" }
  ],
  "counts": { "input": 3, "output": 3, "matched": 1, "invalidOrBlank": 1, "unmatched": 1 }
}
```

The example mapping is abbreviated. `columnMapping` includes every column;
`geocodeMapping` maps each requested canonical field to its appended column.
Appended labels use `geocode_`; collisions receive deterministic suffixes.
Blank and duplicate source header positions are preserved with stable IDs and
unique output labels. Mappings include any CSV header escaping. Source columns
are never replaced. Automatic naming-style matching is deferred.

## Save a dataset directly

```http
POST /dataset-file
Content-Type: application/json

{
  "sessionId": "<UUID>",
  "filename": "applicants.xlsx",
  "format": "xlsx",
  "dataset": {
    "columns": [{ "id": "student_id", "label": "student_id" }],
    "rows": [["00001"], [null]]
  }
}
```

This endpoint calls the same `saveDataset` utility as enrichment. Column IDs
must be unique nonempty strings. Rows must have exactly one scalar cell per
column: string, finite number, boolean, or null. The HTTP interface accepts dates
as strings; the internal reader/writer also supports Excel date cells. Filename
must be a safe leaf name with an extension matching `format`. A UUID suffix is
added to each saved filename, so repeated requests cannot overwrite input or
other outputs. Response 201 includes `success`, session/path/format information,
and `columnMapping`. No geocoding occurs.

## Export and formula policy

Exports contain values from one selected sheet, with headers. They do not retain
formatting, other sheets, macros, or formulas. Formulas are never evaluated;
existing cached values are exported, or an empty cell if there is no cached
value. Excel numbers, strings, booleans, and dates are supported. Excel errors
have no guaranteed representation in this values-only dataset contract.

XLS/XLSX strings are written as text cells without formula metadata. CSV has no
text-cell type: string cells and header labels starting with `=`, `+`, `-`, or
`@` after whitespace, or starting with tab/CR/LF, are prefixed with an apostrophe
and quoted. Numeric values are not changed. This deliberately affects round
trips for those strings; consumers must not silently remove the protective
apostrophe before opening an export in spreadsheet software. Every CSV cell is
quoted. Ordinary identifiers such as `00123` keep their original text in the
file; a spreadsheet application's own automatic inference is outside the CSV
format. Nulls serialize as empty cells.

XLS exports preserve cell values and headers up to 4,110 UTF-16 code units. A
longer XLS string returns HTTP 413 with code `XLS_TEXT_TOO_LARGE`. The configured
32,767-character limit still applies to dataset validation, CSV, and XLSX.

The shared spreadsheet dependency is SheetJS CE 0.20.3 from its
[official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
under [Apache 2.0](https://docs.sheetjs.com/docs/miscellany/license/).
The npm-registry 0.18.5 version is not used; the maintainers document the ReDoS
fix in their [security issue](https://git.sheetjs.com/sheetjs/sheetjs/issues/3325).
I/O uses buffers with Node filesystem APIs, since the SheetJS ESM entry point
does not initialize `readFile`/`writeFile` automatically.

## Limits and failure behavior

Limits are configured through positive integer environment variables at startup:

| Variable | Default | Applies to |
| --- | ---: | --- |
| `DATASET_MAX_BYTES` | 5242880 (5 MiB) | Input/output file and JSON body bytes |
| `DATASET_MAX_EXPANDED_BYTES` | 33554432 (32 MiB) | Expanded XLSX entries and dataset text |
| `DATASET_MAX_ROWS` | 2000 | Data rows |
| `DATASET_MAX_COLUMNS` | 100 | Total columns, including appended fields |
| `DATASET_MAX_CELL_CHARS` | 32767 | Input strings and CSV/XLSX exports; XLS exports have a separate 4110-code-unit limit |
| `GEOCODE_MAX_UNIQUE` | 100 | Unique valid addresses per operation |
| `GEOCODE_CONCURRENCY` | 4 | Census calls per operation |
| `GEOCODE_DEADLINE_MS` | 60000 | Whole enrichment duration |
| `UPLOAD_SESSION_TTL_MS` | 86400000 (24 hours) | Idle session expiration since last write |
| `UPLOAD_TEMP_DIR` | `/tmp/enroll-dash` | Session storage root |

Upload retains its existing 50 MiB limit; larger uploads may be stored but cannot
be synchronously enriched under the smaller dataset limit. XLSX ZIP metadata
and bounded decompression are checked before parsing. ZIP64, multi-disk,
encrypted, and unsupported ZIP compression formats are rejected. Malformed CSV
quoting and non-UTF-8 CSV are rejected. Parsing/serialization are bounded local
operations; the deadline is checked around them and cancels network work.
Defaults are conservative development limits, verified with synthetic fixtures;
production volumes and Census latency still need calibration. Larger workloads
need a job/status/download workflow.

Malformed options return 400, missing session files 404, limits 413, unsupported
formats 415, and unreadable/ambiguous datasets 422. Errors include `success:
false`, `code`, and a safe `error` message. Network/HTTP failures return 502;
per-call timeout, request cancellation, and overall deadline return 504. An
upstream failure aborts outstanding workers and does not publish an output,
including for an inner join. Client disconnect cancels outstanding work.

Storage accepts only files produced within the supplied UUID session. Traversal,
foreign paths, cross-session paths, and symlink escapes are rejected. Paths are
server/container paths; this response does not provide a browser download route.
Session UUIDs are capability tokens; no authenticated ownership is implemented.

`DELETE /upload/:sessionId` removes input and derived files together. It returns
409 while an operation is active. The API server runs idle-session cleanup at
startup and hourly, skipping active sessions; failed browser-close cleanup thus
has a fallback. Tests use isolated storage roots, synthetic data, and fake
Census responses; they never use student data or live Census calls.
