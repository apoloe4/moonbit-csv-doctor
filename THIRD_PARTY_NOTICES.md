# Third-party notices

The parser and validation engine are original MoonBit implementations, not a port of another parser. CSV conventions reference RFC 4180, with documented extensions for LF/CR endings and configurable delimiters.

The project uses [moonbitlang/core](https://github.com/moonbitlang/core) (Apache-2.0). Generated `web/core.js` incorporates standard-library code; its upstream license is included in `licenses/moonbit-core-LICENSE`.

The MoonBit compiler and build tool are available from https://www.moonbitlang.com/download/. Node.js provides CLI IO and the development server. There are no npm dependencies.

GitHub Actions uses actions/checkout, actions/setup-node and actions/upload-artifact (MIT). These build services are not included in the browser bundle.
