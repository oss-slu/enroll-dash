# Address Field Detection

The address field detection utility reads CSV and Excel files and identifies fields whose first value passes the existing `validateAddress` check.

## Supported Files

The utility uses SheetJS (`xlsx`). Despite the package name, `XLSX.readFile()` supports both CSV and Excel files.

## Field Detection

Every field is checked regardless of its header name. This means fields such as `address`, `addr`, or `location` can all be detected if their first value is a valid address.

## API

`GET /address-fields?path=<file-path>`

The route returns an array of potential address field names.

Example:

```json
["address", "location"]