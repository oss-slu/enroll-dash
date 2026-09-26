# Address-format validation

`validateAddress` checks the shape of an address before it is sent to the
Census geocoder. It is synchronous and local: it does not check whether an
address exists, correct spelling, infer missing content, or make a network
request.

```ts
import { getGeocodeFromAddr } from '../../api/src/utils/census';
import { validateAddress } from '../../api/src/utils/validateAddress';

const validation = validateAddress(input);

if (!validation.ok) {
    // Present the suggestion for an explicit user decision, or reject input.
    // Do not silently replace the user's address.
    if (validation.suggested) {
        const suggestion = validateAddress(validation.suggested);
        if (suggestion.ok) {
            // Ask the caller whether to use suggestion.original.
        }
    }
} else {
    const geocode = await getGeocodeFromAddr(validation.original);
}
```

The validator preserves the input in `original` on every result. A result with
`ok: true` means that the original string has a supported structure. A result
with `ok: false` may include `suggested` for an unambiguous formatting repair;
the suggestion is independently revalidated before it is returned. Callers
choose whether to use it.

## Supported structure

The minimum structure is a numeric house number followed by street text. House
numbers may be alphanumeric (`12A`), hyphenated (`12-14`), or fractional
(`12 1/2`). Street text accepts multiword names, Unicode letters, apostrophes,
hyphens, periods, and directionals such as `N.` and `SW`.

The following locality forms are supported:

| Form                                             | Example                              |
| ------------------------------------------------ | ------------------------------------ |
| Street only, optionally with a unit              | `123 Main St`, `123 Main St, Apt 2E` |
| Street plus ZIP                                  | `123 Main St, 01234`                 |
| Street, city, state, optional ZIP                | `123 Main St, Saint Louis, MO 63109` |
| Street, city and state in one locality component | `123 Main St, Saint Louis MO 63109`  |

Units may be written as `Apt. 2E`, `Apt 2E`, `Suite 200`, or `#2E`. ZIP codes
use five digits or ZIP+4 syntax, and remain strings so leading zeroes are not
lost. State abbreviations and full names are matched case-insensitively; the
50 states, the District of Columbia, and U.S. territories listed in
`validateAddress.ts` are supported. City and street names are not looked up,
and ZIP values are not checked against geography.

The validator can suggest only whitespace and punctuation repairs, such as
trimming surrounding whitespace, collapsing repeated spaces, adding spaces
after existing commas, or repairing clearly repeated abbreviation punctuation.
It does not guess a missing street/locality boundary or alter spelling, digits,
hyphens, fractions, apostrophes, unit identifiers, or meaningful punctuation.

## Unsupported structures

PO boxes, rural-route/box-only addresses, APO/FPO/DPO military mail,
intersections, foreign postal formats, and Puerto Rico addresses using an
`URB`/`Urbanización` or `Municipio` component are outside this policy. A
rejected structure means only that this local format policy cannot safely parse
it; it is not a statement about postal validity.
