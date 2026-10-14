# API routes

Express routers live in `api/src/routes` and are mounted by `createApp` in
`api/src/app.ts`. Each router defines its own full path; the `ROUTES` array is
metadata used by route-mounting tests. The API listens on port `9876`
(`api/src/main.ts`). CORS is enabled only for the configured frontend origin and
allows credentials.

Request bodies are parsed as JSON up to `DATASET_MAX_BYTES` (5 MiB default).
Session-scoped routes accept only files under the supplied UUID session
directory. See [geocoder file enrichment](geocoder_file_enrichment.md) for the
dataset contract, limits table, and session cleanup behavior.

| Method(s) | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` / `POST` | `/geocode` | Geocode a single address |
| `POST` | `/upload` | Upload a dataset file |
| `GET` | `/upload` | `405` |
| `DELETE` | `/upload/:sessionId` | Delete a session directory |
| `GET` | `/address-fields` | Detect address columns in an uploaded file |
| `POST` | `/geocode-file` | Enrich and save an uploaded file |
| `GET` | `/geocode-file` | `405` |
| `POST` | `/dataset-file` | Save a dataset directly |
| `GET` | `/dataset-file` | `405` |

File-oriented routes return errors as `success: false` with a machine-readable
`code` and a safe `error` message (`api/src/utils/fileResponse.ts`). The
single-address `/geocode` route and `/health` use their own `ok`-based shapes.

## GET /health

Liveness check. No parameters.

```json
{ "ok": true, "message": "express server is healthy" }
```

Always returns `200`.

## Geocode a single address

```http
GET /geocode?addr=<URL-encoded-address>
POST /geocode
Content-Type: application/json

{ "addr": "6957 Chippewa St, Saint Louis, MO 63109" }
```

Both methods share one handler. `addr` is read from the query string for `GET`
and from the JSON body for `POST`.

Validation happens before any Census request. Missing, empty, or non-string
`addr` returns `400`:

```json
{ "ok": false, "error": "addr must be a non-empty string" }
```

A string that fails local
[address validation](address_validation.md) returns `400` with `ok: false`,
`original`, an `error`, and `suggested` when a safe formatting correction
exists. Suggestions are never applied automatically:

```json
{
  "ok": false,
  "original": "  6957 Chippewa St, Saint Louis, MO 63109 ",
  "suggested": "6957 Chippewa St, Saint Louis, MO 63109",
  "error": "Unsupported address format"
}
```

A matched address returns `200` with the canonical Census block-group fields
(no `ok`/`success` wrapper). Coordinates come from the Census `x`/`y`
(longitude/latitude); identifiers are strings and keep leading zeroes:

```json
{
  "matchedAddress": "6957 CHIPPEWA ST, SAINT LOUIS, MO, 63109",
  "latitude": 38.5,
  "longitude": -90.2,
  "blockGeoid": "295101865001001",
  "state": "29",
  "county": "189",
  "tract": "018650",
  "blkgrp": "1"
}
```

No match returns `200` with `ok: false`. Upstream failures also return `200`
with `ok: false` in the body so the client can render the message:

| Condition | Body |
| --- | --- |
| No address match | `{ "ok": false, "error": "No address matches for <addr>" }` |
| Census HTTP error | `{ "ok": false, "error": "Census API error: <status> <statusText>" }` |
| Unexpected failure | `{ "ok": false, "error": "Unexpected error: <error>" }` |

Upstream requests time out after 10 seconds (`api/src/utils/http.ts`).

## POST /upload

Multipart upload of a CSV, XLS, or XLSX file. Rate limited to 100 requests per
15 minutes per IP. Files are held in memory (50 MiB limit) and restricted to
`.csv`, `.xls`, and `.xlsx` extensions.

- Field name: `file`.
- No file: `400` `{ "error": "No valid file uploaded" }`.
- Disallowed extension: multer rejects it, returning `500`.
- Save failure: `500` `{ "error": "Failed to save file" }`.

Success returns `200`. `filename` is generated as
`data_<MMDDYY_HHMMSS>.<ext>`; `tempPath` is the server/container path used by the
other file routes. There is no browser download route.

```json
{
  "success": true,
  "sessionId": "<UUID>",
  "filename": "data_012526_143012.csv",
  "tempPath": "/tmp/enroll-dash/<UUID>/data_012526_143012.csv"
}
```

`GET /upload` returns `405` `{ "error": "Method Not Allowed" }`.

## DELETE /upload/:sessionId

Removes the session directory, deleting input and derived files together. Rate
limited like `POST /upload`.

- Invalid UUID: `400` `{ "error": "Invalid session ID format" }`.
- Success: `200` `{ "success": true }`.
- Active file operation on the session: `409` `SESSION_BUSY`.
- Other failure: `500` `{ "error": "Failed to clean up directory" }`.

The API server also runs idle-session cleanup at startup and hourly
(`UPLOAD_SESSION_TTL_MS`, default 24 hours), skipping active sessions.

## GET /address-fields

Detects address columns in a previously uploaded file. See
[address field detection](address_field_detection.md) for the sampling rules.

| Query param | Required | Notes |
| --- | --- | --- |
| `path` | yes | URL-encoded upload `tempPath` |
| `sessionId` | yes | Upload session UUID; prevents arbitrary reads |
| `sheet` | no | Excel worksheet name; invalid for CSV |
| `hasHeaders` | no | `true` (default) or `false` |

Returns `200` with an array of candidate header labels. Repeated labels may
appear more than once:

```json
["address", "location"]
```

Missing `path`/`sessionId` returns `400` `INVALID_OPTIONS`; a non-string `sheet`
returns `400` `INVALID_SHEET`; a `hasHeaders` value other than `true`/`false`
returns `400` `INVALID_HEADERS`. A path from another session returns `400`
`INVALID_PATH`. Other failures use the shared file-error shape.

## POST /geocode-file

Enriches an uploaded file with Census block-group fields and saves the result.

```http
POST /geocode-file?path=<URL-encoded-upload-tempPath>
Content-Type: application/json

{
  "sessionId": "<UUID>",
  "addressField": "mailing_address",
  "fields": ["latitude", "longitude", "blockGeoid"],
  "join": "left",
  "hasHeaders": true,
  "sheet": "Applicants"
}
```

`path` is required and read from the query string (`400` `INVALID_PATH` if
missing). The JSON body carries the options; see
[geocoder file enrichment](geocoder_file_enrichment.md) for field, join,
detection, and caching semantics.

Success returns `201` with the saved-file fields plus the resolved
`addressField`, a `geocodeMapping`, and row `counts`:

```json
{
  "success": true,
  "sessionId": "<UUID>",
  "filename": "data_geocoded_<UUID>.csv",
  "tempPath": "<server session path>",
  "format": "csv",
  "addressField": "field2",
  "columnMapping": [{ "id": "field1", "source": "id", "output": "id" }],
  "geocodeMapping": [
    { "field": "latitude", "id": "geocode_latitude", "output": "geocode_latitude" }
  ],
  "counts": { "input": 3, "output": 3, "matched": 1, "invalidOrBlank": 1, "unmatched": 1 }
}
```

The enrichment deadline (`GEOCODE_DEADLINE_MS`, default 60 seconds) and client
disconnect cancel outstanding Census work. A request body that is too large or
cannot be parsed returns `413` `BODY_TOO_LARGE` or `400` `INVALID_BODY`
(`api/src/app.ts`). `GET /geocode-file` returns `405`.

## POST /dataset-file

Saves a JSON dataset directly without geocoding.

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

`filename` must be a safe leaf name whose extension matches `format`
(`csv`, `xls`, or `xlsx`). `dataset` is validated like any other dataset:
unique nonempty string column IDs, one scalar cell per column, and the row,
column, and cell limits. A UUID suffix is added to the output filename so
repeated requests cannot overwrite input.

- Missing/invalid fields: `400` `INVALID_OPTIONS`.
- Extension/format mismatch: `400` `FORMAT_MISMATCH`.
- Invalid dataset: `400` `INVALID_DATASET` or `413` limits.
- Success: `201` `{ "success": true, ...saved }` including `columnMapping`.

Body parse failures use the same `BODY_TOO_LARGE`/`INVALID_BODY` handler as
`/geocode-file`. `GET /dataset-file` returns `405`.

## Error codes

Codes raised by these routes via `FileError` (`api/src/errs/file.ts`) and
`fileResponseError`:

| Status | Code | Meaning |
| ---: | --- | --- |
| 400 | `INVALID_OPTIONS` | Missing or malformed options |
| 400 | `INVALID_SESSION` | `sessionId` is not a UUID |
| 400 | `INVALID_PATH` | Path not in the supplied session, or unsafe leaf |
| 400 | `INVALID_FILENAME` | Filename is not a safe leaf name |
| 400 | `INVALID_SHEET` | Unknown worksheet, or `sheet` used with CSV |
| 400 | `INVALID_HEADERS` | `hasHeaders` not a boolean/`true`/`false` |
| 400 | `FORMAT_MISMATCH` | Extension does not match `format` |
| 400 | `INVALID_DATASET` | Dataset shape/cell validation failed |
| 400 | `BODY_TOO_LARGE` / `INVALID_BODY` | Body parse failures on file routes |
| 404 | `FILE_NOT_FOUND` | Session file missing |
| 409 | `SESSION_BUSY` | Delete blocked by an active operation |
| 409 | `FILE_EXISTS` | Output filename already exists |
| 413 | `FILE_TOO_LARGE` / `TABLE_TOO_LARGE` / `CELL_TOO_LARGE` | Limits exceeded |
| 413 | `TOO_MANY_GEOCODES` | Unique geocode limit exceeded |
| 413 | `WORKBOOK_TOO_LARGE` / `XLS_TEXT_TOO_LARGE` | Workbook/export limits |
| 415 | `UNSUPPORTED_FORMAT` | Not CSV/XLS/XLSX |
| 422 | `UNREADABLE_DATASET` / `EMPTY_DATASET` | Cannot parse input |
| 422 | `ADDRESS_FIELD_NOT_FOUND` | Selected address column missing |
| 422 | `NO_ADDRESS_FIELDS` / `AMBIGUOUS_ADDRESS_FIELDS` | Detection result |
| 502 | `GEOCODER_FAILED` | Census request failed |
| 504 | `CANCELLED` / `DEADLINE_EXCEEDED` | Client cancel or overall deadline |

`AMBIGUOUS_ADDRESS_FIELDS` and `NO_ADDRESS_FIELDS` include a `candidates` array
of column IDs. Unhandled file errors fall back to `500`
`FILE_OPERATION_FAILED`.
