# Address field detection

The shared dataset reader handles CSV, XLS, and XLSX input. Detection samples the
first 20 data rows of each column and returns candidates whose exact string
values pass `validateAddress`. It checks all columns, regardless of header names,
and never applies suggested corrections. Explicit selection is available through
[geocoder file enrichment](geocoder_file_enrichment.md) when sampling is insufficient.

```http
GET /address-fields?sessionId=<UUID>&path=<URL-encoded-upload-tempPath>&hasHeaders=true
```

The route now requires the upload's `sessionId` alongside `path` to prevent
arbitrary filesystem reads. Optional `hasHeaders=false` generates `field1`,
`field2`, etc.; optional `sheet` selects an Excel sheet and is invalid for CSV.
It returns an array of candidate header labels, preserving the existing response:

```json
["address", "location"]
```

Repeated header labels can appear more than once. The enrichment route returns
stable column IDs for ambiguous selection instead. File errors use the shared
`success: false`, `code`, and `error` response. Missing session/path options
return 400. The reusable `findAddressFields(filePath, options?)` wrapper remains
available internally; HTTP callers must use session storage.
